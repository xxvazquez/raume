// Flashcards -- Dashboard tab + the study session it launches
// (RaumeStudy.flashcards.dashboard).
//
// Renders the Dashboard (next-review summary, stat tiles, card-progress and
// weekly-activity charts, "Missed today", "Words to Review"), derives the
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

  var getCache = store.getCache, localDateStr = store.localDateStr, isGuestMode = store.isGuestMode;
  var uuid = store.uuid, RATING_NAMES = store.RATING_NAMES, DIRECTION_LABEL = store.DIRECTION_LABEL;
  var studyableCards = sched.studyableCards, buildQueue = sched.buildQueue, shuffle = sched.shuffle;
  var readyToStudy = sched.readyToStudy;
  var todayNewCount = sched.todayNewCount, bumpNewToday = sched.bumpNewToday;
  var previewRatings = sched.previewRatings, getScheduler = sched.getScheduler, applyRating = sched.applyRating, fsrsRowFields = sched.fsrsRowFields;
  var getVocabIndex = vidx.getVocabIndex, promptFor = vidx.promptFor, askLabelFor = vidx.askLabelFor;
  var answerPlaceholderFor = vidx.answerPlaceholderFor, expectedDisplayFor = vidx.expectedDisplayFor;
  var contextDisplayFor = vidx.contextDisplayFor;
  var checkAnswer = vidx.checkAnswer, getRawVocabRow = vidx.getRawVocabRow;
  var getClient = dataOps.getClient, currentUser = dataOps.currentUser;
  var recordStudyActivity = dataOps.recordStudyActivity, syncOutbox = dataOps.syncOutbox;

  // The app shell / tab routing live in the bootstrap module -- reached lazily
  // so this file does not depend on its load order.
  function rerender() { window.RaumeStudy.flashcards.render(); }

  var session = null; // review session state
  function getSession() { return session; }
  function setSession(v) { session = v; }

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
      "<h3>No flashcards yet</h3>" +
      "<p>Add words from the vocabulary tables and they’ll show up here to review on an FSRS schedule. Open a table, then use the card icon on any row — or add the whole table from its menu.</p>" +
      '<div class="fc-cta-row fc-cta-row-primary">' +
      '<button type="button" class="fc-btn fc-btn-primary" id="fcEmptyBrowse">Browse vocabulary</button>' +
      '<button type="button" class="fc-btn" id="fcEmptyManage">Choose tables in Manage</button>' +
      "</div></div>";
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
    var retentionText = retentionPending ? "Not enough reviews yet" : Math.round(stats.estimatedRetention * 100) + "%";
    var settings = getCache().settings;
    // A couple of points under target is normal noise, not a real dip -- only
    // flag it once it's meaningfully below what Settings asks FSRS to aim for,
    // so the tile isn't flickering color over nothing.
    var retentionLow = !retentionPending && stats.estimatedRetention < settings.fsrs_request_retention - 0.02;
    var streak = settings.current_streak || 0;
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
    panel.innerHTML =
      '<div class="fc-top-row">' + nextReviewHtml(now, ready, newInSession) + todayProgressHtml() + "</div>" +
      '<div class="fc-cta-row fc-cta-row-primary"><button type="button" class="fc-btn fc-btn-primary" id="fcStudyNow"' + (canStudy ? "" : " disabled") + ">Study now</button></div>" +
      '<div class="fc-stats-grid">' +
      statTile(streak, "Day streak", "streak") +
      statTile(stats.total, "Total cards") +
      statTile(stats.reviewsCompleted, "Reviews completed") +
      statTile(retentionText, "Estimated retention", retentionLow ? "attention" : null, retentionPending) +
      "</div>" +
      (settings.longest_streak > streak ? '<p class="fc-note fc-longest-streak">Longest streak: ' + settings.longest_streak + " day" + (settings.longest_streak === 1 ? "" : "s") + ".</p>" : "") +
      (stats.estimatedRetention == null ? "" : '<p class="fc-note fc-retention-note">"Estimated retention" is FSRS’s forecasted recall probability across your reviewed cards — not a directly measured pass rate.</p>') +
      '<div class="fc-viz-grid">' +
      '<div class="fc-viz-card"><h3 class="fc-viz-title">Card progress</h3>' + stateBreakdownChart(stats) + "</div>" +
      '<div class="fc-viz-card"><h3 class="fc-viz-title">Reviews this week</h3>' + (weeklyActivity ? weeklyActivityChart(weeklyActivity) : '<p class="fc-note">Loading…</p>') + "</div>" +
      (foldReview
        ? '<div class="fc-viz-card fc-viz-wide"><h3 class="fc-viz-title">Words to review</h3><p class="fc-note">Nothing to review yet — words you miss collect here, and repeat misses become a table to drill and print.</p></div>'
        : '<div class="fc-viz-card fc-viz-wide"><h3 class="fc-viz-title">Missed today</h3>' + missedTodayHtml() + "</div>") +
      "</div>" +
      (foldReview ? "" : '<div id="fcWordsToReview"></div>');
    var btn = document.getElementById("fcStudyNow");
    if (btn) btn.addEventListener("click", startSession);
    renderWordsToReview();
    lastReadyCount = ready.length;
    startDashboardPoll();
  }
  function statTile(value, label, variant, pending) {
    var cls = (variant ? " fc-stat-" + variant : "") + (pending ? " fc-stat-tile-pending" : "");
    return '<div class="fc-stat-tile' + cls + '"><span class="fc-stat-value">' + esc(value) + '</span><span class="fc-stat-label">' + esc(label) + "</span></div>";
  }

  // --- Dashboard: Today's progress, Next review, Missed today, Words to Review ---

  function todayProgressHtml() {
    var target = Math.max(0, getCache().settings.queue_new_cards_per_day || 0);
    var done = reviewInsights ? reviewInsights.reviewedToday : 0;
    var pct = target > 0 ? Math.min(100, Math.round(done / target * 100)) : (done > 0 ? 100 : 0);
    return '<div class="fc-today">' +
      '<div class="fc-today-head"><span class="fc-today-label">Today</span>' +
      '<span class="fc-today-count">' + done + " / " + target + " cards</span>" +
      '<span class="fc-today-pct">' + pct + '%</span></div>' +
      '<div class="fc-progress"><svg viewBox="0 0 100 6" preserveAspectRatio="none" class="fc-progress-svg" aria-hidden="true">' +
      '<rect class="fc-progress-track" x="0" y="0" width="100" height="6"></rect>' +
      '<rect class="fc-progress-fill" x="0" y="0" width="' + pct + '" height="6"></rect></svg></div></div>';
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
  // The summary above "Study now". Three honest states, always matching the
  // button: something to do now / nothing now but more coming later today /
  // nothing today. "Ready" is what a session would actually pull (readyToStudy
  // + the new-card allowance), so it never claims cards you can't start.
  function nextReviewHtml(now, ready, newInSession) {
    var scheduled = studyableCards().filter(function (c) { return c.state !== 0; });
    var endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
    var readyIds = {};
    ready.forEach(function (c) { readyIds[c.id] = true; });
    var laterToday = scheduled.filter(function (c) {
      return !readyIds[c.id] && new Date(c.due) <= endToday;
    }).length;
    var futureTs = scheduled
      .map(function (c) { return new Date(c.due).getTime(); })
      .filter(function (t) { return t > now.getTime(); })
      .sort(function (a, b) { return a - b; });
    var nextTs = futureTs.length ? futureTs[0] : null;
    var readyNow = ready.length + newInSession;
    var title, sub, variant;
    if (readyNow > 0) {
      variant = "due";
      title = readyNow + " to study";
      if (laterToday > 0) sub = laterToday + " more due later today";
      else if (nextTs) sub = "Next review: " + friendlyWhen(now, nextTs);
      // Fresh deck -- nothing scheduled to return yet. Describe the queue so
      // the card carries a second line instead of just a bare count.
      else if (ready.length > 0) sub = ready.length + " due now, " + newInSession + " new";
      else sub = "All new — nothing reviewed yet";
    } else if (laterToday > 0) {
      variant = "clear";
      title = "All caught up";
      sub = "Next review: " + verboseUntil(now, nextTs);
    } else {
      variant = "clear";
      title = "All caught up";
      sub = "Next review: " + (nextTs ? friendlyWhen(now, nextTs) : "no cards scheduled yet");
    }
    return '<div class="fc-next-review fc-next-review-' + variant + '">' +
      '<span class="fc-next-review-title">' + esc(title) + "</span>" +
      (sub ? '<span class="fc-next-review-sub">' + esc(sub) + "</span>" : "") + "</div>";
  }

  // "Missed today" -- a calm shortlist of words to revisit. One row per word:
  // the Japanese pair (strongest), a single supporting "romaji · english" line,
  // and a compact "N× today" badge. The whole row is the control (tap to
  // practice that word now); no per-row buttons.
  function missedTodayHtml() {
    if (!reviewInsights) return '<p class="fc-note">Loading…</p>';
    var list = reviewInsights.recentMistakes;
    if (!list.length) return '<p class="fc-note">Nothing missed today.</p>';
    var idx = getVocabIndex();
    return '<ul class="fc-missed-list">' + list.map(function (m) {
      var e = idx[m.vocabId];
      if (!e) return "";
      return '<li><button type="button" class="fc-missed-row" data-review-vocab="' + esc(m.vocabId) + '" title="Practice this word now">' +
        '<span class="fc-missed-jp" lang="ja">' + e.jpInlineHtml + "</span>" +
        '<span class="fc-missed-gloss">' +
        '<span class="fc-missed-ro">' + esc(e.romajiDisplay) + "</span>" +
        '<span class="fc-missed-sep"> · </span>' +
        '<span class="fc-missed-en">' + esc(e.englishDisplay) + "</span>" +
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
      host.innerHTML = '<div class="fc-viz-card"><h3 class="fc-viz-title">Words to review</h3>' +
        '<p class="fc-note">Nothing stands out yet — words you miss more than once collect here so you can drill and print them.</p></div>';
      return;
    }
    host.innerHTML = window.RaumeStudy.vocab.buildVocabSection({
      id: "wtr", title: "Words to review", rows: rows, presort: false,
      controls: { print: true, viewMode: true }
    });
    window.RaumeStudy.flashcards.refreshRowToggleButtons();
    // Sync the just-drawn view-mode buttons (and this table's cell aria-hidden)
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
      var res = await client.from("review_logs").select("card_id, rating, reviewed_at, client_review_id").eq("user_id", user.id).gte("reviewed_at", since.toISOString());
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
      days.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2), count: counts[key] || 0 });
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
      var res = await client.from("review_logs").select("reviewed_at, client_review_id").eq("user_id", user.id).gte("reviewed_at", since.toISOString());
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
  function weeklyActivityChart(days) {
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
    // A week with no reviews at all: say so, so the bare day axis doesn't read
    // as a broken chart.
    var noneYet = days.every(function (d) { return !d.count; });
    return (noneYet ? '<p class="fc-note fc-week-none">No reviews yet this week.</p>' : "") +
      '<div class="fc-week-chart" role="img" aria-label="Reviews per day over the last 7 days">' + cols + "</div>";
  }

  // -----------------------------------------------------------------------
  // Review session flow
  // -----------------------------------------------------------------------
  function newSession(queue) {
    return { queue: queue, index: 0, checked: false, preview: null, correct: null,
      reviewedCount: 0, correctCount: 0, seen: {}, done: false };
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
    session.checked = true;
    session.preview = previewRatings(getScheduler(getCache().settings), card, new Date());
    // Update the card in place so the answer field keeps focus -- rebuilding
    // the panel here would drop focus to <body> and close a phone's on-screen
    // keyboard on every single card. Full render only if the shell is gone.
    if (!syncReviewCard()) rerender();
  }

  function renderSessionDone(panel) {
    var reviewed = session.reviewedCount;
    var html = '<div class="fc-session-done">';
    if (!reviewed) {
      html += '<p class="fc-session-done-title" tabindex="-1">Nothing to review right now</p>';
    } else {
      var correct = session.correctCount || 0;
      var pct = Math.round((correct / reviewed) * 100);
      var streak = getCache().settings.current_streak || 0;
      html += '<p class="fc-session-done-title" tabindex="-1">' + (session.done ? "Session ended" : "Session complete") + "</p>" +
        '<p class="fc-session-done-stats">' + reviewed + " reviewed · " + correct + " correct (" + pct + "%)</p>" +
        (streak ? '<p class="fc-session-done-streak">Day streak: ' + streak + "</p>" : "");
    }
    var moreReady = buildQueue(new Date()).some(function (id) { return !session.seen[id]; });
    html += '<div class="fc-cta-row">' +
      (moreReady ? '<button type="button" class="fc-btn fc-btn-primary" id="fcStudyMore">Keep going</button>' : "") +
      '<button type="button" class="fc-btn' + (moreReady ? "" : " fc-btn-primary") + '" id="fcBackToDashboard">Back to Dashboard</button>' +
      "</div></div>";
    panel.innerHTML = html;
    // Same innerHTML-drops-focus problem as the review card: move focus to the
    // wrap-up heading so the outcome is read and a keyboard user stays in the panel.
    var doneTitle = panel.querySelector(".fc-session-done-title");
    if (doneTitle) doneTitle.focus();
    document.getElementById("fcBackToDashboard").addEventListener("click", function () { session = null; rerender(); });
    var more = document.getElementById("fcStudyMore");
    if (more) more.addEventListener("click", function () { startSession(); });
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
      '<div class="fc-review-meta"><span class="fc-review-progress"></span>' +
      '<button type="button" class="fc-session-exit" id="fcEndSession">End session</button></div>' +
      '<div class="fc-prompt-label"></div>' +
      '<div class="fc-prompt"></div>' +
      '<form class="fc-answer-form" id="fcAnswerForm">' +
      '<input id="fcAnswerInput" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
      '<button type="submit" class="fc-btn fc-btn-primary fc-check-btn">Check</button>' +
      '</form>' +
      // aria-live so the result is announced when it drops in, without moving
      // focus off the answer field (that focus move was the mobile-keyboard bug).
      '<div class="fc-review-dynamic" aria-live="polite"></div>' +
      "</div>";

    var endBtn = document.getElementById("fcEndSession");
    if (endBtn) endBtn.addEventListener("click", endSession);
    var form = document.getElementById("fcAnswerForm");
    if (form) form.addEventListener("submit", function (event) { event.preventDefault(); submitCheck(); });

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
    shell.querySelector(".fc-prompt-label").textContent = askLabelFor(card.direction);
    var promptEl = shell.querySelector(".fc-prompt");
    if (prompt.lang) promptEl.setAttribute("lang", "ja"); else promptEl.removeAttribute("lang");
    promptEl.innerHTML = prompt.html || esc(prompt.text);
    promptEl.querySelectorAll(".jp-speak-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { window.RaumeStudy.shared.speech.speak(btn.dataset.jpSpeak); });
    });

    var input = shell.querySelector("#fcAnswerInput");
    // Name the field with the prompt it belongs to, so a screen-reader user
    // dropped onto it between cards knows what they're answering.
    input.setAttribute("aria-label", askLabelFor(card.direction) + ": " + (prompt.text || entry.jpPlain));
    input.placeholder = answerPlaceholderFor(card.direction);
    input.value = session.userAnswer || "";
    var checkBtn = shell.querySelector(".fc-check-btn");
    var dyn = shell.querySelector(".fc-review-dynamic");

    if (!session.checked) {
      input.classList.remove("fc-answer-locked");
      if (checkBtn) checkBtn.hidden = false;
      dyn.innerHTML = "";
      return true;
    }

    // Checked: the field is inert now (rate with the buttons or 1-4) -- keep it
    // in the DOM and styled-quiet rather than disabled, so it holds focus and
    // the keyboard stays put for the next card.
    input.classList.add("fc-answer-locked");
    if (checkBtn) checkBtn.hidden = true;
    dyn.innerHTML =
      '<div class="fc-result ' + (session.correct ? "fc-correct" : "fc-incorrect") + '" tabindex="-1">' +
      '<span class="fc-result-label">' + (session.correct ? "Correct" : "Not quite") + "</span>" +
      (session.correct ? "" : '<span class="fc-your-answer">You typed: ' + esc(session.userAnswer || "(nothing)") + "</span>") +
      "</div>" +
      '<div class="fc-answer-context"><span class="fc-answer-reveal-label">' + esc(context.label) + "</span>" +
      '<span class="fc-context-value">' + esc(context.value) + "</span></div>" +
      '<div class="fc-answer-reveal"><span class="fc-answer-reveal-label">Answer</span>' +
      '<span class="fc-expected">' + esc(expectedDisplayFor(entry, card.direction)) + "</span></div>" +
      // After a wrong (or blank) answer the honest ratings are Again / Hard,
      // so Good / Easy are dimmed -- still one click away (typos happen), just
      // not the default read.
      '<div class="fc-rating-row' + (session.correct === false ? " fc-rating-row-missed" : "") + '">' + RATING_NAMES.map(function (name, i) {
        var p = session.preview[name];
        return '<button type="button" class="fc-rating-btn" data-rating="' + name.toLowerCase() + '"><span class="fc-rating-key">' + (i + 1) + '</span><span class="fc-rating-name">' + name + '</span><span class="fc-rating-interval">' + p.intervalLabel + "</span></button>";
      }).join("") + "</div>";

    var resultEl = dyn.querySelector(".fc-result");
    if (resultEl) resultEl.setAttribute("aria-label",
      (session.correct ? "Correct." : "Not quite.") +
      (session.correct ? "" : " You typed " + (session.userAnswer && session.userAnswer.trim() ? session.userAnswer : "nothing") + ".") +
      " " + context.label + ": " + context.value + "." +
      " Answer: " + expectedDisplayFor(entry, card.direction) + ".");
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
    if (wasNew) bumpNewToday(now);
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

  // Practice a word straight from the Dashboard's "Missed today" list.
  document.addEventListener("click", function (event) {
    var btn = event.target.closest && event.target.closest("[data-review-vocab]");
    if (!btn) return;
    startSessionForVocab(btn.dataset.reviewVocab);
  });

  return {
    renderDashboard: renderDashboard,
    invalidateInsights: invalidateInsights,
    getSession: getSession, setSession: setSession
  };
})();
