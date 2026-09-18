// Flashcards -- guest-mode backup (RaumeStudy.flashcards.backup).
//
// Guest mode keeps everything in this browser's localStorage, so clearing site
// data (or switching browsers) loses it. This exports that on-device data to a
// single JSON file and restores it from one. Signed-in progress lives in the
// account already, so this is guest-only -- the Settings tab only offers it
// there.
//
// The file holds only the reader's own learning data: the flashcard cache
// (cards, review history, settings, paused tables), the Kana trainer cache,
// table names/icons/order, and the reader's own custom words. Built-in
// vocabulary is never copied in -- cards reference it by vocab_id, so a backup
// stays valid as the reference data grows.
//
// Restoring REPLACES the on-device data with the file's contents (the state at
// the time of the backup), then the caller reloads so every module re-reads it.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.backup = (function () {
  "use strict";

  var store = window.RaumeStudy.flashcards.store;
  var FORMAT = "raume-backup";
  var VERSION = 1;

  function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
  function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

  // Whether there is anything to back up / restore into: guest mode only.
  function available() { return store.isGuestMode(); }

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
        customVocab: readCustomVocab()
      }
    };
  }

  function fileName() { return "raume-backup-" + store.localDateStr(new Date()) + ".json"; }

  function downloadBackup() {
    var json = JSON.stringify(buildBackup(), null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return a.download;
  }

  // Parse + validate a backup file's text. Every section goes back through the
  // same validator the live app uses to load that data, so a hand-edited or
  // partly-corrupt file can drop bad records but can't put the app in a shape
  // it can't read. Returns { ok:true, backup, summary } or { ok:false, error }.
  function parseBackup(text) {
    var raw;
    try { raw = JSON.parse(text); } catch (e) { return { ok: false, error: "That file isn't a valid backup (it isn't readable JSON)." }; }
    if (!isPlainObject(raw) || raw.format !== FORMAT || !isPlainObject(raw.data)) {
      return { ok: false, error: "That file isn't a raume backup." };
    }
    if (typeof raw.version !== "number" || raw.version > VERSION) {
      return { ok: false, error: "That backup was made by a newer version of raume. Reload the page to update, then try again." };
    }
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
    var backup = { flashcards: flashcards, kana: kana, tableCustom: tableCustom, customVocab: customVocab };
    return { ok: true, backup: backup, summary: summarize(backup, raw.exportedAt) };
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
      customisedTables: b.tableCustom ? Object.keys(b.tableCustom).length : 0
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

  return {
    FORMAT: FORMAT, VERSION: VERSION,
    available: available, buildBackup: buildBackup, fileName: fileName, downloadBackup: downloadBackup,
    parseBackup: parseBackup, applyBackup: applyBackup
  };
})();
