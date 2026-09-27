// Kanji the reader has marked "Known" in the Kanji section's detail sheet --
// their tiles turn green, so what's still to learn stands out. Keyed by the
// kanji row's permanent vocab id, never a copy of its content.
// localStorage is the immediate source of truth; while signed in each change
// is also pushed to the account (flashcard_settings.known_kanji, see
// js/flashcards/data-ops.js + bootstrap.js) and merged back on sign-in.
// Shape: { "<vocabId>": { "k": 1 | 0, "t": <ms of the last change> } } --
// an un-mark is kept (k: 0) so a merge can tell it from "never marked", and
// the newer change wins per kanji.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.knownKanji = (function () {
  "use strict";

  var KEY = "raume-kanji-known";
  var cache = null;
  var listeners = [];
  var remotePush = null;

  function clean(obj) {
    var out = {};
    if (!obj || typeof obj !== "object") return out;
    Object.keys(obj).forEach(function (id) {
      var e = obj[id];
      if (e && typeof e === "object" && typeof e.t === "number") out[id] = { k: e.k ? 1 : 0, t: e.t };
    });
    return out;
  }
  function load() {
    if (cache) return cache;
    try { cache = clean(JSON.parse(window.localStorage.getItem(KEY))); } catch (e) { cache = {}; }
    return cache;
  }
  function persistLocal() {
    try { window.localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {}
  }
  function announce() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function getAll() { return JSON.parse(JSON.stringify(load())); }

  function isKnown(id) { var e = load()[String(id)]; return !!(e && e.k); }
  function count() { var all = load(); return Object.keys(all).filter(function (id) { return all[id].k; }).length; }
  function setKnown(id, known) {
    load()[String(id)] = { k: known ? 1 : 0, t: Date.now() };
    persistLocal();
    announce();
    if (remotePush) { try { remotePush(getAll()); } catch (e) {} }
  }

  // Sign-in: per kanji the newer change wins; anything the account is
  // missing or has older is pushed back up.
  function applyRemote(obj) {
    var remote = clean(obj);
    load();
    var merged = {}, addsToRemote = false;
    Object.keys(cache).concat(Object.keys(remote)).forEach(function (id) {
      var a = cache[id], b = remote[id];
      merged[id] = !b || (a && a.t > b.t) ? a : b;
      if (!b || b.t < merged[id].t) addsToRemote = true;
    });
    var changedLocally = JSON.stringify(merged) !== JSON.stringify(cache);
    if (changedLocally) { cache = merged; persistLocal(); announce(); }
    if (addsToRemote && remotePush) { try { remotePush(getAll()); } catch (e) {} }
  }

  function onChange(fn) { listeners.push(fn); }
  function setRemotePush(fn) { remotePush = fn; }

  return {
    isKnown: isKnown, count: count, setKnown: setKnown, getAll: getAll, sanitize: clean,
    applyRemote: applyRemote, onChange: onChange, setRemotePush: setRemotePush,
    STORAGE_KEY: KEY
  };
})();
