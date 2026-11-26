// Your own changes to the built-in words -- a row's Japanese, romaji, English
// or note, edited from its hold menu (js/vocab/interactions.js). Layered over
// the Git-only dataset the way js/vocab/table-custom.js layers names and
// icons: data/vocabulary.js is never touched; each edit is keyed by the row's
// permanent vocab id and patched onto RaumeStudy.data.vocabularyTables before
// anything renders, so search, print, speech, flashcards and their answers
// all see the edited word, and its FSRS history stays with it.
// localStorage is the immediate source of truth; while signed in every change
// is also pushed to the account (flashcard_settings.word_edits, see
// js/flashcards/data-ops.js + bootstrap.js) and merged back on sign-in.
// Shape: { "<vocabId>": { "t": <ms of the last change>, "jp", "romaji",
// "english", "enNote" } } for a word, "forms" ([plain, polite], each
// { jp, romaji }) in place of jp / romaji for a verb. A restored word is kept
// as { "t", "x": 1 } so a merge can tell it from "never edited"; the newer
// change wins per word.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.wordEdits = (function () {
  "use strict";

  var KEY = "raume-word-edits";
  var cache = null;
  var listeners = [];
  var remotePush = null;
  // The dataset's own content for every row an edit has touched, so Restore
  // original (or an edit synced away) can put it back.
  var originals = {};

  function cleanSegments(segs) {
    if (!Array.isArray(segs)) return null;
    var out = segs.map(function (s) {
      if (s && typeof s.kanji === "string" && typeof s.reading === "string") return { kanji: s.kanji, reading: s.reading };
      if (s && typeof s.p === "string") return { p: s.p };
      if (s && typeof s.text === "string") return { text: s.text };
      return null;
    });
    return out.length && out.every(Boolean) ? out : null;
  }
  function cleanEntry(e) {
    if (!e || typeof e !== "object" || typeof e.t !== "number") return null;
    if (e.x) return { t: e.t, x: 1 };
    var out = { t: e.t };
    if (typeof e.english === "string" && e.english.trim()) out.english = e.english.trim();
    else return null;
    out.enNote = typeof e.enNote === "string" ? e.enNote.trim() : "";
    if (Array.isArray(e.forms)) {
      var forms = e.forms.map(function (f) {
        var jp = f && cleanSegments(f.jp), ro = f && typeof f.romaji === "string" ? f.romaji.trim() : "";
        return jp && ro ? { jp: jp, romaji: ro } : null;
      });
      if (forms.length !== 2 || !forms[0] || !forms[1]) return null;
      out.forms = forms;
    } else {
      var jp = cleanSegments(e.jp), ro = typeof e.romaji === "string" ? e.romaji.trim() : "";
      if (!jp || !ro) return null;
      out.jp = jp; out.romaji = ro;
    }
    return out;
  }
  function clean(obj) {
    var out = {};
    if (!obj || typeof obj !== "object") return out;
    Object.keys(obj).forEach(function (id) {
      var e = cleanEntry(obj[id]);
      if (e) out[id] = e;
    });
    return out;
  }
  function load() {
    if (cache) return cache;
    try { cache = clean(JSON.parse(window.localStorage.getItem(KEY))); } catch (e) { cache = {}; }
    return cache;
  }
  // false when the browser refused the write (storage full, or blocked) --
  // the caller says so rather than pretending the edit stuck.
  function persistLocal() {
    try { window.localStorage.setItem(KEY, JSON.stringify(cache)); return true; } catch (e) { return false; }
  }
  function announce(ids) { listeners.forEach(function (fn) { try { fn(ids); } catch (e) {} }); }
  function getAll() { return JSON.parse(JSON.stringify(load())); }

  // ---- the dataset ------------------------------------------------------

  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  // Built-in rows only: the reader's own words ("cv-" rows, merged in by
  // custom-vocab.js) are edited at their source instead.
  function dataRow(id) {
    var tables = (window.RaumeStudy.data && window.RaumeStudy.data.vocabularyTables) || [];
    for (var i = 0; i < tables.length; i++) {
      if (tables[i].__custom) continue;
      var rows = tables[i].rows || [];
      for (var j = 0; j < rows.length; j++) {
        if (rows[j].id === id && !rows[j].__custom) return rows[j];
      }
    }
    return null;
  }
  function isEditable(row) { return !!row && !row.__custom && (row.type === "word" || row.type === "verb-pair"); }
  function snapshotOf(row) {
    return row.type === "verb-pair"
      ? { forms: copy(row.forms), english: row.english, enNote: row.enNote }
      : { jp: copy(row.jp), romaji: row.romaji, english: row.english, enNote: row.enNote };
  }
  function restoreRow(row, orig) {
    Object.keys(orig).forEach(function (k) {
      if (orig[k] === undefined) delete row[k]; else row[k] = copy(orig[k]);
    });
  }
  function patchRow(id) {
    var row = dataRow(id);
    if (!isEditable(row)) return;
    if (!originals[id]) originals[id] = snapshotOf(row);
    restoreRow(row, originals[id]);
    var e = load()[id];
    if (!e || e.x) return;
    if (row.type === "verb-pair") { if (e.forms) row.forms = copy(e.forms); }
    else if (e.jp) { row.jp = copy(e.jp); row.romaji = e.romaji; }
    row.english = e.english;
    if (e.enNote) row.enNote = e.enNote; else delete row.enNote;
  }
  // Idempotent: every edited row is put back to its original and re-patched,
  // so it is safe to call before the first render and after every change.
  function applyToDataset() {
    Object.keys(originals).concat(Object.keys(load())).forEach(patchRow);
  }

  // ---- reads -----------------------------------------------------------

  function isEdited(id) { var e = load()[String(id)]; return !!(e && !e.x); }
  // The row as Git has it, whatever the reader changed since.
  function original(id) {
    id = String(id);
    if (originals[id]) return copy(originals[id]);
    var row = dataRow(id);
    return isEditable(row) ? copy(snapshotOf(row)) : null;
  }

  // ---- writes ----------------------------------------------------------

  // fields: { jp, romaji } or { forms }, plus english and enNote. Returns
  // true once it is on this device; false if the browser wouldn't store it.
  function save(id, fields) {
    id = String(id);
    var row = dataRow(id);
    if (!isEditable(row)) throw new Error("This word can’t be edited.");
    var entry = cleanEntry(Object.assign({}, fields, { t: Date.now() }));
    if (!entry || (row.type === "verb-pair") !== !!entry.forms) throw new Error("That edit is incomplete.");
    // Back to exactly what Git has: nothing left to keep.
    var orig = original(id), same = JSON.stringify(snapshotOf(Object.assign({ type: row.type }, entry, { enNote: entry.enNote || undefined })));
    if (same === JSON.stringify(snapshotOf(Object.assign({ type: row.type }, orig)))) return reset(id);
    return commit(id, entry);
  }
  function reset(id) {
    id = String(id);
    if (!load()[id]) { announce([id]); return true; }
    return commit(id, { t: Date.now(), x: 1 });
  }
  // A change the browser won't store isn't made at all: the word stays as it
  // was on screen too, and the form says why.
  function commit(id, entry) {
    var had = Object.prototype.hasOwnProperty.call(load(), id), prev = cache[id];
    cache[id] = entry;
    if (!persistLocal()) {
      if (had) cache[id] = prev; else delete cache[id];
      return false;
    }
    patchRow(id);
    announce([id]);
    if (remotePush) { try { remotePush(getAll()); } catch (e) {} }
    return true;
  }

  // Sign-in: per word the newer change wins; anything the account is missing
  // or has older is pushed back up.
  function applyRemote(obj) {
    var remote = clean(obj);
    load();
    var merged = {}, addsToRemote = false, changed = [];
    Object.keys(cache).concat(Object.keys(remote)).forEach(function (id) {
      var a = cache[id], b = remote[id];
      merged[id] = !b || (a && a.t > b.t) ? a : b;
      if (!b || b.t < merged[id].t) addsToRemote = true;
      if (JSON.stringify(merged[id]) !== JSON.stringify(a) && changed.indexOf(id) === -1) changed.push(id);
    });
    if (changed.length) {
      cache = merged;
      persistLocal();
      changed.forEach(patchRow);
      announce(changed);
    }
    if (addsToRemote && remotePush) { try { remotePush(getAll()); } catch (e) {} }
  }

  function onChange(fn) { listeners.push(fn); }
  function setRemotePush(fn) { remotePush = fn; }

  return {
    applyToDataset: applyToDataset, isEdited: isEdited, original: original,
    save: save, reset: reset, getAll: getAll, sanitize: clean,
    applyRemote: applyRemote, onChange: onChange, setRemotePush: setRemotePush,
    STORAGE_KEY: KEY
  };
})();
