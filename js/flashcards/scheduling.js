// Flashcards -- FSRS-6 scheduling + review queue/stats
// (RaumeStudy.flashcards.scheduling).
//
// A thin wrapper over the vendored ts-fsrs (window.FSRS): builds a scheduler
// from the user's settings, previews/applies ratings, converts between the
// library's card/log shapes and what the cache/Supabase store, and derives the
// study queue and the Dashboard's aggregate stats. The trained algorithm and
// its weights are never touched -- only the knobs ts-fsrs itself exposes.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.scheduling = (function () {
  "use strict";

  var store = window.RaumeStudy.flashcards.store;
  var getCache = store.getCache, localDateStr = store.localDateStr;
  var RATING_NAMES = store.RATING_NAMES;
  var vidx = window.RaumeStudy.flashcards.vocabIndex;

  function getScheduler(settings) {
    var params = window.FSRS.generatorParameters({
      request_retention: settings.fsrs_request_retention,
      maximum_interval: settings.fsrs_maximum_interval,
      enable_fuzz: settings.fsrs_enable_fuzz
    });
    return window.FSRS.fsrs(params);
  }

  function formatInterval(now, due) {
    var ms = new Date(due).getTime() - now.getTime();
    if (ms <= 0) return "now";
    var mins = ms / 60000;
    if (mins < 1) return "<1m";
    if (mins < 60) return Math.round(mins) + "m";
    var hours = mins / 60;
    if (hours < 24) return Math.round(hours) + "h";
    var days = hours / 24;
    if (days < 30) return Math.round(days) + "d";
    var months = days / 30.44;
    if (months < 12) return Math.round(months) + "mo";
    return (days / 365.25).toFixed(1) + "y";
  }
  function cardToFsrsInput(card) {
    return {
      due: card.due, stability: card.stability, difficulty: card.difficulty,
      scheduled_days: card.scheduled_days, learning_steps: card.learning_steps,
      reps: card.reps, lapses: card.lapses, state: card.state, last_review: card.last_review || undefined
    };
  }
  function fsrsCardToStorage(c) {
    return {
      due: c.due instanceof Date ? c.due.toISOString() : c.due,
      stability: c.stability, difficulty: c.difficulty, scheduled_days: c.scheduled_days,
      learning_steps: c.learning_steps, reps: c.reps, lapses: c.lapses, state: c.state,
      last_review: c.last_review ? (c.last_review instanceof Date ? c.last_review.toISOString() : c.last_review) : null
    };
  }
  function fsrsLogToStorage(l) {
    return {
      rating: l.rating, state: l.state,
      due: l.due instanceof Date ? l.due.toISOString() : l.due,
      stability: l.stability, difficulty: l.difficulty, scheduled_days: l.scheduled_days,
      learning_steps: l.learning_steps,
      review: l.review instanceof Date ? l.review.toISOString() : l.review
    };
  }

  function previewRatings(scheduler, card, now) {
    var record = scheduler.repeat(cardToFsrsInput(card), now);
    var out = {};
    RATING_NAMES.forEach(function (name) {
      var item = record[window.FSRS.Rating[name]];
      out[name] = { card: fsrsCardToStorage(item.card), log: fsrsLogToStorage(item.log), intervalLabel: formatInterval(now, item.card.due) };
    });
    return out;
  }
  function applyRating(scheduler, card, now, ratingName) {
    var result = scheduler.next(cardToFsrsInput(card), now, window.FSRS.Rating[ratingName]);
    return { card: fsrsCardToStorage(result.card), log: fsrsLogToStorage(result.log) };
  }
  function retrievabilityOf(scheduler, card, now) {
    if (!card.reps) return null;
    return scheduler.retrievability(cardToFsrsInput(card), now);
  }

  // The FSRS scheduling columns of a card, for a Supabase flashcards row.
  function fsrsRowFields(card) {
    return {
      state: card.state, due: card.due, stability: card.stability, difficulty: card.difficulty,
      scheduled_days: card.scheduled_days, reps: card.reps, lapses: card.lapses,
      learning_steps: card.learning_steps, last_review: card.last_review
    };
  }

  // -----------------------------------------------------------------------
  // Queue selection + stats
  // -----------------------------------------------------------------------
  function activeCards() {
    var c = getCache();
    return Object.keys(c.cards).map(function (id) { return c.cards[id]; }).filter(function (card) { return card.active; });
  }
  // Cards in a direction the user has switched off in Settings (Study
  // Directions), or in a table paused as a unit (Manage -> "Pause table"),
  // are left exactly as they are -- state, history, everything -- just
  // excluded from what gets studied or counted, the same way an archived card
  // is. Re-enabling the direction / resuming the table picks them back up with
  // nothing lost.
  function studyableCards() {
    var enabled = getCache().settings.enabled_directions;
    var index = vidx.getVocabIndex();
    return activeCards().filter(function (card) {
      if (enabled[card.direction] === false) return false;
      var entry = index[card.vocabId];
      return !(entry && store.isTablePaused(entry.tableId));
    });
  }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  // Spread a word's own cards apart: with 4 directions per word, a flat
  // shuffle still routinely lands "English meaning of X" right next to
  // "romaji of X". Deal the cards out round-robin by word instead, so the
  // same word's directions are always (# of remaining words) apart. Order
  // within each word, and the order words first appear, both come from the
  // caller's shuffle, so it stays different every session.
  function spaceByVocab(cards) {
    var groups = {}, order = [];
    cards.forEach(function (card) {
      if (!groups[card.vocabId]) { groups[card.vocabId] = []; order.push(card.vocabId); }
      groups[card.vocabId].push(card);
    });
    var out = [], dealt = true;
    while (dealt) {
      dealt = false;
      for (var k = 0; k < order.length; k++) {
        var g = groups[order[k]];
        if (g.length) { out.push(g.shift()); dealt = true; }
      }
    }
    return out;
  }
  // A learning/relearning step is meant to come back in minutes -- making
  // someone sit out a 10-minute step before they can finish a session is
  // silly, so those count as "ready" a short way ahead of their due time
  // (Anki calls this the learn-ahead limit). Review cards, whose intervals
  // are days, still only count once they are genuinely due.
  var LEARN_AHEAD_MS = 20 * 60 * 1000;
  function readyToStudy(now) {
    var t = (now || new Date()).getTime();
    return studyableCards().filter(function (card) {
      if (card.state === 0) return false;
      var due = new Date(card.due).getTime();
      if (card.state === 1 || card.state === 3) return due <= t + LEARN_AHEAD_MS;
      return due <= t;
    });
  }
  // New cards introduced today, across every session -- not just the one
  // being built right now. Without this, "New cards per day" only capped a
  // single queue build: study three short sessions in a day instead of one
  // and you'd get three times the configured new-card allowance. Same
  // {date, count} tracker as the Kana trainer (js/flashcards/kana.js
  // todayNew/bumpNew), reset the first time a new day sees a bump.
  function todayNewCount(now) {
    var day = getCache().day;
    return day && day.date === localDateStr(now) ? day.count : 0;
  }
  function bumpNewToday(now) {
    var c = getCache();
    var today = localDateStr(now);
    if (!c.day || c.day.date !== today) c.day = { date: today, count: 0 };
    c.day.count++;
  }
  // What's studied in a session is: every card that's ready (readyToStudy)
  // plus whatever's left of that day's allowance of brand-new cards. These
  // used to be kept in strict learning -> review -> new order, which meant
  // the same due cards led every single session -- it never *felt* random
  // even though each bucket was shuffled. Now the whole lot is pooled and
  // shuffled together, so the order is genuinely different every day
  // regardless of what's due or what was just added. It's still spaced by
  // word afterwards (so the same word's other directions never land back
  // to back).
  function buildQueue(now) {
    var c = getCache();
    var allowance = Math.max(0, c.settings.queue_new_cards_per_day - todayNewCount(now));
    var fresh = shuffle(studyableCards().filter(function (card) { return card.state === 0; }))
      .slice(0, allowance);
    return spaceByVocab(shuffle(readyToStudy(now).concat(fresh)))
      .map(function (card) { return card.id; });
  }
  function computeStats(now) {
    var cards = studyableCards();
    var newCount = 0, learningCount = 0, reviewCount = 0, dueCount = 0;
    var retSum = 0, retN = 0;
    var scheduler = getScheduler(getCache().settings);
    cards.forEach(function (card) {
      if (card.state === 0) newCount++;
      else if (card.state === 1 || card.state === 3) learningCount++;
      else reviewCount++;
      if (card.state !== 0 && new Date(card.due) <= now) dueCount++;
      var r = retrievabilityOf(scheduler, card, now);
      if (r != null) { retSum += r; retN++; }
    });
    var reviewsCompleted = 0;
    // Reviews completed is a lifetime count derived from each card's own
    // `reps` (ts-fsrs increments it once per review) rather than a separate
    // counter -- one less piece of state that could drift out of sync.
    Object.keys(getCache().cards).forEach(function (id) { reviewsCompleted += getCache().cards[id].reps || 0; });
    return {
      total: cards.length, newCount: newCount, learningCount: learningCount, reviewCount: reviewCount,
      dueCount: dueCount, reviewsCompleted: reviewsCompleted,
      // Below a handful of reviewed cards the average is almost pure noise
      // (one card at 100% reads as "100% retention"), so hold it back until
      // there's enough to mean something.
      estimatedRetention: retN >= 5 ? retSum / retN : null
    };
  }

  return {
    getScheduler: getScheduler, previewRatings: previewRatings, applyRating: applyRating,
    retrievabilityOf: retrievabilityOf, formatInterval: formatInterval,
    fsrsRowFields: fsrsRowFields,
    activeCards: activeCards, studyableCards: studyableCards, shuffle: shuffle,
    readyToStudy: readyToStudy, buildQueue: buildQueue, computeStats: computeStats,
    todayNewCount: todayNewCount, bumpNewToday: bumpNewToday
  };
})();
