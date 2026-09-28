// Flashcards -- the Stats screen for Puzzles and Games
// (RaumeStudy.flashcards.puzzleStats).
//
// A pushed screen, like Settings and Help: "Puzzle stats" (crossword,
// arroword, word search) or "Game stats" (Match, Listening), a segmented
// control to pick the style, then iOS Settings groups off puzzle-runs.js --
// Overview, the trend over the last 30 games, personal bests per setup
// (tap one for its history), the words you miss most across every puzzle
// and game (with Practise these), and Reset. Practice only: nothing here
// touches FSRS.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.puzzleStats = (function () {
  "use strict";

  var S = window.RaumeStudy.flashcards;
  var esc = window.RaumeStudy.shared.escapeHtml;
  var MODES = {
    puzzles: [["crossword", "Crossword"], ["arroword", "Arroword"], ["wordsearch", "Word search"]],
    games: [["match", "Match"], ["listening", "Listening"], ["kanatiles", "Kana tiles"]]
  };
  var SCRIPTS = { romaji: "Romaji", native: "Japanese", hiragana: "Hiragana", katakana: "Katakana" };
  var PRACTISE_WORDS = 20;
  // Each style's own hue (the --tile palette), as Fitness gives each ring
  // one: its headline figures and its trend line wear it.
  var HUES = { crossword: "blue", arroword: "indigo", wordsearch: "teal", match: "purple", listening: "orange", kanatiles: "green" };
  var CHEVRON = '<svg class="fc-st-chev" viewBox="0 0 18 18" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 7l3.5 4 3.5-4"/></svg>';
  var view = { kind: "games", mode: "match", open: null };

  function runs() { return S.puzzleRuns; }
  function modeName(mode) {
    var hit = MODES.puzzles.concat(MODES.games).filter(function (m) { return m[0] === mode; })[0];
    return hit ? hit[1] : mode;
  }
  function kindOf(mode) { return runs().isGameMode(mode) ? "games" : "puzzles"; }
  function title() { return view.kind === "games" ? "Game stats" : "Puzzle stats"; }

  // Opens on a style: the one asked for, else the one you played last.
  function open(kind, mode) {
    view.kind = kind;
    var modes = MODES[kind].map(function (m) { return m[0]; });
    if (modes.indexOf(mode) === -1) {
      var last = runs().live().filter(function (r) { return modes.indexOf(r.mode) !== -1; }).pop();
      mode = last ? last.mode : modes[0];
    }
    view.mode = mode;
    view.open = null;
    S.setActiveTab("stats");
    S.render();
    window.scrollTo(0, 0);
  }

  // --- formatting ---
  function clock(ms) {
    var tenths = Math.floor(ms / 100), s = Math.floor(tenths / 10);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + "." + (tenths % 10);
  }
  function duration(ms) {
    var m = Math.round(ms / 60000);
    if (m < 1) return Math.round(ms / 1000) + "s";
    return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m";
  }
  function days(n) { return n + (n === 1 ? " day" : " days"); }
  function pct(x) { return Math.round(x * 100) + "%"; }
  // One game's headline: its time, or for Listening its score.
  function scored(mode) { return mode === "listening" || mode === "kanatiles"; }
  function runValue(r) { return scored(r.mode) ? (r.right || 0) + " / " + r.n : clock(r.ms); }
  function measureText(mode, v) {
    if (scored(mode)) return pct(v);
    return v.toFixed(1) + "s / " + (mode === "match" ? "pair" : "word");
  }
  function dateText(at) { return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  // "flashcards|romaji|15" -> "Flashcards · Romaji · 15 words".
  function setupLabel(key) {
    var parts = String(key).split("|"), src = parts[0];
    var name = src === "flashcards" ? "Flashcards" : src === "tricky" ? "Tricky words" : "";
    if (!name && src.indexOf("tables:") === 0) {
      var ids = src.slice(7).split(",");
      var titles = (window.RaumeStudy.data.vocabularyTables || [])
        .filter(function (t) { return ids.indexOf(String(t.id)) !== -1; }).map(function (t) { return t.title; });
      name = titles.length && titles.length <= 2 ? titles.join(", ") : ids.length + " tables";
    }
    return [name || src, SCRIPTS[parts[1]] || parts[1], parts[2] + " words"].join(" · ");
  }

  // --- pieces ---
  function row(label, value, extraCls) {
    return '<div class="set-row' + (extraCls ? " " + extraCls : "") + '"><span class="set-label">' + esc(label) + "</span>" +
      '<span class="set-value">' + esc(value) + "</span></div>";
  }
  function group(head, body, cls) {
    return '<h3 class="help-head">' + esc(head) + '</h3><div class="help-card set-card' + (cls ? " " + cls : "") + '">' + body + "</div>";
  }
  // The headline first, as Fitness and Game Center do: the style's own
  // measure, games played and the day streak as three big figures; the
  // rest as ordinary rows under them.
  function heroHtml(st) {
    var mode = st.mode;
    var lead = scored(mode) ? [pct(st.right / (st.words || 1)), "accuracy"]
      : [st.best.toFixed(1) + "s", mode === "match" ? "best per pair" : "best per word"];
    function cell(v, l) { return '<div class="fc-st-fig"><span class="fc-st-fig-val">' + esc(v) + '</span><span class="fc-st-fig-lbl">' + esc(l) + "</span></div>"; }
    return '<div class="help-card fc-st-hero">' + cell(lead[0], lead[1]) +
      cell(String(st.played), runs().isGameMode(mode) ? "played" : "solved") +
      cell(String(st.streak.current), st.streak.current === 1 ? "day streak" : "days streak") + "</div>";
  }
  function overviewHtml(st) {
    var mode = st.mode, rows = row("Time played", duration(st.totalMs)) +
      row("Longest streak", days(st.streak.longest));
    if (mode === "match") {
      rows += (st.bestRound ? row("Fastest round", clock(st.bestRound.ms) + " · " + st.bestRound.pairs + " pairs") : "") +
        row("Pairs matched", String(st.words)) + row("Misses per game", (st.misses / st.played).toFixed(1));
    }
    else if (mode === "listening") rows += row("Words heard", String(st.words));
    else if (mode === "kanatiles") rows += row("Words spelled", String(st.words));
    else rows += row("Words", String(st.words)) + row("Hints used", String(st.help));
    return group("Overview", rows);
  }
  // The last 30 games as one line in the accent tone, oldest to newest.
  // Better is always up: less time per pair / word, or more of them right.
  function trendHtml(st) {
    var pts = st.trend, mode = st.mode;
    if (pts.length < 2) return group("Last 30 games", '<p class="fc-st-note">Play one more to see a trend.</p>');
    var vals = pts.map(function (p) { return p.value; });
    var hi = Math.max.apply(null, vals), lo = Math.min.apply(null, vals), span = hi - lo || 1;
    var W = 300, H = 88, pad = 8, step = (W - pad * 2) / (pts.length - 1);
    var up = scored(mode);
    var xy = pts.map(function (p, i) {
      var t = (p.value - lo) / span;
      return [Math.round((pad + i * step) * 10) / 10, Math.round((pad + (up ? 1 - t : t) * (H - pad * 2)) * 10) / 10];
    });
    var bestV = up ? hi : lo, worstV = up ? lo : hi;
    var dots = xy.map(function (q, i) {
      return '<circle class="fc-st-hit" data-i="' + i + '" cx="' + q[0] + '" cy="' + q[1] + '" r="9"><title>' + esc(dateText(pts[i].at) + " · " + measureText(mode, pts[i].value)) + "</title></circle>";
    }).join("");
    var end = xy[xy.length - 1];
    var svg = '<svg class="fc-st-chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' +
      esc((up ? "Accuracy" : mode === "match" ? "Seconds per pair" : "Seconds per word") + " over your last " + pts.length + " games") + '">' +
      '<line class="fc-st-base" x1="0" y1="' + (H - 0.5) + '" x2="' + W + '" y2="' + (H - 0.5) + '"/>' +
      '<polyline points="' + xy.map(function (q) { return q.join(","); }).join(" ") + '"/>' +
      // The newest game's dot: a zero-length round-capped line, so it
      // stays round however the chart stretches to its card's width.
      '<line class="fc-st-end-ring" x1="' + end[0] + '" y1="' + end[1] + '" x2="' + end[0] + '" y2="' + end[1] + '"/>' +
      '<line class="fc-st-end" x1="' + end[0] + '" y1="' + end[1] + '" x2="' + end[0] + '" y2="' + end[1] + '"/>' + dots + "</svg>";
    var change = st.change === null ? "" : '<p class="fc-st-change">' + (up
      ? Math.round(st.change * 100) + " points more accurate than your first 10 games"
      : Math.round(st.change * 100) + "% faster than your first 10 games") + "</p>";
    return group("Last " + pts.length + " games",
      '<div class="fc-st-trend">' + svg +
      // Tap a point (there's no hover on a phone) and its date and value
      // replace the best here, as Health shows a selected bar.
      '<div class="fc-st-scale"><span class="fc-st-readout" id="fcStReadout" aria-live="polite">Best ' + esc(measureText(mode, bestV)) + "</span><span>" +
      (up ? "Higher is better" : "Higher is faster") + "</span></div>" + change + "</div>");
  }
  function bestsHtml(st) {
    if (!st.bests.length) return "";
    return group("Personal bests", st.bests.map(function (b, i) {
      var isOpen = view.open === b.setup;
      var hist = isOpen ? '<ul class="fc-st-history" id="fcStHist' + i + '">' + b.runs.slice(0, 10).map(function (r) {
        return '<li><span>' + esc(dateText(r.at)) + (r.ended ? " · ended early" : "") + "</span><span>" + esc(runValue(r)) + "</span></li>";
      }).join("") + "</ul>" : "";
      return '<button type="button" class="set-row fc-st-best" data-setup="' + esc(b.setup) + '" aria-expanded="' + isOpen + '"' +
        (isOpen ? ' aria-controls="fcStHist' + i + '"' : "") + '>' +
        '<span class="set-label">' + esc(setupLabel(b.setup)) + '<span class="fc-st-count">' + b.runs.length + (b.runs.length === 1 ? " game" : " games") + "</span></span>" +
        '<span class="set-value">' + esc(runValue(b.best)) + CHEVRON + "</span></button>" + hist;
    }).join(""), "fc-st-bests");
  }
  function trickyHtml() {
    var index = S.vocabIndex.getVocabIndex();
    var list = runs().trickyWords(12).filter(function (t) { return index[t.id]; });
    var practise = runs().trickyWords(PRACTISE_WORDS, 1).filter(function (t) { return index[t.id]; });
    if (!list.length) {
      return group("Tricky words", '<p class="fc-st-note">Words you miss in two or more games collect here — across every puzzle and game.</p>');
    }
    var rows = list.map(function (t) {
      var e = index[t.id];
      var jp = String(e.jpPlain || e.jpReading || "").replace(/^〜/, "");
      var romaji = String(e.romajiDisplay || "").split(" / ")[0];
      return '<div class="set-row fc-st-word"><span class="fc-st-word-main"><span class="fc-st-jp" lang="ja">' + esc(jp) + "</span>" +
        (romaji ? '<span class="fc-st-ro">' + esc(romaji) + "</span>" : "") +
        '<span class="fc-st-en">' + esc(String(e.englishDisplay || "").split(" / ")[0]) + "</span></span>" +
        '<span class="set-value">' + t.count + "×</span></div>";
    }).join("");
    // The action is the card's last row, tint text -- iOS Settings' way.
    return group("Tricky words", rows +
      (practise.length >= 6
        ? '<button type="button" class="set-row set-action" id="fcStPractise">Practise these in ' + esc(modeName(view.mode)) + "</button>"
        : ""));
  }

  function render(panel) {
    if (!panel) return;
    var st = runs().styleStats(view.mode, new Date());
    panel.dataset.tile = HUES[view.mode] || "";
    panel.innerHTML =
      '<div class="fc-manage-filters fc-st-modes" role="tablist" aria-label="Style">' + MODES[view.kind].map(function (m) {
        var on = m[0] === view.mode;
        return '<button type="button" role="tab" aria-selected="' + on + '" class="' + (on ? "active" : "") + '" data-mode="' + m[0] + '">' + m[1] + "</button>";
      }).join("") + "</div>" +
      (st.played
        ? heroHtml(st) + overviewHtml(st) + trendHtml(st) + bestsHtml(st)
        : '<p class="fc-st-empty">No ' + esc(modeName(view.mode)) + (view.kind === "games" ? " games" : " puzzles solved") + " yet.</p>") +
      trickyHtml() +
      '<div class="help-card set-card fc-st-reset-card"><button type="button" class="set-row set-action fc-st-reset" id="fcStReset">Reset ' +
      esc(modeName(view.mode)) + " stats</button></div>";

    panel.querySelectorAll(".fc-st-modes button").forEach(function (b) {
      b.addEventListener("click", function () { view.mode = b.dataset.mode; view.open = null; render(panel); });
    });
    panel.querySelectorAll(".fc-st-best").forEach(function (b) {
      b.addEventListener("click", function () { view.open = view.open === b.dataset.setup ? null : b.dataset.setup; render(panel); });
    });
    var readout = document.getElementById("fcStReadout");
    panel.querySelectorAll(".fc-st-hit").forEach(function (c) {
      c.addEventListener("click", function () { readout.textContent = c.querySelector("title").textContent; });
    });
    var practise = document.getElementById("fcStPractise");
    if (practise) practise.addEventListener("click", function () {
      var ids = runs().trickyWords(PRACTISE_WORDS, 1).map(function (t) { return t.id; });
      S.crosswords.playWords(view.kind, view.mode, ids);
      S.setActiveTab(view.kind === "games" ? "games" : "crosswords");
      S.render();
      window.scrollTo(0, 0);
    });
    document.getElementById("fcStReset").addEventListener("click", function () {
      var name = modeName(view.mode);
      if (!window.confirm("Reset " + name + " stats?\n\nEvery " + name + " game so far is cleared from your stats and bests, on every device. This can’t be undone.")) return;
      runs().reset(view.mode);
      if (view.mode === "match" && S.crosswords.clearMatchBests) S.crosswords.clearMatchBests();
      render(panel);
    });
  }

  return { open: open, render: render, title: title, kindOf: kindOf, setupLabel: setupLabel, view: view };
})();
