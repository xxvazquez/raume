// Finished Puzzles games -- Match, Listening, and every crossword, arroword
// and word search solved -- so the Dashboard can show them: games per day,
// Listening accuracy, Match pace, puzzles solved. Practice only -- nothing
// here touches FSRS. One record per game:
//   { id, at: ISO time, mode: "match" | "listening" | "crossword" |
//     "arroword" | "wordsearch", n: pairs / questions / words, ms: time
//     taken, miss: wrong pairs (Match), right: correct answers (Listening),
//     help: letters / words revealed (grids), setup: source|script|count
//     (for comparing like with like), splits: time at each round's end
//     (Match, for the live split against your best), missed: vocab ids
//     the game caught you on -- a wrong pair, a wrong answer, a word or
//     letter revealed, a square Check marked wrong (for Tricky words),
//     ended: true for a Match / Listening game stopped early -- only its
//     finished rounds / answered words, so it counts everywhere except
//     personal bests; sizes: that Match game's round sizes }
// Reset stats for one style adds a marker record { mode, reset: true }
// rather than only deleting: the log syncs by union, so a plain delete
// would come straight back from another device. Everything of that style
// up to its latest marker is left out of every number.
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
  // Every counted game: markers out, and a style's games before its last
  // reset out. `mode` (optional) narrows to one style.
  function live(mode) {
    var runs = load(), resetAt = {};
    runs.forEach(function (r) { if (r.reset && (!resetAt[r.mode] || r.at > resetAt[r.mode])) resetAt[r.mode] = r.at; });
    return runs.filter(function (r) {
      return !r.reset && (!mode || r.mode === mode) && !(resetAt[r.mode] && r.at <= resetAt[r.mode]);
    });
  }

  function newId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function record(run) {
    var r = { id: newId(), at: new Date().toISOString(), mode: run.mode, n: run.n, ms: Math.round(run.ms) };
    if (run.setup) r.setup = run.setup;
    if (run.ended) r.ended = true;
    if (run.missed && run.missed.length) {
      var seen = {};
      r.missed = run.missed.map(String).filter(function (id) { return !seen[id] && (seen[id] = true); }).slice(0, 40);
    }
    if (run.mode === "match") {
      r.miss = run.miss || 0;
      if (run.splits && run.splits.length) r.splits = run.splits.map(Math.round);
      if (run.sizes && run.sizes.length) r.sizes = run.sizes.slice();
    }
    else if (run.mode === "listening") r.right = run.right || 0;
    else r.help = run.help || 0;
    save(load().concat([r]));
    return r;
  }
  function save(arr) {
    cache = capped(arr);
    persistLocal();
    announce();
    if (remotePush) { try { remotePush(all()); } catch (e) {} }
  }
  // Clears one style's numbers: its games go, a marker stays (see top).
  function reset(mode) {
    if (MODES.indexOf(mode) === -1) return;
    save(load().filter(function (r) { return r.mode !== mode; })
      .concat([{ id: newId(), at: new Date().toISOString(), mode: mode, n: 0, ms: 0, reset: true }]));
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

  // The Dashboard's numbers, off the whole local log -- or `kind`
  // ("puzzles" / "games") for one card's share of it.
  function summary(now, kind) {
    var runs = live().filter(function (r) { return !kind || (kind === "games") === isGameMode(r.mode); });
    var today = new Date(now || Date.now());
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

  // --- Stats (js/flashcards/puzzle-stats.js) ---
  var GAME_MODES = ["match", "listening"];
  function isGameMode(mode) { return GAME_MODES.indexOf(mode) !== -1; }
  function dayKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  // Days in a row with at least one game: the run ending today (or
  // yesterday -- today isn't over), and the longest ever.
  function streaks(runs, now) {
    var days = {};
    runs.forEach(function (r) { days[dayKey(new Date(r.at))] = true; });
    var sorted = Object.keys(days).map(function (k) { var p = k.split("-"); return new Date(+p[0], p[1] - 1, +p[2]); })
      .sort(function (a, b) { return a - b; });
    var longest = 0, runLen = 0, prev = null;
    sorted.forEach(function (d) {
      runLen = prev && Math.round((d - prev) / 864e5) === 1 ? runLen + 1 : 1;
      if (runLen > longest) longest = runLen;
      prev = d;
    });
    var day = new Date(now || Date.now()); day.setHours(0, 0, 0, 0);
    if (!days[dayKey(day)]) day.setDate(day.getDate() - 1);
    var current = 0;
    while (days[dayKey(day)]) { current++; day.setDate(day.getDate() - 1); }
    return { current: current, longest: longest };
  }
  // A game's one comparable number, whatever its size: seconds per pair
  // (Match), share right (Listening), seconds per word (grids).
  function measure(r) {
    if (r.mode === "listening") return r.n ? (r.right || 0) / r.n : 0;
    return r.n ? r.ms / r.n / 1000 : 0;
  }
  // Match's rounds: even groups of at most 6 pairs (crosswords.js
  // matchRounds -- this file loads first, so the rule is repeated here).
  function roundSizes(n) {
    var count = Math.ceil(n / 6), sizes = [];
    for (var i = 0; i < count; i++) sizes.push(Math.floor(n / count) + (i < n % count ? 1 : 0));
    return sizes;
  }
  // Every Match round ever cleared: its time (the gap between splits) and
  // how many pairs it had -- a 5-pair round only races other 5-pair rounds.
  function matchRoundTimes(runs) {
    var out = [];
    runs.forEach(function (r) {
      if (!r.splits || !r.splits.length) return;
      var sizes = r.sizes || roundSizes(r.n);
      if (sizes.length !== r.splits.length) return;
      r.splits.forEach(function (at, i) { out.push({ ms: at - (i ? r.splits[i - 1] : 0), pairs: sizes[i], at: r.at }); });
    });
    return out;
  }
  // The fastest round of `pairs` pairs so far (any size when omitted).
  function bestRound(pairs) {
    var best = null;
    matchRoundTimes(live("match")).forEach(function (t) {
      if ((pairs == null || t.pairs === pairs) && (!best || t.ms < best.ms)) best = t;
    });
    return best;
  }
  function higherIsBetter(mode) { return mode === "listening"; }
  function better(mode, a, b) { return higherIsBetter(mode) ? a > b : a < b; }
  function average(xs) { return xs.reduce(function (a, b) { return a + b; }, 0) / (xs.length || 1); }
  function styleStats(mode, now) {
    var runs = live(mode);
    var st = {
      mode: mode, played: runs.length, totalMs: 0, streak: streaks(runs, now), words: 0, help: 0, misses: 0, right: 0,
      best: null, trend: [], change: null, bests: []
    };
    var bySetup = {};
    runs.forEach(function (r) {
      st.totalMs += r.ms; st.words += r.n; st.help += r.help || 0; st.misses += r.miss || 0; st.right += r.right || 0;
      var m = measure(r);
      if (st.best === null || better(mode, m, st.best)) st.best = m;
      var key = r.setup || "";
      (bySetup[key] = bySetup[key] || []).push(r);
    });
    if (mode === "match") st.bestRound = bestRound();
    st.trend = runs.slice(-30).map(function (r) { return { at: r.at, value: measure(r) }; });
    // "Faster / more accurate than your first 10": only once there are 20
    // games, so the two tens don't overlap, and only when it's true.
    if (runs.length >= 20) {
      var first = average(runs.slice(0, 10).map(measure)), last = average(runs.slice(-10).map(measure));
      if (better(mode, last, first)) st.change = higherIsBetter(mode) ? last - first : (first - last) / first;
    }
    // Personal bests, one per setup (source · script · count) -- the
    // fastest time, or for Listening the most right, then the fastest.
    st.bests = Object.keys(bySetup).filter(Boolean).map(function (key) {
      var list = bySetup[key], whole = list.filter(function (r) { return !r.ended; }), top = whole[0];
      if (!top) return null;
      whole.forEach(function (r) {
        var a = higherIsBetter(mode) ? (r.right || 0) : -r.ms, b = higherIsBetter(mode) ? (top.right || 0) : -top.ms;
        if (a > b || (a === b && r.ms < top.ms)) top = r;
      });
      return { setup: key, best: top, runs: list.slice().reverse() };
    }).filter(Boolean).sort(function (a, b) { return a.best.at < b.best.at ? 1 : -1; });
    return st;
  }
  // The words that trip you up most, across every puzzle and game: each
  // vocab id and how many games it was missed in -- twice or more unless
  // `min` says otherwise (Practise these tops up with words missed once).
  function trickyWords(limit, min) {
    var counts = {}, last = {};
    live().forEach(function (r) {
      (r.missed || []).forEach(function (id) { counts[id] = (counts[id] || 0) + 1; last[id] = r.at; });
    });
    return Object.keys(counts).filter(function (id) { return counts[id] >= (min || 2); })
      .sort(function (a, b) { return counts[b] - counts[a] || (last[a] < last[b] ? 1 : -1); })
      .slice(0, limit || 12)
      .map(function (id) { return { id: id, count: counts[id] }; });
  }

  function onChange(fn) { listeners.push(fn); }
  function setRemotePush(fn) { remotePush = fn; }

  return {
    record: record, all: all, live: live, reset: reset, summary: summary,
    styleStats: styleStats, trickyWords: trickyWords, bestRound: bestRound, isGameMode: isGameMode, GAME_MODES: GAME_MODES, sanitize: function (arr) { return capped(clean(arr)); },
    applyRemote: applyRemote, onChange: onChange, setRemotePush: setRemotePush,
    STORAGE_KEY: KEY, MAX: MAX
  };
})();
