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
      // An opt-in direction (writing, verb forms) counts only when switched
      // on -- settings saved before it existed don't mention it at all.
      if (store.isOptInDirection(card.direction) && enabled[card.direction] !== true) return false;
      // A card whose word left the dataset (a removed table, or a custom
      // word not loaded yet) has nothing to show -- skip it, don't jam the queue.
      var entry = index[card.vocabId];
      // A written card whose word can no longer be written that way (its
      // reading changed) has nothing to ask either.
      if (entry && store.isWriteDirection(card.direction) && !vidx.writeCharsFor(entry, card.direction)) return false;
      if (entry && store.isVerbFormDirection(card.direction) && !vidx.formsFor(entry, card.direction)) return false;
      return !!entry && !store.isTablePaused(entry.tableId);
    });
  }
  // Study from (Dashboard): the tables with cards in study, and the cards
  // Study now draws on -- one table's, or every one's. A choice whose table
  // has nothing left in study (deleted, paused, every word archived) reads
  // as every flashcard, so Study now never goes quiet over a stale pick.
  // Only what a session holds follows it; the rings, stats and Library
  // still count everything you've studied.
  function studyTables() {
    var index = vidx.getVocabIndex(), has = {};
    studyableCards().forEach(function (card) { has[String(index[card.vocabId].tableId)] = true; });
    return (window.RaumeStudy.data.vocabularyTables || []).filter(function (t) { return has[String(t.id)]; })
      .map(function (t) { return { id: String(t.id), title: t.title, category: t.category || "" }; });
  }
  // Or JLPT levels' words, across every table -- one ("jlpt:4") or several
  // ("jlpt:5,4"): the levels your cards in study have, easiest first.
  function studyLevels() {
    var index = vidx.getVocabIndex(), has = {};
    studyableCards().forEach(function (card) { has[index[card.vocabId].jlpt || 0] = true; });
    return [5, 4, 3, 2, 1, 0].filter(function (n) { return has[n]; });   // 0: not on the JLPT lists
  }
  // "jlpt:5,4" -> [5, 4]; null for a table id.
  function scopeLevels(id) {
    var m = /^jlpt:([0-5](?:,[0-5])*)$/.exec(id || "");
    return m ? m[1].split(",").map(Number) : null;
  }
  function studyScope() {
    var id = store.studyFrom();
    if (!id) return null;
    var lv = scopeLevels(id);
    if (lv) return lv.some(function (n) { return studyLevels().indexOf(n) !== -1; }) ? id : null;
    return studyTables().some(function (t) { return t.id === id; }) ? id : null;
  }
  function scopedCards() {
    var cards = studyableCards(), id = studyScope();
    if (!id) return cards;
    var index = vidx.getVocabIndex(), lv = scopeLevels(id);
    if (lv) return cards.filter(function (card) { return lv.indexOf(index[card.vocabId].jlpt) !== -1; });
    return cards.filter(function (card) { return String(index[card.vocabId].tableId) === id; });
  }
  // Leeches: words you keep forgetting. A card "lapses" each time a card you'd
  // already learned is rated Again, so a high count means the word isn't
  // sticking however often it's shown. Per word (pausing is per word), by its
  // worst studied direction. 8 lapses is Anki's default; after the reader
  // chooses "Keep" the word stays quiet until it lapses another
  // LEECH_RETRIGGER times (half the threshold, as Anki does).
  var LEECH_LAPSES = 8;
  var LEECH_RETRIGGER = 4;
  function leechWords() {
    var kept = store.getLeechKept();
    var worst = {};
    studyableCards().forEach(function (card) {
      var lapses = card.lapses || 0;
      var w = worst[card.vocabId];
      if (!w || lapses > w.lapses) worst[card.vocabId] = { vocabId: card.vocabId, direction: card.direction, lapses: lapses };
    });
    return Object.keys(worst).map(function (id) { return worst[id]; }).filter(function (w) {
      if (w.lapses < LEECH_LAPSES) return false;
      return typeof kept[w.vocabId] !== "number" || w.lapses >= kept[w.vocabId] + LEECH_RETRIGGER;
    }).sort(function (a, b) { return b.lapses - a.lapses; });
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
  // "romaji of X". Deal the cards out in rounds by word instead -- one card
  // per word per round -- so a word's directions sit about a round apart.
  // Each round is reshuffled: dealing every round in the same word order
  // replayed the session's first stretch (A, B, C, … then A, B, C, … again)
  // and made it feel like the same few words every time. A word never
  // straddles two rounds back to back.
  function spaceByVocab(cards) {
    var groups = {}, order = [];
    cards.forEach(function (card) {
      if (!groups[card.vocabId]) { groups[card.vocabId] = []; order.push(card.vocabId); }
      groups[card.vocabId].push(card);
    });
    var out = [], last = null;
    while (order.length) {
      var round = shuffle(order.slice());
      if (round.length > 1 && round[0] === last) {
        var t = round[0]; round[0] = round[round.length - 1]; round[round.length - 1] = t;
      }
      round.forEach(function (id) { out.push(groups[id].shift()); last = id; });
      order = order.filter(function (id) { return groups[id].length; });
    }
    return out;
  }
  // A learning/relearning step is meant to come back in minutes -- making
  // someone sit out a 10-minute step before they can finish a session is
  // silly, so those count as "ready" a short way ahead of their due time
  // (Anki calls this the learn-ahead limit). A review card's interval is in
  // days, so it is ready all of the day it falls due, not only from the
  // hour of yesterday's review -- otherwise a card reviewed at 9pm isn't
  // back until 9pm, and a morning session can't clear what the Review ring
  // counts as due today.
  var LEARN_AHEAD_MS = 20 * 60 * 1000;
  function endOfDay(now) {
    var d = new Date(now || new Date()); d.setHours(23, 59, 59, 999);
    return d;
  }
  function isReady(card, now) {
    if (!card || card.state === 0) return false;
    var t = (now || new Date()).getTime(), due = new Date(card.due).getTime();
    if (card.state === 1 || card.state === 3) return due <= t + LEARN_AHEAD_MS;
    return due <= endOfDay(now).getTime();
  }
  function readyToStudy(now) {
    return scopedCards().filter(function (card) { return isReady(card, now); });
  }
  // New cards introduced today, across every session -- not just the one
  // being built right now. Without this, "New cards per day" only capped a
  // single queue build: study three short sessions in a day instead of one
  // and you'd get three times the configured new-card allowance. Same
  // {date, count} tracker as the Kana trainer (js/flashcards/kana.js
  // todayNew/bumpNew), reset the first time a new day sees a bump.
  // It also keeps which cards were introduced (`fresh`) and which were
  // reviewed (`reviewed`, cards already past new) today, by id -- the
  // Dashboard's Review and Learn rings count off them.
  function todayNewCount(now) {
    var day = getCache().day;
    return day && day.date === localDateStr(now) ? day.count : 0;
  }
  function today(now) {
    var c = getCache(), date = localDateStr(now);
    if (!c.day || c.day.date !== date) c.day = { date: date, count: 0, fresh: [], reviewed: [] };
    return c.day;
  }
  function bumpNewToday(now, cardId) {
    var day = today(now);
    day.count++;
    if (cardId && day.fresh.indexOf(cardId) === -1) day.fresh.push(cardId);
  }
  function markReviewedToday(now, cardId) {
    var day = today(now);
    if (day.fresh.indexOf(cardId) === -1 && day.reviewed.indexOf(cardId) === -1) day.reviewed.push(cardId);
  }
  // Today's tracker is kept per device; signed in, the account's own review
  // log says what every device studied today. Folded in (union) so two
  // devices share one daily new-card allowance and one set of rings.
  function mergeToday(now, freshIds, reviewedIds) {
    var day = today(now);
    freshIds.forEach(function (id) { if (day.fresh.indexOf(id) === -1) day.fresh.push(id); });
    reviewedIds.forEach(function (id) {
      if (day.fresh.indexOf(id) === -1 && day.reviewed.indexOf(id) === -1) day.reviewed.push(id);
    });
    day.reviewed = day.reviewed.filter(function (id) { return day.fresh.indexOf(id) === -1; });
    day.count = Math.max(day.count, day.fresh.length);
  }
  // Today's tracker, read-only: an empty one before anything's studied.
  function todayDay(now) {
    var day = getCache().day;
    return day && day.date === localDateStr(now) ? day : { date: localDateStr(now), count: 0, fresh: [], reviewed: [] };
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
  // A new word is met Japanese -> English first: recognising it comes before
  // producing it. Until a word has been studied in some direction, only its
  // first one still in study (in DIRECTIONS order -- Japanese -> English
  // unless that's switched off or paused) can be introduced; its other new
  // cards wait until that one has been seen, then join like any other.
  function introducible(cards) {
    var order = store.DIRECTIONS, byWord = {};
    cards.forEach(function (card) {
      var w = byWord[card.vocabId] || (byWord[card.vocabId] = { seen: false, first: null });
      if (card.state !== 0) w.seen = true;
      else if (!w.first || order.indexOf(card.direction) < order.indexOf(w.first.direction)) w.first = card;
    });
    return cards.filter(function (card) {
      if (card.state !== 0) return false;
      var w = byWord[card.vocabId];
      return w.seen || w.first === card || w.first.direction === card.direction;
    });
  }
  // How many new cards could be introduced right now (see introducible) --
  // what the Dashboard counts, so its numbers match what Study now holds.
  // `all` counts past Study from (the Learn ring is the whole day's).
  function introducibleCount(all) { return introducible(all ? studyableCards() : scopedCards()).length; }
  function buildQueue(now) {
    var c = getCache();
    var allowance = Math.max(0, c.settings.queue_new_cards_per_day - todayNewCount(now));
    var fresh = shuffle(introducible(scopedCards()))
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
      if (isReady(card, now)) dueCount++;
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
    activeCards: activeCards, studyableCards: studyableCards, leechWords: leechWords,
    studyTables: studyTables, studyLevels: studyLevels, scopeLevels: scopeLevels, studyScope: studyScope, scopedCards: scopedCards,
    LEECH_LAPSES: LEECH_LAPSES, shuffle: shuffle, spaceByVocab: spaceByVocab,
    endOfDay: endOfDay, isReady: isReady,
    readyToStudy: readyToStudy, buildQueue: buildQueue, introducibleCount: introducibleCount, computeStats: computeStats,
    todayNewCount: todayNewCount, bumpNewToday: bumpNewToday, markReviewedToday: markReviewedToday, todayDay: todayDay,
    mergeToday: mergeToday
  };
})();
