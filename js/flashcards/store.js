// Flashcards -- state & storage (RaumeStudy.flashcards.store).
//
// The versioned, validated, disposable local cache plus the guest-vs-signed-in
// mode preference. In guest mode this cache *is* the record (its own
// localStorage key); signed in it is only a read-through copy of Supabase plus
// an offline outbox. Also holds the small shared vocabulary of the feature
// (direction ids/labels, rating names) and two persistence helpers (uuid,
// localDateStr). See the load-order comment in index.html.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.store = (function () {
  "use strict";

  var DIRECTIONS = ["jp-en", "jp-ro", "ro-en", "en-ro"];
  var DIRECTION_LABEL = {
    "jp-en": "Japanese → English",
    "jp-ro": "Japanese → Romaji",
    "ro-en": "Romaji → English",
    "en-ro": "English → Romaji"
  };
  var RATING_NAMES = ["Again", "Hard", "Good", "Easy"];
  // localStorage keys. Old "sakura-*" names (the app's former name) are moved
  // across once by js/storage-migration.js before this module loads.
  var CACHE_KEY = "raume-flashcards-cache-v1";
  var GUEST_CACHE_KEY = "raume-flashcards-guest-v1";
  var MODE_KEY = "raume-flashcards-mode";
  var CACHE_SCHEMA_VERSION = 1;

  // Two ways to use Flashcards: signed in (Supabase is authoritative) or
  // entirely on-device ("guest" mode -- localStorage only, no account, no
  // network, nothing to set up). Guest mode is a stored preference, not a
  // session -- it's guest mode whenever there's no active Supabase session and
  // the user has previously chosen it. The active session is pushed in here by
  // the auth layer (data-ops) via setSession().
  //
  // inMemoryMode is a same-pageview fallback for when localStorage itself
  // is unavailable (private browsing in some browsers throws on any access,
  // rather than just declining to persist) -- without it, choosing "guest
  // mode" would silently fail to take effect at all rather than just fail
  // to be *remembered* next visit.
  var inMemoryMode = null;
  var currentSession = null;
  function setSession(session) { currentSession = session; }
  function getStoredMode() {
    try { return localStorage.getItem(MODE_KEY); } catch (e) { return inMemoryMode; }
  }
  function setStoredMode(m) {
    inMemoryMode = m;
    try { if (m) localStorage.setItem(MODE_KEY, m); else localStorage.removeItem(MODE_KEY); } catch (e) {}
  }
  function isGuestMode() { return !currentSession && getStoredMode() === "guest"; }
  function hasActiveSession() { return isGuestMode() || !!currentSession; }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function localDateStr(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // -----------------------------------------------------------------------
  // Local cache -- versioned, validated, disposable. Never authoritative.
  // -----------------------------------------------------------------------
  function defaultSettings() {
    return {
      fsrs_request_retention: 0.9, fsrs_maximum_interval: 36500, fsrs_enable_fuzz: false,
      queue_new_cards_per_day: 20, schema_version: 1,
      current_streak: 0, longest_streak: 0, last_study_date: null,
      // Which of the 4 directions actually get studied -- not an FSRS
      // setting, and independent of which cards exist: turning a direction
      // off just leaves its cards out of the queue/stats, never deletes or
      // resets them. All on by default, same as before this setting existed.
      enabled_directions: { "jp-en": true, "jp-ro": true, "ro-en": true, "en-ro": true }
    };
  }
  function emptyCache(userId) {
    return { schemaVersion: CACHE_SCHEMA_VERSION, userId: userId || null, cards: {}, logsOutbox: [], reviewLogs: [], settings: defaultSettings(), day: null, pausedTables: [], lastSyncedAt: null };
  }
  function isValidCardRecord(c) {
    return c && typeof c.id === "string" && typeof c.vocabId === "string" && DIRECTIONS.indexOf(c.direction) !== -1 &&
      typeof c.state === "number" && typeof c.due === "string" && typeof c.reps === "number";
  }
  function validateCache(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.schemaVersion !== "number") return null;
    if (!raw.cards || typeof raw.cards !== "object") return null;
    if (!Array.isArray(raw.logsOutbox)) return null;
    var cards = {};
    Object.keys(raw.cards).forEach(function (id) {
      if (isValidCardRecord(raw.cards[id])) cards[id] = raw.cards[id];
    });
    return {
      schemaVersion: raw.schemaVersion, userId: raw.userId || null, cards: cards,
      logsOutbox: raw.logsOutbox.filter(function (e) { return e && e.clientReviewId && e.cardId; }),
      // Only ever used in guest mode (signed-in mode reads its history from
      // Supabase's review_logs instead) -- one entry per review, carrying the
      // day plus (for the Dashboard's mistake insights) a timestamp, the
      // vocab id, the rating and whether the typed answer was wrong. Capped so
      // it can't grow forever; older {date}-only entries are still valid.
      reviewLogs: Array.isArray(raw.reviewLogs) ? raw.reviewLogs.filter(function (e) { return e && typeof e.date === "string"; }).slice(-1000) : [],
      settings: mergeSettings(raw.settings),
      // New cards introduced today, so the daily allowance holds across
      // multiple sessions in one day, not just within a single queue build --
      // same {date, count} shape as the Kana trainer's identical tracker
      // (js/flashcards/kana.js). Device-local only, like Kana's: not synced
      // to Supabase, so two devices studied the same day each get their own
      // allowance -- a pre-existing limitation this shares with Kana, not a
      // new one.
      day: raw.day && typeof raw.day.date === "string" ? { date: raw.day.date, count: raw.day.count | 0 } : null,
      // Whole tables paused as a unit -- an overlay of table ids, not a state
      // on the cards. Their cards keep their own active/archived flag; this
      // list just holds them out of review, the stat tiles and the Manage
      // filters until the table is resumed. Synced via flashcard_settings.
      pausedTables: Array.isArray(raw.pausedTables) ? raw.pausedTables.filter(function (t) { return typeof t === "string"; }) : [],
      lastSyncedAt: raw.lastSyncedAt || null
    };
  }
  // Object.assign is shallow, which would let a stored settings blob missing
  // (or only partially specifying) enabled_directions silently wipe out the
  // rest of that nested object's defaults -- merge it one level deeper so an
  // older cache (from before this setting existed) still comes back with
  // every direction enabled, not undefined/missing ones treated as off.
  function mergeSettings(raw) {
    var merged = Object.assign(defaultSettings(), raw && typeof raw === "object" ? raw : {});
    merged.enabled_directions = Object.assign({}, defaultSettings().enabled_directions, (raw && raw.enabled_directions) || {});
    return merged;
  }
  // Slot for future cache-shape upgrades -- a no-op today, kept so a v2
  // change has somewhere to live instead of a rewrite.
  function migrate(raw) {
    if (!raw || raw.schemaVersion === CACHE_SCHEMA_VERSION) return raw;
    return raw; // no migrations defined yet
  }

  // Guest mode and signed-in mode keep entirely separate caches (different
  // localStorage keys) so switching between them never overwrites or mixes
  // the other's data -- both are simply preserved, whichever you come back to.
  function cacheKey() { return isGuestMode() ? GUEST_CACHE_KEY : CACHE_KEY; }
  var cache = null;
  var cacheLoadedKey = null;
  // Same reasoning as inMemoryMode above: if localStorage itself is
  // unavailable, saveCache() below still keeps a same-pageview copy here so
  // that switching modes and back within one visit doesn't discard data
  // that was already added -- without this, loadCache() would rebuild an
  // empty cache from scratch every time the active key changes, even though
  // nothing was actually lost, just never persisted anywhere to read back.
  var inMemoryCaches = {};
  function loadCache() {
    var key = cacheKey();
    try {
      var raw = window.localStorage && localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : null;
      var validated = validateCache(migrate(parsed));
      cache = validated || inMemoryCaches[key] || emptyCache();
    } catch (e) {
      cache = inMemoryCaches[key] || emptyCache();
    }
    cacheLoadedKey = key;
    return cache;
  }
  function saveCache() {
    var key = cacheKey();
    inMemoryCaches[key] = cache;
    try { localStorage.setItem(key, JSON.stringify(cache)); } catch (e) {}
  }
  function getCache() {
    // Re-load if the active mode changed which key we should be reading
    // (e.g. signing in after having used guest mode) rather than continuing
    // to read/write the wrong one.
    if (!cache || cacheLoadedKey !== cacheKey()) return loadCache();
    return cache;
  }
  // Paused-tables overlay (see validateCache). Table ids are compared as
  // strings -- vocabulary.js has both numeric and string ids.
  function pausedTables() { return (getCache().pausedTables || []).slice(); }
  function isTablePaused(tableId) { return (getCache().pausedTables || []).indexOf(String(tableId)) !== -1; }
  function setTablePausedLocal(tableId, paused) {
    var c = getCache();
    var id = String(tableId);
    var list = (c.pausedTables || []).filter(function (t) { return t !== id; });
    if (paused) list.push(id);
    c.pausedTables = list;
    saveCache();
    return list;
  }
  function resetCacheForUser(userId) {
    cache = emptyCache(userId);
    cacheLoadedKey = cacheKey();
    saveCache();
  }

  // -----------------------------------------------------------------------
  // Kana trainer cache -- the "Kana" tab's own store, the exact same
  // guest-vs-signed-in split as the vocab cache above but a much smaller
  // shape (no FSRS settings, no streak). Guest mode keeps its record under
  // the original single key; signed in this is a read-through copy of the
  // kana_cards table plus its own offline review outbox. The card values are
  // keyed "<kanaId>|<direction>" and carry the FSRS fields plus, when signed
  // in, the server row's `id` (for the review-log foreign key).
  // -----------------------------------------------------------------------
  var KANA_GUEST_KEY = "raume-kana-v1";
  var KANA_CACHE_KEY = "raume-kana-cache-v1";
  var KANA_DEFAULT_GROUPS = ["hira-gojuon"]; // mirrors kanaData.DEFAULT_GROUPS
  // FSRS knobs for the Kana trainer -- the library defaults (same as a fresh
  // vocab-flashcards account), but tuned independently in the Settings tab and
  // synced through the `kana_fsrs` column, so the two trainers never share a
  // retention target. `new_per_day` is pacing, not an FSRS setting, but it
  // rides in the same blob.
  function defaultKanaFsrs() {
    return { fsrs_request_retention: 0.9, fsrs_maximum_interval: 36500, fsrs_enable_fuzz: false, new_per_day: 15 };
  }
  function sanitizeKanaFsrs(raw) {
    var d = defaultKanaFsrs();
    if (!raw || typeof raw !== "object") return d;
    var ret = Number(raw.fsrs_request_retention), maxI = Number(raw.fsrs_maximum_interval), npd = Number(raw.new_per_day);
    return {
      fsrs_request_retention: ret >= 0.7 && ret <= 0.99 ? ret : d.fsrs_request_retention,
      fsrs_maximum_interval: maxI >= 1 && maxI <= 36500 ? Math.round(maxI) : d.fsrs_maximum_interval,
      fsrs_enable_fuzz: raw.fsrs_enable_fuzz === true,
      new_per_day: npd >= 0 && npd <= 1000 ? Math.round(npd) : d.new_per_day
    };
  }
  function emptyKanaCache(userId) {
    return { v: 1, userId: userId || null, groups: KANA_DEFAULT_GROUPS.slice(), dirs: { k2r: true, r2k: true }, fsrs: defaultKanaFsrs(), cards: {}, day: null, logsOutbox: [] };
  }
  function validateKanaCache(raw) {
    if (!raw || typeof raw !== "object" || !raw.cards || typeof raw.cards !== "object") return null;
    var d = { k2r: raw.dirs && raw.dirs.k2r === false ? false : true, r2k: raw.dirs && raw.dirs.r2k === false ? false : true };
    if (!d.k2r && !d.r2k) { d.k2r = true; d.r2k = true; } // never all-off
    return {
      v: 1, userId: raw.userId || null,
      groups: Array.isArray(raw.groups) ? raw.groups.filter(function (g) { return typeof g === "string"; }) : KANA_DEFAULT_GROUPS.slice(),
      dirs: d, fsrs: sanitizeKanaFsrs(raw.fsrs), cards: raw.cards,
      day: raw.day && typeof raw.day.date === "string" ? { date: raw.day.date, count: raw.day.count | 0 } : null,
      logsOutbox: Array.isArray(raw.logsOutbox) ? raw.logsOutbox.filter(function (e) { return e && e.clientReviewId && e.kanaId && e.direction; }) : []
    };
  }
  function kanaCacheKey() { return isGuestMode() ? KANA_GUEST_KEY : KANA_CACHE_KEY; }
  var kanaCache = null;
  var kanaCacheLoadedKey = null;
  var inMemoryKanaCaches = {};
  function loadKanaCache() {
    var key = kanaCacheKey();
    try {
      var raw = window.localStorage && localStorage.getItem(key);
      var validated = validateKanaCache(raw ? JSON.parse(raw) : null);
      kanaCache = validated || inMemoryKanaCaches[key] || emptyKanaCache();
    } catch (e) {
      kanaCache = inMemoryKanaCaches[key] || emptyKanaCache();
    }
    kanaCacheLoadedKey = key;
    return kanaCache;
  }
  function saveKanaCache() {
    var key = kanaCacheKey();
    inMemoryKanaCaches[key] = kanaCache;
    try { localStorage.setItem(key, JSON.stringify(kanaCache)); } catch (e) {}
  }
  function getKanaCache() {
    if (!kanaCache || kanaCacheLoadedKey !== kanaCacheKey()) return loadKanaCache();
    return kanaCache;
  }
  function resetKanaCacheForUser(userId) {
    kanaCache = emptyKanaCache(userId);
    kanaCacheLoadedKey = kanaCacheKey();
    saveKanaCache();
  }

  return {
    DIRECTIONS: DIRECTIONS, DIRECTION_LABEL: DIRECTION_LABEL, RATING_NAMES: RATING_NAMES,
    CACHE_SCHEMA_VERSION: CACHE_SCHEMA_VERSION,
    getStoredMode: getStoredMode, setStoredMode: setStoredMode,
    setSession: setSession, isGuestMode: isGuestMode, hasActiveSession: hasActiveSession,
    uuid: uuid, localDateStr: localDateStr,
    loadCache: loadCache, saveCache: saveCache, getCache: getCache, resetCacheForUser: resetCacheForUser,
    isTablePaused: isTablePaused, pausedTables: pausedTables, setTablePausedLocal: setTablePausedLocal,
    loadKanaCache: loadKanaCache, saveKanaCache: saveKanaCache, getKanaCache: getKanaCache,
    resetKanaCacheForUser: resetKanaCacheForUser,
    defaultKanaFsrs: defaultKanaFsrs, sanitizeKanaFsrs: sanitizeKanaFsrs
  };
})();
