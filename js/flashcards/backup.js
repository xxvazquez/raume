// Flashcards -- backup & restore (RaumeStudy.flashcards.backup).
//
// One file format, "raume-backup", for both modes:
//
// Guest mode keeps everything in this browser's localStorage, so clearing site
// data (or switching browsers) loses it. A guest file's `data` holds that
// on-device data: the flashcard cache (cards, review history, settings, paused
// tables), the Kana trainer cache, table names/icons/order, the reader's own
// custom words, the kanji they marked Known and their finished games.
// Restoring it REPLACES the on-device data with the file's contents.
//
// Signed in, the account is the only full copy (the local caches are cleared
// on sign-out, and Supabase's free plan keeps no backups), so a signed-in
// file's `account` holds every row the account owns, read with the same
// anon-key queries the app makes: cards with their FSRS state, every review,
// Kana cards and reviews, the settings row (table customisations, paused
// tables, word edits, Known kanji, games...), custom tables and words, and
// every note. Restoring MERGES into the account: it adds what is missing,
// moves a card forward only when the file has more reviews than the account,
// replaces a note only with a newer one, and never deletes anything.
//
// Built-in vocabulary is never copied in -- cards reference it by vocab_id, so
// a backup stays valid as the reference data grows. The caller reloads after
// a restore so every module re-reads its data.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.backup = (function () {
  "use strict";

  var store = window.RaumeStudy.flashcards.store;
  var FORMAT = "raume-backup";
  // 2 added `account` (signed-in backups); a guest file's shape is unchanged.
  var VERSION = 2;
  var LAST_KEY = "raume-last-backup";

  function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
  function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

  function dataOps() { return window.RaumeStudy.flashcards.dataOps; }
  // "device" (guest: this browser's data), "account" (signed in) or null
  // (signed out, or no Supabase project to read).
  function mode() {
    if (store.isGuestMode()) return "device";
    var ops = dataOps();
    return ops && ops.configured() && ops.currentUser() ? "account" : null;
  }
  function available() { return mode() !== null; }

  // When this device last saved a backup (either mode): the Settings row's
  // quiet reminder. Per device -- it's about the files this device made.
  function lastBackupAt() {
    try {
      var v = window.localStorage.getItem(LAST_KEY);
      return v && !isNaN(Date.parse(v)) ? v : null;
    } catch (e) { return null; }
  }
  function markSaved(result) {
    if (result === "shared" || result === "download") {
      try { window.localStorage.setItem(LAST_KEY, new Date().toISOString()); } catch (e) {}
    }
    return result;
  }

  // Guest custom words never go through a live cache the way the others do, so
  // read the guest key directly (sanitised the same way the module loads it).
  function readCustomVocab() {
    var cv = window.RaumeStudy.customVocab;
    try {
      var raw = window.localStorage.getItem(cv.GUEST_KEY);
      var clean = cv.sanitize(raw ? JSON.parse(raw) : null);
      return clean.tables.length || clean.rows.length ? clean : null;
    } catch (e) { return null; }
  }

  // Kanji marked Known and finished puzzle games: device-wide stores (not
  // split guest / signed-in), read through their own modules.
  function knownKanji() {
    var kk = window.RaumeStudy.knownKanji;
    var all = kk ? kk.getAll() : {};
    return Object.keys(all).length ? all : null;
  }
  function wordEdits() {
    var we = window.RaumeStudy.wordEdits;
    var all = we ? we.getAll() : {};
    return Object.keys(all).length ? all : null;
  }
  function puzzleRuns() {
    var pr = window.RaumeStudy.flashcards.puzzleRuns;
    var all = pr ? pr.all() : [];
    return all.length ? all : null;
  }

  function buildBackup() {
    var cache = clone(store.getCache());
    var kana = clone(store.getKanaCache());
    // Guest data never has an account or a sync queue; drop them so a backup
    // is the same regardless of what this device last did.
    cache.userId = null; cache.logsOutbox = [];
    kana.userId = null; kana.logsOutbox = [];
    var tableCustom = window.RaumeStudy.tableCustom.getAll();
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        flashcards: cache,
        kana: kana,
        tableCustom: Object.keys(tableCustom).length ? tableCustom : null,
        customVocab: readCustomVocab(),
        knownKanji: knownKanji(),
        wordEdits: wordEdits(),
        puzzleRuns: puzzleRuns()
      }
    };
  }

  function fileName() { return "raume-backup-" + store.localDateStr(new Date()) + ".json"; }

  // iPhone / iPad hand the file to the share sheet (Save to Files, AirDrop,
  // Mail), as an iOS app exports: an <a download> in the home-screen app has
  // no downloads bar and can open a dead-end viewer or do nothing. Desktop
  // and Android keep the plain download -- a share sheet there would be a
  // detour.
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function canShareFile(file) {
    try { return isIOS() && !!navigator.share && !!navigator.canShare && navigator.canShare({ files: [file] }); }
    catch (e) { return false; }
  }
  // The last download's object URL lives until the next backup or a minute
  // on -- revoked at once, WebKit could drop the blob before reading it.
  var lastUrl = null, lastUrlTimer = null;
  function releaseUrl() {
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = null;
    clearTimeout(lastUrlTimer);
  }
  function saveByDownload(blob, name) {
    releaseUrl();
    lastUrl = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = lastUrl; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    lastUrlTimer = setTimeout(releaseUrl, 60000);
  }
  function fileFor(json) {
    return typeof File === "function" ? new File([json], fileName(), { type: "application/json" }) : null;
  }
  // Whether saving `json` goes through the share sheet. That needs a tap of
  // its own: an account backup is read from the network first, and by then
  // the tap that asked for it is too old for WebKit to open the sheet.
  function needsShareTap(json) {
    var file = fileFor(json);
    return !!file && canShareFile(file);
  }
  // Resolves "shared", "download" or "cancelled" (the share sheet closed
  // without saving -- not an error); rejects only when the share sheet
  // itself failed for another reason.
  function saveText(json) {
    var name = fileName();
    var file = fileFor(json);
    if (file && canShareFile(file)) {
      // Called straight from a tap: the share sheet needs that gesture.
      return navigator.share({ files: [file] }).then(function () { return markSaved("shared"); }, function (e) {
        if (e && e.name === "AbortError") return "cancelled";
        throw e;
      });
    }
    saveByDownload(new Blob([json], { type: "application/json" }), name);
    return Promise.resolve(markSaved("download"));
  }
  function downloadBackup() { return saveText(JSON.stringify(buildBackup(), null, 2)); }

  // --- Signed in: the account's rows ---
  // Each table read whole (fetchAllRows pages past Supabase's 1000-row cap),
  // without user_id -- a restore stamps the signed-in account's own.
  function strip(rows) {
    return (rows || []).map(function (r) { var o = Object.assign({}, r); delete o.user_id; return o; });
  }
  async function readAll(client, uid, table) {
    var res = await dataOps().fetchAllRows(function () { return client.from(table).select("*").eq("user_id", uid); });
    if (res.error) throw res.error;
    return strip(res.data);
  }
  // Notes can be up to 5 MB each, so their html comes a few at a time.
  var NOTE_BATCH = 4;
  async function readNotes(client, uid) {
    var meta = await dataOps().fetchAllRows(function () { return client.from("notes").select("id").eq("user_id", uid); });
    if (meta.error) throw meta.error;
    var ids = meta.data.map(function (r) { return r.id; }), out = [];
    for (var i = 0; i < ids.length; i += NOTE_BATCH) {
      var res = await client.from("notes").select("*").eq("user_id", uid).in("id", ids.slice(i, i + NOTE_BATCH));
      if (res.error) throw res.error;
      out = out.concat(strip(res.data));
    }
    return out;
  }
  async function buildAccountBackup() {
    var ops = dataOps(), client = ops.getClient(), user = ops.currentUser();
    if (!client || !user) throw new Error("sign in again, then try once more.");
    var uid = user.id;
    var settings = await client.from("flashcard_settings").select("*").eq("user_id", uid).maybeSingle();
    if (settings.error) throw settings.error;
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      account: {
        flashcards: await readAll(client, uid, "flashcards"),
        reviewLogs: await readAll(client, uid, "review_logs"),
        kanaCards: await readAll(client, uid, "kana_cards"),
        kanaReviewLogs: await readAll(client, uid, "kana_review_logs"),
        settings: settings.data ? strip([settings.data])[0] : null,
        customTables: await readAll(client, uid, "custom_tables"),
        customRows: await readAll(client, uid, "custom_rows"),
        notes: await readNotes(client, uid)
      }
    };
  }
  // The file's text, ready for saveText().
  async function prepareAccountBackup() { return JSON.stringify(await buildAccountBackup()); }

  // Parse + validate a backup file's text. Every section goes back through the
  // same validator the live app uses to load that data, so a hand-edited or
  // partly-corrupt file can drop bad records but can't put the app in a shape
  // it can't read. Returns { ok:true, backup, summary } or { ok:false, error }.
  function parseBackup(text) {
    var raw;
    try { raw = JSON.parse(text); } catch (e) { return { ok: false, error: "That file isn't a valid backup (it isn't readable JSON)." }; }
    if (!isPlainObject(raw) || raw.format !== FORMAT || !(isPlainObject(raw.data) || isPlainObject(raw.account))) {
      return { ok: false, error: "That file isn't a raume backup." };
    }
    if (typeof raw.version !== "number" || raw.version > VERSION) {
      return { ok: false, error: "That backup was made by a newer version of raume. Reload the page to update, then try again." };
    }
    if (isPlainObject(raw.account)) return parseAccount(raw);
    var d = raw.data;
    var cv = window.RaumeStudy.customVocab;
    var flashcards = d.flashcards == null ? null : store.validateCache(d.flashcards);
    var kana = d.kana == null ? null : store.validateKanaCache(d.kana);
    if (d.flashcards != null && !flashcards) return { ok: false, error: "The flashcards section of that backup is damaged." };
    if (d.kana != null && !kana) return { ok: false, error: "The Kana section of that backup is damaged." };
    if (flashcards) { flashcards.userId = null; flashcards.logsOutbox = []; }
    if (kana) { kana.userId = null; kana.logsOutbox = []; }
    var tableCustom = isPlainObject(d.tableCustom) && Object.keys(d.tableCustom).length ? clone(d.tableCustom) : null;
    var customVocab = null;
    if (d.customVocab != null) {
      var clean = cv.sanitize(d.customVocab);
      if (clean.tables.length || clean.rows.length) customVocab = clean;
    }
    // Backups from before these existed don't mention them -- leave the
    // device's own untouched then (undefined) rather than clearing them.
    var kk = window.RaumeStudy.knownKanji, pr = window.RaumeStudy.flashcards.puzzleRuns;
    var known = !("knownKanji" in d) ? undefined : kk ? kk.sanitize(d.knownKanji) : null;
    if (known && !Object.keys(known).length) known = null;
    var we = window.RaumeStudy.wordEdits;
    var edits = !("wordEdits" in d) ? undefined : we ? we.sanitize(d.wordEdits) : null;
    if (edits && !Object.keys(edits).length) edits = null;
    var runs = !("puzzleRuns" in d) ? undefined : pr ? pr.sanitize(d.puzzleRuns) : null;
    if (runs && !runs.length) runs = null;
    var backup = { flashcards: flashcards, kana: kana, tableCustom: tableCustom, customVocab: customVocab, knownKanji: known, wordEdits: edits, puzzleRuns: runs };
    return { ok: true, kind: "device", backup: backup, summary: summarize(backup, raw.exportedAt) };
  }

  // An account file: each section a list of rows (the settings row an
  // object). Rows missing what a restore keys on are dropped; the rest go
  // to Postgres as they are, which checks every column itself.
  var ACCOUNT_LISTS = {
    flashcards: ["vocab_id", "direction"], reviewLogs: ["card_id", "client_review_id"],
    kanaCards: ["kana_id", "direction"], kanaReviewLogs: ["card_id", "client_review_id"],
    customTables: ["id", "title"], customRows: ["id", "target_table"], notes: ["id", "title", "html"]
  };
  function parseAccount(raw) {
    var a = raw.account, out = {};
    var damaged = Object.keys(ACCOUNT_LISTS).filter(function (k) { return k in a && !Array.isArray(a[k]); });
    if (damaged.length || ("settings" in a && a.settings !== null && !isPlainObject(a.settings))) {
      return { ok: false, error: "That backup is damaged." };
    }
    Object.keys(ACCOUNT_LISTS).forEach(function (k) {
      out[k] = strip((a[k] || []).filter(function (r) {
        return isPlainObject(r) && ACCOUNT_LISTS[k].every(function (f) { return typeof r[f] === "string" && r[f] !== ""; });
      }));
    });
    out.settings = isPlainObject(a.settings) ? strip([a.settings])[0] : null;
    var words = {};
    out.flashcards.forEach(function (c) { words[c.vocab_id] = true; });
    return {
      ok: true, kind: "account", backup: { account: out },
      summary: {
        exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : null,
        words: Object.keys(words).length, cards: out.flashcards.length, reviews: out.reviewLogs.length,
        kanaCards: out.kanaCards.length, customWords: out.customRows.length, notes: out.notes.length
      }
    };
  }

  function summarize(b, exportedAt) {
    var cards = b.flashcards ? Object.keys(b.flashcards.cards) : [];
    var words = {};
    cards.forEach(function (id) { words[b.flashcards.cards[id].vocabId] = true; });
    return {
      exportedAt: typeof exportedAt === "string" ? exportedAt : null,
      words: Object.keys(words).length,
      cards: cards.length,
      kanaCards: b.kana ? Object.keys(b.kana.cards).length : 0,
      customWords: b.customVocab ? b.customVocab.rows.length : 0,
      customisedTables: b.tableCustom ? Object.keys(b.tableCustom).length : 0,
      knownKanji: b.knownKanji ? Object.keys(b.knownKanji).filter(function (id) { return b.knownKanji[id].k; }).length : 0,
      editedWords: b.wordEdits ? Object.keys(b.wordEdits).filter(function (id) { return !b.wordEdits[id].x; }).length : 0,
      puzzleGames: b.puzzleRuns ? b.puzzleRuns.length : 0
    };
  }

  // Write the parsed backup over the on-device data. Sections the backup didn't
  // have are cleared (replace, not merge). If any write fails (storage full or
  // blocked), everything already written is put back so a failed restore never
  // leaves a half-old, half-new mix.
  function applyBackup(b) {
    var cv = window.RaumeStudy.customVocab;
    var plan = [
      [store.GUEST_CACHE_KEY, b.flashcards],
      [store.KANA_GUEST_KEY, b.kana],
      [window.RaumeStudy.tableCustom.STORAGE_KEY, b.tableCustom],
      [cv.GUEST_KEY, b.customVocab]
    ];
    if (b.knownKanji !== undefined && window.RaumeStudy.knownKanji) plan.push([window.RaumeStudy.knownKanji.STORAGE_KEY, b.knownKanji]);
    if (b.wordEdits !== undefined && window.RaumeStudy.wordEdits) plan.push([window.RaumeStudy.wordEdits.STORAGE_KEY, b.wordEdits]);
    if (b.puzzleRuns !== undefined && window.RaumeStudy.flashcards.puzzleRuns) plan.push([window.RaumeStudy.flashcards.puzzleRuns.STORAGE_KEY, b.puzzleRuns]);
    var before = [];
    try {
      plan.forEach(function (step) { before.push([step[0], window.localStorage.getItem(step[0])]); });
      plan.forEach(function (step) {
        if (step[1]) window.localStorage.setItem(step[0], JSON.stringify(step[1]));
        else window.localStorage.removeItem(step[0]);
      });
      return { ok: true };
    } catch (e) {
      before.forEach(function (prev) {
        try {
          if (prev[1] == null) window.localStorage.removeItem(prev[0]);
          else window.localStorage.setItem(prev[0], prev[1]);
        } catch (e2) {}
      });
      return { ok: false, error: "Couldn't save the restored data on this device (is the browser's storage full or blocked?). Nothing was changed." };
    }
  }

  // --- Signed in: merge a file into the account ---
  // Adds what the account is missing and never deletes. A card the account
  // already has moves forward only when the file has more reviews on it
  // (guarded on the account's reps, as a review is); a review is added once
  // (client_review_id); a note is replaced only by a newer copy.
  var CHUNK = 500;
  var FSRS_FIELDS = ["active", "state", "due", "stability", "difficulty", "scheduled_days", "reps", "lapses", "learning_steps", "last_review"];
  function pick(row, fields) {
    var o = {};
    fields.forEach(function (f) { if (f in row) o[f] = row[f]; });
    return o;
  }
  function ok(res) { if (res.error) throw res.error; return res.data; }
  // Cards first (by their natural key, so a file from another project or
  // account maps onto this one's ids), then their reviews.
  async function mergeCards(client, uid, cardTable, logTable, keyCol, cards, logs) {
    var have = ok(await dataOps().fetchAllRows(function () {
      return client.from(cardTable).select("id," + keyCol + ",direction,reps").eq("user_id", uid);
    }));
    function key(r) { return r[keyCol] + "|" + r.direction; }
    var byKey = {}, idMap = {}, missing = [], behind = [], added = 0, moved = 0;
    have.forEach(function (r) { byKey[key(r)] = r; });
    cards.forEach(function (c) {
      var s = byKey[key(c)];
      if (!s) { var row = pick(c, FSRS_FIELDS.concat([keyCol, "direction", "created_at"])); row.user_id = uid; missing.push(row); }
      else if ((c.reps || 0) > (s.reps || 0)) behind.push({ server: s, card: c });
      if (s) idMap[c.id] = s.id;
    });
    var oldIdByKey = {};
    cards.forEach(function (c) { oldIdByKey[key(c)] = c.id; });
    for (var i = 0; i < missing.length; i += CHUNK) {
      var made = ok(await client.from(cardTable).insert(missing.slice(i, i + CHUNK)).select("id," + keyCol + ",direction"));
      made.forEach(function (r) { idMap[oldIdByKey[key(r)]] = r.id; });
      added += made.length;
    }
    for (var j = 0; j < behind.length; j++) {
      var b = behind[j], patch = pick(b.card, FSRS_FIELDS);
      patch.updated_at = new Date().toISOString();
      var upd = ok(await client.from(cardTable).update(patch).eq("id", b.server.id).eq("reps", b.server.reps || 0).select("id"));
      moved += upd.length;
    }
    var logRows = logs.filter(function (l) { return idMap[l.card_id]; }).map(function (l) {
      var r = Object.assign({}, l, { card_id: idMap[l.card_id], user_id: uid });
      delete r.id;
      return r;
    });
    var reviews = 0;
    for (var k = 0; k < logRows.length; k += CHUNK) {
      var put = ok(await client.from(logTable).upsert(logRows.slice(k, k + CHUNK), { onConflict: "user_id,client_review_id", ignoreDuplicates: true }).select("id"));
      reviews += put.length;
    }
    return { cards: added, movedOn: moved, reviews: reviews };
  }
  async function mergeById(client, uid, table, rows) {
    var added = 0;
    for (var i = 0; i < rows.length; i += CHUNK) {
      var chunk = rows.slice(i, i + CHUNK).map(function (r) { return Object.assign({}, r, { user_id: uid }); });
      added += ok(await client.from(table).upsert(chunk, { onConflict: "id", ignoreDuplicates: true }).select("id")).length;
    }
    return added;
  }
  async function mergeNotes(client, uid, notes) {
    var have = ok(await dataOps().fetchAllRows(function () { return client.from("notes").select("id,updated_at").eq("user_id", uid); }));
    var byId = {}, added = 0, updated = 0;
    have.forEach(function (n) { byId[n.id] = n; });
    for (var i = 0; i < notes.length; i++) {
      var n = Object.assign({}, notes[i], { user_id: uid }), s = byId[n.id];
      if (!s) {
        var res = await client.from("notes").insert(n);
        // That id is taken outside this account (a file from another
        // account in the same project): add it as a new note instead.
        if (res.error && res.error.code === "23505") { delete n.id; res = await client.from("notes").insert(n); }
        ok(res); added++;
      } else if (Date.parse(n.updated_at) > Date.parse(s.updated_at)) {
        var fields = pick(n, ["title", "note_date", "html", "size", "source", "updated_at"]);
        ok(await client.from("notes").update(fields).eq("id", s.id).eq("user_id", uid)); updated++;
      }
    }
    return { added: added, updated: updated };
  }
  // The settings row: a missing row comes back whole; otherwise every
  // setting the account has stays, and each list or map gains what the file
  // adds (the newer edit winning, as a sync does).
  function newerById(a, b) {
    var out = Object.assign({}, a);
    Object.keys(b).forEach(function (id) { if (!out[id] || (b[id] && b[id].t > out[id].t)) out[id] = b[id]; });
    return out;
  }
  function mergedSettings(server, file) {
    var patch = {};
    function set(col, v) { if (JSON.stringify(v) !== JSON.stringify(server[col])) patch[col] = v; }
    var kk = window.RaumeStudy.knownKanji, we = window.RaumeStudy.wordEdits, pr = window.RaumeStudy.flashcards.puzzleRuns;
    if (Array.isArray(file.paused_tables)) {
      var seen = {}, list = (server.paused_tables || []).concat(file.paused_tables).map(String).filter(function (t) { return !seen[t] && (seen[t] = true); });
      set("paused_tables", list);
    }
    if (isPlainObject(file.leech_kept)) set("leech_kept", store.mergeLeechKept(store.cleanLeechKept(server.leech_kept), store.cleanLeechKept(file.leech_kept)));
    if (isPlainObject(file.journey)) set("journey", store.mergeJourney(store.cleanJourney(server.journey), store.cleanJourney(file.journey)));
    if (isPlainObject(file.known_kanji) && kk) set("known_kanji", newerById(kk.sanitize(server.known_kanji), kk.sanitize(file.known_kanji)));
    if (isPlainObject(file.word_edits) && we) set("word_edits", newerById(we.sanitize(server.word_edits), we.sanitize(file.word_edits)));
    if (isPlainObject(file.table_custom)) set("table_custom", Object.assign({}, file.table_custom, server.table_custom || {}));
    if (Array.isArray(file.puzzle_runs) && pr) {
      var byId = {};
      pr.sanitize(file.puzzle_runs).concat(pr.sanitize(server.puzzle_runs)).forEach(function (r) { byId[r.id] = r; });
      set("puzzle_runs", pr.sanitize(Object.keys(byId).map(function (id) { return byId[id]; })));
    }
    ["kana_prefs", "kana_fsrs"].forEach(function (col) {
      if (isPlainObject(file[col]) && Object.keys(file[col]).length && !Object.keys(server[col] || {}).length) set(col, file[col]);
    });
    if ((file.longest_streak || 0) > (server.longest_streak || 0)) patch.longest_streak = file.longest_streak;
    return patch;
  }
  async function mergeSettingsRow(client, uid, file) {
    if (!file) return false;
    var server = ok(await client.from("flashcard_settings").select("*").eq("user_id", uid).maybeSingle());
    if (!server) { ok(await client.from("flashcard_settings").insert(Object.assign({}, file, { user_id: uid }))); return true; }
    var patch = mergedSettings(server, file);
    if (!Object.keys(patch).length) return false;
    ok(await client.from("flashcard_settings").update(patch).eq("user_id", uid));
    return true;
  }
  // Resolves a tally of what changed; rejects on the first failed write
  // (what landed before it stays -- each step only ever adds, so running
  // the restore again finishes the rest).
  async function restoreAccount(b) {
    var ops = dataOps(), client = ops.getClient(), user = ops.currentUser();
    if (!client || !user) throw new Error("sign in again, then try once more.");
    var a = b.account, uid = user.id;
    // Custom tables before their words, and both before the cards that
    // reference those words.
    var customTables = await mergeById(client, uid, "custom_tables", a.customTables);
    var customWords = await mergeById(client, uid, "custom_rows", a.customRows);
    var words = await mergeCards(client, uid, "flashcards", "review_logs", "vocab_id", a.flashcards, a.reviewLogs);
    var kana = await mergeCards(client, uid, "kana_cards", "kana_review_logs", "kana_id", a.kanaCards, a.kanaReviewLogs);
    var settings = await mergeSettingsRow(client, uid, a.settings);
    var notes = await mergeNotes(client, uid, a.notes);
    return { customTables: customTables, customWords: customWords, words: words, kana: kana, settings: settings, notes: notes };
  }

  return {
    FORMAT: FORMAT, VERSION: VERSION,
    available: available, mode: mode, buildBackup: buildBackup, fileName: fileName, downloadBackup: downloadBackup,
    parseBackup: parseBackup, applyBackup: applyBackup,
    saveText: saveText, needsShareTap: needsShareTap, lastBackupAt: lastBackupAt,
    buildAccountBackup: buildAccountBackup, prepareAccountBackup: prepareAccountBackup,
    restoreAccount: restoreAccount, mergedSettings: mergedSettings
  };
})();
