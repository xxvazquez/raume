// Flashcards -- the Kana tab (RaumeStudy.flashcards.kana).
//
// A hiragana / katakana reading trainer that sits alongside the vocabulary
// flashcards: pick which kana groups to drill (gojuon, dakuten, combos, per
// script -- see kana-data.js), then review them one at a time by typing the
// answer. Every kana + direction is its own FSRS-6 card, scheduled with the
// same vendored scheduler the vocabulary cards use.
//
// Storage mirrors the vocab flashcards: guest mode keeps its record in one
// local key; signed in, Supabase (kana_cards / kana_review_logs) is
// authoritative and the local cache is a read-through copy plus an offline
// review outbox. The cache itself lives in store.js (getKanaCache); the
// remote/sync plumbing in data-ops.js. This file is the Kana tab's UI and
// review flow.
//
// Directions: kana -> type the romaji, and romaji -> type the kana. Both are
// typed and graded the same way; which directions are in the queue is a
// per-tab toggle on the group picker, and both are on by default.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.kana = (function () {
  "use strict";

  var S = window.RaumeStudy.flashcards;
  var kanaData = S.kanaData;
  var sched = S.scheduling;
  var store = S.store;
  var dataOps = S.dataOps;
  var esc = window.RaumeStudy.shared.escapeHtml;

  var getScheduler = sched.getScheduler, previewRatings = sched.previewRatings;
  var applyRating = sched.applyRating, shuffle = sched.shuffle;
  var RATING_NAMES = store.RATING_NAMES, localDateStr = store.localDateStr, uuid = store.uuid;
  var isGuestMode = store.isGuestMode;

  // FSRS knobs live in the kana cache's `fsrs` blob -- tuned in the Settings
  // tab, synced via the kana_fsrs column, independent of the vocab cards'
  // knobs. fsrs() hands the shared scheduler wrapper the object it wants;
  // newPerDay() is the daily new-card cap.
  function fsrs() { return load().fsrs || store.defaultKanaFsrs(); }
  function newPerDay() { return fsrs().new_per_day; }
  var LEARN_AHEAD_MS = 20 * 60 * 1000; // match scheduling.js: a short learning step counts as ready
  var DIRECTIONS = ["k2r", "r2k"]; // kana -> romaji, romaji -> kana (both typed)
  var DIR_LABEL = { k2r: "Kana → romaji", r2k: "Romaji → kana" };
  function isDir(d) { return DIRECTIONS.indexOf(d) !== -1; }

  // -----------------------------------------------------------------------
  // Store access -- the cache lives in store.js (guest vs signed-in keys,
  // validation, the same-pageview in-memory fallback). load() hands back the
  // live object; mutate it in place then save().
  // -----------------------------------------------------------------------
  function load() { return store.getKanaCache(); }
  function save() { store.saveKanaCache(); }
  function signedIn() { return !!(dataOps && dataOps.currentUser && dataOps.currentUser()); }
  // Push the group/direction picker state up so it follows the account
  // (best-effort, exactly like the vocabulary table icons).
  function pushPrefs() {
    if (!signedIn()) return;
    var s = load();
    dataOps.saveKanaPrefsRemote({ groups: s.groups.slice(), dirs: { k2r: s.dirs.k2r !== false, r2k: s.dirs.r2k !== false } }).catch(function () {});
  }

  function cardKey(item, dir) { return item.id + "|" + dir; }
  function newCard(now) {
    return {
      state: 0, due: now.toISOString(), stability: 0, difficulty: 0,
      scheduled_days: 0, reps: 0, lapses: 0, learning_steps: 0, last_review: null
    };
  }
  function todayNew(s, now) {
    return s.day && s.day.date === localDateStr(now) ? s.day.count : 0;
  }
  function bumpNew(s, now) {
    var today = localDateStr(now);
    if (!s.day || s.day.date !== today) s.day = { date: today, count: 0 };
    s.day.count++;
  }

  // -----------------------------------------------------------------------
  // Groups + queue
  // -----------------------------------------------------------------------
  function selectedGroupIds() { return load().groups.slice(); }
  function setGroup(id, on) {
    if (!kanaData.isGroupId(id)) return;
    var s = load();
    var i = s.groups.indexOf(id);
    if (on && i === -1) s.groups.push(id);
    else if (!on && i !== -1) s.groups.splice(i, 1);
    else return;
    save();
    pushPrefs();
  }
  function selectedItems() { return kanaData.itemsFor(selectedGroupIds()); }

  function enabledDirs() {
    var d = load().dirs;
    return DIRECTIONS.filter(function (k) { return d[k] !== false; });
  }
  function setDir(dir, on) {
    if (!isDir(dir)) return;
    var s = load(), next = {};
    DIRECTIONS.forEach(function (k) { next[k] = s.dirs[k] !== false; });
    next[dir] = !!on;
    if (!DIRECTIONS.some(function (k) { return next[k]; })) return; // keep at least one on
    s.dirs = next;
    save();
    pushPrefs();
  }
  // Every selected kana, once per enabled direction -- the unit the queue and
  // the progress line actually count. `dir` rides along so each card is keyed
  // <itemId>|<dir> and rendered its own way.
  function studyUnits() {
    var items = selectedItems(), dirs = enabledDirs(), out = [];
    items.forEach(function (it) {
      dirs.forEach(function (d) { out.push({ item: it, dir: d }); });
    });
    return out;
  }

  function dueState(card, now) {
    var ahead = (card.state === 1 || card.state === 3) ? LEARN_AHEAD_MS : 0;
    return new Date(card.due).getTime() <= now.getTime() + ahead;
  }
  // Deal units out round-robin by kana, so an item's two directions never land
  // back to back (the vocab queue's spaceByVocab, scoped to one kana).
  function spaceByItem(units) {
    var groups = {}, order = [];
    units.forEach(function (u) {
      if (!groups[u.item.id]) { groups[u.item.id] = []; order.push(u.item.id); }
      groups[u.item.id].push(u);
    });
    var out = [], dealt = true;
    while (dealt) {
      dealt = false;
      for (var i = 0; i < order.length; i++) {
        if (groups[order[i]].length) { out.push(groups[order[i]].shift()); dealt = true; }
      }
    }
    return out;
  }
  // The queue: every selected unit whose card is due (learning steps count a
  // short way ahead, like the vocab queue), plus that day's remaining new
  // allowance, shuffled together then spaced by kana.
  function buildQueue(now) {
    var s = load(), units = studyUnits();
    var due = [], unseen = [];
    units.forEach(function (u) {
      var c = s.cards[cardKey(u.item, u.dir)];
      if (!c) unseen.push(u);
      else if (dueState(c, now)) due.push(u);
    });
    var allowance = Math.max(0, newPerDay() - todayNew(s, now));
    return spaceByItem(shuffle(due.concat(shuffle(unseen).slice(0, allowance))));
  }
  // For the overview summary line.
  function progress(now) {
    var s = load(), units = studyUnits();
    var started = 0, dueNow = 0;
    units.forEach(function (u) {
      var c = s.cards[cardKey(u.item, u.dir)];
      if (!c) return;
      started++;
      if (dueState(c, now)) dueNow++;
    });
    return { total: units.length, started: started, due: dueNow, unseen: units.length - started };
  }

  // -----------------------------------------------------------------------
  // Review session
  // -----------------------------------------------------------------------
  var session = null;
  function rerender() { S.render(); }
  function clearSession() { session = null; }

  function startSession() {
    var queue = buildQueue(new Date());
    session = { queue: queue, index: 0, checked: false, correct: null, userAnswer: "", preview: null, reviewedCount: 0, correctCount: 0, seen: {}, done: false };
    rerender();
  }
  function endSession() {
    if (!session) return;
    if (!session.reviewedCount) { session = null; rerender(); return; }
    session.done = true;
    rerender();
  }

  // A reading trainer's own answer check. The vocabulary cards deliberately
  // let vowel length slide ("koohii" == "kōhī"), but here typing "ii" for い
  // has to be wrong -- a short vowel is not a long vowel. So instead of
  // collapsing long vowels we canonicalise their *length*: a macron expands
  // to its doubled vowel (ō -> "oo"), and a kana long o written おう (which
  // the reading layer romanises as "ou") counts the same as "oo" / "ō".
  // "o" and "oo" stay distinct. The si/ti/sya-style alternates in
  // kana-data.js are orthography, not vowels, and pass straight through.
  function normalizeKana(v) {
    return String(v == null ? "" : v).trim().toLowerCase()
      .replace(/[āâ]/g, "aa").replace(/[īî]/g, "ii").replace(/[ūû]/g, "uu")
      .replace(/[ēê]/g, "ee").replace(/[ōô]/g, "oo")
      .replace(/ou/g, "oo");
  }
  function checkKana(item, input) {
    var n = normalizeKana(input);
    return item.answers.some(function (a) { return normalizeKana(a) === n; });
  }
  // Romaji -> kana is graded on the glyph: what you type has to be the kana
  // itself (the group already fixes the script), give or take surrounding
  // space. Romaji spellings aren't accepted here -- reading the prompt back
  // isn't recall.
  function checkR2k(item, input) {
    return String(input == null ? "" : input).replace(/\s+/g, "") === item.kana;
  }

  // Grade what was typed and move to the checked state. Both directions have a
  // text answer now; only the grader and the prompt differ.
  function submitCheck() {
    if (!session || session.checked) return;
    var unit = session.queue[session.index];
    if (!unit) return;
    var input = document.getElementById("fcKanaInput");
    if (!input) return;
    session.userAnswer = input.value;
    session.correct = unit.dir === "r2k"
      ? checkR2k(unit.item, input.value)
      : checkKana(unit.item, input.value);
    session.checked = true;
    var base = load().cards[cardKey(unit.item, unit.dir)] || newCard(new Date());
    session.preview = previewRatings(getScheduler(fsrs()), base, new Date());
    // Update in place so the answer field keeps focus (a phone keyboard stays
    // open); full render only if the shell is gone.
    if (!syncReviewCard()) rerender();
  }

  // Rating commits the review and moves straight on -- no separate "next"
  // step, same as the vocabulary review flow. `ratingKey` is the lowercase
  // data-rating ("again" … "easy").
  function rate(ratingKey) {
    if (!session || !session.checked) return;
    var ratingName = ratingKey.charAt(0).toUpperCase() + ratingKey.slice(1);
    if (RATING_NAMES.indexOf(ratingName) === -1) return;
    var unit = session.queue[session.index];
    if (!unit) return;
    var now = new Date();
    var s = load();
    var key = cardKey(unit.item, unit.dir);
    var prev = s.cards[key];
    var base = prev || newCard(now);
    var res = applyRating(getScheduler(fsrs()), base, now, ratingName);
    var card = res.card;
    if (prev && prev.id) card.id = prev.id; // keep the server row id across reviews
    s.cards[key] = card;
    if (!prev) bumpNew(s, now);
    // Signed in: queue the review for Supabase (guest mode keeps no outbox --
    // its local cache is the record). Same offline-safe pattern as the vocab
    // cards: apply locally now, sync when we can.
    if (signedIn()) {
      s.logsOutbox = s.logsOutbox || [];
      s.logsOutbox.push({
        clientReviewId: uuid(), kanaId: unit.item.id, direction: unit.dir,
        baseReps: (prev && prev.reps) || 0, resultCard: card, logFields: res.log
      });
    }
    save();
    if (signedIn()) dataOps.syncKanaOutbox();
    session.reviewedCount++;
    if (session.correct === true) session.correctCount++;
    session.seen[key] = true;
    session.index++;
    session.checked = false;
    session.correct = null;
    session.userAnswer = "";
    session.preview = null;
    // Advance in place where we can (keeps the answer field + a phone keyboard
    // alive); full render for the wrap-up at the end of the queue.
    if (session.done || session.index >= session.queue.length || !advanceReviewCard()) rerender();
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------
  function renderKana(panel) {
    if (!panel) return;
    if (session && (session.done || session.index >= session.queue.length)) renderDone(panel);
    else if (session) renderReview(panel);
    else renderOverview(panel);
  }

  function groupCheckbox(g, on) {
    return '<label class="fc-kana-group"><input type="checkbox" class="fc-kana-group-cb" data-group="' + g.id + '"' +
      (on ? " checked" : "") + "> " + esc(g.label) +
      ' <span class="fc-kana-group-n">' + g.count + "</span></label>";
  }
  function dirCheckbox(dir, on) {
    return '<label class="fc-kana-group"><input type="checkbox" class="fc-kana-dir-cb" data-dir="' + dir + '"' +
      (on ? " checked" : "") + "> " + esc(DIR_LABEL[dir]) + "</label>";
  }
  function renderOverview(panel) {
    var selected = selectedGroupIds();
    var dirs = enabledDirs();
    var groups = kanaData.groups();
    var byScript = { hiragana: [], katakana: [] };
    groups.forEach(function (g) { byScript[g.script].push(g); });
    var p = progress(new Date());
    var canStudy = buildQueue(new Date()).length > 0;

    var summary = !selected.length
      ? "Choose at least one group to practise."
      : p.due + " due · " + p.started + " started · " + p.unseen + " not started";

    panel.innerHTML =
      '<p class="fc-note">Learn to read hiragana and katakana: pick the groups you want, then work through them one at a time — type the romaji for a kana, or type the kana for a romaji. Cards are FSRS-scheduled, the same as the vocabulary flashcards.</p>' +
      '<div class="fc-kana-groups">' +
      ["hiragana", "katakana"].map(function (script) {
        return '<fieldset class="fc-kana-fieldset"><legend>' + (script === "hiragana" ? "Hiragana" : "Katakana") + "</legend>" +
          byScript[script].map(function (g) { return groupCheckbox(g, selected.indexOf(g.id) !== -1); }).join("") +
          "</fieldset>";
      }).join("") +
      '<fieldset class="fc-kana-fieldset"><legend>Directions</legend>' +
      DIRECTIONS.map(function (d) { return dirCheckbox(d, dirs.indexOf(d) !== -1); }).join("") +
      "</fieldset>" +
      "</div>" +
      '<p class="fc-kana-summary" id="fcKanaSummary">' + esc(summary) + "</p>" +
      '<button type="button" class="fc-btn fc-btn-primary" id="fcKanaStart"' + (canStudy ? "" : " disabled") + ">Study now</button>";

    panel.querySelectorAll(".fc-kana-group-cb").forEach(function (cb) {
      cb.addEventListener("change", function () { setGroup(cb.dataset.group, cb.checked); rerender(); });
    });
    panel.querySelectorAll(".fc-kana-dir-cb").forEach(function (cb) {
      cb.addEventListener("change", function () { setDir(cb.dataset.dir, cb.checked); rerender(); });
    });
    var start = document.getElementById("fcKanaStart");
    if (start) start.addEventListener("click", startSession);
  }

  function ratingRowHtml(missed) {
    return '<div class="fc-rating-row' + (missed ? " fc-rating-row-missed" : "") + '">' +
      RATING_NAMES.map(function (name, i) {
        var pr = session.preview[name];
        return '<button type="button" class="fc-rating-btn" data-rating="' + name.toLowerCase() + '">' +
          '<span class="fc-rating-key">' + (i + 1) + '</span><span class="fc-rating-name">' + name +
          '</span><span class="fc-rating-interval">' + pr.intervalLabel + "</span></button>";
      }).join("") + "</div>";
  }

  function currentUnit() {
    var unit = session && session.queue[session.index];
    return unit && unit.item ? unit : null;
  }

  // The review card is a persistent shell (progress line, prompt, answer field,
  // an aria-live result region) built once per full render; check and rate then
  // update it in place via syncReviewCard(). Rebuilding it with innerHTML each
  // step -- what this used to do -- destroys the focused <input>, which on a
  // phone closes the on-screen keyboard for every card and won't reopen (a
  // programmatic focus with no user gesture is ignored). Same fix as the
  // vocabulary review card (js/flashcards/dashboard.js).
  function renderReview(panel) {
    if (!currentUnit()) { renderDone(panel); return; }
    panel.innerHTML =
      '<div class="fc-review-card">' +
      '<div class="fc-review-meta"><span class="fc-review-progress"></span>' +
      '<button type="button" class="fc-session-exit" id="fcKanaEnd">End session</button></div>' +
      '<div class="fc-prompt-label"></div>' +
      '<div class="fc-prompt"></div>' +
      // r2k wants kana in the field -- lang is set per card in syncReviewCard so
      // a system IME picks the right keyboard. No visible Check button -- Enter
      // (or a mobile keyboard's own Go/submit action) checks, same as the word
      // card (js/flashcards/dashboard.js).
      '<form class="fc-answer-form" id="fcKanaForm">' +
      '<input id="fcKanaInput" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
      '</form>' +
      '<div class="fc-review-dynamic" aria-live="polite"></div>' +
      "</div>";

    var end = document.getElementById("fcKanaEnd");
    if (end) end.addEventListener("click", endSession);
    var form = document.getElementById("fcKanaForm");
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); submitCheck(); });

    syncReviewCard();
    var input = document.getElementById("fcKanaInput");
    if (input && !session.checked) input.focus();
  }

  // Reflect the current session state onto the live review-card shell. Returns
  // false when the shell isn't in the DOM (caller should full-render instead).
  function syncReviewCard() {
    var shell = document.querySelector("#fcPanelKana .fc-review-card");
    var unit = currentUnit();
    if (!shell || !unit) return false;
    var item = unit.item, r2k = unit.dir === "r2k";
    var wordCls = item.word ? " fc-prompt-kana-word" : "";

    shell.querySelector(".fc-review-progress").textContent =
      DIR_LABEL[unit.dir] + " · " + (session.index + 1) + " / " + session.queue.length;
    shell.querySelector(".fc-prompt-label").textContent = r2k ? "Type the kana" : "Type the romaji reading";

    var promptEl = shell.querySelector(".fc-prompt");
    if (r2k) {
      promptEl.className = "fc-prompt fc-prompt-romaji";
      promptEl.removeAttribute("lang");
      promptEl.textContent = item.romaji;
    } else {
      promptEl.className = "fc-prompt fc-prompt-kana" + wordCls;
      promptEl.setAttribute("lang", "ja");
      promptEl.textContent = item.kana;
    }

    var input = shell.querySelector("#fcKanaInput");
    if (r2k) { input.setAttribute("lang", "ja"); input.placeholder = "Kana…"; }
    else { input.removeAttribute("lang"); input.placeholder = "Romaji…"; }
    // Name the field with its prompt, so a screen-reader user dropped onto it
    // between cards knows what to type without hunting for the visual label.
    input.setAttribute("aria-label", (r2k ? "Type the kana for" : "Type the romaji reading for") + " " + (r2k ? item.romaji : item.kana));
    input.value = session.userAnswer || "";

    var dyn = shell.querySelector(".fc-review-dynamic");

    if (!session.checked) {
      input.classList.remove("fc-answer-locked");
      dyn.innerHTML = "";
      return true;
    }

    input.classList.add("fc-answer-locked");
    var expected = r2k ? item.kana : item.romaji;
    // Same merged reveal as the vocabulary word card: the prompt recedes,
    // a compact tag carries the verdict, and one "stage" panel holds either
    // the restated answer (correct) or a plain typed-vs-correct pair (wrong
    // -- kana/romaji typos aren't diffed letter-by-letter here the way a
    // romaji vocabulary answer is, just shown side by side).
    var stageHtml = session.correct
      ? '<div class="fc-stage-expected"' + (r2k ? ' lang="ja"' : "") + ">" + esc(expected) + "</div>"
      : '<div class="fc-stage-compare">' + esc(session.userAnswer || "(nothing)") +
        ' <span class="fc-diff-arrow">&rarr;</span> <span' + (r2k ? ' lang="ja"' : "") + ">" + esc(expected) + "</span></div>";
    dyn.innerHTML =
      '<div class="fc-review-verdict ' + (session.correct ? "fc-verdict-ok" : "fc-verdict-bad") + '" tabindex="-1">' +
      '<div class="fc-prompt-small"' + (r2k ? "" : ' lang="ja"') + ">" + esc(r2k ? item.romaji : item.kana) + "</div>" +
      '<span class="fc-verdict-tag">' + (session.correct ? "Correct" : "Almost correct") + "</span>" +
      '<div class="fc-stage">' + stageHtml + "</div>" +
      ratingRowHtml(session.correct === false) +
      "</div>";

    var resultEl = dyn.querySelector(".fc-review-verdict");
    if (resultEl) resultEl.setAttribute("aria-label",
      (session.correct ? "Correct." : "Not quite.") +
      (session.correct ? "" : " You typed " + (session.userAnswer && session.userAnswer.trim() ? session.userAnswer : "nothing") + ".") +
      " Answer: " + expected + ".");
    dyn.querySelectorAll(".fc-rating-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { rate(btn.dataset.rating); });
    });
    return true;
  }

  // Next card in place (keeping the answer field + its focus, so a phone
  // keyboard survives). False if the queue is spent / no live shell.
  function advanceReviewCard() {
    if (session.index >= session.queue.length || !currentUnit()) return false;
    if (!syncReviewCard()) return false;
    var input = document.getElementById("fcKanaInput");
    if (input) input.focus(); // within the rating click / keydown, so mobile honours it
    return true;
  }

  function renderDone(panel) {
    var reviewed = session.reviewedCount, correct = session.correctCount;
    var html = '<div class="fc-session-done">';
    if (!reviewed) {
      html += '<p class="fc-session-done-title" tabindex="-1">Nothing to review right now</p>';
    } else {
      var stats = reviewed + " reviewed · " + correct + " / " + reviewed +
        " correct (" + Math.round((correct / reviewed) * 100) + "%)";
      html += '<p class="fc-session-done-title" tabindex="-1">' + (session.done ? "Session ended" : "Session complete") + "</p>" +
        '<p class="fc-session-done-stats">' + stats + "</p>";
    }
    var moreReady = buildQueue(new Date()).some(function (u) { return !session.seen[cardKey(u.item, u.dir)]; });
    html += '<div class="fc-cta-row">' +
      (moreReady ? '<button type="button" class="fc-btn fc-btn-primary" id="fcKanaMore">Keep going</button>' : "") +
      '<button type="button" class="fc-btn' + (moreReady ? "" : " fc-btn-primary") + '" id="fcKanaBack">Back to groups</button>' +
      "</div></div>";
    panel.innerHTML = html;
    // Same innerHTML-drops-focus problem as the review card: move focus to the
    // wrap-up heading so the outcome is read and a keyboard user stays in the panel.
    var doneTitle = panel.querySelector(".fc-session-done-title");
    if (doneTitle) doneTitle.focus();
    document.getElementById("fcKanaBack").addEventListener("click", function () { session = null; rerender(); });
    var more = document.getElementById("fcKanaMore");
    if (more) more.addEventListener("click", startSession);
  }

  // Review keyboard shortcuts, mirroring the vocabulary review flow: Enter /
  // Space check (Space passes through while the field is focused), then 1-4
  // rate. Only fires on the Kana tab with a live session.
  document.addEventListener("keydown", function (event) {
    if (!session || document.body.dataset.activePage !== "flashcards") return;
    if (S.getActiveTab && S.getActiveTab() !== "kana") return;
    var isSubmitKey = event.key === "Enter" || event.key === " ";

    var back = document.getElementById("fcKanaBack");
    if (back) { if (isSubmitKey) { event.preventDefault(); back.click(); } return; }

    var typing = document.activeElement === document.getElementById("fcKanaInput");
    if (!session.checked) {
      // Enter always checks (not left to the form's implicit submission, which
      // some browsers don't fire from a focused field); Space only when the
      // field isn't focused.
      if (event.key === "Enter" || (event.key === " " && !typing)) { event.preventDefault(); submitCheck(); }
      return;
    }
    var idx = ["1", "2", "3", "4"].indexOf(event.key);
    if (idx === -1) return;
    event.preventDefault();
    var btn = document.querySelector('#fcPanelKana .fc-rating-btn[data-rating="' + RATING_NAMES[idx].toLowerCase() + '"]');
    if (btn) btn.click();
  });

  return {
    renderKana: renderKana, clearSession: clearSession,
    // pure hooks for scripts/smoke-test.js
    __testHooks: {
      checkKana: checkKana, checkR2k: checkR2k, buildQueue: buildQueue, selectedItems: selectedItems,
      setGroup: setGroup, setDir: setDir, enabledDirs: enabledDirs, studyUnits: studyUnits
    }
  };
})();
