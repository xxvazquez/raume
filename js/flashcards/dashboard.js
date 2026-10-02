// Flashcards -- Dashboard tab + the study session it launches
// (RaumeStudy.flashcards.dashboard).
//
// Renders the Dashboard (next-review summary, stat tiles, card-progress and
// weekly-activity and due-forecast charts, "Missed today", "Words to Review"), derives the
// review-history insights those cards need, and runs the review session flow
// (queue -> prompt -> check -> rate) that "Study now" and "Missed today" start.
// Session state, the insight caches and the two are one cluster because they
// share `session`, invalidate together and re-render through each other.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.dashboard = (function () {
  "use strict";

  var fc = window.RaumeStudy.flashcards;
  var store = fc.store, sched = fc.scheduling, vidx = fc.vocabIndex, dataOps = fc.dataOps;
  var esc = window.RaumeStudy.shared.escapeHtml;
  var speech = window.RaumeStudy.shared.speech;

  var getCache = store.getCache, localDateStr = store.localDateStr, dayBefore = store.dayBefore, isGuestMode = store.isGuestMode;
  var uuid = store.uuid, RATING_NAMES = store.RATING_NAMES, DIRECTION_LABEL = store.DIRECTION_LABEL;
  var studyableCards = sched.studyableCards, buildQueue = sched.buildQueue, shuffle = sched.shuffle;
  var readyToStudy = sched.readyToStudy;
  var todayNewCount = sched.todayNewCount, bumpNewToday = sched.bumpNewToday;
  var previewRatings = sched.previewRatings, getScheduler = sched.getScheduler, applyRating = sched.applyRating, fsrsRowFields = sched.fsrsRowFields;
  var getVocabIndex = vidx.getVocabIndex, promptFor = vidx.promptFor, askLabelFor = vidx.askLabelFor;
  var answerPlaceholderFor = vidx.answerPlaceholderFor, expectedDisplayFor = vidx.expectedDisplayFor;
  var contextDisplayFor = vidx.contextDisplayFor, homophonesOf = vidx.homophonesOf;
  var checkAnswer = vidx.checkAnswer, otherLanguageHint = vidx.otherLanguageHint, getRawVocabRow = vidx.getRawVocabRow;
  var answerCompareHtml = vidx.answerCompareHtml;
  var getClient = dataOps.getClient, currentUser = dataOps.currentUser;
  var recordStudyActivity = dataOps.recordStudyActivity, syncOutbox = dataOps.syncOutbox;

  // The app shell / tab routing live in the bootstrap module -- reached lazily
  // so this file does not depend on its load order.
  function rerender() { window.RaumeStudy.flashcards.render(); }

  var session = null; // review session state
  function getSession() { return session; }
  function setSession(v) { session = v; }

  // The verdict tag's icon -- same line-icon idiom as the speaker button
  // (js/vocab/render.js), just two glyphs, kept local since nothing else uses them.
  var VERDICT_OK_ICON = '<svg width="10" height="10" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5l3.2 3.2L14 5.8"/></svg>';
  var VERDICT_BAD_ICON = '<svg width="9" height="9" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg>';
  // A near-miss (exactly one letter off) reads as a caution, not a flat pass
  // or fail -- same stroke style as the two icons above.
  var VERDICT_ALMOST_ICON = '<svg width="11" height="11" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2.5L16 15.5H2z"/><path d="M9 7.2v3.4"/><path d="M9 13.1v.1"/></svg>';

  // The Dashboard is a snapshot -- if you sit on it while a learning step's
  // due time passes, "Study now" should light up on its own rather than
  // staying dead until you navigate. A slow poll re-renders only when the
  // ready-to-study count actually changes, so it's a no-op almost always.
  var dashboardTimer = null;
  var lastReadyCount = -1;
  function stopDashboardPoll() { if (dashboardTimer) { clearInterval(dashboardTimer); dashboardTimer = null; } }
  function startDashboardPoll() {
    stopDashboardPoll();
    dashboardTimer = setInterval(function () {
      if (session || document.body.dataset.activePage !== "flashcards" ||
          window.RaumeStudy.flashcards.getActiveTab() !== "dashboard") {
        stopDashboardPoll();
        return;
      }
      if (readyToStudy(new Date()).length !== lastReadyCount) rerender();
    }, 60000);
  }

  // Nothing added yet -- a dashboard of zeroes and empty charts tells a new
  // user nothing. Show only what to do next: add some vocabulary.
  function renderEmptyDashboard(panel) {
    panel.innerHTML =
      '<div class="fc-dash-empty">' +
      // One large muted glyph for the empty state, iOS-style -- the only big
      // icon on the Flashcards screens.
      '<svg class="fc-dash-empty-glyph" viewBox="0 0 18 18" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + STAT_GLYPH_PATHS["Total cards"] + "</svg>" +
      "<h3>No flashcards yet</h3>" +
      "<p>Add words from the vocabulary tables to study them here.</p>" +
      '<div class="fc-cta-row fc-cta-row-primary">' +
      '<button type="button" class="fc-btn fc-btn-primary" id="fcEmptyBrowse">Browse vocabulary</button>' +
      '<button type="button" class="fc-btn" id="fcEmptyManage">Choose tables in Library</button>' +
      "</div></div>" +
      // Puzzles work without flashcards (Tables as the source), so their
      // games still get their card.
      '<div class="fc-viz-grid fc-dash-empty-puzzles">' + kanaCardHtml(new Date()) + puzzlesCardHtml(new Date()) + gamesCardHtml(new Date()) + kanjiCardHtml() + "</div>";
    bindDashGo(panel);
    var browse = document.getElementById("fcEmptyBrowse");
    if (browse) browse.addEventListener("click", function () {
      var v = window.RaumeStudy.vocab;
      if (v && v.showSection) v.showSection("vocabulary");
    });
    var manage = document.getElementById("fcEmptyManage");
    if (manage) manage.addEventListener("click", function () {
      window.RaumeStudy.flashcards.setActiveTab("manage");
      rerender();
    });
  }

  function renderDashboard(panel, stats) {
    stopDashboardPoll();
    if (session) { renderReview(panel); return; }
    if (stats.total === 0) { renderEmptyDashboard(panel); return; }
    // Before FSRS has enough reviews to forecast, spell it out -- a lone "—"
    // in a stat tile reads as a broken value.
    var retentionPending = stats.estimatedRetention == null;
    var retentionText = retentionPending ? "After a few reviews" : Math.round(stats.estimatedRetention * 100) + "%";
    var settings = getCache().settings;
    // A couple of points under target is normal noise, not a real dip -- only
    // flag it once it's meaningfully below what Settings asks FSRS to aim for,
    // so the tile isn't flickering color over nothing.
    var retentionLow = !retentionPending && stats.estimatedRetention < settings.fsrs_request_retention - 0.02;
    var now = new Date();
    if (weeklyActivity === null && !weeklyActivityLoading) {
      weeklyActivityLoading = true;
      loadWeeklyActivity().catch(function () { weeklyActivity = []; }).then(function () { weeklyActivityLoading = false; rerender(); });
    }
    if (reviewInsights === null && !reviewInsightsLoading) {
      reviewInsightsLoading = true;
      loadReviewInsights().catch(function () { reviewInsights = emptyInsights(); }).then(function () { reviewInsightsLoading = false; rerender(); });
    }
    var newInSession = Math.min(stats.newCount, Math.max(0, settings.queue_new_cards_per_day - todayNewCount(now)));
    // On a quiet account "Missed today" and "Words to Review" are two full-width
    // cards each holding one sentence -- fold them into a single line until
    // there's review history to show. (Still null while insights load: keep
    // both, they say "Loading…", then this settles on the next rerender.)
    var foldReview = reviewInsights && !reviewInsights.recentMistakes.length && !reviewInsights.wordsToReview.length;
    // "Study now" is enabled exactly when a session would have something in it
    // -- cards ready to review (incl. learning steps due within the look-ahead)
    // plus the day's new-card allowance -- so the button and the summary above
    // it never disagree.
    var ready = readyToStudy(now);
    var canStudy = ready.length + newInSession > 0;
    // Order matches the way you actually use this page: read the due / next-review
    // summary, act on it (Study now), then the slower-moving context below --
    // stat tiles, charts, and finally the Words to Review table.
    // The dashboard's ~9 pieces used to each carry their own border+shadow,
    // reading as a stack of independent widgets. They're grouped into 3
    // cards instead -- "right now" (next review / today / Study now),
    // "your stats" (the 4 tiles) and "your progress" (the charts) -- each
    // item keeping its own colour/accent but losing its individual box.
    var rings = todayRings(now, stats);
    var jn = noteJourney(now, stats);
    var tilesHtml = '<div class="fc-stats-grid fc-stats-grid-3 fc-journey-stats">' +
      statTile(stats.total, "Total cards") +
      statTile(stats.reviewsCompleted, "Reviews completed") +
      statTile(retentionText, "Estimated retention", retentionLow ? "attention" : null, retentionPending, stats.estimatedRetention != null) +
      "</div>" +
      (stats.estimatedRetention == null ? "" : '<p class="fc-note fc-retention-note" id="fcRetentionNote" hidden>FSRS’s forecast of how likely you are to recall your reviewed cards — not a measured pass rate.</p>');
    panel.innerHTML =
      // Today's rings beside their legend, then what a session holds now
      // and the button that starts it, on one row.
      '<div class="fc-dash-now fc-dash-rings">' +
      '<div class="fc-rings-row">' + ringsSvgHtml(rings, 120, ringsAnimateToday(now)) + ringsLegendHtml(rings) + "</div>" +
      '<div class="fc-now-row">' + ringsLineHtml(now, rings, ready.length + newInSession) +
      '<button type="button" class="fc-btn fc-btn-primary fc-now-btn" id="fcStudyNow"' + (canStudy ? "" : " disabled") + ">Study now</button></div>" +
      "</div>" +
      streakStripHtml(now, rings) +
      // The journey: level, Kana / Kanji / Words and the stat tiles; the
      // awards; a Highlights row when there's news -- then everything else
      // under a quiet "Details" header.
      journeyHtml(jn.journey, now, tilesHtml) +
      awardsCardHtml(jn.journey, jn.vals) +
      highlightHtml(now) +
      '<h3 class="fc-dash-head">Details</h3>' +
      '<div class="fc-dash-progress">' +
      '<div class="fc-viz-grid">' +
      '<div class="fc-viz-card fc-viz-wide">' + vizTitle("Card progress") + stateBreakdownChart(stats) + "</div>" +
      '<div class="fc-viz-card">' + vizTitle("Reviews this week") + (weeklyActivity ? weeklyActivityChart(weeklyActivity) : '<p class="fc-note">Loading…</p>') + "</div>" +
      '<div class="fc-viz-card">' + vizTitle("Due next 7 days") + dueForecastHtml(dueForecast(now)) + "</div>" +
      kanaCardHtml(now) +
      puzzlesCardHtml(now) +
      gamesCardHtml(now) +
      kanjiCardHtml() +
      (foldReview
        ? '<div class="fc-viz-card fc-viz-wide">' + vizTitle("Words to review") + '<p class="fc-note">Nothing to review yet — words you miss collect here, and repeat misses become a table to drill and print.</p></div>'
        // Nothing missed today: no card at all -- an empty card saying so is
        // a row of space for no news.
        : reviewInsights && !reviewInsights.recentMistakes.length ? ""
        : '<div class="fc-viz-card fc-viz-wide">' + vizTitle("Missed today") + missedTodayHtml() + "</div>") +
      leechesHtml() +
      "</div>" +
      "</div>" +
      (foldReview ? "" : '<div id="fcWordsToReview"></div>');
    var btn = document.getElementById("fcStudyNow");
    if (btn) btn.addEventListener("click", startSession);
    bindDashGo(panel);
    var info = panel.querySelector(".fc-stat-info"), note = document.getElementById("fcRetentionNote");
    if (info && note) info.addEventListener("click", function () {
      var open = info.getAttribute("aria-expanded") !== "true";
      info.setAttribute("aria-expanded", String(open));
      note.hidden = !open;
    });
    renderWordsToReview();
    lastReadyCount = ready.length;
    startDashboardPoll();
  }
  // Each card's title leads with an iOS-style tile -- a white glyph on its
  // own hue (the table rows' --tile palette), as Health and Settings mark
  // their categories. Kana and Kanji wear a character, not a drawing.
  var TITLE_TILES = {
    "Card progress": ["slate", '<rect x="5.5" y="3" width="10" height="12.5" rx="1.8"/><path d="M3 5.5v9.2c0 1 .8 1.8 1.8 1.8h7.7"/>'],
    "Reviews this week": ["blue", '<path d="M4 15V9M9 15V4M14 15v-4"/>'],
    "Due next 7 days": ["indigo", '<rect x="3" y="4" width="12" height="11" rx="2"/><path d="M3 8h12M6.5 2.5v3M11.5 2.5v3"/>'],
    "Kana": ["orange", "あ"],
    "Puzzles": ["teal", '<rect x="3" y="3" width="12" height="12" rx="1.5"/><path d="M3 9h12M9 3v12"/>'],
    "Games": ["purple", '<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="10" y="3" width="5" height="5" rx="1"/><rect x="3" y="10" width="5" height="5" rx="1"/><rect x="10" y="10" width="5" height="5" rx="1"/>'],
    "Kanji": ["amber", "字"],
    "Awards": ["amber", '<circle cx="9" cy="7" r="4.5"/><path d="M6.6 10.8 5.5 16 9 14.2l3.5 1.8-1.1-5.2"/>'],
    "Missed today": ["clay", '<circle cx="9" cy="9" r="6.5"/><path d="M6.8 6.8l4.4 4.4M11.2 6.8l-4.4 4.4"/>'],
    "Leeches": ["clay", '<path d="M9 3.2 15.8 15H2.2Z"/><path d="M9 7.6v3.2"/><circle cx="9" cy="12.9" r=".4" fill="currentColor"/>'],
    "Words to review": ["green", '<path d="M6.5 5h8M6.5 9h8M6.5 13h8"/><circle cx="3.5" cy="5" r=".5" fill="currentColor"/><circle cx="3.5" cy="9" r=".5" fill="currentColor"/><circle cx="3.5" cy="13" r=".5" fill="currentColor"/>']
  };
  function vizTitle(name) {
    var t = TITLE_TILES[name];
    var mark = !t ? "" : t[1].charAt(0) === "<"
      ? '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + t[1] + "</svg>"
      : '<span lang="ja" aria-hidden="true">' + t[1] + "</span>";
    return '<h3 class="fc-viz-title">' + (t ? '<span class="fc-title-tile" data-tile="' + t[0] + '">' + mark + "</span>" : "") + esc(name) + "</h3>";
  }
  // A small glyph before each stat's label, as iOS Health marks its
  // summary cards -- in the stat's own hue (the streak's flame orange).
  var STAT_GLYPH_PATHS = {
    "Day streak": '<path d="M9 16c2.8 0 4.5-1.9 4.5-4.3 0-2.9-2.4-4.3-3.2-7.2-.9 1.6-1.3 2.6-1.3 3.9-.9-.6-1.4-1.4-1.6-2.4C6 7.4 4.5 9.2 4.5 11.7 4.5 14.1 6.2 16 9 16Z"/>',
    "Total cards": '<rect x="5.5" y="3" width="10" height="12.5" rx="1.8"/><path d="M3 5.5v9.2c0 1 .8 1.8 1.8 1.8h7.7"/>',
    "Reviews completed": '<circle cx="9" cy="9" r="6.5"/><path d="M6.2 9.2l2 2 3.8-4.1"/>',
    "Games played": '<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="10" y="3" width="5" height="5" rx="1"/><rect x="3" y="10" width="5" height="5" rx="1"/><rect x="10" y="10" width="5" height="5" rx="1"/>',
    "Puzzles solved": '<rect x="3" y="3" width="12" height="12" rx="1.5"/><path d="M3 9h12M9 3v12"/>',
    "Estimated retention": '<circle cx="9" cy="9" r="6.5"/><circle cx="9" cy="9" r="3.4"/><circle cx="9" cy="9" r=".6" fill="currentColor"/>'
  };
  var INFO_GLYPH = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="7"/><path d="M9 8.2v4.3"/><circle cx="9" cy="5.6" r=".4" fill="currentColor"/></svg>';
  // `info`: an ⓘ after the label that shows the tile's explainer
  // (#fcRetentionNote) -- hidden until asked for, never a standing footnote.
  var STAT_HUES = {
    "Day streak": "orange", "Total cards": "blue", "Reviews completed": "green", "Estimated retention": "indigo",
    "Games played": "purple", "Puzzles solved": "teal"
  };
  function statTile(value, label, variant, pending, info) {
    var cls = (variant ? " fc-stat-" + variant : "") + (pending ? " fc-stat-tile-pending" : "");
    var glyph = STAT_GLYPH_PATHS[label]
      ? '<svg class="fc-stat-glyph"' + (STAT_HUES[label] ? ' data-tile="' + STAT_HUES[label] + '"' : "") + ' viewBox="0 0 18 18" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + STAT_GLYPH_PATHS[label] + "</svg>"
      : "";
    var infoBtn = info ? '<button type="button" class="fc-stat-info" aria-expanded="false" aria-controls="fcRetentionNote" aria-label="What is ' + esc(label) + '?">' + INFO_GLYPH + "</button>" : "";
    return '<div class="fc-stat-tile' + cls + '"><span class="fc-stat-value">' + esc(value) + '</span><span class="fc-stat-label">' + glyph + esc(label) + infoBtn + "</span></div>";
  }

  // --- Dashboard: Today's progress, Next review, Missed today, Words to Review ---

  // The one progress bar (Today, Kana, Kanji): a 6px sage fill on a faint
  // track, rounded ends -- tokens --bar-h / --bar-track / --bar-fill.
  function progressBarHtml(done, total, label) {
    var pct = total > 0 ? Math.min(100, Math.round(done / total * 1000) / 10) : (done > 0 ? 100 : 0);
    return '<svg class="fc-bar" viewBox="0 0 100 6" preserveAspectRatio="none" role="img" aria-label="' + esc(label) + '">' +
      '<rect class="fc-bar-track" x="0" y="0" width="100" height="6" rx="3"></rect>' +
      (pct > 0 ? '<rect class="fc-bar-fill" x="0" y="0" width="' + Math.max(pct, 3) + '" height="6" rx="3"></rect>' : "") + "</svg>";
  }
  // "in 8 minutes" for something imminent, "Tomorrow at 09:30" for something
  // further out -- both straight off each card's real FSRS `due`.
  function verboseUntil(now, ts) {
    var ms = ts - now.getTime();
    if (ms <= 0) return "now";
    var mins = Math.max(1, Math.round(ms / 60000));
    if (mins < 60) return "in " + mins + " minute" + (mins === 1 ? "" : "s");
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return "in " + hrs + " hour" + (hrs === 1 ? "" : "s");
    var days = Math.round(hrs / 24);
    return "in " + days + " day" + (days === 1 ? "" : "s");
  }
  function friendlyWhen(now, ts) {
    var d = new Date(ts);
    var time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    var startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
    var dStart = new Date(ts); dStart.setHours(0, 0, 0, 0);
    var dayDiff = Math.round((dStart.getTime() - startToday.getTime()) / 86400000);
    if (dayDiff <= 0) return "Today at " + time;
    if (dayDiff === 1) return "Tomorrow at " + time;
    if (dayDiff < 7) return d.toLocaleDateString(undefined, { weekday: "long" }) + " at " + time;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " at " + time;
  }
  // --- Dashboard: Today's rings and the streak strip ---------------------
  // Apple Fitness, not a points game: three rings to close each day, outer
  // to inner -- Review (the cards due today you've cleared, of those due
  // today), Learn (new cards introduced, of the day's allowance) and Play
  // (one finished puzzle or game). All counted from what the app already
  // keeps: today's tracker in scheduling.js (`fresh` / `reviewed` ids), the
  // cards' due dates and the puzzle/game log. A ring past 100% laps.
  var RINGS = [["review", "Review", "blue"], ["learn", "Learn", "green"], ["play", "Play", "purple"]];
  function todayRings(now, stats) {
    var day = sched.todayDay(now), fresh = {}, seen = {};
    day.fresh.forEach(function (id) { fresh[id] = true; });
    day.reviewed.forEach(function (id) { if (!fresh[id]) seen[id] = true; });
    var endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
    var cleared = Object.keys(seen).length;
    var left = studyableCards().filter(function (c) {
      return c.state !== 0 && !seen[c.id] && !fresh[c.id] && new Date(c.due) <= endToday;
    }).length;
    var perDay = Math.max(0, getCache().settings.queue_new_cards_per_day || 0);
    var learnGoal = Math.min(perDay, day.count + stats.newCount);
    var runs = fc.puzzleRuns ? fc.puzzleRuns.all() : [];
    var today = localDateStr(now);
    var played = runs.filter(function (r) { return !r.reset && !r.ended && r.at && localDateStr(new Date(r.at)) === today; }).length;
    return {
      review: { done: cleared, goal: cleared + left },
      learn: { done: day.count, goal: learnGoal, off: perDay === 0 },
      play: { done: played, goal: 1 }
    };
  }
  // "16/20" -- or, with nothing to count, what that means.
  function ringValue(key, r, sep) {
    if (key === "review" && r.goal === 0) return "Nothing due";
    if (key === "learn" && r.goal === 0) return r.off ? "Off" : "No new words";
    return r.done + sep + r.goal;
  }
  // A ring's share of its goal; nothing to do counts as closed.
  function ringShare(r) { return r.goal > 0 ? r.done / r.goal : 1; }
  function ringsClosed(rings) { return RINGS.every(function (k) { return ringShare(rings[k[0]]) >= 1; }); }
  // One <svg>, three concentric rings from 12 o'clock, clockwise, round
  // caps; each arc's length is an SVG attribute (pathLength 100), never a
  // style. A second lap past 100% is a shade darker with a small shadow.
  // `animate`: draw up from nothing (the day's first look only).
  function ringsSvgHtml(rings, size, animate) {
    var label = RINGS.map(function (k) { return k[1] + " " + ringValue(k[0], rings[k[0]], " of "); }).join(", ");
    var arcs = RINGS.map(function (k, i) {
      var rad = 52 - i * 14, share = ringShare(rings[k[0]]);
      var circle = function (cls, len) {
        return '<circle class="' + cls + '" cx="60" cy="60" r="' + rad + '"' +
          (len == null ? "" : ' pathLength="100" stroke-dasharray="' + len + ' 100" transform="rotate(-90 60 60)"') + "/>";
      };
      var first = Math.min(share, 1), lap = Math.min(Math.max(share - 1, 0), 1);
      return '<g class="fc-ring" data-tile="' + k[2] + '" data-i="' + i + '">' + circle("fc-ring-track") +
        (first > 0 ? circle("fc-ring-arc", Math.round(first * 1000) / 10) : "") +
        (lap > 0 ? circle("fc-ring-arc fc-ring-lap", Math.round(lap * 1000) / 10) : "") + "</g>";
    }).join("");
    return '<svg class="fc-rings' + (animate ? " fc-rings-animate" : "") + '" viewBox="0 0 120 120" width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(label) + '">' + arcs + "</svg>";
  }
  var RING_DONE_ICON = '<svg class="fc-rings-tick" viewBox="0 0 18 18" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5l3.2 3.2L14 5.8"/></svg>';
  // The legend beside the rings, Fitness-style: the ring's name in its
  // colour, then "16/20" in tabular figures; a closed ring adds a ✓.
  function ringsLegendHtml(rings) {
    return '<ul class="fc-rings-legend">' + RINGS.map(function (k) {
      var r = rings[k[0]], value = ringValue(k[0], r, "/");
      return '<li data-tile="' + k[2] + '"><span class="fc-rings-name">' + k[1] + '</span><span class="fc-rings-val">' + esc(value) +
        (ringShare(r) >= 1 ? RING_DONE_ICON : "") + "</span></li>";
    }).join("") + "</ul>";
  }
  // The rings draw up from nothing on the day's first Dashboard visit only
  // (never on a rerender or the minute poll); reduced motion, never.
  var RINGS_SHOWN_KEY = "raume-rings-shown";
  function ringsAnimateToday(now) {
    var today = localDateStr(now);
    try {
      if (localStorage.getItem(RINGS_SHOWN_KEY) === today) return false;
      localStorage.setItem(RINGS_SHOWN_KEY, today);
    } catch (e) { return false; }
    return !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  // The line beside Study now: what a session holds now, else when the
  // next review is, else that every ring is closed.
  function ringsLineHtml(now, rings, readyNow) {
    var text;
    if (readyNow > 0) text = readyNow + (readyNow === 1 ? " card" : " cards") + " to study";
    else if (ringsClosed(rings)) text = "All rings closed";
    else {
      var next = studyableCards().filter(function (c) { return c.state !== 0; })
        .map(function (c) { return new Date(c.due).getTime(); })
        .filter(function (t) { return t > now.getTime(); }).sort(function (a, b) { return a - b; })[0];
      var endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
      text = next && next <= endToday.getTime() ? "Next review " + verboseUntil(now, next)
        : "Nothing due — learn new words or play";
    }
    return '<p class="fc-rings-line">' + esc(text) + "</p>";
  }

  // The streak: the number with a flame, then this week as seven dots --
  // filled for a day you studied, hollow for one you didn't, today half
  // until its Review ring closes, the days ahead a grey track. The week
  // starts where the locale's does (Monday when it can't say).
  function weekStart() {
    try {
      var loc = new Intl.Locale(navigator.language || "en");
      var info = loc.getWeekInfo ? loc.getWeekInfo() : loc.weekInfo;
      if (info && info.firstDay) return info.firstDay % 7;
    } catch (e) { /* older engines */ }
    return 1;
  }
  // The streak as it stands today: a run that ended before yesterday is 0,
  // not the number it reached.
  function liveStreak(now) {
    var s = getCache().settings, last = s.last_study_date;
    var yesterday = localDateStr(dayBefore(now));
    return last === localDateStr(now) || last === yesterday ? (s.current_streak || 0) : 0;
  }
  var FLAME_ICON = '<svg class="fc-streak-flame" data-tile="orange" viewBox="0 0 18 18" width="22" height="22" fill="currentColor" aria-hidden="true">' +
    '<path d="M9 16c2.8 0 4.5-1.9 4.5-4.3 0-2.9-2.4-4.3-3.2-7.2-.9 1.6-1.3 2.6-1.3 3.9-.9-.6-1.4-1.4-1.6-2.4C6 7.4 4.5 9.2 4.5 11.7 4.5 14.1 6.2 16 9 16Z"/></svg>';
  function streakStripHtml(now, rings) {
    var settings = getCache().settings, streak = liveStreak(now), best = Math.max(settings.longest_streak || 0, streak);
    var studied = {};
    (weeklyActivity || []).forEach(function (d) { if (d.count > 0) studied[d.date] = true; });
    var todayStr = localDateStr(now);
    if (settings.last_study_date === todayStr) studied[todayStr] = true;
    var start = new Date(now); start.setHours(12, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() - weekStart() + 7) % 7));
    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      var key = localDateStr(d), state;
      if (key === todayStr) state = studied[key] && ringShare(rings.review) >= 1 ? "done" : "today";
      else if (key > todayStr) state = "future";
      else state = studied[key] ? "done" : "missed";
      var name = d.toLocaleDateString(undefined, { weekday: "long" });
      days.push('<li class="fc-streak-day fc-streak-' + state + (key === todayStr ? " fc-streak-is-today" : "") + '">' +
        '<span class="fc-streak-letter" aria-hidden="true">' + esc(d.toLocaleDateString(undefined, { weekday: "narrow" })) + "</span>" +
        '<span class="fc-streak-dot" role="img" aria-label="' + esc(name + ": " + (state === "done" ? "studied" : state === "missed" ? "not studied" : state === "today" ? "today" : "still to come")) + '"></span></li>');
    }
    var line = best > streak ? "Best " + best + " days · " + (best - streak + 1) + " to beat it"
      : streak >= 2 ? "Your longest streak yet" : "";
    return '<div class="fc-dash-streak">' +
      '<div class="fc-streak-head">' + FLAME_ICON + '<span class="fc-streak-num">' + streak + '</span><span class="fc-streak-lbl">day streak</span></div>' +
      '<ol class="fc-streak-week" aria-label="This week">' + days.join("") + "</ol>" +
      (line ? '<p class="fc-streak-line">' + esc(line) + "</p>" : "") + "</div>";
  }

  // --- Dashboard: the N5 journey, awards and highlights -------------------
  // A level that only grows -- one per 25 words *ever* mastered, kept in
  // getCache().journey so forgetting a word never takes a level back -- then
  // where you stand in Kana, Kanji and Words; the awards to collect (each
  // celebrated once: its id is noted the day it's earned); and one
  // Highlights row only when there's real news. All derived from what the
  // app already keeps, except that journey record.
  var LEVEL_WORDS = 25;
  // The N5 kanji (the vocab-kanji tables) and how many are marked Known.
  function kanjiCounts() {
    var kk = window.RaumeStudy.knownKanji;
    if (!kk) return null;
    var ids = [];
    (window.RaumeStudy.data.vocabularyTables || []).forEach(function (t) {
      if (t.tableClass === "vocab-kanji") t.rows.forEach(function (r) { if (r.id) ids.push(r.id); });
    });
    if (!ids.length) return null;
    return { known: ids.filter(function (id) { return kk.isKnown(id); }).length, total: ids.length };
  }
  // Each award: id, kind (the Awards screen's group), the value it's judged
  // on, its goal ("all" = that value's own total), name, what it's for, hue
  // and glyph (an AWARD_GLYPHS key, or a character).
  var AWARD_GLYPHS = {
    streak: '<path d="M9 16c2.8 0 4.5-1.9 4.5-4.3 0-2.9-2.4-4.3-3.2-7.2-.9 1.6-1.3 2.6-1.3 3.9-.9-.6-1.4-1.4-1.6-2.4C6 7.4 4.5 9.2 4.5 11.7 4.5 14.1 6.2 16 9 16Z"/>',
    reviews: '<circle cx="9" cy="9" r="6.5"/><path d="M6.2 9.2l2 2 3.8-4.1"/>',
    words: '<path d="M9 2.5l2 4.3 4.6.5-3.4 3.1 1 4.6L9 12.6 4.8 15l1-4.6-3.4-3.1 4.6-.5z"/>',
    puzzles: '<rect x="3" y="3" width="12" height="12" rx="1.5"/><path d="M3 9h12M9 3v12"/>',
    games: '<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="10" y="3" width="5" height="5" rx="1"/><rect x="3" y="10" width="5" height="5" rx="1"/><rect x="10" y="10" width="5" height="5" rx="1"/>',
    pace: '<path d="M10 2.5 4.5 10H9l-1 5.5L13.5 8H9z"/>',
    ear: '<path d="M3.5 7v4h2.8L10 14V4L6.3 7z"/><path d="M12.4 6.6a3.4 3.4 0 0 1 0 4.8M14.3 4.8a6 6 0 0 1 0 8.4"/>',
    awards: '<circle cx="9" cy="7" r="4.5"/><path d="M6.6 10.8 5.5 16 9 14.2l3.5 1.8-1.1-5.2"/>'
  };
  function A(id, kind, metric, goal, name, what, hue, glyph) {
    return { id: id, kind: kind, metric: metric, goal: goal, name: name, what: what, hue: hue, glyph: glyph };
  }
  var AWARDS = [
    A("streak-3", "streak", "streak", 3, "3-day streak", "Study three days in a row.", "orange", "streak"),
    A("streak-7", "streak", "streak", 7, "7-day streak", "Study seven days in a row.", "orange", "streak"),
    A("streak-30", "streak", "streak", 30, "30-day streak", "Study 30 days in a row.", "orange", "streak"),
    A("streak-100", "streak", "streak", 100, "100-day streak", "Study 100 days in a row.", "orange", "streak"),
    A("reviews-100", "reviews", "reviews", 100, "100 reviews", "Complete 100 flashcard reviews.", "blue", "reviews"),
    A("reviews-1000", "reviews", "reviews", 1000, "1,000 reviews", "Complete 1,000 flashcard reviews.", "blue", "reviews"),
    A("reviews-5000", "reviews", "reviews", 5000, "5,000 reviews", "Complete 5,000 flashcard reviews.", "blue", "reviews"),
    A("words-25", "words", "words", 25, "25 words mastered", "Master 25 words — every card of a word remembered for three weeks or more.", "green", "words"),
    A("words-100", "words", "words", 100, "100 words mastered", "Master 100 words.", "green", "words"),
    A("words-300", "words", "words", 300, "300 words mastered", "Master 300 words.", "green", "words"),
    A("kana-hiragana", "kana", "hiragana", "all", "Hiragana", "Study every hiragana at least once in Kana — gojūon, dakuten, handakuten and yōon.", "orange", "あ"),
    A("kana-katakana", "kana", "katakana", "all", "Katakana", "Study every katakana at least once in Kana — gojūon, dakuten, handakuten and yōon.", "orange", "ア"),
    A("kanji-25", "kanji", "kanji", 25, "25 kanji known", "Mark 25 N5 kanji as Known in the Kanji section.", "amber", "字"),
    A("kanji-50", "kanji", "kanji", 50, "50 kanji known", "Mark 50 N5 kanji as Known.", "amber", "字"),
    A("kanji-all", "kanji", "kanji", "all", "Every N5 kanji", "Mark every N5 kanji as Known.", "amber", "字"),
    A("puzzles-1", "puzzles", "puzzles", 1, "First puzzle", "Solve a crossword, arroword or word search.", "teal", "puzzles"),
    A("puzzles-10", "puzzles", "puzzles", 10, "10 puzzles", "Solve ten puzzles.", "teal", "puzzles"),
    A("puzzles-50", "puzzles", "puzzles", 50, "50 puzzles", "Solve 50 puzzles.", "teal", "puzzles"),
    A("games-1", "games", "games", 1, "First game", "Finish a game.", "purple", "games"),
    A("games-10", "games", "games", 10, "10 games", "Finish ten games.", "purple", "games"),
    A("games-50", "games", "games", 50, "50 games", "Finish 50 games.", "purple", "games"),
    A("games-pace", "games", "pace", 1, "Quick hands", "Finish a whole Match game at under two seconds a pair.", "indigo", "pace"),
    A("games-ear", "games", "ear", 1, "Perfect ear", "Get every word right in a whole Listening game.", "blue", "ear")
  ];
  var AWARD_KINDS = [["streak", "Streaks"], ["reviews", "Reviews"], ["words", "Words"], ["kana", "Kana"], ["kanji", "Kanji"], ["puzzles", "Puzzles"], ["games", "Games"]];
  // What each award is judged on. Puzzles and games count from the whole log
  // (all(), not live()), so Reset stats never takes an award back; a game
  // ended early doesn't count. null = can't be judged here (hidden).
  function awardValues(now, stats, ever) {
    var pr = fc.puzzleRuns, kana = fc.kana && fc.kana.scriptProgress ? fc.kana : null, kj = kanjiCounts();
    var runs = pr ? pr.all().filter(function (r) { return !r.reset && !r.ended; }) : [];
    var games = runs.filter(function (r) { return pr.isGameMode(r.mode); });
    var hira = kana ? kana.scriptProgress("hiragana") : null, kata = kana ? kana.scriptProgress("katakana") : null;
    return {
      streak: Math.max(getCache().settings.longest_streak || 0, liveStreak(now)),
      reviews: stats.reviewsCompleted || 0, words: ever,
      hiragana: hira ? hira.started : null, hiraganaTotal: hira ? hira.total : 0,
      katakana: kata ? kata.started : null, katakanaTotal: kata ? kata.total : 0,
      kanji: kj ? kj.known : null, kanjiTotal: kj ? kj.total : 0,
      puzzles: pr ? runs.length - games.length : null, games: pr ? games.length : null,
      pace: pr ? (games.some(function (r) { return r.mode === "match" && r.n > 0 && r.ms / r.n < 2000; }) ? 1 : 0) : null,
      ear: pr ? (games.some(function (r) { return r.mode === "listening" && r.n > 0 && r.right === r.n; }) ? 1 : 0) : null
    };
  }
  function awardGoal(a, vals) { return a.goal === "all" ? vals[a.metric + "Total"] : a.goal; }
  function awardShown(a, vals) { return vals[a.metric] != null && awardGoal(a, vals) > 0; }
  // Notes words newly mastered and awards newly earned (today's date) into
  // the journey, saving -- and pushing to the account -- only on a change.
  function noteJourney(now, stats) {
    var c = getCache();
    if (!c.journey) c.journey = store.cleanJourney(null);
    var j = c.journey, today = localDateStr(now), changed = false;
    Object.keys(masteredWords()).forEach(function (v) { if (!j.mastered[v]) { j.mastered[v] = today; changed = true; } });
    var vals = awardValues(now, stats, Object.keys(j.mastered).length);
    AWARDS.forEach(function (a) {
      if (!j.awards[a.id] && awardShown(a, vals) && vals[a.metric] >= awardGoal(a, vals)) { j.awards[a.id] = today; changed = true; }
    });
    if (changed) {
      store.saveCache();
      if (!isGuestMode() && dataOps.saveJourneyRemote) dataOps.saveJourneyRemote(j);
    }
    return { journey: j, vals: vals };
  }
  function glyphHtml(g, size) {
    var paths = AWARD_GLYPHS[g] || (g && g.charAt(0) === "<" ? g : null);
    return paths
      ? '<svg viewBox="0 0 18 18" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>"
      : '<span lang="ja" aria-hidden="true">' + esc(g) + "</span>";
  }
  // A medal, Fitness-style: a round face in the award's hue with a white
  // glyph once earned; locked, a grey face inside a thin ring of its
  // progress (an SVG attribute, never a style).
  function medalHtml(a, vals, earned, big) {
    var share = earned ? 1 : Math.min((vals[a.metric] || 0) / awardGoal(a, vals), 1);
    var ring = earned ? "" : '<svg class="fc-medal-ring" viewBox="0 0 52 52" aria-hidden="true"><circle class="fc-medal-ring-track" cx="26" cy="26" r="24.5"/>' +
      (share > 0 ? '<circle class="fc-medal-ring-arc" cx="26" cy="26" r="24.5" pathLength="100" stroke-dasharray="' + Math.max(Math.round(share * 1000) / 10, 2) + ' 100" transform="rotate(-90 26 26)"/>' : "") + "</svg>";
    return '<span class="fc-medal' + (earned ? "" : " fc-medal-locked") + (big ? " fc-medal-big" : "") + '" data-tile="' + a.hue + '">' + ring +
      '<span class="fc-medal-face">' + glyphHtml(a.glyph, big ? 34 : 20) + "</span></span>";
  }
  function awardProgress(a, vals) {
    var goal = awardGoal(a, vals);
    return goal === 1 ? "Not yet" : Math.min(vals[a.metric] || 0, goal).toLocaleString() + "/" + goal.toLocaleString();
  }
  function dayText(day, opts) {
    var p = day.split("-");
    return new Date(+p[0], p[1] - 1, +p[2]).toLocaleDateString(undefined, opts || { day: "numeric", month: "long", year: "numeric" });
  }
  function awardHtml(a, j, vals) {
    var earned = j.awards[a.id];
    return '<li><button type="button" class="fc-award" data-award="' + a.id + '" aria-label="' +
      esc(a.name + (earned ? ", earned " + dayText(earned) : ", " + awardProgress(a, vals).replace("/", " of "))) + '">' +
      medalHtml(a, vals, earned, false) + '<span class="fc-award-name" aria-hidden="true">' + esc(a.name) + "</span>" +
      (earned ? "" : '<span class="fc-award-cap" aria-hidden="true">' + esc(awardProgress(a, vals)) + "</span>") + "</button></li>";
  }
  // The Dashboard shows six: the newest earned first, then the locked ones
  // nearest done.
  function dashAwards(j, vals) {
    var shown = AWARDS.filter(function (a) { return awardShown(a, vals); });
    var earned = shown.filter(function (a) { return j.awards[a.id]; })
      .sort(function (a, b) { return j.awards[a.id] < j.awards[b.id] ? 1 : j.awards[a.id] > j.awards[b.id] ? -1 : AWARDS.indexOf(b) - AWARDS.indexOf(a); });
    var share = function (a) { return (vals[a.metric] || 0) / awardGoal(a, vals); };
    var locked = shown.filter(function (a) { return !j.awards[a.id]; }).sort(function (a, b) { return share(b) - share(a); });
    return earned.concat(locked).slice(0, 6);
  }
  function awardsCardHtml(j, vals) {
    return '<div class="fc-viz-card fc-dash-awards"><div class="fc-awards-head">' + vizTitle("Awards") +
      '<button type="button" class="fc-pz-link" id="fcAwardsAll">Show all</button></div>' +
      '<ul class="fc-awards-grid">' + dashAwards(j, vals).map(function (a) { return awardHtml(a, j, vals); }).join("") + "</ul></div>";
  }
  // Level + its bar, then Kana / Kanji / Words -- each a way into its place
  // -- then the three stat tiles under a hairline.
  function journeyHtml(j, now, tilesHtml) {
    var ever = Object.keys(j.mastered).length, level = Math.floor(ever / LEVEL_WORDS) + 1, into = ever % LEVEL_WORDS;
    var kana = fc.kana && fc.kana.summary ? fc.kana.summary(now) : null, kj = kanjiCounts();
    var inDeck = {};
    studyableCards().forEach(function (c) { inDeck[c.vocabId] = true; });
    var cols = [];
    if (kana) cols.push(["kana", "Kana started", kana.started, kana.total]);
    if (kj) cols.push(["kanji", "Kanji known", kj.known, kj.total]);
    cols.push(["manage", "Words mastered", Object.keys(masteredWords()).length, Object.keys(inDeck).length]);
    var left = LEVEL_WORDS - into;
    return '<div class="fc-dash-stats fc-journey">' +
      '<div class="fc-journey-head"><span class="fc-journey-level">Level ' + level + "</span>" +
      '<span class="fc-journey-next">' + left + (left === 1 ? " word" : " words") + " to Level " + (level + 1) + "</span></div>" +
      progressBarHtml(into, LEVEL_WORDS, into + " of " + LEVEL_WORDS + " words mastered toward Level " + (level + 1)) +
      '<div class="fc-journey-cols">' + cols.map(function (c) {
        return '<button type="button" class="fc-journey-col" data-dash-go="' + c[0] + '"><span class="fc-journey-val">' + c[2] +
          '<span class="fc-journey-of">/' + c[3] + '</span></span><span class="fc-journey-lbl">' + c[1] + "</span></button>";
      }).join("") + "</div>" + tilesHtml + "</div>";
  }
  // One Highlights row, only for real news: this week's reviews up 15% or
  // more on last week's (at least ten in each), else a new best Match pace
  // this week. Never a "fewer" line; nothing to say, no card.
  function highlightHtml(now) {
    var news = null, day = 86400000;
    var start = new Date(now); start.setHours(0, 0, 0, 0);
    var weekFrom = start.getTime() - 6 * day, lastFrom = weekFrom - 7 * day;
    if (reviewEvents) {
      var thisWk = 0, lastWk = 0;
      reviewEvents.forEach(function (e) { if (e.ts >= weekFrom) thisWk++; else if (e.ts >= lastFrom) lastWk++; });
      if (thisWk >= 10 && lastWk >= 10 && thisWk >= lastWk * 1.15) {
        news = ["up", thisWk + " reviews this week — " + Math.round((thisWk / lastWk - 1) * 100) + "% more than last week"];
      }
    }
    if (!news && fc.puzzleRuns) {
      var best = function (runs) { return runs.reduce(function (m, r) { return Math.min(m, r.ms / r.n); }, Infinity); };
      var match = fc.puzzleRuns.live("match").filter(function (r) { return !r.ended && r.n > 0; });
      var mine = best(match.filter(function (r) { return Date.parse(r.at) >= weekFrom; }));
      var before = best(match.filter(function (r) { return Date.parse(r.at) < weekFrom; }));
      if (mine < before && before < Infinity) news = ["pace", "New best Match pace — " + (mine / 1000).toFixed(1) + "s a pair"];
    }
    return news ? '<h3 class="fc-dash-head">Highlights</h3><div class="set-card fc-dash-highlight">' + newsRowHtml(news[0], news[1]) + "</div>" : "";
  }
  // The Awards screen (pushed from Show all): how many earned, then every
  // award by kind.
  function renderAwards(panel) {
    if (!panel) return;
    var now = new Date(), n = noteJourney(now, sched.computeStats(now)), j = n.journey, vals = n.vals;
    var shown = AWARDS.filter(function (a) { return awardShown(a, vals); });
    var got = shown.filter(function (a) { return j.awards[a.id]; }).length;
    panel.innerHTML = '<p class="fc-awards-count">' + got + " of " + shown.length + " earned</p>" +
      AWARD_KINDS.map(function (k) {
        var list = shown.filter(function (a) { return a.kind === k[0]; });
        return list.length ? '<h3 class="help-head">' + esc(k[1]) + '</h3><div class="help-card fc-awards-group"><ul class="fc-awards-grid">' +
          list.map(function (a) { return awardHtml(a, j, vals); }).join("") + "</ul></div>" : "";
      }).join("");
  }
  // Tapping a medal: a sheet with it large, its name, what it's for and the
  // day it was earned (or how far along). Done, a tap on the dimmed page or
  // Escape closes it; focus goes back to the medal.
  function openMedalSheet(id) {
    var a = AWARDS.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    var now = new Date(), n = noteJourney(now, sched.computeStats(now)), earned = n.journey.awards[id];
    var old = document.querySelector(".fc-medal-host");
    if (old) old.remove();
    var opener = document.activeElement;
    var host = document.createElement("div");
    host.className = "ios-confirm fc-medal-host";
    host.innerHTML = '<div class="ios-confirm-scrim"></div>' +
      '<div class="ios-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="fcMedalName">' +
      '<div class="ios-confirm-group fc-medal-sheet">' + medalHtml(a, n.vals, earned, true) +
      '<p class="fc-medal-name" id="fcMedalName">' + esc(a.name) + "</p>" +
      '<p class="fc-medal-what">' + esc(a.what) + "</p>" +
      '<p class="fc-medal-when">' + esc(earned ? "Earned " + dayText(earned) : awardGoal(a, n.vals) === 1 ? "Not earned yet" : awardProgress(a, n.vals) + " so far") + "</p></div>" +
      '<button type="button" class="ios-confirm-cancel" id="fcMedalDone">Done</button></div>';
    document.body.appendChild(host);
    function close() {
      document.removeEventListener("keydown", onKey);
      host.remove();
      if (opener && opener.focus && document.contains(opener)) opener.focus();
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    host.querySelector(".ios-confirm-scrim").addEventListener("click", close);
    document.getElementById("fcMedalDone").addEventListener("click", close);
    document.getElementById("fcMedalDone").focus();
  }
  document.addEventListener("click", function (event) {
    var medal = event.target.closest && event.target.closest("[data-award]");
    if (medal) { openMedalSheet(medal.dataset.award); return; }
    if (event.target.closest && event.target.closest("#fcAwardsAll")) {
      window.RaumeStudy.flashcards.setActiveTab("awards");
      rerender();
      window.scrollTo(0, 0);
    }
  });

  // Leeches -- words that keep lapsing (see scheduling.leechWords). Shown only
  // when there are any, so a healthy deck never sees an empty card. Two
  // outcomes per word: Pause (the existing per-word pause -- progress and
  // history kept, Resume in Manage) or Keep (stop flagging it for now).
  var LEECH_SHOWN = 5;
  function leechesHtml() {
    var list = sched.leechWords();
    if (!list.length) return "";
    var idx = getVocabIndex();
    var rows = list.filter(function (w) { return idx[w.vocabId]; });
    if (!rows.length) return "";
    return '<div class="fc-viz-card fc-viz-wide fc-leech-card">' + vizTitle("Leeches") +
      '<p class="fc-note">Words that keep slipping out of memory. Pausing takes one out of review — its progress is kept, and you can resume it any time in Library. Keep leaves it studied and stops flagging it for now.</p>' +
      '<ul class="fc-leech-list">' + rows.slice(0, LEECH_SHOWN).map(function (w) {
        var e = idx[w.vocabId];
        var what = e.englishFull;
        return '<li class="fc-leech-row">' +
          '<div class="fc-leech-word"><span class="fc-missed-jp" lang="ja">' + e.jpInlineHtml + "</span>" +
          '<span class="fc-missed-gloss"><span class="fc-missed-ro">' + esc(e.romajiDisplay) + '</span><span class="fc-missed-sep"> · </span><span class="fc-missed-en">' + esc(what) + "</span></span>" +
          '<span class="fc-leech-meta">Forgotten ' + w.lapses + "× · " + esc(DIRECTION_LABEL[w.direction] || w.direction) + "</span></div>" +
          '<div class="fc-leech-actions">' +
          '<button type="button" class="fc-btn" data-leech-pause="' + esc(w.vocabId) + '" aria-label="Pause ' + esc(what) + '" title="Take this word out of review — progress is kept">Pause</button>' +
          '<button type="button" class="fc-btn" data-leech-keep="' + esc(w.vocabId) + '" data-lapses="' + w.lapses + '" aria-label="Keep ' + esc(what) + ' in review" title="Keep studying it — stop flagging it for now">Keep</button>' +
          "</div></li>";
      }).join("") + "</ul>" +
      (rows.length > LEECH_SHOWN ? '<p class="fc-note">+ ' + (rows.length - LEECH_SHOWN) + " more — deal with these and the next ones appear.</p>" : "") +
      "</div>";
  }

  // "Missed today" -- a calm shortlist of words to revisit. One row per word:
  // the Japanese pair (strongest), a single supporting "romaji · english" line,
  // and a compact "N× today" badge. The whole row is the control (tap to
  // practice that word now); no per-row buttons.
  function missedTodayHtml() {
    if (!reviewInsights) return '<p class="fc-note">Loading…</p>';
    var list = reviewInsights.recentMistakes;
    var idx = getVocabIndex();
    return '<ul class="fc-missed-list">' + list.map(function (m) {
      var e = idx[m.vocabId];
      if (!e) return "";
      return '<li><button type="button" class="fc-missed-row" data-review-vocab="' + esc(m.vocabId) + '" title="Practice this word now">' +
        '<span class="fc-missed-jp" lang="ja">' + e.jpInlineHtml + "</span>" +
        '<span class="fc-missed-gloss">' +
        '<span class="fc-missed-ro">' + esc(e.romajiDisplay) + "</span>" +
        '<span class="fc-missed-sep"> · </span>' +
        '<span class="fc-missed-en">' + esc(e.englishFull) + "</span>" +
        "</span>" +
        '<span class="fc-missed-badge">' + m.count + "× today</span>" +
        "</button></li>";
    }).join("") + "</ul>";
  }

  // "Words to Review" is one of the standard vocabulary table sections
  // (RaumeStudy.vocab.buildVocabSection) filled with the entries missed most
  // often -- so it sorts, prints, and (via viewMode) hides columns exactly
  // like every other table. The column toggles drive the same global
  // body.hide-* state the reference pages use. Scoped CSS on #fcWordsToReview
  // keeps its header quiet so it reads as a dashboard card, not a full
  // vocabulary-page section.
  function renderWordsToReview() {
    var host = document.getElementById("fcWordsToReview");
    if (!host) return;
    if (!reviewInsights) { host.innerHTML = '<p class="fc-note">Loading…</p>'; return; }
    var rows = reviewInsights.wordsToReview.map(function (m) { return getRawVocabRow(m.vocabId); }).filter(Boolean);
    if (!rows.length || !window.RaumeStudy.vocab.buildVocabSection) {
      host.innerHTML = '<div class="fc-viz-card">' + vizTitle("Words to review") +
        '<p class="fc-note">Nothing stands out yet — words you miss more than once collect here so you can drill and print them.</p></div>';
      return;
    }
    host.innerHTML = window.RaumeStudy.vocab.buildVocabSection({
      id: "wtr", title: "Words to review", rows: rows, presort: false,
      controls: { print: true, viewMode: true }
    });
    window.RaumeStudy.flashcards.refreshRowToggleButtons();
    // Sync the just-drawn column checkmarks (and this table's cell aria-hidden)
    // to whatever columns are currently hidden globally.
    if (window.RaumeStudy.vocab.applyColVisibility) window.RaumeStudy.vocab.applyColVisibility();
  }

  // Card-state breakdown -- a single stacked bar (New/Learning/Review) as a
  // light-to-dark slate ramp (see --fc-state-* / .fc-seg-* in site.css):
  // an ordinal progression, so a sequential ramp reads better than three
  // similar tones. SVG attributes (not style="") so the computed widths
  // don't run into the page's CSP.
  function stateBreakdownChart(stats) {
    var segs = [
      { n: stats.newCount, cls: "fc-seg-new", label: "New" },
      { n: stats.learningCount, cls: "fc-seg-learning", label: "Learning" },
      { n: stats.reviewCount, cls: "fc-seg-review", label: "Review" }
    ];
    var total = Math.max(1, stats.newCount + stats.learningCount + stats.reviewCount);
    var w = 400, x = 0, rects = "";
    segs.forEach(function (s) {
      var sw = (s.n / total) * w;
      if (s.n > 0) rects += '<rect class="' + s.cls + '" x="' + x.toFixed(1) + '" y="0" width="' + sw.toFixed(1) + '" height="16"></rect>';
      x += sw;
    });
    var legend = segs.map(function (s) {
      return '<span class="fc-legend-item"><span class="fc-legend-dot ' + s.cls + '"></span>' + esc(s.label) + " " + s.n + "</span>";
    }).join("");
    return '<div class="fc-breakdown-bar-wrap"><svg viewBox="0 0 ' + w + ' 16" preserveAspectRatio="none" class="fc-breakdown-bar" role="img" aria-label="Card progress breakdown">' + rects + "</svg></div>" +
      '<div class="fc-breakdown-legend">' + legend + "</div>";
  }

  var weeklyActivity = null; // null = not fetched yet, [] = fetched, empty
  var weeklyActivityLoading = false;

  // -----------------------------------------------------------------------
  // Review insights (Dashboard): reviewed-today count, "Words to Review"
  // (missed repeatedly, over time) and "Missed today" (missed today).
  // All derived from actual review history -- the guest cache's reviewLogs
  // or Supabase's review_logs -- never estimated. `reviewEvents` caches the
  // raw per-review list so the two derived views recompute cheaply (e.g.
  // when pausing a word changes which entries still count as active).
  // -----------------------------------------------------------------------
  var reviewInsights = null;
  var reviewInsightsLoading = false;
  var reviewEvents = null; // [{ vocabId, wrong, ts }]
  function emptyInsights() { return { reviewedToday: 0, wordsToReview: [], recentMistakes: [] }; }
  // Drops every cached derived-history view. Callers always want the weekly
  // chart refreshed alongside the insights (sign-in, mode switch, a new
  // review, the outbox draining), so both are cleared together.
  function invalidateInsights() {
    reviewInsights = null; reviewEvents = null; reviewInsightsLoading = false;
    weeklyActivity = null; weeklyActivityLoading = false;
  }

  // Reviews still sitting in the local outbox -- signed in, done but not yet on
  // the server -- as the same {vocabId, wrong, ts} shape fetchReviewEvents
  // returns. Folded into every derived view so a review shows on the dashboard
  // the moment it's rated and keeps showing while offline, instead of the
  // panels reading as zero until the next successful sync. `syncedIds` skips
  // any entry the server already has (the rare log-inserted-then-card-retry
  // overlap).
  function outboxReviewEvents(syncedIds) {
    if (isGuestMode()) return [];
    var cards = getCache().cards;
    return (getCache().logsOutbox || []).reduce(function (out, e) {
      if (syncedIds && syncedIds[e.clientReviewId]) return out;
      var card = cards[e.cardId];
      out.push({
        vocabId: card ? card.vocabId : null,
        wrong: e.logFields.rating === 1,
        ts: Date.parse(e.logFields.review) || Date.now()
      });
      return out;
    }, []);
  }

  function computeInsights(events) {
    var todayStr = localDateStr(new Date());
    var agg = {};
    var reviewedToday = 0;
    events.forEach(function (e) {
      if (!e.vocabId) return;
      var a = agg[e.vocabId] || (agg[e.vocabId] = { reviews: 0, mistakes: 0, todayMistakes: 0, lastMistakeTs: 0 });
      var isToday = localDateStr(new Date(e.ts)) === todayStr;
      a.reviews++;
      if (isToday) reviewedToday++;
      if (e.wrong) {
        a.mistakes++;
        if (e.ts > a.lastMistakeTs) a.lastMistakeTs = e.ts;
        if (isToday) a.todayMistakes++;
      }
    });
    var activeVocab = {};
    Object.keys(getCache().cards).forEach(function (id) {
      var c = getCache().cards[id];
      if (c.active) activeVocab[c.vocabId] = true;
    });
    // Words to Review: missed at least twice (not a one-off slip) and still
    // being studied. Ranked by mistake count, then by miss rate.
    var wordsToReview = Object.keys(agg)
      .filter(function (v) { return agg[v].mistakes >= 2 && activeVocab[v]; })
      .map(function (v) { return { vocabId: v, mistakes: agg[v].mistakes, reviews: agg[v].reviews }; })
      .sort(function (a, b) { return b.mistakes - a.mistakes || (b.mistakes / b.reviews) - (a.mistakes / a.reviews); })
      .slice(0, 20);
    // Missed today: whatever was missed today, most-missed first.
    var recentMistakes = Object.keys(agg)
      .filter(function (v) { return agg[v].todayMistakes >= 1; })
      .map(function (v) { return { vocabId: v, count: agg[v].todayMistakes, lastTs: agg[v].lastMistakeTs }; })
      .sort(function (a, b) { return b.count - a.count || b.lastTs - a.lastTs; })
      .slice(0, 6);
    return { reviewedToday: reviewedToday, wordsToReview: wordsToReview, recentMistakes: recentMistakes };
  }
  async function fetchReviewEvents() {
    if (isGuestMode()) {
      return getCache().reviewLogs.map(function (r) {
        return {
          vocabId: r.vocabId || null,
          wrong: r.wrong === true || r.rating === 1,
          ts: typeof r.ts === "number" ? r.ts : (Date.parse(r.date + "T12:00:00") || Date.now())
        };
      });
    }
    var events = [];
    var synced = {};
    try {
      var client = getClient(), user = currentUser();
      var since = new Date(); since.setDate(since.getDate() - 120);
      var res = await dataOps.fetchAllRows(function () { return client.from("review_logs").select("card_id, rating, reviewed_at, client_review_id").eq("user_id", user.id).gte("reviewed_at", since.toISOString()); });
      if (res.error) throw res.error;
      var cards = getCache().cards;
      events = res.data.map(function (row) {
        if (row.client_review_id) synced[row.client_review_id] = true;
        var card = cards[row.card_id];
        return { vocabId: card ? card.vocabId : null, wrong: row.rating === 1, ts: new Date(row.reviewed_at).getTime() };
      });
    } catch (e) {
      // Offline or a transient failure -- fall back to just the local outbox
      // below, so recent reviews still show rather than the dashboard reading
      // as empty. The bootstrap re-fetches once the outbox drains.
      events = [];
    }
    return events.concat(outboxReviewEvents(synced));
  }
  async function loadReviewInsights() {
    if (!reviewEvents) reviewEvents = await fetchReviewEvents();
    reviewInsights = computeInsights(reviewEvents);
  }
  function last7DaysFromCounts(counts) {
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var key = localDateStr(d);
      days.push({ date: key, label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2), count: counts[key] || 0 });
    }
    return days;
  }
  async function loadWeeklyActivity() {
    var counts = {};
    if (isGuestMode()) {
      getCache().reviewLogs.forEach(function (r) { counts[r.date] = (counts[r.date] || 0) + 1; });
      weeklyActivity = last7DaysFromCounts(counts);
      return;
    }
    var synced = {};
    try {
      var client = getClient(), user = currentUser();
      var since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - 6);
      var res = await dataOps.fetchAllRows(function () { return client.from("review_logs").select("reviewed_at, client_review_id").eq("user_id", user.id).gte("reviewed_at", since.toISOString()); });
      if (res.error) throw res.error;
      res.data.forEach(function (row) {
        if (row.client_review_id) synced[row.client_review_id] = true;
        var key = localDateStr(new Date(row.reviewed_at));
        counts[key] = (counts[key] || 0) + 1;
      });
    } catch (e) {
      // Offline / transient -- show at least what's still queued locally
      // rather than an empty week. Re-fetched when the outbox drains.
    }
    outboxReviewEvents(synced).forEach(function (e) {
      var key = localDateStr(new Date(e.ts));
      counts[key] = (counts[key] || 0) + 1;
    });
    weeklyActivity = last7DaysFromCounts(counts);
  }
  // Labels are plain HTML, not SVG <text> -- an SVG scales *everything*
  // inside it, text included, to fill its container (that's what stretched
  // a 9px label into something enormous on a narrow phone screen where the
  // chart is much wider, relative to its own coordinate system, than it is
  // on desktop). Keeping the bar's geometry as a tiny per-bar SVG (pure
  // shapes, no text) still gets CSP-safe proportional heights without
  // inline style="", but the count/day labels now size the same predictable
  // way as every other piece of text on the page.
  function weeklyActivityChart(days, ariaLabel, noneText) {
    var max = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.count; })));
    var cols = days.map(function (d, i) {
      // A day with no reviews is a flat 2-unit baseline (reads as "nothing
      // here", not a stunted bar), and its count label is dropped so the row
      // isn't a wall of zeroes.
      var barH = d.count ? Math.max(8, Math.round((d.count / max) * 100)) : 2;
      var barCls = d.count ? "fc-week-bar" : "fc-week-bar fc-week-bar-empty";
      // The last column is today (see last7DaysFromCounts) -- CSS gives it the
      // full section tone so the current day reads first.
      var colCls = i === days.length - 1 ? "fc-week-col fc-week-col-today" : "fc-week-col";
      return '<div class="' + colCls + '">' +
        '<span class="fc-week-count">' + (d.count || "") + "</span>" +
        '<svg viewBox="0 0 10 100" preserveAspectRatio="none" class="fc-week-barsvg" aria-hidden="true">' +
        '<rect class="' + barCls + '" x="0" y="' + (100 - barH) + '" width="10" height="' + barH + '"></rect></svg>' +
        '<span class="fc-week-label">' + esc(d.label) + "</span></div>";
    }).join("");
    // A week with no reviews at all: one line instead of an empty chart --
    // seven flat baselines under a tall blank space read as broken.
    var noneYet = days.every(function (d) { return !d.count; });
    if (noneYet) return '<p class="fc-note fc-week-none">' + esc(noneText || "No reviews yet this week.") + "</p>";
    return '<div class="fc-week-chart" role="img" aria-label="' + esc(ariaLabel || "Reviews per day over the last 7 days") + '">' + cols + "</div>";
  }

  // --- Dashboard: Puzzles and Games ---
  // Finished puzzles and games (puzzle-runs.js), one card each. Practice
  // only -- none of it feeds FSRS or the tiles above.
  function clock(ms) {
    var tenths = Math.floor(ms / 100), s = Math.floor(tenths / 10);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + "." + (tenths % 10);
  }
  var MODE_NAMES = { match: "Match", listening: "Listening", kanatiles: "Kana tiles", oddone: "Odd one out", speedsort: "Speed sort", wordchain: "Word chain", crossword: "Crossword", arroword: "Arroword", wordsearch: "Word search" };
  // A recent game as an iOS subtitle cell: its name, the date and what's
  // not in the result on the grey line, the result trailing -- each fact
  // once ("9 / 10" already says ten words).
  function runRowHtml(r) {
    var scored = r.mode === "listening" || r.mode === "kanatiles" || r.mode === "oddone" || r.mode === "speedsort" || r.mode === "wordchain";
    var detail = r.mode === "speedsort" ? clock(r.ms)
      : r.mode === "match" ? r.n + " pairs · " + (r.miss ? r.miss + (r.miss === 1 ? " miss" : " misses") : "no misses")
      : scored ? ""
      : r.n + " words · " + (r.help ? r.help + (r.help === 1 ? " hint" : " hints") : "no hints");
    var when = new Date(r.at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    var sub = [when, detail, r.ended ? "ended early" : ""].filter(Boolean).join(" · ");
    var result = scored ? (r.right || 0) + " / " + r.n : clock(r.ms);
    return '<li class="fc-pz-row"><span class="fc-pz-what">' + esc(MODE_NAMES[r.mode] || r.mode) + '<span class="fc-pz-when">' + esc(sub) + "</span></span>" +
      '<span class="fc-pz-how">' + esc(result) + "</span></li>";
  }

  // Play (white) and See stats (plain) at the foot of each card -- See
  // stats only once there's something to see.
  function pzActionsHtml(kind, empty) {
    return '<div class="fc-pz-actions"><button type="button" class="fc-btn" data-dash-go="' + kind + '">' + (kind === "games" ? "Play a game" : "Play a puzzle") + "</button>" +
      (empty ? "" : '<button type="button" class="fc-pz-link" data-dash-go="stats-' + kind + '">See stats</button>') + "</div>";
  }
  // Puzzles: grids and word searches solved, and the last few.
  function puzzlesCardHtml(now) {
    var runs = window.RaumeStudy.flashcards.puzzleRuns;
    if (!runs) return "";
    var sum = runs.summary(now, "puzzles");
    var head = '<div class="fc-viz-card fc-viz-wide fc-puzzles-card">' + vizTitle("Puzzles");
    // Nothing solved yet: one line and the way in, not a card of zeroes.
    if (!sum.total) return head + '<div class="fc-pz-empty"><p class="fc-note">No puzzles solved yet.</p>' + pzActionsHtml("puzzles", true) + "</div></div>";
    return head + '<div class="fc-stats-grid fc-pz-stats">' + statTile(sum.total, "Puzzles solved") + statTile(sum.streak, "Day streak") + "</div>" +
      '<h4 class="fc-pz-sub">Recent puzzles</h4><ul class="fc-pz-list">' + sum.recent.slice(0, 3).map(runRowHtml).join("") + "</ul>" +
      pzActionsHtml("puzzles") + "</div>";
  }
  // Games: Match and Listening -- how many and when, how well you hear
  // words, how fast you match them, and the last few.
  function gamesCardHtml(now) {
    var runs = window.RaumeStudy.flashcards.puzzleRuns;
    if (!runs) return "";
    var sum = runs.summary(now, "games");
    var head = '<div class="fc-viz-card fc-viz-wide fc-games-card">' + vizTitle("Games");
    if (!sum.total) return head + '<div class="fc-pz-empty"><p class="fc-note">No games yet.</p>' + pzActionsHtml("games", true) + "</div></div>";
    // Two figures that hold for every game; each game's own measure
    // (accuracy, pace, fastest round) lives in its Stats.
    var tiles = statTile(sum.total, "Games played") + statTile(sum.streak, "Day streak");
    return head + '<div class="fc-stats-grid fc-pz-stats">' + tiles + "</div>" +
      '<h4 class="fc-pz-sub">Games this week</h4>' +
      weeklyActivityChart(sum.days, "Games per day over the last 7 days", "No games yet this week.") +
      '<h4 class="fc-pz-sub">Recent games</h4><ul class="fc-pz-list">' + sum.recent.slice(0, 3).map(runRowHtml).join("") + "</ul>" +
      pzActionsHtml("games") + "</div>";
  }

  // --- Dashboard: Kanji ---
  // How many of the N5 kanji you've marked Known (js/vocab/kanji-known.js),
  // as a count and a sage bar -- the tiles' own colour.
  function kanjiCardHtml() {
    var kj = kanjiCounts();
    if (!kj) return "";
    var known = kj.known, total = kj.total;
    return '<div class="fc-viz-card fc-viz-wide fc-kanji-card">' + vizTitle("Kanji") +
      '<div class="fc-kj-row"><span class="fc-kj-count"><b>' + known + "</b> of " + total + " known</span>" +
      '<button type="button" class="fc-btn" data-dash-go="kanji">' + (known ? "Open Kanji" : "Mark kanji you know") + "</button></div>" +
      progressBarHtml(known, total, known + " of " + total + " kanji known") + "</div>";
  }
  // --- Dashboard: Kana ---
  // The Kana trainer's chosen groups: how many cards started (a sage bar,
  // like Kanji) and how many a session would hold now.
  function kanaCardHtml(now) {
    var kana = window.RaumeStudy.flashcards.kana;
    if (!kana || !kana.summary) return "";
    var k = kana.summary(now);
    if (!k.total) return "";
    return '<div class="fc-viz-card fc-viz-wide fc-dash-kana">' + vizTitle("Kana") +
      '<div class="fc-kj-row"><span class="fc-kj-count"><b>' + k.started + "</b> of " + k.total + " started" +
      (k.toStudy ? '<span class="fc-kj-sub">' + k.toStudy + " to study now</span>" : "") + "</span>" +
      '<button type="button" class="fc-btn' + (k.toStudy ? " fc-btn-primary" : "") + '" data-dash-go="kana">' + (k.toStudy ? "Study kana" : "Open Kana") + "</button></div>" +
      progressBarHtml(k.started, k.total, k.started + " of " + k.total + " kana cards started") + "</div>";
  }
  // The Puzzles / Games / Kana / Kanji cards' buttons: to that tab, or the
  // Kanji section.
  function bindDashGo(panel) {
    panel.querySelectorAll("[data-dash-go]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var go = btn.dataset.dashGo;
        if (go.indexOf("stats-") === 0) { window.RaumeStudy.flashcards.puzzleStats.open(go.slice(6)); return; }
        var tab = { puzzles: "crosswords", games: "games", kana: "kana", manage: "manage" }[go];
        if (tab) {
          window.RaumeStudy.flashcards.setActiveTab(tab);
          rerender();
          return;
        }
        var v = window.RaumeStudy.vocab;
        if (v && v.showSection) v.showSection("kanji");
      });
    });
  }

  // --- Dashboard: due forecast ---
  // How many cards come due on each of the next 7 days, straight off each
  // card's real FSRS `due` -- no extra state, and it already includes reviews
  // still queued offline (they're applied to the local cache immediately).
  // Goes through studyableCards(), so switched-off directions and paused
  // tables are left out, exactly as they are from the queue and the stat
  // tiles. New cards (state 0) have no schedule yet and aren't counted.
  // Overdue cards fold into "Today" -- that's when they're next asked for.
  function dueForecast(now) {
    var start = new Date(now); start.setHours(0, 0, 0, 0);
    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(start); d.setDate(d.getDate() + i);
      days.push({ label: i === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2), count: 0 });
    }
    var later = 0, total = 0;
    studyableCards().forEach(function (card) {
      if (card.state === 0) return;
      var due = new Date(card.due);
      if (isNaN(due.getTime())) return;
      due.setHours(0, 0, 0, 0);
      var diff = Math.round((due.getTime() - start.getTime()) / 86400000);
      if (diff < 7) { days[Math.max(0, diff)].count++; total++; }
      else later++;
    });
    return { days: days, later: later, total: total };
  }
  function dueForecastHtml(f) {
    var laterNote = f.later ? '<p class="fc-note fc-due-later">' + f.later + " more " + (f.later === 1 ? "is" : "are") + " due after that.</p>" : "";
    // Nothing in the window: one line, not a chart of seven flat baselines.
    if (!f.total) {
      return '<p class="fc-note fc-due-none">' + (f.later
        ? "Nothing due in the next 7 days."
        : "Nothing scheduled yet — once you've reviewed some cards, their next due dates show up here.") + "</p>" + laterNote;
    }
    var max = Math.max.apply(null, f.days.map(function (d) { return d.count; }));
    var cols = f.days.map(function (d, i) {
      var barH = d.count ? Math.max(8, Math.round((d.count / max) * 100)) : 2;
      var barCls = d.count ? "fc-due-bar" : "fc-due-bar fc-due-bar-empty";
      return '<div class="' + (i === 0 ? "fc-due-col fc-due-col-today" : "fc-due-col") + '">' +
        '<span class="fc-due-count">' + (d.count || "") + "</span>" +
        '<svg viewBox="0 0 10 100" preserveAspectRatio="none" class="fc-due-barsvg" aria-hidden="true">' +
        '<rect class="' + barCls + '" x="0" y="' + (100 - barH) + '" width="10" height="' + barH + '"></rect></svg>' +
        '<span class="fc-due-label">' + esc(d.label) + "</span></div>";
    }).join("");
    var summary = f.days.map(function (d) { return d.count + " " + (d.label === "Today" ? "today (including overdue)" : "on " + d.label); }).join(", ");
    return '<div class="fc-due-chart" role="img" aria-label="Cards due per day over the next 7 days: ' + esc(summary) + '">' + cols + "</div>" + laterNote;
  }

  // -----------------------------------------------------------------------
  // Review session flow
  // -----------------------------------------------------------------------
  function newSession(queue) {
    var now = new Date();
    return { queue: queue, index: 0, checked: false, preview: null, correct: null,
      reviewedCount: 0, correctCount: 0, seen: {}, done: false, startedAt: now.getTime(), before: sessionSnapshot(now) };
  }
  function startSession() {
    session = newSession(buildQueue(new Date()));
    rerender();
  }
  // Practice one word now (from "Missed today") -- all of its active cards,
  // regardless of whether they're due yet.
  function startSessionForVocab(vocabId) {
    var ids = studyableCards().filter(function (c) { return c.vocabId === vocabId; }).map(function (c) { return c.id; });
    if (!ids.length) return;
    window.RaumeStudy.flashcards.setActiveTab("dashboard");
    session = newSession(shuffle(ids));
    rerender();
  }
  // Leaving a session mid-way: if any cards were reviewed, show the same
  // wrap-up screen a finished session gets (progress is already saved per
  // card); if none were, just drop straight back to the Dashboard.
  function endSession() {
    if (!session) return;
    if (!session.reviewedCount) { session = null; rerender(); return; }
    session.done = true;
    rerender();
  }
  // Extracted so the keyboard shortcut and the form's own submit both check
  // through one path. Never rates -- only reveals the answer + rating buttons.
  function submitCheck() {
    if (!session || session.checked) return;
    var card = getCache().cards[session.queue[session.index]];
    var entry = card && getVocabIndex()[card.vocabId];
    var input = document.getElementById("fcAnswerInput");
    if (!card || !entry || !input) return;
    session.userAnswer = input.value;
    session.correct = checkAnswer(entry, card.direction, input.value);
    // Right answer, wrong language: say which one the card wants and keep the
    // field open (text selected, ready to overtype) -- no grade, no reveal.
    session.hint = session.correct ? "" : otherLanguageHint(entry, card.direction, input.value);
    if (session.hint) {
      if (!syncReviewCard()) rerender();
      input.select();
      return;
    }
    session.checked = true;
    session.preview = previewRatings(getScheduler(getCache().settings), card, new Date());
    // Pronunciation plays automatically the moment the answer reveals --
    // every direction gets here eventually, including the two (ro-en,
    // en-ro) where the Japanese word itself only appears now, in the
    // reveal's context line, not as the prompt.
    speech.speak(entry.jpReading);
    // Update the card in place so the answer field keeps focus -- rebuilding
    // the panel here would drop focus to <body> and close a phone's on-screen
    // keyboard on every single card. Full render only if the shell is gone.
    if (!syncReviewCard()) rerender();
  }

  // A word is mastered once every one of its cards in study has a
  // stability of three weeks or more (FSRS: likely still recalled after
  // 21 days) -- the ids, as a set.
  var MASTERED_DAYS = 21;
  function masteredWords() {
    var byWord = {};
    studyableCards().forEach(function (c) {
      var ok = c.state !== 0 && (c.stability || 0) >= MASTERED_DAYS;
      byWord[c.vocabId] = (byWord[c.vocabId] === undefined ? true : byWord[c.vocabId]) && ok;
    });
    var out = {};
    Object.keys(byWord).forEach(function (v) { if (byWord[v]) out[v] = true; });
    return out;
  }
  // Where the day stood when a session began, so its wrap-up can say what
  // changed: the rings, the streak and the mastered words.
  function sessionSnapshot(now) {
    var stats = sched.computeStats(now);
    return { rings: todayRings(now, stats), streak: liveStreak(now), mastered: masteredWords(),
      awards: Object.assign({}, noteJourney(now, stats).journey.awards) };
  }
  var NEWS_TILES = {
    streak: ["orange", '<path d="M9 16c2.8 0 4.5-1.9 4.5-4.3 0-2.9-2.4-4.3-3.2-7.2-.9 1.6-1.3 2.6-1.3 3.9-.9-.6-1.4-1.4-1.6-2.4C6 7.4 4.5 9.2 4.5 11.7 4.5 14.1 6.2 16 9 16Z"/>'],
    mastered: ["green", '<path d="M9 2.5l2 4.3 4.6.5-3.4 3.1 1 4.6L9 12.6 4.8 15l1-4.6-3.4-3.1 4.6-.5z"/>'],
    up: ["blue", '<path d="M4 15V9M9 15V4M14 15v-4"/>'],
    pace: ["indigo", '<path d="M10 2.5 4.5 10H9l-1 5.5L13.5 8H9z"/>']
  };
  // `kind`: a NEWS_TILES key, or an award's [hue, glyph].
  function newsRowHtml(kind, text) {
    var t = NEWS_TILES[kind] || kind;
    return '<div class="set-row set-row-tiled fc-done-news-row"><span class="set-label"><span class="set-tile" data-tile="' + t[0] + '">' +
      glyphHtml(t[1], 16) + "</span>" + esc(text) + "</span></div>";
  }
  // A ring that closed during the session draws its last stretch once the
  // wrap-up is up, from where it stood at the start (the arc's length is an
  // SVG attribute, tweened -- never a style). Reduced motion: at rest.
  function animateClosedRings(panel, before, after) {
    if (!window.requestAnimationFrame || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    RINGS.forEach(function (k, i) {
      var from = Math.min(ringShare(before[k[0]]), 1), to = Math.min(ringShare(after[k[0]]), 1);
      if (from >= 1 || to < 1) return;
      var arc = panel.querySelector('.fc-ring[data-i="' + i + '"] .fc-ring-arc:not(.fc-ring-lap)');
      if (!arc) return;
      var t0 = null;
      arc.setAttribute("stroke-dasharray", from * 100 + " 100");
      function step(now) {
        if (!arc.isConnected) return;
        if (t0 === null) t0 = now + 250;
        var p = Math.max(0, Math.min((now - t0) / 600, 1)), e = 1 - Math.pow(1 - p, 3);
        arc.setAttribute("stroke-dasharray", Math.round((from + (to - from) * e) * 1000) / 10 + " 100");
        if (p < 1) window.requestAnimationFrame(step);
      }
      window.requestAnimationFrame(step);
    });
  }
  // The wrap-up, Fitness-style: today's rings, a title that says what
  // happened, one grey line (cards · % right · minutes), then a card of only
  // the rows with news -- a streak day added, words newly mastered. Then
  // Keep going when more cards came ready, or Play a game while the Play
  // ring is open, and Done.
  function renderSessionDone(panel) {
    var reviewed = session.reviewedCount;
    var now = new Date();
    var after = todayRings(now, sched.computeStats(now)), before = session.before || { rings: after, streak: 0, mastered: {} };
    var html = '<div class="fc-session-done">';
    var playOpen = ringShare(after.play) < 1;
    var moreReady = buildQueue(now).some(function (id) { return !session.seen[id]; });
    if (!reviewed) {
      html += '<p class="fc-session-done-title" tabindex="-1">Nothing to review right now</p>';
    } else {
      var correct = session.correctCount || 0;
      var mins = Math.max(1, Math.round((now.getTime() - (session.startedAt || now.getTime())) / 60000));
      var closedNow = function (key) { return ringShare(before.rings[key]) < 1 && ringShare(after[key]) >= 1; };
      var title = ringsClosed(after) && RINGS.some(function (k) { return closedNow(k[0]); }) ? "All rings closed"
        : closedNow("review") ? "Review ring closed"
        : closedNow("learn") ? "Learn ring closed"
        : session.done ? "Session ended" : "Session complete";
      var streak = liveStreak(now), mastered = masteredWords();
      var newlyMastered = Object.keys(mastered).filter(function (v) { return !before.mastered[v]; }).length;
      // An award earned during the session gets its own row, its medal's
      // glyph as the tile -- celebrated here once, never again.
      var earned = noteJourney(now, sched.computeStats(now)).journey.awards, beforeAwards = before.awards || earned;
      var news = (streak > before.streak ? newsRowHtml("streak", streak + (streak === 1 ? " day" : " days") + " in a row") : "") +
        (newlyMastered ? newsRowHtml("mastered", newlyMastered + (newlyMastered === 1 ? " word" : " words") + " mastered") : "") +
        AWARDS.filter(function (a) { return earned[a.id] && !beforeAwards[a.id]; }).map(function (a) {
          return newsRowHtml([a.hue, a.glyph], "New award: " + a.name);
        }).join("");
      html += ringsSvgHtml(after, 110, false) +
        '<p class="fc-session-done-title" tabindex="-1">' + title + "</p>" +
        '<p class="fc-session-done-stats">' + reviewed + (reviewed === 1 ? " card" : " cards") + " · " + Math.round(correct / reviewed * 100) + "% right · " +
        mins + " min</p>" +
        (news ? '<div class="set-card fc-done-news">' + news + "</div>" : "");
    }
    var primary = moreReady ? "more" : playOpen ? "play" : "done";
    html += '<div class="fc-cta-row">' +
      (primary === "more" ? '<button type="button" class="fc-btn fc-btn-primary" id="fcStudyMore">Keep going</button>' : "") +
      (primary === "play" ? '<button type="button" class="fc-btn fc-btn-primary" id="fcPlayGame">Play a game</button>' : "") +
      '<button type="button" class="fc-btn' + (primary === "done" ? " fc-btn-primary" : "") + '" id="fcBackToDashboard">Done</button>' +
      "</div></div>";
    panel.innerHTML = html;
    if (reviewed) animateClosedRings(panel, before.rings, after);
    // Same innerHTML-drops-focus problem as the review card: move focus to the
    // wrap-up heading so the outcome is read and a keyboard user stays in the panel.
    var doneTitle = panel.querySelector(".fc-session-done-title");
    if (doneTitle) doneTitle.focus();
    document.getElementById("fcBackToDashboard").addEventListener("click", function () { session = null; rerender(); });
    var more = document.getElementById("fcStudyMore");
    if (more) more.addEventListener("click", function () { startSession(); });
    var play = document.getElementById("fcPlayGame");
    if (play) play.addEventListener("click", function () {
      session = null;
      window.RaumeStudy.flashcards.setActiveTab("games");
      rerender();
    });
  }

  // The review card is a persistent shell (progress line, prompt, answer field,
  // an aria-live region for the result) built once per full render; check and
  // rate then update it in place via syncReviewCard(). Rebuilding it with
  // innerHTML on every state change -- what this used to do -- destroys the
  // focused <input>, which on a phone closes the on-screen keyboard for every
  // card and won't reopen (a programmatic focus with no user gesture is
  // ignored). Keeping the same node alive keeps the keyboard up.
  function currentReviewCard() {
    var card = getCache().cards[session.queue[session.index]];
    var entry = card && getVocabIndex()[card.vocabId];
    return card && card.active && entry ? { card: card, entry: entry } : null;
  }
  function renderReview(panel) {
    if (session.done || !session.queue.length || session.index >= session.queue.length) {
      renderSessionDone(panel);
      return;
    }
    if (!currentReviewCard()) { session.index++; renderReview(panel); return; }

    panel.innerHTML =
      '<div class="fc-review-card">' +
      // Cancel-style exit on the left, the direction + count on the right, a thin
      // progress bar under both.
      '<div class="fc-review-meta">' +
      '<button type="button" class="fc-session-exit" id="fcEndSession">End session</button>' +
      '<span class="fc-review-progress"></span></div>' +
      '<progress class="fc-progress" aria-label="Session progress" max="1" value="0"></progress>' +
      '<div class="fc-prompt"></div>' +
      '<div class="fc-prompt-reading" hidden></div>' +
      // One quiet answer line is the whole "answering" screen: Enter (or a
      // phone keyboard's return) checks, and so does the arrow at its end.
      // The placeholder alone (English / Romaji) says what to type -- no
      // separate direction label needed above it.
      '<form class="fc-answer-form" id="fcAnswerForm">' +
      '<input id="fcAnswerInput" type="text" enterkeyhint="go" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
      window.RaumeStudy.shared.CHECK_BUTTON_HTML +
      '</form>' +
      // aria-live so the result is announced when it drops in, without moving
      // focus off the answer field (that focus move was the mobile-keyboard bug).
      '<div class="fc-review-dynamic" aria-live="polite"></div>' +
      "</div>";

    var endBtn = document.getElementById("fcEndSession");
    if (endBtn) endBtn.addEventListener("click", endSession);
    var form = document.getElementById("fcAnswerForm");
    if (form) form.addEventListener("submit", function (event) { event.preventDefault(); submitCheck(); });
    window.RaumeStudy.shared.keepFieldFocus(form);

    syncReviewCard();
    var input = document.getElementById("fcAnswerInput");
    if (input && !session.checked) input.focus();
  }

  // Reflect the current session state onto the live review-card shell. Returns
  // false when the shell isn't in the DOM (caller should full-render instead).
  function syncReviewCard() {
    var shell = document.querySelector("#fcPanelDashboard .fc-review-card");
    var cur = session && currentReviewCard();
    if (!shell || !cur) return false;
    var card = cur.card, entry = cur.entry;
    var prompt = promptFor(entry, card.direction);
    var context = contextDisplayFor(entry, card.direction);

    shell.querySelector(".fc-review-progress").textContent =
      DIRECTION_LABEL[card.direction] + " · " + (session.index + 1) + " / " + session.queue.length;
    var bar = shell.querySelector(".fc-progress");
    if (bar) { bar.max = session.queue.length; bar.value = session.index; }
    var promptEl = shell.querySelector(".fc-prompt");
    if (prompt.lang) promptEl.setAttribute("lang", "ja"); else promptEl.removeAttribute("lang");
    // No click listener wired here on purpose -- js/vocab/interactions.js
    // already binds a single document-wide delegated handler for every
    // .jp-speak-btn on the page, this card's included. A second listener
    // here used to double-fire speak() per click (this element's own
    // listener, then the same click bubbling to the document handler),
    // and the second call's cancel() -- seeing the first still in flight --
    // wedged the speech engine permanently: exactly the failure mode
    // speak()'s own comment already warns about, just self-inflicted.
    promptEl.innerHTML = prompt.html || esc(prompt.text) +
      (prompt.note ? '<span class="fc-prompt-note">' + esc(prompt.note) + "</span>" : "");

    // The reading, right under the word -- only Japanese -> English needs it
    // (Japanese -> Romaji already tests the reading itself), and only once
    // checked, so it can't be used to dodge the meaning question above it.
    // A kana-only word (レモン, りんご) is its own reading -- nothing to add.
    var readingEl = shell.querySelector(".fc-prompt-reading");
    var showReading = session.checked && prompt.lang === "ja" && card.direction === "jp-en" &&
      !!entry.jpReading && entry.jpReading !== entry.jpPlain;
    readingEl.hidden = !showReading;
    readingEl.textContent = showReading ? entry.jpReading : "";

    var input = shell.querySelector("#fcAnswerInput");
    // Name the field with the prompt it belongs to, so a screen-reader user
    // dropped onto it between cards knows what they're answering.
    input.setAttribute("aria-label", askLabelFor(card.direction) + ": " + (prompt.text || entry.jpPlain));
    input.placeholder = answerPlaceholderFor(card.direction);
    input.value = session.userAnswer || "";
    var form = shell.querySelector("#fcAnswerForm");
    var dyn = shell.querySelector(".fc-review-dynamic");

    if (!session.checked) {
      input.classList.remove("fc-answer-locked");
      if (form) form.classList.remove("fc-answer-form-checked");
      dyn.innerHTML = session.hint ? '<p class="fc-answer-hint">' + esc(session.hint) + "</p>" : "";
      return true;
    }

    // Checked: the field collapses -- the "You wrote" line below now carries
    // what you typed -- but stays in the DOM and focused, so a phone's
    // on-screen keyboard doesn't drop between cards.
    input.classList.add("fc-answer-locked");
    if (form) form.classList.add("fc-answer-form-checked");
    var expected = expectedDisplayFor(entry, card.direction);
    // Wrong answers get a real letter-level comparison (romaji targets) or a
    // plain typed-vs-correct pair (English targets, which accept several
    // synonyms -- diffing characters against just one of them isn't fair).
    // Correct answers need none of that -- just the answer, once, restated.
    var cmp = session.correct ? null : answerCompareHtml(entry, card.direction, session.userAnswer);
    // The ANSWER is the focus -- big, first thing the eye lands on. What you
    // typed is one quiet line below it, never struck through (hard to read):
    // the romaji diff marks the bad letters (cmp.marked), and otherwise the
    // verdict icon above already says it's wrong. A single letter off is "Almost";
    // anything else is "Not quite" -- the icon above carries that, not text.
    var stageHtml = session.correct
      ? '<div class="fc-stage-expected">' + esc(expected) + "</div>"
      : '<div class="fc-stage-compare"><div class="fc-answer-row fc-answer-right"><span class="fc-answer-text">' + cmp.correctHtml + "</span></div>" +
          '<div class="fc-stage-typed">You wrote ' + cmp.youHtml + "</div>" +
          (cmp.note ? '<div class="fc-diff-note">' + cmp.note + "</div>" : "") + "</div>";
    // An English answer's note ("before a noun") sits right under it.
    if ((card.direction === "jp-en" || card.direction === "ro-en") && entry.englishNote) {
      stageHtml += '<div class="fc-stage-note">' + esc(entry.englishNote) + "</div>";
    }
    // A Romaji -> English prompt can't tell namesakes apart (any of their
    // meanings was accepted) -- so the reveal names the others, kanji first.
    var sameSound = card.direction === "ro-en" ? homophonesOf(entry) : [];
    var sameSoundHtml = sameSound.length
      ? '<div class="fc-stage-meaning fc-stage-homophones"><span class="fc-answer-label">Same sound</span>' +
        sameSound.map(function (h) {
          return '<span class="fc-homophone"><span lang="ja">' + h.jpInlineHtml + "</span> " + esc(h.englishFull) + "</span>";
        }).join("") + "</div>"
      : "";
    var verdictKind = session.correct ? "ok" : (cmp.near ? "almost" : "bad");
    var verdictIcon = verdictKind === "ok" ? VERDICT_OK_ICON : (verdictKind === "almost" ? VERDICT_ALMOST_ICON : VERDICT_BAD_ICON);
    dyn.innerHTML =
      '<div class="fc-review-verdict ' + (session.correct ? "fc-verdict-ok" : "fc-verdict-bad") + '" tabindex="-1">' +
      // No repeated prompt here -- the original above (.fc-prompt) never
      // goes anywhere once checked, so echoing it again just below was
      // showing the same word twice on screen at once.
      '<span class="fc-verdict-badge fc-verdict-badge-' + verdictKind + '">' + verdictIcon + "</span>" +
      '<div class="fc-stage">' + stageHtml +
        (card.direction === "jp-en" || String(context.value).toLowerCase() === String(expected).toLowerCase() ? "" : '<div class="fc-stage-meaning"><span class="fc-answer-label">' + esc(context.label) + '</span>' + (context.html ? '<span lang="ja">' + context.html + "</span>" : esc(context.value)) + "</div>") + sameSoundHtml + "</div>" +
      // After a wrong (or blank) answer the honest ratings are Again / Hard,
      // so Good / Easy sit at reduced opacity -- still one click away (typos
      // happen), just not the default read.
      '<div class="fc-rating-row' + (session.correct === false ? " fc-rating-row-missed" : "") + '">' + RATING_NAMES.map(function (name) {
        var p = session.preview[name];
        return '<button type="button" class="fc-rating-btn" data-rating="' + name.toLowerCase() + '"><span class="fc-rating-name">' + name + '</span><span class="fc-rating-interval">' + p.intervalLabel + "</span></button>";
      }).join("") + "</div></div>";

    var resultEl = dyn.querySelector(".fc-review-verdict");
    if (resultEl) resultEl.setAttribute("aria-label",
      (session.correct ? "Correct." : (cmp.near ? "Almost." : "Not quite.")) +
      (session.correct ? "" : " You typed " + (session.userAnswer && session.userAnswer.trim() ? session.userAnswer : "nothing") + ".") +
      " " + context.label + ": " + context.value + "." +
      (sameSound.length ? " Same sound: " + sameSound.map(function (h) { return h.jpPlain + ", " + h.englishFull; }).join("; ") + "." : "") +
      " Answer: " + expected + (entry.englishNote && (card.direction === "jp-en" || card.direction === "ro-en") ? ", " + entry.englishNote : "") + ".");
    dyn.querySelectorAll(".fc-rating-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { rate(btn.dataset.rating); });
    });
    return true;
  }

  // Move to the next card in place (keeping the answer field + its focus, so a
  // phone keyboard survives). Returns false if there's no live shell or the
  // queue is spent -- caller falls back to a full render / the wrap-up.
  function advanceReviewCard() {
    while (session.index < session.queue.length && !currentReviewCard()) session.index++;
    if (session.index >= session.queue.length) return false;
    if (!syncReviewCard()) return false;
    var input = document.getElementById("fcAnswerInput");
    if (input) input.focus(); // within the rating click / keydown, so mobile honours it
    return true;
  }

  // Rating immediately commits the review and advances to the next card --
  // no separate "next review" confirmation screen to click through. The
  // interval each rating will produce is already shown on its own button
  // (from previewRatings, before you pick), so nothing is lost by not
  // pausing here -- and the whole session can run keyboard-only: type,
  // Enter to check, 1-4 to rate and move on, repeat.
  function rate(ratingKey) {
    var ratingName = ratingKey.charAt(0).toUpperCase() + ratingKey.slice(1);
    var ratingNum = RATING_NAMES.indexOf(ratingName) + 1; // Again = 1 … Easy = 4
    var cardId = session.queue[session.index];
    var c = getCache();
    var card = c.cards[cardId];
    var scheduler = getScheduler(c.settings);
    var now = new Date();
    var base = fsrsRowFields(card);
    var baseReps = card.reps; // captured before mutation -- the sync guard's version number
    var wasNew = card.state === 0; // captured before mutation -- see bumpNewToday below
    var result = applyRating(scheduler, base, now, ratingName);
    Object.assign(card, result.card);
    // Counts against today's new-card allowance the moment a new card is
    // actually studied, not when it's merely offered -- a card queued but
    // never reached (session ended early) shouldn't use up the allowance.
    if (wasNew) bumpNewToday(now, cardId); else sched.markReviewedToday(now, cardId);
    if (isGuestMode()) {
      // No server -- keep a capped local history. Beyond the day (for the
      // weekly chart) each entry carries what the Dashboard's mistake
      // insights need: which word, the rating, and whether the typed answer
      // was wrong (rating "Again" or a failed check both count as a miss).
      c.reviewLogs.push({
        date: localDateStr(now), ts: now.getTime(), vocabId: card.vocabId,
        rating: ratingNum, wrong: ratingNum === 1 || session.correct === false
      });
      if (c.reviewLogs.length > 1000) c.reviewLogs = c.reviewLogs.slice(-1000);
    } else {
      c.logsOutbox.push({
        clientReviewId: uuid(), cardId: cardId, baseCard: { reps: baseReps },
        resultCard: result.card, logFields: result.log
      });
    }
    recordStudyActivity(now);
    store.saveCache();
    if (!isGuestMode()) syncOutbox();
    // This review changed today's counts -- drop the cached weekly chart and
    // mistake insights so the Dashboard recomputes them on the next visit.
    weeklyActivity = null;
    invalidateInsights();
    session.seen[cardId] = true;
    session.reviewedCount++;
    if (session.correct === true) session.correctCount++;
    session.index++;
    session.checked = false;
    session.userAnswer = "";
    session.hint = "";
    // Advance in place where we can (keeps the answer field + a phone keyboard
    // alive); full render for the wrap-up at the end of the queue.
    if (session.done || session.index >= session.queue.length || !advanceReviewCard()) rerender();
  }

  // Review keyboard shortcuts. Space / Enter check the answer (Space is left
  // alone while the answer field is focused so it can still be typed into
  // answers like "hot water"); once checked, only 1-4 rate. Nothing here can
  // pick a rating before the answer has been checked, or skip the check.
  document.addEventListener("keydown", function (event) {
    if (!session || document.body.dataset.activePage !== "flashcards") return;
    // A review left open under another tab mustn't take that tab's keys
    // (Word chain's field, say).
    var fc = window.RaumeStudy.flashcards;
    if (fc.getActiveTab && fc.getActiveTab() !== "dashboard") return;
    // An IME confirming a conversion, a shortcut chord, or a key meant for
    // another focused control (End session, the speaker, a menu) is not an
    // answer key -- swallowing it here used to check the card instead of
    // ending the session or playing the word.
    if (event.isComposing || event.keyCode === 229 || event.metaKey || event.ctrlKey || event.altKey) return;
    var focused = document.activeElement;
    if (focused && focused.id !== "fcAnswerInput" && focused.id !== "fcBackToDashboard" && !focused.classList.contains("fc-rating-btn")
        && focused.matches && focused.matches("button, a[href], input, select, textarea, [contenteditable], [role=button], [role=menuitem]")) return;
    var isSubmitKey = event.key === "Enter" || event.key === " ";

    var backBtn = document.getElementById("fcBackToDashboard");
    if (backBtn) { // session-complete screen
      if (isSubmitKey) { event.preventDefault(); backBtn.click(); }
      return;
    }
    var typing = document.activeElement === document.getElementById("fcAnswerInput");
    if (!session.checked) {
      // Enter always checks -- wired here rather than left to the form's
      // implicit submission, which some browsers don't fire from a focused
      // field. Space only checks when the field isn't focused (it's a real
      // character in answers like "hot water").
      if (event.key === "Enter" || (event.key === " " && !typing)) { event.preventDefault(); submitCheck(); }
      return;
    }
    var idx = ["1", "2", "3", "4"].indexOf(event.key);
    if (idx === -1) return;
    event.preventDefault();
    var btn = document.querySelector('.fc-rating-btn[data-rating="' + RATING_NAMES[idx].toLowerCase() + '"]');
    if (btn) btn.click();
  });

  // Leeches card: Pause a word (per-word pause, nothing deleted) or Keep it.
  document.addEventListener("click", async function (event) {
    var pause = event.target.closest && event.target.closest("[data-leech-pause]");
    var keep = event.target.closest && event.target.closest("[data-leech-keep]");
    if (!pause && !keep) return;
    try {
      if (pause) {
        pause.disabled = true;
        await dataOps.archiveVocab(pause.dataset.leechPause);
        await dataOps.refreshData();
        invalidateInsights();
      } else {
        await dataOps.keepLeech(keep.dataset.leechKeep, Number(keep.dataset.lapses) || 0);
      }
      rerender();
    } catch (e) {
      if (pause) pause.disabled = false;
      window.alert("Couldn't update flashcards — " + (e.message || "check your connection and try again."));
    }
  });

  // Practice a word straight from the Dashboard's "Missed today" list.
  document.addEventListener("click", function (event) {
    var btn = event.target.closest && event.target.closest("[data-review-vocab]");
    if (!btn) return;
    startSessionForVocab(btn.dataset.reviewVocab);
  });

  return {
    renderDashboard: renderDashboard, renderAwards: renderAwards,
    invalidateInsights: invalidateInsights, dueForecast: dueForecast,
    getSession: getSession, setSession: setSession
  };
})();
