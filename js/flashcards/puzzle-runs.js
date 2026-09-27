// Finished Puzzles games -- Match, Listening, and every crossword, arroword
// and word search solved -- so the Dashboard can show them: games per day,
// Listening accuracy, Match pace, puzzles solved. Practice only -- nothing
// here touches FSRS. One record per game:
//   { id, at: ISO time, mode: "match" | "listening" | "crossword" |
//     "arroword" | "wordsearch", n: pairs / questions / words, ms: time
//     taken, miss: wrong pairs (Match), right: correct answers (Listening),
//     help: letters / words revealed (grids), setup: source|script|count
//     (Match, for comparing like with like) }
// localStorage is the immediate source of truth (capped at MAX, newest
// kept); while signed in the whole log is pushed best-effort to
// flashcard_settings.puzzle_runs (js/flashcards/data-ops.js + bootstrap.js)
// and merged back on sign-in -- union by id, so no device's games are lost.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.puzzleRuns = (function () {
  "use strict";

  var KEY = "raume-puzzle-runs";
  var MAX = 500;
  var MODES = ["match", "listening", "crossword", "arroword", "wordsearch"];
  var cache = null;
  var listeners = [];
  var remotePush = null;

  function clean(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (r) {
      return r && typeof r.id === "string" && typeof r.at === "string" && MODES.indexOf(r.mode) !== -1 &&
        typeof r.n === "number" && typeof r.ms === "number";
    });
  }
  function capped(arr) {
    arr.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
    return arr.length > MAX ? arr.slice(arr.length - MAX) : arr;
  }
  function load() {
    if (cache) return cache;
    try { cache = capped(clean(JSON.parse(window.localStorage.getItem(KEY)))); } catch (e) { cache = []; }
    return cache;
  }
  function persistLocal() {
    try { window.localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {}
  }
  function announce() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function all() { return load().slice(); }

  function newId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function record(run) {
    var r = { id: newId(), at: new Date().toISOString(), mode: run.mode, n: run.n, ms: Math.round(run.ms) };
    if (run.mode === "match") { r.miss = run.miss || 0; if (run.setup) r.setup = run.setup; }
    else if (run.mode === "listening") r.right = run.right || 0;
    else r.help = run.help || 0;
    cache = capped(load().concat([r]));
    persistLocal();
    announce();
    if (remotePush) { try { remotePush(all()); } catch (e) {} }
    return r;
  }

  function applyRemote(arr) {
    var remote = clean(arr), byId = {};
    load().concat(remote).forEach(function (r) { byId[r.id] = r; });
    var merged = capped(Object.keys(byId).map(function (id) { return byId[id]; }));
    var remoteIds = {};
    remote.forEach(function (r) { remoteIds[r.id] = true; });
    var addsToRemote = merged.some(function (r) { return !remoteIds[r.id]; });
    if (merged.length !== load().length) { cache = merged; persistLocal(); announce(); }
    if (addsToRemote && remotePush) { try { remotePush(all()); } catch (e) {} }
  }

  // The Dashboard's numbers, off the whole local log.
  function summary(now) {
    var runs = load(), today = new Date(now || Date.now());
    today.setHours(0, 0, 0, 0);
    var days = [], dayIndex = {};
    for (var i = 6; i >= 0; i--) {
      var d = new Date(today); d.setDate(d.getDate() - i);
      dayIndex[d.toDateString()] = days.length;
      days.push({ label: i === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2), count: 0 });
    }
    var ls = { games: 0, right: 0, asked: 0 }, mt = { games: 0, pairs: 0, ms: 0, bestPace: null, misses: 0 }, solved = 0;
    runs.forEach(function (r) {
      var idx = dayIndex[new Date(r.at).toDateString()];
      if (idx !== undefined) days[idx].count++;
      if (r.mode === "listening") { ls.games++; ls.right += r.right || 0; ls.asked += r.n; }
      else if (r.mode !== "match") solved++;
      else if (r.n) {
        mt.games++; mt.pairs += r.n; mt.ms += r.ms; mt.misses += r.miss || 0;
        var pace = r.ms / r.n;
        if (mt.bestPace === null || pace < mt.bestPace) mt.bestPace = pace;
      }
    });
    return {
      total: runs.length, days: days, listening: ls, match: mt, solved: solved,
      recent: runs.slice(-4).reverse()
    };
  }

  function onChange(fn) { listeners.push(fn); }
  function setRemotePush(fn) { remotePush = fn; }

  return {
    record: record, all: all, summary: summary, sanitize: function (arr) { return capped(clean(arr)); },
    applyRemote: applyRemote, onChange: onChange, setRemotePush: setRemotePush,
    STORAGE_KEY: KEY, MAX: MAX
  };
})();
