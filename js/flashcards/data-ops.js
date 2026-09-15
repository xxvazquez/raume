// Flashcards -- authentication, sync and data operations
// (RaumeStudy.flashcards.dataOps).
//
// The Supabase client + auth, the remote store (Supabase is the source of
// truth when signed in), the guest-mode local store (the cache itself is the
// record), the mode-aware entry points the rest of the UI calls, the daily
// streak, and the offline review outbox + conflict-safe sync. Nothing here
// changes storage formats or sync semantics -- it is the same code, relocated.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.dataOps = (function () {
  "use strict";

  var store = window.RaumeStudy.flashcards.store;
  var sched = window.RaumeStudy.flashcards.scheduling;
  var vidx = window.RaumeStudy.flashcards.vocabIndex;
  var getCache = store.getCache, saveCache = store.saveCache, resetCacheForUser = store.resetCacheForUser;
  var resetKanaCacheForUser = store.resetKanaCacheForUser;
  var isGuestMode = store.isGuestMode, uuid = store.uuid, localDateStr = store.localDateStr;
  var RATING_NAMES = store.RATING_NAMES;
  var getVocabIndex = vidx.getVocabIndex, directionsForEntry = vidx.directionsForEntry;
  var fsrsRowFields = sched.fsrsRowFields, getScheduler = sched.getScheduler, applyRating = sched.applyRating;

  // -----------------------------------------------------------------------
  // Supabase client + auth
  // -----------------------------------------------------------------------
  var supabaseClient = null;
  function configured() {
    var cfg = window.RaumeStudy.config || {};
    return !!(cfg.url && cfg.anonKey);
  }
  function getClient() {
    if (supabaseClient || !configured()) return supabaseClient;
    var cfg = window.RaumeStudy.config;
    supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
    return supabaseClient;
  }

  // `passwordRecovery` is set when the user lands here via a "reset your
  // password" email link. supabase-js detects the recovery token in the URL
  // itself (then clears it from location.hash) and, rather than a plain
  // SIGNED_IN, fires this as its own onAuthStateChange event -- the one hook
  // that tells the UI to show "set a new password" instead of the ordinary
  // signed-in shell, even though a (real, if short-lived-in-intent) session
  // now exists. Cleared once a new password is set, or the user backs out.
  var authState = { session: null, ready: false, passwordRecovery: false };
  var authListeners = [];
  function onAuthChange(fn) { authListeners.push(fn); }
  function notifyAuthChange() { authListeners.forEach(function (fn) { fn(authState); }); }

  function initAuth() {
    var client = getClient();
    if (!client) { authState.ready = true; notifyAuthChange(); return; }
    client.auth.getSession().then(function (res) {
      authState.session = res.data.session;
      store.setSession(authState.session);
      authState.ready = true;
      if (authState.session) { resetCacheForUser(authState.session.user.id); resetKanaCacheForUser(authState.session.user.id); }
      notifyAuthChange();
    });
    client.auth.onAuthStateChange(function (event, session) {
      var prevUserId = authState.session ? authState.session.user.id : null;
      authState.session = session;
      store.setSession(session);
      if (event === "PASSWORD_RECOVERY") authState.passwordRecovery = true;
      var newUserId = session ? session.user.id : null;
      if (newUserId !== prevUserId) { resetCacheForUser(newUserId); resetKanaCacheForUser(newUserId); }
      notifyAuthChange();
    });
  }
  function currentUser() { return authState.session ? authState.session.user : null; }
  function signUp(email, password) { return getClient().auth.signUp({ email: email, password: password }); }
  function signIn(email, password) { return getClient().auth.signInWithPassword({ email: email, password: password }); }
  function signOut() { authState.passwordRecovery = false; return getClient().auth.signOut(); }
  // The redirect target is wherever the user is standing right now (this is a
  // hash-routed static site, not a server with its own reset-password path) --
  // Supabase appends its own recovery token to it as a URL fragment, which
  // supabase-js reads and clears on the other end (see initAuth above). Must
  // also be added to the project's Authentication -> URL Configuration ->
  // Redirect URLs allowlist, or Supabase silently ignores it (SUPABASE_SETUP.md).
  function resetPassword(email) {
    return getClient().auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  }
  // Only valid while authState.passwordRecovery is true -- that recovery
  // session is what authorises the update without re-entering the old
  // password. Clearing the flag is the caller's job once this resolves.
  function updatePassword(newPassword) {
    return getClient().auth.updateUser({ password: newPassword });
  }
  function clearPasswordRecovery() { authState.passwordRecovery = false; }

  // -----------------------------------------------------------------------
  // Remote store (Supabase = source of truth)
  // -----------------------------------------------------------------------
  async function fetchAllFromServer() {
    var client = getClient(), user = currentUser();
    var cardsRes = await client.from("flashcards").select("*").eq("user_id", user.id);
    if (cardsRes.error) throw cardsRes.error;
    var settingsRes = await client.from("flashcard_settings").select("*").eq("user_id", user.id).maybeSingle();
    if (settingsRes.error) throw settingsRes.error;
    var settingsRow = settingsRes.data;
    if (!settingsRow) {
      var insertRes = await client.from("flashcard_settings").insert({ user_id: user.id }).select().single();
      if (insertRes.error) throw insertRes.error;
      settingsRow = insertRes.data;
    }
    var c = getCache();
    c.cards = {};
    cardsRes.data.forEach(function (row) {
      c.cards[row.id] = {
        id: row.id, vocabId: row.vocab_id, direction: row.direction, active: row.active,
        state: row.state, due: row.due, stability: row.stability, difficulty: row.difficulty,
        scheduled_days: row.scheduled_days, reps: row.reps, lapses: row.lapses,
        learning_steps: row.learning_steps, last_review: row.last_review
      };
    });
    c.settings = {
      fsrs_request_retention: settingsRow.fsrs_request_retention,
      fsrs_maximum_interval: settingsRow.fsrs_maximum_interval,
      fsrs_enable_fuzz: settingsRow.fsrs_enable_fuzz,
      queue_new_cards_per_day: settingsRow.queue_new_cards_per_day,
      schema_version: settingsRow.schema_version,
      current_streak: settingsRow.current_streak || 0,
      longest_streak: settingsRow.longest_streak || 0,
      last_study_date: settingsRow.last_study_date || null,
      // !== false rather than a plain truthy check -- an existing Supabase
      // project that hasn't re-run the latest supabase/schema.sql yet won't
      // have these columns at all, and undefined should mean "on" (today's
      // default), not "off".
      enabled_directions: {
        "jp-en": settingsRow.enabled_jp_en !== false, "jp-ro": settingsRow.enabled_jp_ro !== false,
        "ro-en": settingsRow.enabled_ro_en !== false, "en-ro": settingsRow.enabled_en_ro !== false
      }
    };
    // Paused tables: union the account's list with whatever this device had
    // (guest tables paused before signing in aren't dropped); push the merge
    // back up if this device contributed anything new. `paused_tables` is
    // absent on a project that hasn't re-run schema.sql -- treat that as [].
    var remotePaused = Array.isArray(settingsRow.paused_tables) ? settingsRow.paused_tables.map(String) : [];
    var mergedPaused = {};
    (c.pausedTables || []).forEach(function (t) { mergedPaused[t] = true; });
    remotePaused.forEach(function (t) { mergedPaused[t] = true; });
    c.pausedTables = Object.keys(mergedPaused);
    c.userId = user.id;
    c.lastSyncedAt = new Date().toISOString();
    saveCache();
    if (c.pausedTables.some(function (t) { return remotePaused.indexOf(t) === -1; })) {
      // Best-effort merge push -- if it fails, the merged list still lives in
      // the local cache and this device behaves correctly; just leave a
      // trace instead of a silent, un-retried drop of a device-only pause
      // set that never makes it to the account.
      savePausedTablesRemote(c.pausedTables).catch(function (e) {
        console.warn("Flashcards: could not sync merged paused-tables list", e);
      });
    }
    // The vocabulary page's per-table icons live in this same row -- hand
    // them to their own store so a header icon set on another device shows up.
    if (window.RaumeStudy.tableCustom) {
      window.RaumeStudy.tableCustom.applyRemote(settingsRow.table_custom || {});
    }
    // The reader's own vocabulary rows/tables (js/vocab/custom-vocab.js) --
    // their own Supabase tables, not this settings row.
    if (window.RaumeStudy.customVocab) {
      var ctRes = await client.from("custom_tables").select("*").eq("user_id", user.id);
      if (ctRes.error) throw ctRes.error;
      var crRes = await client.from("custom_rows").select("*").eq("user_id", user.id);
      if (crRes.error) throw crRes.error;
      window.RaumeStudy.customVocab.applyRemote({
        tables: (ctRes.data || []).map(function (r) {
          return { id: r.id, title: r.title, category: r.category, sort: r.sort_index };
        }),
        rows: (crRes.data || []).map(function (r) {
          return { id: r.id, tableId: r.target_table, jp: r.jp, romaji: r.romaji, english: r.english, sort: r.sort_index };
        })
      });
    }
  }

  // Custom vocabulary writes -- thin inserts/deletes against the reader's own
  // custom_tables / custom_rows. Best-effort, mirroring addVocabsRemote: the
  // local cache already has the change, so a failed push just leaves a trace.
  async function customVocabAddRows(rows) {
    var client = getClient(), user = currentUser();
    if (!client || !user || !rows || !rows.length) return;
    var payload = rows.map(function (r) {
      return { id: r.id, user_id: user.id, target_table: String(r.tableId), jp: r.jp, romaji: r.romaji, english: r.english, sort_index: Math.round(r.sort || 0) };
    });
    var res = await client.from("custom_rows").upsert(payload, { onConflict: "id" });
    if (res.error) throw res.error;
  }
  async function customVocabDeleteRows(ids) {
    var client = getClient(), user = currentUser();
    if (!client || !user || !ids || !ids.length) return;
    var res = await client.from("custom_rows").delete().eq("user_id", user.id).in("id", ids);
    if (res.error) throw res.error;
  }
  async function customVocabAddTable(t) {
    var client = getClient(), user = currentUser();
    if (!client || !user) return;
    var res = await client.from("custom_tables").upsert(
      { id: t.id, user_id: user.id, title: t.title, category: t.category, sort_index: Math.round(t.sort || 0) },
      { onConflict: "id" }
    );
    if (res.error) throw res.error;
  }
  async function customVocabDeleteTable(id, rowIds) {
    var client = getClient(), user = currentUser();
    if (!client || !user) return;
    if (rowIds && rowIds.length) await customVocabDeleteRows(rowIds);
    var res = await client.from("custom_tables").delete().eq("user_id", user.id).eq("id", id);
    if (res.error) throw res.error;
  }

  async function addVocabsRemote(vocabIds) {
    var client = getClient(), user = currentUser();
    var index = getVocabIndex();
    var rows = [];
    vocabIds.forEach(function (vocabId) {
      var entry = index[vocabId];
      if (!entry) return; // skip anything not resolvable (e.g. a stale id)
      directionsForEntry(entry).forEach(function (d) {
        rows.push({ user_id: user.id, vocab_id: vocabId, direction: d, active: true });
      });
    });
    if (!rows.length) return [];
    // Only user_id/vocab_id/direction/active are in the payload, so on a
    // conflict (an archived row already exists) Postgres's upsert only
    // touches `active` -- every FSRS field and its review history is left
    // exactly as it was. On no conflict it inserts a fresh row using the
    // table's own createEmptyCard-equivalent column defaults.
    var res = await client.from("flashcards").upsert(rows, { onConflict: "user_id,vocab_id,direction" }).select();
    if (res.error) throw res.error;
    return res.data;
  }
  async function archiveVocabsRemote(vocabIds) {
    if (!vocabIds.length) return;
    var client = getClient(), user = currentUser();
    var res = await client.from("flashcards").update({ active: false }).eq("user_id", user.id).in("vocab_id", vocabIds);
    if (res.error) throw res.error;
  }
  async function saveFsrsSettingsRemote(patch) {
    var client = getClient(), user = currentUser();
    var res = await client.from("flashcard_settings").update(patch).eq("user_id", user.id);
    if (res.error) throw res.error;
  }
  // Vocabulary-page table icons ride along in the same settings row so they
  // sync across devices (see js/vocab/table-custom.js).
  async function saveTableCustomRemote(obj) {
    if (!getClient() || !currentUser()) return;
    return saveFsrsSettingsRemote({ table_custom: obj || {} });
  }
  async function savePausedTablesRemote(arr) {
    if (!getClient() || !currentUser()) return;
    return saveFsrsSettingsRemote({ paused_tables: arr || [] });
  }
  // Pause / resume a whole table. An overlay -- the cards themselves are left
  // exactly as they are (see store.setTablePausedLocal), so resuming is a
  // clean revert. Local first, then the account; a paused table drops out of
  // review, the stat tiles and every Manage filter except "All vocabulary".
  async function setTablePaused(tableId, paused) {
    var list = store.setTablePausedLocal(tableId, paused);
    if (!isGuestMode()) await savePausedTablesRemote(list);
  }

  // -----------------------------------------------------------------------
  // Guest-mode store -- the exact same operations as above, but entirely
  // local: no network, no account, nothing to set up. The cache itself
  // *is* the record here (see the store's cacheKey() picking a separate
  // localStorage key for guest mode) rather than a disposable read-through
  // copy of something else authoritative.
  // -----------------------------------------------------------------------
  function newLocalCard(vocabId, direction) {
    var id = uuid();
    return {
      id: id, vocabId: vocabId, direction: direction, active: true,
      state: 0, due: new Date().toISOString(), stability: 0, difficulty: 0,
      scheduled_days: 0, reps: 0, lapses: 0, learning_steps: 0, last_review: null
    };
  }
  function findLocalCard(c, vocabId, direction) {
    return Object.keys(c.cards).map(function (id) { return c.cards[id]; })
      .find(function (card) { return card.vocabId === vocabId && card.direction === direction; });
  }
  function addVocabsLocal(vocabIds) {
    var c = getCache();
    var index = getVocabIndex();
    vocabIds.forEach(function (vocabId) {
      var entry = index[vocabId];
      if (!entry) return;
      directionsForEntry(entry).forEach(function (d) {
        var existing = findLocalCard(c, vocabId, d);
        if (existing) existing.active = true; // restore -- FSRS state/history untouched
        else { var card = newLocalCard(vocabId, d); c.cards[card.id] = card; }
      });
    });
    saveCache();
  }
  function archiveVocabsLocal(vocabIds) {
    var c = getCache();
    Object.keys(c.cards).forEach(function (id) {
      if (vocabIds.indexOf(c.cards[id].vocabId) !== -1) c.cards[id].active = false;
    });
    saveCache();
  }

  // -----------------------------------------------------------------------
  // Mode-aware entry points -- everything outside this module (UI, review
  // flow, queue/stats) calls only these, never the *Remote/*Local functions
  // directly, so it doesn't need to know or care which mode is active.
  // -----------------------------------------------------------------------
  async function addVocabs(vocabIds) { return isGuestMode() ? addVocabsLocal(vocabIds) : addVocabsRemote(vocabIds); }
  async function addVocab(vocabId) { return addVocabs([vocabId]); }
  async function archiveVocabs(vocabIds) { return isGuestMode() ? archiveVocabsLocal(vocabIds) : archiveVocabsRemote(vocabIds); }
  async function archiveVocab(vocabId) { return archiveVocabs([vocabId]); }
  async function saveFsrsSettings(patch) {
    Object.assign(getCache().settings, patch);
    saveCache();
    if (!isGuestMode()) await saveFsrsSettingsRemote(patch);
  }
  async function saveQueueSettings(patch) { return saveFsrsSettings(patch); }
  // Separate from saveFsrsSettings because the shapes differ: the cache
  // keeps enabled directions as one nested object (for easy `enabled[dir]`
  // lookups in buildQueue/computeStats), but Supabase stores them as 4 flat
  // boolean columns -- same pattern (mutate cache, persist locally always,
  // push remotely when signed in), just with that one translation.
  async function saveDirectionSettings(enabledMap) {
    getCache().settings.enabled_directions = enabledMap;
    saveCache();
    if (!isGuestMode()) {
      await saveFsrsSettingsRemote({
        enabled_jp_en: enabledMap["jp-en"], enabled_jp_ro: enabledMap["jp-ro"],
        enabled_ro_en: enabledMap["ro-en"], enabled_en_ro: enabledMap["en-ro"]
      });
    }
  }
  // Guest mode has nothing to fetch -- its cache already is the record.
  async function refreshData() { if (!isGuestMode()) await fetchAllFromServer(); }

  // -----------------------------------------------------------------------
  // Daily study streak -- a motivational counter, not an FSRS concept.
  // Computed locally (so it still counts an offline review) and pushed to
  // Supabase best-effort; worst case (app closed before it syncs) it's off
  // by a day until the next review, never lost outright since it's derived
  // fresh from last_study_date each time, not incremented blindly.
  // -----------------------------------------------------------------------
  function recordStudyActivity(now) {
    var s = getCache().settings;
    var today = localDateStr(now);
    if (s.last_study_date === today) return; // already counted today
    var yesterday = localDateStr(new Date(now.getTime() - 86400000));
    s.current_streak = s.last_study_date === yesterday ? s.current_streak + 1 : 1;
    s.longest_streak = Math.max(s.longest_streak, s.current_streak);
    s.last_study_date = today;
    saveCache();
    syncStreakRemote(s).catch(function () {}); // best-effort; local cache already has it
  }
  async function syncStreakRemote(s) {
    if (!configured() || !currentUser()) return;
    await saveFsrsSettingsRemote({ current_streak: s.current_streak, longest_streak: s.longest_streak, last_study_date: s.last_study_date });
  }

  // Returns true when the log is (now or already) on the server, false when the
  // card it points at no longer exists there -- an orphan review that can never
  // sync, so the caller drops it rather than wedging the whole outbox on it.
  async function pushReviewLogRemote(entry) {
    var client = getClient(), user = currentUser();
    var res = await client.from("review_logs").insert({
      user_id: user.id, card_id: entry.cardId, client_review_id: entry.clientReviewId,
      rating: entry.logFields.rating, state: entry.logFields.state, due: entry.logFields.due,
      stability: entry.logFields.stability, difficulty: entry.logFields.difficulty,
      scheduled_days: entry.logFields.scheduled_days, learning_steps: entry.logFields.learning_steps,
      reviewed_at: entry.logFields.review
    });
    if (!res.error || res.error.code === "23505") return true;  // ok, or already synced
    if (res.error.code === "23503") return false;               // FK: the card is gone from the server
    throw res.error;
  }
  async function applyCardUpdateGuarded(cardId, resultCard, baseReps) {
    var client = getClient();
    var payload = fsrsRowFields(resultCard);
    payload.updated_at = new Date().toISOString();
    var res = await client.from("flashcards").update(payload).eq("id", cardId).eq("reps", baseReps).select();
    if (res.error) throw res.error;
    return res.data && res.data.length > 0;
  }
  async function fetchCardById(cardId) {
    var client = getClient();
    var res = await client.from("flashcards").select("*").eq("id", cardId).maybeSingle();
    if (res.error) throw res.error;
    return res.data;
  }

  // -----------------------------------------------------------------------
  // Outbox / sync -- offline reviews computed locally, queued, then synced.
  // -----------------------------------------------------------------------
  var syncing = false, syncStartedAt = 0;

  // A connection in a half-open state can leave a fetch hanging forever -- and
  // with it `syncing` stuck true, so nothing (not even the manual "Sync now")
  // could retry. Cap every sync request; a timeout is caught like any other
  // error, so the loop stops and the `syncing` flag is released for next time.
  var SYNC_REQUEST_TIMEOUT_MS = 20000;
  var SYNC_STUCK_MS = 60000; // a run older than this is presumed wedged; ignore its flag
  function withTimeout(promise, label, ms) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) { settled = true; reject(new Error((label || "request") + " timed out")); }
      }, ms || SYNC_REQUEST_TIMEOUT_MS);
      promise.then(
        function (v) { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } },
        function (e) { if (!settled) { settled = true; clearTimeout(timer); reject(e); } }
      );
    });
  }

  // A tiny observable for the UI's offline / pending-sync chip: current
  // connectivity plus how many reviews are still queued locally. Guest mode
  // has nothing to sync, so its pending count is always 0 (an offline hint
  // is still meaningful there). Fired on connectivity changes and every time
  // the outbox depth moves.
  var syncStateListeners = [];
  // Set when a sync attempt breaks with entries still queued (network error, or
  // an entry whose card isn't on the server yet); cleared once both outboxes
  // drain. Drives the chip's "couldn't sync" state + its manual retry button.
  var syncErrored = false;
  function onSyncStateChange(fn) { syncStateListeners.push(fn); }
  function totalPending() {
    return isGuestMode() ? 0 : ((getCache().logsOutbox || []).length + kanaPendingCount() + cvOutboxPending() + (tcDirty() ? 1 : 0));
  }
  function getSyncState() {
    var online = typeof navigator === "undefined" || navigator.onLine !== false;
    var pending = totalPending();
    var busy = syncing || kanaSyncing || cvSyncing;
    return {
      online: online, pending: pending, syncing: busy,
      // Queued changes, online, not mid-attempt, and the last try failed --
      // offer a manual retry rather than waiting on the next trigger.
      stalled: pending > 0 && online && !busy && syncErrored
    };
  }
  // Itemised version of getSyncState()'s pending count, for a "what hasn't
  // synced yet" detail list. Returns raw ids/payloads only -- resolving them
  // to word text is the caller's job (bootstrap.js), since that needs
  // vocabIndex / kanaData, which this module doesn't otherwise depend on.
  function pendingItems() {
    if (isGuestMode()) return [];
    var cache = getCache();
    var out = [];
    (cache.logsOutbox || []).forEach(function (e) {
      var card = cache.cards[e.cardId];
      out.push({ kind: "review", vocabId: card && card.vocabId, direction: card && card.direction });
    });
    (store.getKanaCache().logsOutbox || []).forEach(function (e) {
      out.push({ kind: "kana", kanaId: e.kanaId, direction: e.direction });
    });
    loadCvOutbox().forEach(function (e) {
      out.push({ kind: "cv", op: e.op, payload: e.payload });
    });
    if (tcDirty()) out.push({ kind: "table" });
    return out;
  }
  // Kick every outbox now -- the chip's "Sync now" button, for a queue that
  // stopped draining on its own.
  function syncNow() {
    syncErrored = false;
    notifySyncStateChange();
    syncOutbox();
    syncKanaOutbox();
    syncCvOutbox();
    syncTableCustomIfDirty();
  }
  function notifySyncStateChange() {
    var st = getSyncState();
    syncStateListeners.forEach(function (fn) { try { fn(st); } catch (e) {} });
  }
  async function syncOutbox() {
    if ((syncing && Date.now() - syncStartedAt < SYNC_STUCK_MS) || !configured() || !currentUser()) return;
    syncing = true;
    syncStartedAt = Date.now();
    try {
      var c = getCache();
      while (c.logsOutbox.length) {
        var entry = c.logsOutbox[0];
        var outcome;
        try {
          outcome = await withTimeout(syncOne(entry), "review sync");
        } catch (e) {
          // network/other error -- stop, leave the entry queued, flag it so the
          // chip offers a manual retry instead of just sitting on "Syncing…".
          syncErrored = true;
          console.warn("Flashcards: review sync failed, will retry", e);
          break;
        }
        if (outcome === "retry") break;
        c.logsOutbox.shift();
        saveCache();
        notifySyncStateChange();
      }
    } finally {
      syncing = false;
      if (totalPending() === 0) syncErrored = false;
      notifySyncStateChange();
    }
  }
  async function syncOne(entry) {
    var logged = await pushReviewLogRemote(entry);
    if (!logged) { // orphan review -- the card no longer exists on the server; drop it rather than wedge the queue
      console.warn("Flashcards: dropping a queued review whose card is gone from the server", entry.cardId);
      return "deleted";
    }
    var ok = await applyCardUpdateGuarded(entry.cardId, entry.resultCard, entry.baseCard.reps);
    if (ok) return "done";
    // Conflict: another device moved this card first. Recompute the rating
    // deterministically from the server's current state instead of
    // overwriting it -- the review log above already recorded what the user
    // saw at the time; this only reconciles the card's live pointer.
    var server = await fetchCardById(entry.cardId);
    if (!server) return "deleted";
    var c = getCache();
    var scheduler = getScheduler(c.settings);
    var replayed = applyRating(scheduler, fsrsRowFields(server), new Date(entry.logFields.review), RATING_NAMES[entry.logFields.rating - 1]);
    var ok2 = await applyCardUpdateGuarded(entry.cardId, replayed.card, server.reps);
    if (!ok2) return "retry";
    entry.resultCard = replayed.card;
    return "done";
  }
  // -----------------------------------------------------------------------
  // Custom vocabulary + table customisations: the account writes above
  // (customVocabAddRows etc., saveTableCustomRemote) used to be fire-and-
  // forget -- a failed push (offline, or any other error) just left a
  // console.warn and nothing else, so a rename or a word added while offline
  // could quietly never reach the account. These give the same retried,
  // visible treatment the review outbox above already has: a failure queues
  // (or flags) the change, folds into getSyncState()'s pending count -- so
  // the existing sync chip covers it too -- and is retried on reconnect or
  // "Sync now", surviving a reload since the queue/flag is persisted, not
  // just held in memory.
  var CV_OUTBOX_KEY = "raume-custom-vocab-outbox-v1";
  function loadCvOutbox() {
    try {
      var arr = JSON.parse(window.localStorage.getItem(CV_OUTBOX_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveCvOutbox(arr) {
    try { window.localStorage.setItem(CV_OUTBOX_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function queueCvOp(op, payload) {
    var q = loadCvOutbox();
    q.push({ op: op, payload: payload });
    saveCvOutbox(q);
    notifySyncStateChange();
  }
  function cvOutboxPending() { return isGuestMode() ? 0 : loadCvOutbox().length; }
  // Every queued op replays through the exact same function a live edit
  // calls (customVocabAddRows etc. above), so a retried change can't drift
  // from what a same-session one does.
  function runCvOp(entry) {
    if (entry.op === "addRows") return customVocabAddRows(entry.payload);
    if (entry.op === "deleteRows") return customVocabDeleteRows(entry.payload);
    if (entry.op === "addTable") return customVocabAddTable(entry.payload);
    if (entry.op === "deleteTable") return customVocabDeleteTable(entry.payload.id, entry.payload.rowIds);
    return Promise.resolve();
  }
  var cvSyncing = false;
  async function syncCvOutbox() {
    if (cvSyncing || !configured() || !currentUser()) return;
    cvSyncing = true;
    try {
      var q = loadCvOutbox();
      while (q.length) {
        try {
          await withTimeout(runCvOp(q[0]), "custom vocab sync");
        } catch (e) {
          syncErrored = true;
          console.warn("Flashcards: custom vocab sync failed, will retry", e);
          break;
        }
        q.shift();
        saveCvOutbox(q);
        notifySyncStateChange();
      }
    } finally {
      cvSyncing = false;
      if (totalPending() === 0) syncErrored = false;
      notifySyncStateChange();
    }
  }
  // What js/flashcards/bootstrap.js's customVocab.setRemote() ops actually
  // call: try once immediately (so a same-session change syncs with no
  // visible delay), and only fall back to the persisted outbox -- retried
  // later -- if that attempt fails, instead of dropping the change.
  function customVocabAddRowsQueued(rows) {
    return customVocabAddRows(rows).catch(function (e) {
      console.warn("Flashcards: could not sync new words, will retry", e);
      queueCvOp("addRows", rows);
    });
  }
  function customVocabDeleteRowsQueued(ids) {
    return customVocabDeleteRows(ids).catch(function (e) {
      console.warn("Flashcards: could not sync a deleted word, will retry", e);
      queueCvOp("deleteRows", ids);
    });
  }
  function customVocabAddTableQueued(t) {
    return customVocabAddTable(t).catch(function (e) {
      console.warn("Flashcards: could not sync a new table, will retry", e);
      queueCvOp("addTable", t);
    });
  }
  function customVocabDeleteTableQueued(id, rowIds) {
    return customVocabDeleteTable(id, rowIds).catch(function (e) {
      console.warn("Flashcards: could not sync a deleted table, will retry", e);
      queueCvOp("deleteTable", { id: id, rowIds: rowIds });
    });
  }

  // Table customisations push the whole current object every time (last-
  // edit-wins, idempotent), so there's no op log to replay -- just a dirty
  // flag that clears on a successful push and is set again on failure.
  // Persisted so "this hasn't synced yet" survives a reload, not only an
  // in-page retry.
  var TC_DIRTY_KEY = "raume-table-custom-dirty-v1";
  function tcDirty() {
    try { return window.localStorage.getItem(TC_DIRTY_KEY) === "1"; } catch (e) { return false; }
  }
  function setTcDirty(v) {
    try {
      if (v) window.localStorage.setItem(TC_DIRTY_KEY, "1");
      else window.localStorage.removeItem(TC_DIRTY_KEY);
    } catch (e) {}
  }
  async function saveTableCustomRemoteQueued(obj) {
    try {
      await withTimeout(saveTableCustomRemote(obj), "table customization sync");
      setTcDirty(false);
    } catch (e) {
      console.warn("Flashcards: could not sync a table customization, will retry", e);
      setTcDirty(true);
    }
    notifySyncStateChange();
  }
  function syncTableCustomIfDirty() {
    if (!tcDirty() || !configured() || !currentUser()) return;
    var tc = window.RaumeStudy.tableCustom;
    if (tc) saveTableCustomRemoteQueued(tc.getAll());
  }

  window.addEventListener("online", function () {
    notifySyncStateChange(); syncOutbox(); syncKanaOutbox(); syncCvOutbox(); syncTableCustomIfDirty();
  });
  window.addEventListener("offline", function () { notifySyncStateChange(); });

  // -----------------------------------------------------------------------
  // Kana trainer sync -- the Kana tab's parallel of everything above, one
  // step simpler: a card is born on its first review (no "add" step) and
  // there's no streak. Guest mode does nothing here; signed in, kana_cards
  // is authoritative and the local kana cache is a read-through copy plus an
  // offline review outbox, exactly like the vocab cache. The FSRS knobs are
  // per-user (Settings tab), stored in the cache's `fsrs` blob and synced
  // through the `kana_fsrs` column -- independent of the vocab cards' knobs.
  // -----------------------------------------------------------------------
  function kanaFsrs() { return store.getKanaCache().fsrs || store.defaultKanaFsrs(); }

  function kanaRowToLocal(row) {
    return {
      id: row.id, active: row.active, state: row.state, due: row.due,
      stability: row.stability, difficulty: row.difficulty, scheduled_days: row.scheduled_days,
      reps: row.reps, lapses: row.lapses, learning_steps: row.learning_steps, last_review: row.last_review
    };
  }
  async function fetchKanaFromServer() {
    if (isGuestMode() || !currentUser()) return;
    var client = getClient(), user = currentUser();
    var cardsRes = await client.from("kana_cards").select("*").eq("user_id", user.id);
    if (cardsRes.error) throw cardsRes.error;
    var setRes = await client.from("flashcard_settings").select("kana_prefs, kana_fsrs").eq("user_id", user.id).maybeSingle();
    if (setRes.error) throw setRes.error;

    // First sign-in with nothing on the server yet -- seed it from whatever
    // this device's guest cache holds, so on-device progress isn't stranded.
    // Never overwrites an account that already has kana rows (from another
    // device): the seed upsert ignores conflicts.
    if (!cardsRes.data.length) {
      var seeded = await seedKanaFromGuest(user);
      if (seeded) cardsRes = { data: seeded };
    }

    var kc = store.getKanaCache();
    kc.cards = {};
    cardsRes.data.forEach(function (row) { kc.cards[row.kana_id + "|" + row.direction] = kanaRowToLocal(row); });
    var prefs = (setRes.data && setRes.data.kana_prefs) || {};
    if (Array.isArray(prefs.groups)) kc.groups = prefs.groups.filter(function (g) { return typeof g === "string"; });
    if (prefs.dirs && typeof prefs.dirs === "object") {
      var d = { k2r: prefs.dirs.k2r !== false, r2k: prefs.dirs.r2k !== false };
      if (d.k2r || d.r2k) kc.dirs = d;
    }
    // FSRS knobs: an account that has never touched the Kana settings has an
    // empty {} here, so keep the defaults; otherwise take (and re-sanitise)
    // what the account holds -- the account wins, same as kana_prefs.
    var serverFsrs = setRes.data && setRes.data.kana_fsrs;
    if (serverFsrs && typeof serverFsrs === "object" && Object.keys(serverFsrs).length) {
      kc.fsrs = store.sanitizeKanaFsrs(serverFsrs);
    }
    kc.userId = user.id;
    store.saveKanaCache();
  }
  async function seedKanaFromGuest(user) {
    var client = getClient(), guestRaw;
    try { guestRaw = JSON.parse(localStorage.getItem("raume-kana-v1") || "null"); } catch (e) { guestRaw = null; }
    if (!guestRaw || !guestRaw.cards) return null;
    var rows = Object.keys(guestRaw.cards).map(function (key) {
      var c = guestRaw.cards[key], sep = key.lastIndexOf("|");
      var dir = sep > 0 ? key.slice(sep + 1) : "";
      if ((dir !== "k2r" && dir !== "r2k") || !c || typeof c.state !== "number" || typeof c.reps !== "number") return null;
      return {
        user_id: user.id, kana_id: key.slice(0, sep), direction: dir, active: true,
        state: c.state, due: c.due, stability: c.stability, difficulty: c.difficulty,
        scheduled_days: c.scheduled_days, reps: c.reps, lapses: c.lapses,
        learning_steps: c.learning_steps, last_review: c.last_review || null
      };
    }).filter(Boolean);
    if (!rows.length) return null;
    var res = await client.from("kana_cards").upsert(rows, { onConflict: "user_id,kana_id,direction", ignoreDuplicates: true });
    if (res.error) throw res.error;
    var all = await client.from("kana_cards").select("*").eq("user_id", user.id);
    if (all.error) throw all.error;
    return all.data;
  }
  async function saveKanaPrefsRemote(prefs) {
    if (isGuestMode() || !getClient() || !currentUser()) return;
    var client = getClient(), user = currentUser();
    // upsert (not update) so it also works before fetchAllFromServer has
    // created the settings row; on conflict only kana_prefs is touched.
    var res = await client.from("flashcard_settings").upsert({ user_id: user.id, kana_prefs: prefs || {} }, { onConflict: "user_id" });
    if (res.error) throw res.error;
  }
  // Kana FSRS knobs: mutate the cache first (so an offline change still takes
  // effect and isn't lost), then best-effort push the whole blob -- same
  // local-first pattern as saveFsrsSettings for the vocab cards.
  async function saveKanaFsrsRemote(fsrs) {
    if (isGuestMode() || !getClient() || !currentUser()) return;
    var client = getClient(), user = currentUser();
    var res = await client.from("flashcard_settings").upsert({ user_id: user.id, kana_fsrs: fsrs || {} }, { onConflict: "user_id" });
    if (res.error) throw res.error;
  }
  function getKanaFsrs() { return store.sanitizeKanaFsrs(store.getKanaCache().fsrs); }
  async function saveKanaFsrs(patch) {
    var kc = store.getKanaCache();
    kc.fsrs = store.sanitizeKanaFsrs(Object.assign({}, kc.fsrs, patch));
    store.saveKanaCache();
    if (!isGuestMode()) await saveKanaFsrsRemote(kc.fsrs);
  }

  async function syncKanaOne(entry) {
    var client = getClient(), user = currentUser();
    var up = await client.from("kana_cards").upsert(
      { user_id: user.id, kana_id: entry.kanaId, direction: entry.direction },
      { onConflict: "user_id,kana_id,direction", ignoreDuplicates: true });
    if (up.error) throw up.error;
    var rowRes = await client.from("kana_cards").select("id,reps")
      .eq("user_id", user.id).eq("kana_id", entry.kanaId).eq("direction", entry.direction).single();
    if (rowRes.error) throw rowRes.error;
    var row = rowRes.data;

    var log = entry.logFields;
    var logRes = await client.from("kana_review_logs").insert({
      user_id: user.id, card_id: row.id, client_review_id: entry.clientReviewId,
      rating: log.rating, state: log.state, due: log.due, stability: log.stability,
      difficulty: log.difficulty, scheduled_days: log.scheduled_days, learning_steps: log.learning_steps,
      reviewed_at: log.review
    });
    if (logRes.error && logRes.error.code !== "23505") throw logRes.error; // 23505 = already synced, fine

    var payload = fsrsRowFields(entry.resultCard);
    payload.updated_at = new Date().toISOString();
    var ok = await client.from("kana_cards").update(payload).eq("id", row.id).eq("reps", entry.baseReps).select();
    if (ok.error) throw ok.error;
    if (ok.data && ok.data.length) return { done: true, cardId: row.id, card: entry.resultCard };
    // Conflict: another device moved this card first. Replay the rating on
    // the server's current state -- the log above already recorded what the
    // user saw; this only reconciles the card's live pointer.
    var serverRes = await client.from("kana_cards").select("*").eq("id", row.id).single();
    if (serverRes.error) throw serverRes.error;
    var server = serverRes.data;
    var replay = applyRating(getScheduler(kanaFsrs()), fsrsRowFields(server), new Date(log.review), RATING_NAMES[log.rating - 1]);
    var payload2 = fsrsRowFields(replay.card);
    payload2.updated_at = new Date().toISOString();
    var ok2 = await client.from("kana_cards").update(payload2).eq("id", row.id).eq("reps", server.reps).select();
    if (ok2.error) throw ok2.error;
    if (ok2.data && ok2.data.length) return { done: true, cardId: row.id, card: replay.card };
    return { done: false };
  }
  var kanaSyncing = false, kanaSyncStartedAt = 0;
  async function syncKanaOutbox() {
    if ((kanaSyncing && Date.now() - kanaSyncStartedAt < SYNC_STUCK_MS) || isGuestMode() || !configured() || !currentUser()) return;
    kanaSyncing = true;
    kanaSyncStartedAt = Date.now();
    try {
      var kc = store.getKanaCache();
      while (kc.logsOutbox.length) {
        var entry = kc.logsOutbox[0], outcome;
        try { outcome = await withTimeout(syncKanaOne(entry), "kana review sync"); }
        catch (e) { // network/other error -- stop, flag for the chip's retry
          syncErrored = true;
          console.warn("Flashcards: kana review sync failed, will retry", e);
          break;
        }
        if (!outcome.done) break;
        var key = entry.kanaId + "|" + entry.direction;
        // Reconcile the local card with what actually landed (the replay path
        // can change it) and keep the server row id for the next review.
        if (kc.cards[key]) kc.cards[key] = Object.assign({}, kc.cards[key], outcome.card, { id: outcome.cardId });
        kc.logsOutbox.shift();
        store.saveKanaCache();
        notifySyncStateChange();
      }
    } finally {
      kanaSyncing = false;
      if (totalPending() === 0) syncErrored = false;
      notifySyncStateChange();
    }
  }
  function kanaPendingCount() {
    return isGuestMode() ? 0 : (store.getKanaCache().logsOutbox || []).length;
  }

  return {
    configured: configured, getClient: getClient, currentUser: currentUser,
    signUp: signUp, signIn: signIn, signOut: signOut, initAuth: initAuth,
    resetPassword: resetPassword, updatePassword: updatePassword, clearPasswordRecovery: clearPasswordRecovery,
    onAuthChange: onAuthChange, authState: authState,
    fetchAllFromServer: fetchAllFromServer,
    addVocab: addVocab, addVocabs: addVocabs, addVocabsRemote: addVocabsRemote,
    archiveVocab: archiveVocab, archiveVocabs: archiveVocabs, setTablePaused: setTablePaused,
    saveFsrsSettings: saveFsrsSettings, saveQueueSettings: saveQueueSettings,
    saveDirectionSettings: saveDirectionSettings, refreshData: refreshData,
    saveTableCustomRemote: saveTableCustomRemote, saveTableCustomRemoteQueued: saveTableCustomRemoteQueued,
    syncTableCustomIfDirty: syncTableCustomIfDirty,
    customVocabAddRows: customVocabAddRows, customVocabDeleteRows: customVocabDeleteRows,
    customVocabAddTable: customVocabAddTable, customVocabDeleteTable: customVocabDeleteTable,
    customVocabAddRowsQueued: customVocabAddRowsQueued, customVocabDeleteRowsQueued: customVocabDeleteRowsQueued,
    customVocabAddTableQueued: customVocabAddTableQueued, customVocabDeleteTableQueued: customVocabDeleteTableQueued,
    syncCvOutbox: syncCvOutbox,
    recordStudyActivity: recordStudyActivity, syncOutbox: syncOutbox, syncNow: syncNow, withTimeout: withTimeout,
    onSyncStateChange: onSyncStateChange, getSyncState: getSyncState, pendingItems: pendingItems,
    fetchKanaFromServer: fetchKanaFromServer, saveKanaPrefsRemote: saveKanaPrefsRemote,
    getKanaFsrs: getKanaFsrs, saveKanaFsrs: saveKanaFsrs,
    syncKanaOutbox: syncKanaOutbox, kanaPendingCount: kanaPendingCount
  };
})();
