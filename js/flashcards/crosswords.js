// Flashcards -- the Puzzles and Games tabs (RaumeStudy.flashcards.crosswords):
// Puzzles holds the crossword, arroword and word search, Games holds Match
// and Listening; one module draws both, each tab with its own settings.
//
// A printable crossword / arroword generator, built from either of two word
// sources: whatever's currently in flashcards (every added word, minus
// individually paused words and whole paused tables -- the same "in your
// deck" set vocabState() in views.js reads), or a single vocabulary table
// picked straight from the reference data, flashcards status aside -- for a
// themed puzzle ("Numbers", "Drinks"...) without first adding the table to
// flashcards. Each answer is the word's own kana reading, reconstructed from
// its furigana exactly like the pronunciation layer does (js/vocab/render.js's
// jpReadingOf) -- except the Japanese script in Match and Word search, which
// uses the word as written, kanji and all (see writtenForm). English meanings
// are the clues.
//
// Two layouts share one grid builder: a classic crossword (numbered
// across/down clue list) or an arroword (the clue sits in a cell right
// before the answer starts, an arrow pointing into it -- no separate list).
// A third style, the word search, has its own builder (see "Word search"
// below): the answers hidden in a block of letters, found by dragging.
// A fourth, Match (see "Match" below), is a timed game: tap each reading and
// then its English, a few pairs a round.
// Every crossword square is a live text field, so it plays on screen as well as
// printing as a worksheet. Nothing here is scheduled or scored for FSRS --
// regenerating is free; the only thing kept is Match's best time.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.crosswords = (function () {
  "use strict";

  var S = window.RaumeStudy.flashcards;
  var store = S.store;
  var esc = window.RaumeStudy.shared.escapeHtml;

  var KANA_ONLY = /^[ぁ-ゖァ-ー]+$/;
  var MIN_LEN = 2, MAX_LEN = 10;
  // A grid with fewer crossing words than this isn't a puzzle -- below it
  // the tab says why instead of showing one.
  var MIN_WORDS = 6;
  // Same printer glyph as the reference pages' print buttons (js/vocab/
  // render.js's PRINT_ICON) -- print always reads as this icon in raume,
  // never a bare text button.
  var PRINT_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 6V2.5h8V6"/><rect x="2.5" y="6" width="13" height="7" rx="1.2"/><path d="M5 11.5h8V15.5H5Z"/></svg>';
  var EYE_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 9S4.5 3.5 9 3.5 16.5 9 16.5 9 13.5 14.5 9 14.5 1.5 9 1.5 9Z"/><circle cx="9" cy="9" r="2.3"/></svg>';
  // Two bars: pause. A bare 32px glyph beside the clock, like ⋯.
  var PAUSE_ICON = '<svg viewBox="0 0 18 18" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="4.5" y="3.5" width="3" height="11" rx="1"/><rect x="10.5" y="3.5" width="3" height="11" rx="1"/></svg>';
  var HINT_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2.5a4.5 4.5 0 0 0-2.5 8.25c.4.28.6.7.6 1.15v.6h4v-.6c0-.45.2-.87.6-1.15A4.5 4.5 0 0 0 9 2.5Z"/><path d="M7 15h4M7.5 13.4h3"/></svg>';
  var RESET_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 9A5.5 5.5 0 1 1 12.9 5.1"/><path d="M14.5 3v4h-4"/></svg>';
  // Same ⋯ glyph as a reference table's overflow menu (js/vocab/render.js's
  // MENU_ICON) -- the menu itself reuses that one's markup, so the delegated
  // open/close/Escape handling in js/vocab/interactions.js covers it too.
  // Three rising bars: the Stats screen.
  var SKIP_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4.5 9.5 9 4 13.5M10 4.5 15.5 9 10 13.5"/></svg>';
  var STAR_ICON = '<svg viewBox="0 0 18 18" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2.5l2 4.3 4.6.5-3.4 3.1 1 4.6L9 12.6 4.8 15l1-4.6-3.4-3.1 4.6-.5z"/></svg>';
  var STATS_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 15V10M9 15V4M14 15V7.5"/></svg>';
  var MENU_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="9" cy="4" r="1.45"/><circle cx="9" cy="9" r="1.45"/><circle cx="9" cy="14" r="1.45"/></svg>';
  // Same ⓘ glyph as a reference row's grammar notes (js/vocab/render.js's
  // INFO_ICON), at the ⋯ menu's size.
  var INFO_ICON = '<svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="9" cy="9" r="7"/><path d="M9 8.2v4.4" stroke-linecap="round"/><circle cx="9" cy="5.7" r=".9" fill="currentColor" stroke="none"/></svg>';

  function vocabIndex() { return S.vocabIndex.getVocabIndex(); }

  // -----------------------------------------------------------------------
  // Word pool
  // -----------------------------------------------------------------------
  // A grid-safe romaji spelling for beginners: the first alternative only
  // (a verb-pair's "kaeru / kaerimasu"), a counter's leading ~ dropped like
  // the kana reading, macrons folded to plain vowels (ō -> o -- a puzzle
  // cell can't ask for a macron), lowercased, spaces/punctuation stripped
  // so it reads as one unbroken word on the grid, matching how a kana
  // answer never has spaces either.
  function foldRomajiForGrid(s) {
    return String(s || "").split(" / ")[0].replace(/^~/, "").toLowerCase()
      .replace(/[āâ]/g, "a").replace(/[īî]/g, "i").replace(/[ūû]/g, "u").replace(/[ēê]/g, "e").replace(/[ōô]/g, "o")
      .replace(/[^a-z]/g, "");
  }
  // A clue that hands over its own answer isn't a clue: "Japanese sake" for
  // *sake*, or a loanword whose English is the word itself (cola -> コーラ,
  // coffee -> コーヒー). The second is caught by comparing consonant
  // skeletons -- English spelling folded the way katakana borrows it (c ->
  // k/s, l -> r, f/ph -> h, v -> b...), vowels and doubles dropped -- so
  // "kora"/"cola" and "koohii"/"coffee" both collapse to the same letters.
  // `dropR` models the other way katakana borrows a closing r: sometimes
  // sounded (beer -> bīru), sometimes not (fork -> fōku, butter -> batā) --
  // an English clue is compared both ways.
  function consonantSkeleton(s, english, dropR) {
    s = String(s || "").toLowerCase().replace(/[^a-z]/g, "");
    if (english) {
      if (dropR) s = s.replace(/r(?![aeiouy])/g, "");
      s = s.replace(/^kn/, "n").replace(/ph/g, "f").replace(/tch/g, "ch").replace(/th/g, "s").replace(/ck/g, "k")
        .replace(/c(?=[eiy])/g, "s").replace(/g(?=[eiy])/g, "j").replace(/ch/g, "C").replace(/c/g, "k").replace(/q/g, "k")
        .replace(/x/g, "ks").replace(/l/g, "r").replace(/v/g, "b").replace(/([aeiou])w/g, "$1");
    } else {
      s = s.replace(/([^aeiou])y/g, "$1"); // menyū, kyabetsu: y only palatalises
    }
    s = s.replace(/sh/g, "s").replace(/ch/g, "C").replace(/ts/g, "s").replace(/z/g, "s").replace(/f/g, "h");
    return s.replace(/[aeiou]/g, "").replace(/(.)\1+/g, "$1");
  }
  function isGiveaway(reading, romaji, clue) {
    if (!romaji) return false;
    var clueLetters = clue.toLowerCase().replace(/[^a-z]/g, "");
    if (romaji.length >= 3 && clueLetters.indexOf(romaji) !== -1) return true;
    if (!/^[ァ-ー]+$/.test(reading)) return false; // only a loanword can echo its English
    var sk = consonantSkeleton(romaji, false);
    // Same skeleton, or the English running on past it (toilet -> トイレ),
    // word by word or for the clue as one run (toilet paper).
    return !!sk && clue.split(/[\s,/()-]+/).concat([clue]).some(function (w) {
      if (w.length < 3) return false;
      return [false, true].some(function (dropR) {
        var ew = consonantSkeleton(w, true, dropR);
        return !!ew && (ew === sk || (sk.length >= 2 && ew.indexOf(sk) === 0));
      });
    });
  }
  // Turns a list of vocab-index entries into puzzle words: kana reading
  // only, giveaways dropped, trimmed to a usable grid length (a counter's leading 〜 is
  // stripped, same as the romaji answers), deduplicated by reading -- two
  // entries that read the same would just collide on the grid. Each word
  // also carries a romaji spelling when the vocab index considers the row's
  // own romaji field usable (isRomajiUsable) -- null otherwise, which Romaji
  // mode filters out rather than showing a broken answer.
  function poolFromEntries(entries) {
    var seen = {}, pool = [];
    entries.forEach(function (entry) {
      // A single kanji isn't a word to spell out -- its words are in the
      // vocabulary tables already.
      if (!entry || entry.kanji) return;
      var reading = String(entry.jpReading || "").replace(/^〜/, "").trim();
      if (reading.length < MIN_LEN || reading.length > MAX_LEN) return;
      if (!KANA_ONLY.test(reading)) return;
      if (seen[reading]) return;
      seen[reading] = true;
      var clue = String(entry.englishDisplay || "").split(" / ")[0].trim();
      if (!clue) return;
      if (entry.englishNote) clue += " (" + entry.englishNote + ")";
      if (isGiveaway(reading, foldRomajiForGrid(entry.romajiDisplay), clue)) return;
      var romaji = entry.romajiUsable ? foldRomajiForGrid(entry.romajiDisplay) : "";
      if (romaji.length < MIN_LEN + 1 || romaji.length > MAX_LEN * 2) romaji = "";
      // tableId: Listening draws its wrong choices from the same table first;
      // speak: the exact reading the speaker buttons play (it keys the
      // prerendered clip), 〜 and all.
      pool.push({ id: entry.vocabId, answer: reading, clue: clue, romaji: romaji || null, tableId: entry.tableId, speak: entry.jpReading });
    });
    return pool;
  }
  // Source 1: every word currently added and not dormant (paused itself, or
  // its whole table paused) -- read straight off the cards, same "active"
  // flag scheduling.js's activeCards() checks.
  // Each word also gets a `weight` from its weakest active card, so games
  // lean toward what you're still learning: new / learning / relearning 3,
  // review under three weeks' stability 2, mastered 1 -- plus 1 for a
  // Tricky word. Mastered words still come up, about one pick in six.
  var MASTERED_DAYS = 21;
  function cardWeight(card) {
    if (card.state !== 2) return 3;
    return (card.stability || 0) < MASTERED_DAYS ? 2 : 1;
  }
  function flashcardsWordPool() {
    var index = vocabIndex();
    var cards = store.getCache().cards;
    var weights = {};
    Object.keys(cards).forEach(function (key) {
      var card = cards[key];
      if (card.active) weights[card.vocabId] = Math.max(weights[card.vocabId] || 0, cardWeight(card));
    });
    var runs = window.RaumeStudy.flashcards.puzzleRuns;
    if (runs) runs.trickyWords(Infinity).forEach(function (t) { if (weights[t.id]) weights[t.id] += 1; });
    var entries = Object.keys(weights)
      .map(function (id) { return index[id]; })
      .filter(function (entry) { return entry && !store.isTablePaused(entry.tableId); });
    return poolFromEntries(entries).map(function (w) { w.weight = weights[w.id]; return w; });
  }
  // Source 2: every word across one or more vocabulary tables, regardless
  // of flashcards status -- a themed puzzle doesn't need the tables added
  // first, and mixing a few ("Numbers" + "Time") is a bigger, richer pool.
  function tableWordPool(tableIds) {
    var ids = (tableIds || []).map(String);
    var index = vocabIndex();
    var entries = Object.keys(index)
      .map(function (id) { return index[id]; })
      .filter(function (entry) { return ids.indexOf(String(entry.tableId)) !== -1; });
    return poolFromEntries(entries);
  }
  // Source 3: a fixed list -- the Stats screen's Tricky words, whatever
  // table or flashcard status they have.
  function idsWordPool(ids) {
    var index = vocabIndex();
    return poolFromEntries((ids || []).map(function (id) { return index[id]; }).filter(Boolean));
  }
  function wordPool() {
    return state.source === "table" ? tableWordPool(state.tables)
      : state.source === "tricky" ? idsWordPool(state.trickyIds) : flashcardsWordPool();
  }
  // The N5 Kanji tables hold single characters, not words to play with.
  function vocabTables() {
    return (window.RaumeStudy.data.vocabularyTables || []).filter(function (t) { return t.tableClass !== "vocab-kanji"; });
  }

  // Hiragana and katakana are the same characters, a fixed 0x60 apart in
  // Unicode (see js/vocab/kana-romaji.js's own comment on the same fact) --
  // covers everything a vocab reading contains except the long vowel mark
  // ー, which has no hiragana form and is left as-is either way.
  function toHiragana(s) {
    return s.replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  }
  function toKatakana(s) {
    return s.replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
  }
  function scriptedAnswer(answer, script) {
    if (script === "hiragana") return toHiragana(answer);
    if (script === "katakana") return toKatakana(answer);
    return answer; // native: whichever script the word is actually written in
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // The pool in a random order that favours heavier words (Efraimidis-
  // Spirakis keys, no repeats); unweighted words -- table and Tricky-words
  // sources -- come out as a plain shuffle.
  function weightedOrder(arr, weightOf) {
    weightOf = weightOf || function (w) { return w.weight || 1; };
    return arr.map(function (w) { return { w: w, k: Math.pow(Math.random(), 1 / weightOf(w)) }; })
      .sort(function (a, b) { return b.k - a.k; })
      .map(function (x) { return x.w; });
  }

  // -----------------------------------------------------------------------
  // Grid construction -- shared by both layouts. Longest word first (a
  // solid backbone), then every other word tries to cross an already-placed
  // letter: same character, perpendicular direction, and no cell it touches
  // (before, after, or alongside) is already taken. A word that can't cross
  // anything already on the grid is left out rather than dropped in
  // disconnected -- every generated puzzle is one connected piece, like a
  // real crossword. In arroword mode the cell immediately before a word's
  // first letter is reserved for its clue (never a letter, never shared
  // with another word's clue), folded into the same placement check.
  // -----------------------------------------------------------------------
  // `words` is every candidate (the whole eligible pool, not a pre-picked
  // handful) and `limit` how many to place: a word that can't cross gets
  // swapped for the next one that can, so the grid reaches the size asked
  // for instead of stopping at whatever happened to share a letter. Several
  // attempts, each with a fresh shuffle, keep whichever placed the most
  // (ties broken by the denser grid -- fewer empty squares). Cheap at this
  // scale -- a few hundred short words at most.
  function buildGrid(words, arroword, limit) {
    if (!words.length) return { placements: [], rows: 0, cols: 0, grid: {}, clueCells: {}, numbers: {} };
    limit = limit || words.length;
    // Up to 16 attempts, but never much past ~150ms in all -- a 40-word grid
    // from a big pool still answers New puzzle at once on a phone.
    var ATTEMPTS = 16, BUDGET_MS = 150, started = Date.now();
    var best = null;
    for (var a = 0; a < ATTEMPTS && (a < 2 || Date.now() - started < BUDGET_MS); a++) {
      var attempt = buildGridOnce(words, arroword, limit);
      if (!best || attempt.placements.length > best.placements.length ||
        (attempt.placements.length === best.placements.length && density(attempt) > density(best))) {
        best = attempt;
      }
    }
    return best;
  }
  function density(p) { return Object.keys(p.grid).length / (p.rows * p.cols); }

  function buildGridOnce(words, arroword, limit) {
    // Shuffled, with the longest of the first `limit` moved to the front as
    // the backbone -- the rest stay in random order, so a big pool doesn't
    // always yield the same handful of long words.
    var list = weightedOrder(words);
    var head = list.slice(0, limit), longest = 0;
    head.forEach(function (w, i) { if (w.answer.length > head[longest].answer.length) longest = i; });
    list.unshift(list.splice(longest, 1)[0]);
    var grid = {}, clueCells = {}, placements = [];
    // Which directions already run through each square: a word may only
    // share a square with a word going the other way, never lie along one
    // (さん inside さんびゃく would give two clues one start square).
    var dirsAt = {};
    function key(r, c) { return r + "," + c; }

    // Returns the number of crossing letters (>=1) if `answer` fits at
    // (row, col) in `dir`, or -1 if it doesn't.
    function fits(answer, row, col, dir) {
      var dr = dir === "down" ? 1 : 0, dc = dir === "across" ? 1 : 0;
      var len = answer.length;
      var beforeKey = key(row - dr, col - dc), afterKey = key(row + dr * len, col + dc * len);
      if (grid[beforeKey] !== undefined || clueCells[beforeKey]) return -1;
      if (grid[afterKey] !== undefined || clueCells[afterKey]) return -1;
      var crosses = 0;
      for (var i = 0; i < len; i++) {
        var r = row + dr * i, c = col + dc * i, k = key(r, c);
        if (clueCells[k]) return -1;
        var existing = grid[k];
        if (existing !== undefined) {
          if (existing !== answer[i] || dirsAt[k][dir]) return -1;
          crosses++;
        } else if (grid[key(r + dc, c + dr)] !== undefined || grid[key(r - dc, c - dr)] !== undefined) {
          return -1; // would run flush alongside another word with no crossing
        }
      }
      return crosses;
    }

    function place(word, row, col, dir) {
      var dr = dir === "down" ? 1 : 0, dc = dir === "across" ? 1 : 0;
      for (var i = 0; i < word.answer.length; i++) {
        var k = key(row + dr * i, col + dc * i);
        grid[k] = word.answer[i];
        (dirsAt[k] = dirsAt[k] || {})[dir] = true;
      }
      if (arroword) clueCells[key(row - dr, col - dc)] = { dir: dir, clue: word.clue };
      placements.push({ id: word.id, clue: word.clue, answer: word.answer, row: row, col: col, dir: dir });
    }

    // The bounding box so far -- every placement is scored against it, so
    // the grid grows as a compact block instead of sprawling in one
    // direction and leaving most of its squares empty.
    var box = { r0: 0, r1: 0, c0: 0, c1: 0 };
    function grow(answer, row, col, dir) {
      var r1 = dir === "down" ? row + answer.length - 1 : row, c1 = dir === "across" ? col + answer.length - 1 : col;
      if (arroword) { if (dir === "down") row--; else col--; }
      return { r0: Math.min(box.r0, row), r1: Math.max(box.r1, r1), c0: Math.min(box.c0, col), c1: Math.max(box.c1, c1) };
    }

    place(list[0], 0, 0, "across");
    box = grow(list[0].answer, 0, 0, "across");

    // Grow one word at a time: of the words not yet on the grid (a sample
    // of them, from a big pool), place whichever has the best legal spot --
    // one that crosses the most letters and grows the box the least,
    // leaning towards a slightly wide rectangle (it sits beside or above its
    // clues, on screen and on paper). Every word must cross the grid, so it
    // stays one connected piece; stop when nothing left can.
    var byLetter = {};
    function indexCells(answer, row, col, dir) {
      for (var i = 0; i < answer.length; i++) {
        var r = dir === "down" ? row + i : row, c = dir === "across" ? col + i : col;
        (byLetter[answer[i]] = byLetter[answer[i]] || []).push([r, c]);
      }
    }
    indexCells(list[0].answer, 0, 0, "across");
    function bestSpot(word) {
      var best = null, seen = {};
      var h = box.r1 - box.r0 + 1, w = box.c1 - box.c0 + 1;
      for (var i = 0; i < word.answer.length; i++) {
        var hits = byLetter[word.answer[i]] || [];
        for (var g = 0; g < hits.length; g++) {
          var gr = hits[g][0], gc = hits[g][1];
          var candidates = [["across", gr, gc - i], ["down", gr - i, gc]];
          for (var ci = 0; ci < candidates.length; ci++) {
            var cand = candidates[ci], ck = cand.join();
            if (seen[ck]) continue;
            seen[ck] = true;
            var crosses = fits(word.answer, cand[1], cand[2], cand[0]);
            if (crosses <= 0) continue;
            var nb = grow(word.answer, cand[1], cand[2], cand[0]);
            var nh = nb.r1 - nb.r0 + 1, nw = nb.c1 - nb.c0 + 1;
            var score = crosses * 4 - ((nh + nw) - (h + w)) * 2 - Math.abs(nw - nh * 1.25) * 0.5 + Math.random() * 0.5;
            if (!best || score > best.score) best = { row: cand[1], col: cand[2], dir: cand[0], score: score, box: nb };
          }
        }
      }
      return best;
    }
    var remaining = list.slice(1);
    var SAMPLE = 12;
    while (remaining.length && placements.length < limit) {
      var pick = null, pickIdx = -1;
      for (var wi = 0; wi < remaining.length && wi < SAMPLE; wi++) {
        var spot = bestSpot(remaining[wi]);
        if (spot && (!pick || spot.score > pick.score)) { pick = spot; pickIdx = wi; }
      }
      if (!pick) {
        // Nothing in the sample fits -- drop it and try the next batch.
        if (remaining.length <= SAMPLE) break;
        remaining = remaining.slice(SAMPLE);
        continue;
      }
      var word = remaining.splice(pickIdx, 1)[0];
      place(word, pick.row, pick.col, pick.dir);
      indexCells(word.answer, pick.row, pick.col, pick.dir);
      box = pick.box;
    }

    var keys = Object.keys(grid).concat(Object.keys(clueCells));
    var rs = keys.map(function (k) { return +k.split(",")[0]; });
    var cs = keys.map(function (k) { return +k.split(",")[1]; });
    var minR = Math.min.apply(null, rs), minC = Math.min.apply(null, cs);
    var maxR = Math.max.apply(null, rs), maxC = Math.max.apply(null, cs);
    var normGrid = {}, normClue = {};
    Object.keys(grid).forEach(function (k) {
      var p = k.split(","); normGrid[(+p[0] - minR) + "," + (+p[1] - minC)] = grid[k];
    });
    Object.keys(clueCells).forEach(function (k) {
      var p = k.split(","); normClue[(+p[0] - minR) + "," + (+p[1] - minC)] = clueCells[k];
    });
    placements.forEach(function (p) { p.row -= minR; p.col -= minC; });
    // A clue cell knows its own word's start cell (post-normalization), so
    // tapping it can jump straight to that word's first input.
    placements.forEach(function (p) {
      var dr = p.dir === "down" ? 1 : 0, dc = p.dir === "across" ? 1 : 0;
      var ck = normClue[(p.row - dr) + "," + (p.col - dc)];
      if (ck) ck.start = p.row + "," + p.col;
    });

    // Numbering, row-major over each word's own start cell -- shared when an
    // across and a down word both start on the same square.
    var numbers = {}, next = 1;
    placements.slice().sort(function (a, b) { return a.row - b.row || a.col - b.col; }).forEach(function (p) {
      var k = p.row + "," + p.col;
      if (!numbers[k]) numbers[k] = next++;
    });
    placements.forEach(function (p) { p.number = numbers[p.row + "," + p.col]; });

    return { placements: placements, grid: normGrid, clueCells: normClue, numbers: numbers, rows: maxR - minR + 1, cols: maxC - minC + 1 };
  }

  // Every cell key ("r,c") a normalized placement occupies, in order.
  function cellsForPlacement(pl) {
    var dr = pl.dir === "down" ? 1 : 0, dc = pl.dir === "across" ? 1 : 0, out = [];
    for (var i = 0; i < pl.answer.length; i++) out.push((pl.row + dr * i) + "," + (pl.col + dc * i));
    return out;
  }

  // -----------------------------------------------------------------------
  // Word search -- the third style. Same word pool and scripts, but the
  // answers hide in a square block of letters instead of crossing on an
  // open grid. An easy word search teaches nothing, so every choice here
  // leans hard: the list gives only the English clue (you have to know the
  // reading to look for it), words run in all eight directions -- backwards
  // and diagonally too -- each word prefers the spot where it shares the
  // most letters with words already down (a dense tangle, not ten tidy
  // lines), and the leftover squares are filled from the answers' own
  // letters, so no stray alphabet makes the real words stand out.
  // -----------------------------------------------------------------------
  var WS_DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
  function buildWordSearch(words, limit) {
    if (!words.length) return { placements: [], rows: 0, cols: 0, letters: [] };
    limit = limit || words.length;
    var target = Math.min(limit, words.length);
    // Sized so an average pick of answers would all but fill the square --
    // overlaps free a little room back, the filler takes the rest. Grown a
    // square at a time only if even the best attempt couldn't fit every word.
    var avg = words.reduce(function (n, w) { return n + Array.from(w.answer).length; }, 0) / words.length;
    var longest = words.reduce(function (n, w) { return Math.max(n, Array.from(w.answer).length); }, 0);
    var side = Math.max(Math.min(longest, 8), Math.ceil(Math.sqrt(target * avg / 0.95)));
    var best = null;
    for (var grow = 0; grow < 4; grow++, side++) {
      for (var a = 0; a < 8; a++) {
        var attempt = buildWordSearchOnce(words, target, side);
        if (!best || attempt.placements.length > best.placements.length ||
          (attempt.placements.length === best.placements.length && attempt.overlaps > best.overlaps)) best = attempt;
      }
      if (best.placements.length >= target) break;
    }
    return best;
  }
  function buildWordSearchOnce(words, target, side) {
    var cells = [], placements = [], overlaps = 0;
    for (var r = 0; r < side; r++) cells.push(new Array(side).fill(null));
    function spotScore(answer, row, col, d) {
      var shared = 0;
      for (var i = 0; i < answer.length; i++) {
        var rr = row + d[0] * i, cc = col + d[1] * i;
        if (rr < 0 || cc < 0 || rr >= side || cc >= side) return -1;
        var have = cells[rr][cc];
        if (have !== null && have !== answer[i]) return -1;
        if (have !== null) shared++;
      }
      // A word lying wholly on letters already down isn't hidden anywhere of its own.
      return shared === answer.length ? -1 : shared;
    }
    weightedOrder(words).some(function (w) {
      if (placements.length >= target) return true;
      var answer = Array.from(w.answer), bestSpot = null, bestScore = -1;
      for (var r = 0; r < side; r++) {
        for (var c = 0; c < side; c++) {
          for (var k = 0; k < WS_DIRS.length; k++) {
            var shared = spotScore(answer, r, c, WS_DIRS[k]);
            if (shared < 0) continue;
            // Shared letters count most; a slant or backwards run gets a
            // nudge over plain across/down; the random share keeps equally
            // good spots from always landing in the same corner.
            var hard = k >= 2 ? 0.6 : 0;
            var score = shared * 2 + hard + Math.random() * 1.2;
            if (score > bestScore) { bestScore = score; bestSpot = { row: r, col: c, d: WS_DIRS[k], shared: shared }; }
          }
        }
      }
      if (!bestSpot) return false;
      answer.forEach(function (ch, i) { cells[bestSpot.row + bestSpot.d[0] * i][bestSpot.col + bestSpot.d[1] * i] = ch; });
      overlaps += bestSpot.shared;
      placements.push({ id: w.id, clue: w.clue, answer: w.answer, row: bestSpot.row, col: bestSpot.col, dr: bestSpot.d[0], dc: bestSpot.d[1], length: answer.length });
      return false;
    });
    var pool = [];
    placements.forEach(function (p) { pool.push.apply(pool, Array.from(p.answer)); });
    for (var fr = 0; fr < side; fr++) {
      for (var fc = 0; fc < side; fc++) {
        if (cells[fr][fc] === null) cells[fr][fc] = pool[Math.floor(Math.random() * pool.length)] || "";
      }
    }
    placements.sort(function (a, b) { return a.clue.localeCompare(b.clue); });
    return { placements: placements, rows: side, cols: side, letters: cells, overlaps: overlaps };
  }

  // Letters are plain text in rows, not inputs -- nothing is typed here. The
  // found-word capsules are lines in one SVG under the letters, drawn in
  // cell units (viewBox = the grid), so they need no inline style at all.
  function wordSearchGridHtml(p, romajiMode) {
    var rows = p.letters.map(function (row, r) {
      return '<div class="fc-ws-row" role="row">' + row.map(function (ch, c) {
        return '<span class="fc-ws-cell" role="gridcell" tabindex="' + (r === 0 && c === 0 ? "0" : "-1") + '" data-r="' + r + '" data-c="' + c + '">' + esc(ch) + "</span>";
      }).join("") + "</div>";
    }).join("");
    return '<div class="fc-ws-grid' + (romajiMode ? " fc-ws-romaji" : "") + '" role="grid" aria-label="Word search"' + (romajiMode ? "" : ' lang="ja"') + ">" +
      '<svg class="fc-ws-marks" viewBox="0 0 ' + p.cols + " " + p.rows + '" preserveAspectRatio="none" aria-hidden="true"></svg>' +
      rows + "</div>";
  }
  var TICK_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5l3.2 3.2L14 5.8"/></svg>';
  function wordSearchListHtml(p) {
    return '<div class="fc-xw-clues fc-ws-list"><div class="fc-xw-cluegroup"><h4 class="fc-xw-cluehead">Find the Japanese for</h4><ol class="fc-xw-cluerows">' +
      p.placements.map(function (pl, i) {
        // A word found in kanji also shows how it's read: 水（みず）.
        var entry = vocabIndex()[pl.id];
        var reading = entry ? String(entry.jpReading || "").replace(/^〜/, "").trim() : "";
        var shown = /[一-龯々]/.test(pl.answer) && reading ? pl.answer + "（" + reading + "）" : pl.answer;
        return '<li data-i="' + i + '"><span class="fc-ws-tick">' + TICK_ICON + '</span><span class="fc-ws-clue">' + esc(pl.clue) +
          '</span><span class="fc-ws-answer"' + (/^[a-z]/.test(pl.answer) ? "" : ' lang="ja"') + " hidden>" + esc(shown) + "</span></li>";
      }).join("") + "</ol></div></div>";
  }

  // Marking a word: drag from its first letter to its last, or tap the two
  // ends one after the other (Enter / Space on a focused letter does the
  // same, arrow keys move). The line snaps to the nearest of the eight
  // directions while dragging; a line that spells an unfound answer, either
  // way round, marks it found. Matched on the letters, not on where the
  // builder put the word -- if the filler happens to spell an answer again
  // elsewhere, finding that copy counts too.
  function wireWordSearch(gridEl, listEl, countEl, p, onAllFound) {
    var SVGNS = "http://www.w3.org/2000/svg";
    var svg = gridEl.querySelector(".fc-ws-marks");
    var found = p.placements.map(function () { return false; });
    var anchor = null, dragStart = null, dragEnd = null, moved = false, dragLine = null;

    function cellEl(r, c) { return gridEl.querySelector('.fc-ws-cell[data-r="' + r + '"][data-c="' + c + '"]'); }
    function pos(el) { return [+el.dataset.r, +el.dataset.c]; }
    function makeLine(cls, a, b) {
      var line = document.createElementNS(SVGNS, "line");
      line.setAttribute("class", cls);
      line.setAttribute("stroke-width", "0.74");
      line.setAttribute("stroke-linecap", "round");
      setLine(line, a, b);
      svg.appendChild(line);
      return line;
    }
    function setLine(line, a, b) {
      line.setAttribute("x1", a[1] + 0.5); line.setAttribute("y1", a[0] + 0.5);
      line.setAttribute("x2", b[1] + 0.5); line.setAttribute("y2", b[0] + 0.5);
    }
    // The end of a straight line from `a` toward `b`: the nearest of the
    // eight directions, as far as the pointer reaches, clipped to the grid.
    function snap(a, b) {
      var dr = b[0] - a[0], dc = b[1] - a[1];
      if (!dr && !dc) return a;
      var oct = ((Math.round(Math.atan2(dr, dc) / (Math.PI / 4)) % 8) + 8) % 8;
      var d = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]][oct];
      var n = d[0] && d[1] ? Math.max(Math.abs(dr), Math.abs(dc)) : Math.abs(d[0] ? dr : dc);
      while (n > 0) {
        var r = a[0] + d[0] * n, c = a[1] + d[1] * n;
        if (r >= 0 && c >= 0 && r < p.rows && c < p.cols) return [r, c];
        n--;
      }
      return a;
    }
    function spell(a, b) {
      var n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      var sr = Math.sign(b[0] - a[0]), sc = Math.sign(b[1] - a[1]), out = "";
      for (var i = 0; i <= n; i++) out += p.letters[a[0] + sr * i][a[1] + sc * i];
      return out;
    }
    function updateCount() {
      var n = found.filter(Boolean).length;
      // "3 / 15", like Listening's counter -- short enough to sit where
      // Check does on a phone; the words are for a screen reader.
      countEl.textContent = n + " / " + found.length;
      countEl.setAttribute("aria-label", n === found.length ? "All " + n + " words found" : n + " of " + found.length + " words found");
      countEl.classList.toggle("fc-ws-count-done", n === found.length);
      if (n === found.length && onAllFound) onAllFound();
    }
    function markFound(i, a, b) {
      found[i] = true;
      makeLine("fc-ws-found", a, b);
      var li = listEl.querySelector('li[data-i="' + i + '"]');
      li.classList.add("fc-ws-done");
      li.querySelector(".fc-ws-answer").hidden = false;
      updateCount();
    }
    function placementEnds(pl) { return [[pl.row, pl.col], [pl.row + pl.dr * (pl.length - 1), pl.col + pl.dc * (pl.length - 1)]]; }
    function tryLine(a, b) {
      if (a[0] === b[0] && a[1] === b[1]) return false;
      var text = spell(a, b), back = Array.from(text).reverse().join("");
      var i = p.placements.findIndex(function (pl, j) { return !found[j] && (pl.answer === text || pl.answer === back); });
      if (i === -1) return false;
      markFound(i, a, b);
      return true;
    }
    function setAnchor(a) {
      gridEl.querySelectorAll(".fc-ws-anchor").forEach(function (el) { el.classList.remove("fc-ws-anchor"); });
      anchor = a;
      if (a) cellEl(a[0], a[1]).classList.add("fc-ws-anchor");
    }
    function clearDrag() {
      if (dragLine) dragLine.remove();
      dragLine = null; dragStart = dragEnd = null; moved = false;
    }
    // One tap (or Enter): the first sets the start, the second -- anywhere
    // on a straight line from it -- tries that word; the same letter again
    // lets go of the start.
    function tap(at) {
      if (!anchor) { setAnchor(at); return; }
      var from = anchor;
      setAnchor(null);
      if (from[0] === at[0] && from[1] === at[1]) return;
      var end = snap(from, at);
      if (!tryLine(from, end)) flashMiss();
    }
    function flashMiss() {
      gridEl.classList.remove("fc-ws-miss");
      void gridEl.offsetWidth;
      gridEl.classList.add("fc-ws-miss");
    }

    gridEl.addEventListener("pointerdown", function (e) {
      var cell = e.target.closest(".fc-ws-cell");
      if (!cell || e.button > 0) return;
      e.preventDefault();
      cell.focus({ preventScroll: true });
      dragStart = dragEnd = pos(cell);
      moved = false;
      try { gridEl.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no capturable pointer */ }
    });
    gridEl.addEventListener("pointermove", function (e) {
      if (!dragStart || !document.elementFromPoint) return;
      var under = document.elementFromPoint(e.clientX, e.clientY);
      var cell = under && under.closest && under.closest(".fc-ws-cell");
      if (!cell || !gridEl.contains(cell)) return;
      var end = snap(dragStart, pos(cell));
      if (end[0] === dragStart[0] && end[1] === dragStart[1] && !moved) return;
      moved = true;
      setAnchor(null);
      dragEnd = end;
      if (!dragLine) dragLine = makeLine("fc-ws-drag", dragStart, dragEnd);
      else setLine(dragLine, dragStart, dragEnd);
    });
    gridEl.addEventListener("pointerup", function () {
      if (!dragStart) return;
      var a = dragStart, b = dragEnd, wasDrag = moved;
      clearDrag();
      if (wasDrag) { if (!tryLine(a, b)) flashMiss(); }
      else tap(a);
    });
    gridEl.addEventListener("pointercancel", clearDrag);
    gridEl.addEventListener("keydown", function (e) {
      var cell = e.target.closest(".fc-ws-cell");
      if (!cell) return;
      var at = pos(cell), move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      if (move) {
        var next = cellEl(at[0] + move[0], at[1] + move[1]);
        if (next) { e.preventDefault(); cell.tabIndex = -1; next.tabIndex = 0; next.focus(); }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        tap(at);
      } else if (e.key === "Escape") setAnchor(null);
    });
    gridEl.addEventListener("focusin", function (e) {
      var cell = e.target.closest(".fc-ws-cell");
      if (!cell) return;
      gridEl.querySelectorAll('.fc-ws-cell[tabindex="0"]').forEach(function (el) { if (el !== cell) el.tabIndex = -1; });
      cell.tabIndex = 0;
    });

    updateCount();
    return {
      // Returns the word it revealed (or null when all are found).
      revealOne: function () {
        var i = found.indexOf(false);
        if (i === -1) return null;
        var ends = placementEnds(p.placements[i]);
        markFound(i, ends[0], ends[1]);
        return p.placements[i];
      },
      revealAll: function () {
        found.forEach(function (f, i) { if (!f) { var ends = placementEnds(p.placements[i]); markFound(i, ends[0], ends[1]); } });
      },
      reset: function () {
        found = found.map(function () { return false; });
        svg.querySelectorAll(".fc-ws-found").forEach(function (l) { l.remove(); });
        listEl.querySelectorAll("li").forEach(function (li) { li.classList.remove("fc-ws-done"); li.querySelector(".fc-ws-answer").hidden = true; });
        setAnchor(null);
        updateCount();
      }
    };
  }

  // -----------------------------------------------------------------------
  // Match -- a timed pairs game. The words split into even rounds of at
  // most MATCH_ROUND pairs (10 -> 5+5, 15 -> 5+5+5), so a round fits a
  // phone without scrolling; each round lays the readings out in one column
  // and the English in the other, each shuffled on its own. Tap a tile and
  // then its partner, from either side: a right pair clears (its tiles keep
  // their place, so nothing under your finger moves), a wrong one costs a
  // second. The clock starts on the first tap, not on render. The best time
  // per word set (source + script + pair count) comes from the game log --
  // practice only, never an FSRS review.
  // -----------------------------------------------------------------------
  var MATCH_ROUND = 6;
  var MATCH_PENALTY_MS = 1000;
  // Best times used to sit in their own key; they're read from the log now
  // (it syncs, and Reset stats already clears it), so the old key goes.
  // Safe to delete a few releases after 2026-10.
  try { localStorage.removeItem("raume-match-best"); } catch (e) { /* ignore */ }
  function matchRounds(n) {
    var count = Math.ceil(n / MATCH_ROUND), sizes = [];
    for (var i = 0; i < count; i++) sizes.push(Math.floor(n / count) + (i < n % count ? 1 : 0));
    return sizes;
  }
  function buildMatch(words, limit) {
    var picked = weightedOrder(words).slice(0, limit);
    var rounds = [], at = 0;
    matchRounds(picked.length).forEach(function (size) { rounds.push(picked.slice(at, at + size)); at += size; });
    return { placements: picked, rounds: rounds };
  }
  function formatClock(ms) {
    var tenths = Math.floor(ms / 100), s = Math.floor(tenths / 10);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + "." + (tenths % 10);
  }
  // A game's setup -- source, script and word count -- so a best or a
  // history only ever compares like with like.
  function setupKey(n, script) {
    var src = state.source === "table" ? "tables:" + state.tables.map(String).sort().join(",") : state.source;
    return src + "|" + (script || state.script) + "|" + n;
  }
  function matchBestKey(p) { return setupKey(p.placements.length); }
  // The fastest whole game logged on these words (a game ended early never
  // counts), or null.
  function bestTime(key) {
    var runs = window.RaumeStudy.flashcards.puzzleRuns, best = null;
    (runs ? runs.live("match") : []).forEach(function (r) {
      if (r.setup === key && !r.ended && (best === null || r.ms < best)) best = r.ms;
    });
    return best;
  }
  // Every finished Match / Listening game goes to the Dashboard's log.
  function recordRun(run) {
    var runs = window.RaumeStudy.flashcards.puzzleRuns;
    return runs ? runs.record(run) : null;
  }
  function ordinal(n) {
    var t = n % 100, u = n % 10;
    return n + (t >= 11 && t <= 13 ? "th" : u === 1 ? "st" : u === 2 ? "nd" : u === 3 ? "rd" : "th");
  }
  // Under a finished Listening or Kana tiles game: this game's accuracy
  // beside your average over every game of that style so far.
  function accuracyStatsHtml(mode, right, n, run) {
    var runs = window.RaumeStudy.flashcards.puzzleRuns;
    var all = runs ? runs.live(mode) : [];
    if (run && !all.some(function (r) { return r.id === run.id; })) all.push(run);
    var asked = 0, got = 0;
    all.forEach(function (r) { asked += r.n; got += r.right || 0; });
    return '<div class="fc-mt-stats"><div class="fc-mt-stat"><span class="fc-mt-stat-val">' + Math.round(right / n * 100) + '%</span><span class="fc-mt-stat-lbl">this game</span></div>' +
      (all.length > 1 ? '<div class="fc-mt-stat"><span class="fc-mt-stat-val">' + Math.round(got / asked * 100) + '%</span><span class="fc-mt-stat-lbl">over ' + all.length + " games</span></div>" : "") +
      "</div>";
  }
  // Pace medals, per pair: gold under 2s, silver under 3s, bronze under 4s
  // -- each tier's hue from the --tile family (amber / slate / clay).
  var PACE_TIERS = [["gold", "Gold", 2], ["silver", "Silver", 3], ["bronze", "Bronze", 4]];
  function paceTier(perPair) {
    var at = -1;
    PACE_TIERS.forEach(function (t, i) { if (at === -1 && perPair < t[2]) at = i; });
    if (at === -1) at = PACE_TIERS.length;
    var tier = PACE_TIERS[at], up = PACE_TIERS[at - 1];
    return { key: tier ? tier[0] : "none", name: tier ? tier[1] + " pace" : "",
      next: up ? up[1] + " is under " + up[2].toFixed(1) + "s a pair" : tier ? "The fastest tier" : "Bronze is under " + PACE_TIERS[2][2].toFixed(1) + "s a pair" };
  }
  // The finish card's middle: your pace per pair inside a ring that draws
  // closed in the tier's hue, the tier named under it.
  function paceRingHtml(perPair) {
    var t = paceTier(perPair);
    return '<div class="fc-mt-pace fc-mt-tier-' + t.key + '">' +
      '<div class="fc-mt-ring"><svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">' +
      '<circle class="fc-mt-ring-track" cx="60" cy="60" r="50"/>' +
      '<circle class="fc-mt-ring-arc" cx="60" cy="60" r="50" pathLength="100" transform="rotate(-90 60 60)"/></svg>' +
      '<p class="fc-mt-ring-val"><span class="fc-mt-ring-num">' + perPair.toFixed(1) + 's</span><span class="fc-mt-ring-lbl">a pair</span></p></div>' +
      (t.name ? '<p class="fc-mt-tier-name">' + t.name + "</p>" : "") +
      '<p class="fc-mt-tier-next">' + t.next + "</p></div>";
  }
  // Under it: the last ten runs on these words as a sparkline that draws
  // itself (higher = faster), this run the dot, and where it ranks.
  function matchHistoryHtml(key, total, run) {
    var runs = window.RaumeStudy.flashcards.puzzleRuns;
    var same = runs ? runs.live("match").filter(function (r) { return r.setup === key && !r.ended; }) : [];
    if (run && !same.some(function (r) { return r.id === run.id; })) same.push(run);
    if (same.length < 2) return "";
    var rank = 1 + same.filter(function (r) { return r.ms < total; }).length;
    var last = same.slice(-10);
    var max = Math.max.apply(null, last.map(function (r) { return r.ms; }));
    var min = Math.min.apply(null, last.map(function (r) { return r.ms; }));
    var span = Math.max(1, max - min), w = 300, h = 40, step = w / (last.length - 1);
    var pts = last.map(function (r, i) { return [Math.round(i * step * 10) / 10, Math.round((5 + (r.ms - min) / span * (h - 10)) * 10) / 10]; });
    var end = pts[pts.length - 1];
    return '<div class="fc-mt-history"><p class="fc-mt-history-head"><span>Last ' + last.length + " games</span>" +
      "<span>Your " + (rank === 1 ? "fastest" : ordinal(rank) + " fastest") + " of " + same.length + "</span></p>" +
      '<svg class="fc-mt-spark" viewBox="-6 0 312 40" role="img" aria-label="Your last ' + last.length + ' times on these words">' +
      '<polyline pathLength="100" points="' + pts.map(function (q) { return q.join(","); }).join(" ") + '"/>' +
      '<circle cx="' + end[0] + '" cy="' + end[1] + '" r="4.5"/></svg></div>';
  }
  // The finish time counts up to itself (~700ms, easing out); the final
  // value is in the markup from the start, and reduced motion (or a page
  // that can't animate) just keeps it.
  function countUpClock(el, ms) {
    if (!el || !window.requestAnimationFrame || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var t0 = null;
    function step(now) {
      if (!el.isConnected) return;
      if (t0 === null) t0 = now;
      var p = Math.min((now - t0) / 700, 1);
      el.textContent = formatClock(ms * (1 - Math.pow(1 - p, 3)));
      if (p < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }
  // Answer feel, shared by the pick-one games (Listening, Odd one out,
  // Speed sort): the right tile washes sage from the middle out and
  // a ✓ draws itself in its corner -- with a small springy press if it was
  // your pick, or a sage ring if you picked another; a wrong pick washes
  // coral with a shake and a ✕. Colours and marks come from the existing
  // fc-mt-right / fc-mt-wrong classes; this adds only the motion.
  var MARK_RIGHT = '<svg class="fc-fb-mark" viewBox="0 0 18 18" aria-hidden="true"><path pathLength="100" d="M4 9.5l3.2 3L14 5.5"/></svg>';
  var MARK_WRONG = '<svg class="fc-fb-mark" viewBox="0 0 18 18" aria-hidden="true"><path pathLength="100" d="M5.5 5.5l7 7M12.5 5.5l-7 7"/></svg>';
  function answerFeel(rightBtn, pickedBtn) {
    if (rightBtn) {
      rightBtn.classList.add("fc-fb", pickedBtn === rightBtn ? "fc-fb-press" : "fc-fb-ring");
      rightBtn.insertAdjacentHTML("beforeend", MARK_RIGHT);
    }
    if (pickedBtn && pickedBtn !== rightBtn) {
      pickedBtn.classList.add("fc-fb");
      pickedBtn.insertAdjacentHTML("beforeend", MARK_WRONG);
    }
  }
  // The question counter's number rolls up when it changes.
  function setCount(countEl, n, total) {
    var prev = countEl.querySelector(".fc-fb-num");
    var same = prev && prev.textContent === String(n);
    countEl.innerHTML = '<span class="fc-fb-num' + (prev && !same ? " fc-fb-roll" : "") + '">' + n + "</span> / " + total;
  }
  // Five dots beside the counter fill with each right answer in a row; the
  // fifth glows once and says "5 in a row", then they start again. A miss
  // empties them. Quiet: no number, no sound.
  var STREAK_DOTS = 5;
  function streakHtml() {
    var dots = "";
    for (var i = 0; i < STREAK_DOTS; i++) dots += '<span class="fc-fb-dot"></span>';
    return '<span class="fc-fb-streak" id="fcStreak" role="img" aria-label="0 right in a row">' + dots +
      '<span class="fc-fb-hot-lbl">' + STREAK_DOTS + " in a row</span></span>";
  }
  function streakMeter() {
    var n = 0, timer = null;
    function el() { return document.getElementById("fcStreak"); }
    function draw(pop) {
      var box = el();
      if (!box) return;
      box.querySelectorAll(".fc-fb-dot").forEach(function (d, i) {
        d.classList.toggle("fc-fb-on", i < n);
        d.classList.toggle("fc-fb-pop", i === pop);
      });
      box.classList.toggle("fc-fb-hot", n === STREAK_DOTS);
      box.setAttribute("aria-label", n + " right in a row");
    }
    return {
      hit: function (right) {
        clearTimeout(timer);
        if (n === STREAK_DOTS) n = 0;
        n = right ? n + 1 : 0;
        draw(right ? n - 1 : -1);
        if (n === STREAK_DOTS) timer = setTimeout(function () { n = 0; draw(-1); }, 1800);
      },
      reset: function () { clearTimeout(timer); n = 0; draw(-1); }
    };
  }
  // A finished game's buttons: Play again (new words), and Stats.
  function doneActionsHtml(againId) {
    return '<div class="fc-mt-done-actions"><button type="button" class="fc-btn fc-btn-primary" id="' + againId + '">Play again</button>' +
      '<button type="button" class="fc-btn" id="fcDoneStats">Stats</button></div>';
  }
  function bindDoneActions(againId) {
    document.getElementById(againId).addEventListener("click", function () { generate(); rerender(); });
    document.getElementById("fcDoneStats").addEventListener("click", openStats);
  }
  function openStats() {
    var stats = window.RaumeStudy.flashcards.puzzleStats;
    if (stats) stats.open(state.kind, state.mode);
  }
  var matchTimer = null;
  function stopMatchTimer() { if (matchTimer) { clearInterval(matchTimer); matchTimer = null; } }

  // The split chip: at each round's end, how far ahead of (−) or behind (+)
  // your best run on these same words you were at that point -- a speedrun
  // split. Only once a best with splits exists; the clock itself never
  // jumps or grows.
  function bestSplits(key, rounds) {
    var runs = window.RaumeStudy.flashcards.puzzleRuns;
    var best = null;
    (runs ? runs.live("match") : []).forEach(function (r) {
      if (r.setup === key && !r.ended && r.splits && r.splits.length === rounds && (!best || r.ms < best.ms)) best = r;
    });
    return best ? best.splits : null;
  }
  // The pause card and a stopped game's card share one look: the finish
  // card's white panel, the time big, one quiet line, then the buttons.
  function pauseCardHtml(big, line) {
    return '<div class="fc-mt-done fc-mt-pause" role="dialog" aria-label="Paused">' +
      '<p class="fc-mt-pause-title">Paused</p>' +
      '<p class="fc-mt-done-time">' + esc(big) + "</p>" +
      (line ? '<p class="fc-mt-done-meta">' + esc(line) + "</p>" : "") +
      '<div class="fc-mt-done-actions fc-mt-pause-actions"><button type="button" class="fc-btn fc-btn-primary" id="fcPauseResume">Resume</button></div>' +
      '<div class="fc-mt-done-actions"><button type="button" class="fc-btn" id="fcPauseRestart">Restart</button>' +
      '<button type="button" class="fc-btn" id="fcPauseEnd">End game</button></div></div>';
  }
  // Pausing covers the board (no studying the tiles on a stopped clock)
  // and brings the card; Resume takes it away with the board as it was.
  function showPauseCard(boardEl, big, line, handlers) {
    boardEl.classList.add("fc-mt-paused");
    boardEl.insertAdjacentHTML("beforeend", pauseCardHtml(big, line));
    document.getElementById("fcPauseResume").addEventListener("click", handlers.resume);
    document.getElementById("fcPauseRestart").addEventListener("click", handlers.restart);
    document.getElementById("fcPauseEnd").addEventListener("click", handlers.end);
    document.getElementById("fcPauseResume").focus();
  }
  function hidePauseCard(boardEl) {
    boardEl.classList.remove("fc-mt-paused");
    var card = boardEl.querySelector(".fc-mt-pause");
    if (card) card.remove();
  }
  // Leaving the app mid-game (another tab, the home screen) pauses it, as
  // an iOS game does; `activeGame` is whichever game is on screen.
  var activeGame = null;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && activeGame && activeGame.pause) activeGame.pause();
  });

  function wireMatch(boardEl, clockEl, p, romajiMode) {
    // The clock only runs while you play: `acc` holds the time banked
    // before the last stop, `runAt` when it last started (null = stopped
    // -- before the first tap, during a round break, paused, finished).
    var round, acc, runAt, started, penalty, misses, roundMisses, selected, left, game = 0, splits, pb, missedIds, phase;
    var splitEl = document.getElementById("fcMtSplit");
    function showSplit(i, at) {
      if (!splitEl || !pb || pb[i] == null) return;
      var d = at - pb[i], ahead = d <= 0;
      splitEl.textContent = (ahead ? "−" : "+") + (Math.abs(d) / 1000).toFixed(1) + "s";
      splitEl.className = "fc-mt-split " + (ahead ? "fc-mt-split-ahead" : "fc-mt-split-behind");
      splitEl.setAttribute("aria-label", (Math.abs(d) / 1000).toFixed(1) + " seconds " + (ahead ? "ahead of" : "behind") + " your best");
      splitEl.hidden = false;
    }
    // Pause only means something mid-round: dimmed on a break or at the end.
    function setPhase(ph) {
      phase = ph;
      var btn = document.getElementById("fcMtPause");
      if (btn) btn.disabled = ph !== "play";
    }
    function elapsed() { return acc + (runAt === null ? 0 : Date.now() - runAt) + penalty; }
    function run() {
      if (runAt !== null) return;
      runAt = Date.now();
      if (!matchTimer) matchTimer = setInterval(tick, 100);
    }
    function halt() {
      if (runAt !== null) { acc += Date.now() - runAt; runAt = null; }
      stopMatchTimer();
      tick();
    }
    function tick() {
      if (!clockEl.isConnected) { stopMatchTimer(); return; }
      clockEl.textContent = formatClock(elapsed());
    }
    // Kana and kanji set a size up (17px) to read as clearly as the English
    // beside them; romaji is Latin text and matches the English's 14px.
    function tileHtml(side, i, text) {
      var jp = side === "l" && !romajiMode;
      return '<button type="button" class="fc-mt-tile' + (jp ? " fc-mt-jp" : "") + '" data-side="' + side + '" data-i="' + i + '" aria-pressed="false"' +
        (jp ? ' lang="ja"' : "") + ">" + esc(text) + "</button>";
    }
    function renderRound() {
      var words = p.rounds[round];
      var order = words.map(function (w, i) { return i; });
      left = words.length;
      selected = null;
      roundMisses = 0;
      setPhase("play");
      boardEl.innerHTML =
        (p.rounds.length > 1 ? '<p class="fc-mt-round">Round ' + (round + 1) + " of " + p.rounds.length + "</p>" : "") +
        '<div class="fc-mt-cols">' +
        '<div class="fc-mt-col">' + shuffle(order).map(function (i) { return tileHtml("l", i, words[i].answer); }).join("") + "</div>" +
        '<div class="fc-mt-col">' + shuffle(order).map(function (i) { return tileHtml("r", i, words[i].clue); }).join("") + "</div>" +
        "</div>";
    }
    // Between rounds: a breather, Duolingo-style, the clock stopped -- how
    // that round went and where you stand against your best so far.
    function roundBreak() {
      setPhase("break");
      var at = splits[round], prev = round ? splits[round - 1] : 0;
      var vs = pb && pb[round] != null ? pb[round] - at : null;
      // Fastest round yet (against rounds of the same size, from games
      // already finished) earns its own line.
      var runs = window.RaumeStudy.flashcards.puzzleRuns;
      var prevBest = runs ? runs.bestRound(p.rounds[round].length) : null;
      var fastest = prevBest && at - prev < prevBest.ms;
      boardEl.innerHTML = '<div class="fc-mt-done fc-mt-break" role="status">' +
        '<p class="fc-mt-pause-title">Round ' + (round + 1) + " of " + p.rounds.length + " done</p>" +
        '<p class="fc-mt-done-time">' + formatClock(at - prev) + "</p>" +
        '<p class="fc-mt-done-meta">' + (roundMisses ? roundMisses + (roundMisses === 1 ? " miss" : " misses") : "No misses") +
        (vs === null ? "" : " · " + (Math.abs(vs) / 1000).toFixed(1) + "s " + (vs >= 0 ? "ahead of" : "behind") + " your best") + "</p>" +
        (fastest ? '<p class="fc-mt-best-round">Your fastest round yet</p>' : "") +
        '<div class="fc-mt-done-actions"><button type="button" class="fc-btn fc-btn-primary" id="fcMtNextRound">Next round</button></div></div>';
      var next = document.getElementById("fcMtNextRound");
      next.addEventListener("click", function () { round++; renderRound(); run(); });
      next.focus();
    }
    function pause() {
      if (phase !== "play" || !boardEl.isConnected) return;
      setPhase("paused");
      halt();
      select(null);
      showPauseCard(boardEl, formatClock(elapsed()),
        p.rounds.length > 1 ? "Round " + (round + 1) + " of " + p.rounds.length : "", {
        resume: function () { hidePauseCard(boardEl); setPhase("play"); if (started) run(); },
        restart: restart,
        end: endEarly
      });
    }
    // Stopped before the last round: the rounds you finished count -- their
    // pairs, time, misses, their place in Fastest round -- logged as ended,
    // so they never set a best time (that takes the whole game).
    function endEarly() {
      setPhase("done");
      halt();
      var total = elapsed(), done = splits.length;
      var sizes = p.rounds.slice(0, done).map(function (r) { return r.length; });
      var pairs = sizes.reduce(function (a, b) { return a + b; }, 0);
      if (done) recordRun({ mode: "match", n: pairs, ms: splits[done - 1], miss: misses, setup: matchBestKey(p),
        splits: splits, sizes: sizes, missed: Object.keys(missedIds), ended: true });
      if (splitEl) splitEl.hidden = true;
      clockEl.classList.add("fc-ws-count-done");
      boardEl.classList.remove("fc-mt-paused");
      boardEl.innerHTML = '<div class="fc-mt-done" role="status">' +
        '<p class="fc-mt-done-time">' + formatClock(total) + "</p>" +
        '<p class="fc-mt-done-meta">Ended after ' + done + " of " + p.rounds.length + (p.rounds.length === 1 ? " round" : " rounds") +
        " · " + (misses === 1 ? "1 miss" : misses + " misses") + "</p>" +
        '<p class="fc-mt-done-note">' + (done ? "The " + pairs + " pairs you finished count in your stats; a best time needs the whole game."
          : "No round finished, so nothing is counted.") + "</p>" +
        doneActionsHtml("fcMtAgain") + "</div>";
      bindDoneActions("fcMtAgain");
    }
    function finish() {
      setPhase("done");
      halt();
      var total = splits.length ? splits[splits.length - 1] : elapsed();
      if (splitEl) splitEl.hidden = true;
      clockEl.textContent = formatClock(total);
      clockEl.classList.add("fc-ws-count-done");
      var key = matchBestKey(p), best = bestTime(key);
      var isBest = typeof best !== "number" || total < best;
      var run = recordRun({ mode: "match", n: p.placements.length, ms: total, miss: misses, setup: key, splits: splits, missed: Object.keys(missedIds) });
      var pairs = p.placements.length;
      var missText = misses === 0 ? "no misses" : misses + (misses === 1 ? " miss" : " misses");
      var delta = typeof best !== "number" ? ""
        : isBest ? ((best - total) / 1000).toFixed(1) + "s faster than before · "
        : ((total - best) / 1000).toFixed(1) + "s off your best · ";
      boardEl.innerHTML = '<div class="fc-mt-done fc-mt-finish" role="status">' +
        '<p class="fc-mt-done-time">' + formatClock(total) + "</p>" +
        (isBest ? '<p class="fc-mt-badge">' + STAR_ICON + "New best</p>" : "") +
        '<p class="fc-mt-done-meta fc-mt-delta">' + delta + pairs + " pairs · " + missText + "</p>" +
        paceRingHtml(total / pairs / 1000) +
        matchHistoryHtml(key, total, run) +
        doneActionsHtml("fcMtAgain") + "</div>";
      countUpClock(boardEl.querySelector(".fc-mt-done-time"), total);
      bindDoneActions("fcMtAgain");
    }
    function select(tile) {
      if (selected) selected.setAttribute("aria-pressed", "false");
      selected = tile;
      if (tile) tile.setAttribute("aria-pressed", "true");
    }
    boardEl.addEventListener("click", function (e) {
      var tile = e.target.closest(".fc-mt-tile");
      if (!tile || tile.disabled || phase !== "play") return;
      if (runAt === null) { started = true; run(); }
      // Nothing picked yet, or another tile on the same side: (re)pick it.
      // Tapping the picked tile again lets it go.
      if (!selected || selected.dataset.side === tile.dataset.side) {
        select(selected === tile ? null : tile);
        return;
      }
      var a = selected, pair = [a, tile], thisGame = game;
      select(null);
      if (a.dataset.i === tile.dataset.i) {
        pair.forEach(function (t) { t.classList.add("fc-mt-right"); t.disabled = true; });
        setTimeout(function () { pair.forEach(function (t) { t.classList.add("fc-mt-gone"); }); }, 250);
        if (--left) return;
        // The round's split is when its last pair cleared, not after the
        // short pause before the next round appears.
        var at = elapsed();
        splits.push(at);
        halt();
        setPhase("between");
        if (round + 1 < p.rounds.length) showSplit(round, at);
        setTimeout(function () {
          if (thisGame !== game || !boardEl.isConnected) return;
          if (round + 1 < p.rounds.length) roundBreak(); else finish();
        }, 350);
      } else {
        penalty += MATCH_PENALTY_MS;
        misses++;
        roundMisses++;
        // Both words of a wrong pair count as missed: the reading you
        // didn't know, and the meaning you took it for.
        pair.forEach(function (t) { missedIds[p.rounds[round][+t.dataset.i].id] = true; });
        tick();
        pair.forEach(function (t) { t.classList.remove("fc-mt-wrong"); void t.offsetWidth; t.classList.add("fc-mt-wrong"); });
        setTimeout(function () { pair.forEach(function (t) { t.classList.remove("fc-mt-wrong"); }); }, 450);
      }
    });
    // Same words, reshuffled, clock back to zero.
    function restart() {
      stopMatchTimer();
      game++;
      hidePauseCard(boardEl);
      round = 0; acc = 0; runAt = null; started = false; penalty = 0; misses = 0; splits = []; missedIds = {};
      pb = bestSplits(matchBestKey(p), p.rounds.length);
      if (splitEl) splitEl.hidden = true;
      clockEl.textContent = formatClock(0);
      clockEl.classList.remove("fc-ws-count-done");
      renderRound();
    }
    restart();
    var api = { restart: restart, pause: pause };
    activeGame = api;
    return api;
  }

  // -----------------------------------------------------------------------
  // Listening -- the app says a word (RaumeStudy.shared.speech: the same
  // prerendered clip or Japanese voice the speaker buttons use) and you pick
  // its English from four. Nothing written shows until you answer; then the
  // word appears as written, with its kana and romaji, so the sound gets
  // tied to the word. A right answer moves on by itself; a wrong one waits
  // for Next. Practice only, like Match -- never an FSRS review.
  // -----------------------------------------------------------------------
  var LISTEN_CHOICES = 4;
  // Each question's wrong choices: other words from the same table first
  // (a clue from another topic is too easy to rule out), never two with the
  // same English -- the choices would be a coin toss.
  function buildListening(words, limit) {
    var picked = weightedOrder(words).slice(0, limit);
    var questions = picked.map(function (w) {
      var used = {};
      used[w.clue.toLowerCase()] = true;
      var others = shuffle(words.filter(function (o) { return o.id !== w.id; }));
      var sameTable = others.filter(function (o) { return o.tableId === w.tableId; });
      var rest = others.filter(function (o) { return o.tableId !== w.tableId; });
      var wrong = [];
      sameTable.concat(rest).some(function (o) {
        var key = o.clue.toLowerCase();
        if (used[key]) return false;
        used[key] = true;
        wrong.push(o);
        return wrong.length === LISTEN_CHOICES - 1;
      });
      return { word: w, choices: shuffle([w].concat(wrong)) };
    });
    return { placements: picked, questions: questions };
  }
  // The triangle's box runs x 8-21; the viewBox shifts it so that box
  // sits 1px right of centre -- a play glyph's optical centre, as SF
  // Symbols' play.fill -- with no padding on the button to throw it off.
  var PLAY_ICON = '<svg viewBox="1.5 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z"/></svg>';
  var SPEAKER_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 7v4h3l4 3V4L5 7H2Z"/><path d="M12 6.3a3 3 0 0 1 0 5.4"/><path d="M14.2 4.3a6 6 0 0 1 0 9.4"/></svg>';
  function speakWord(w) { window.RaumeStudy.shared.speech.speak(w.speak || w.answer); }
  // Sound comes from a prerendered clip or the device's Japanese voice;
  // js/shared.js marks the page once either is confirmed.
  function canSpeak() { return document.body.classList.contains("ja-voice-ready"); }
  // The word as written, its kana and its romaji -- shown once answered.
  function spokenWordHtml(w) {
    var entry = vocabIndex()[w.id] || {};
    var written = String(entry.jpPlain || w.answer).replace(/^〜/, "");
    var romaji = String(entry.romajiDisplay || "").split(" / ")[0];
    return '<span class="fc-ls-written" lang="ja">' + esc(written) + "</span>" +
      '<span class="fc-ls-sub"><span lang="ja">' + (written !== w.answer ? esc(w.answer) + " · " : "") + "</span>" + esc(romaji) + "</span>";
  }
  function wireListening(boardEl, countEl, p) {
    // `pausedMs`: time spent on the pause card, left out of the game's time.
    var at, score, missed, game = 0, played, startedAt, pausedMs, pausedAt, done, pendingNext, streak = streakMeter();
    function count() { setCount(countEl, Math.min(at + 1, p.questions.length), p.questions.length); }
    function renderQuestion() {
      var q = p.questions[at];
      count();
      boardEl.innerHTML =
        '<div class="fc-ls-card">' +
        '<button type="button" class="fc-ls-play" aria-label="' + (played ? "Play the word again" : "Play the word") + '">' + PLAY_ICON + "</button>" +
        '<p class="fc-ls-hint">' + (played ? "Tap to hear it again" : "Tap to listen") + "</p>" +
        '<p class="fc-ls-word" aria-live="polite" hidden></p></div>' +
        '<div class="fc-ls-choices">' + q.choices.map(function (c, i) {
          return '<button type="button" class="fc-mt-tile fc-ls-choice" data-i="' + i + '">' + esc(c.clue) + "</button>";
        }).join("") + "</div>" +
        '<div class="fc-ls-next-row"><button type="button" class="fc-btn fc-btn-primary fc-ls-next" hidden>Next</button></div>';
    }
    function next() {
      at++;
      if (at >= p.questions.length) { finish(); return; }
      renderQuestion();
      // Straight on to the next sound. A browser that wants a fresh tap for
      // audio just stays quiet here -- the ▶ is right there.
      speakWord(p.questions[at].word);
    }
    function answer(btn) {
      var q = p.questions[at], chosen = q.choices[+btn.dataset.i], right = chosen === q.word, thisGame = game, rightBtn = null;
      boardEl.querySelectorAll(".fc-ls-choice").forEach(function (b) {
        b.disabled = true;
        if (q.choices[+b.dataset.i] === q.word) { b.classList.add("fc-mt-right"); rightBtn = b; }
      });
      if (!right) btn.classList.add("fc-mt-wrong", "fc-ls-chosen-wrong");
      answerFeel(rightBtn, btn);
      streak.hit(right);
      var word = boardEl.querySelector(".fc-ls-word");
      word.innerHTML = spokenWordHtml(q.word);
      word.hidden = false;
      boardEl.querySelector(".fc-ls-hint").hidden = true;
      if (right) {
        score++;
        // Paused in the moment before it moves on: it moves on at Resume.
        setTimeout(function () {
          if (thisGame !== game || !boardEl.isConnected) return;
          if (pausedAt !== null) pendingNext = true; else next();
        }, 1100);
      } else {
        missed.push(q.word);
        var nextBtn = boardEl.querySelector(".fc-ls-next");
        nextBtn.hidden = false;
        nextBtn.focus();
      }
    }
    function pause() {
      if (done || pausedAt !== null || !boardEl.isConnected) return;
      pausedAt = Date.now();
      showPauseCard(boardEl, Math.min(at + 1, p.questions.length) + " / " + p.questions.length,
        score + " right so far", {
        resume: function () {
          pausedMs += Date.now() - pausedAt; pausedAt = null; hidePauseCard(boardEl);
          if (pendingNext) { pendingNext = false; next(); }
        },
        restart: restart,
        end: endEarly
      });
    }
    // Stopped part-way: the words you answered count (logged as ended, so
    // never a best -- see Match's).
    function endEarly() {
      done = true;
      document.getElementById("fcMtPause").disabled = true;
      var answered = at + (boardEl.querySelector(".fc-ls-choice:disabled") ? 1 : 0);
      if (answered) recordRun({ mode: "listening", n: answered, ms: (pausedAt || Date.now()) - startedAt - pausedMs, right: score,
        setup: setupKey(p.questions.length), missed: missed.map(function (w) { return w.id; }), ended: true });
      countEl.classList.add("fc-ws-count-done");
      boardEl.classList.remove("fc-mt-paused");
      boardEl.innerHTML = '<div class="fc-mt-done" role="status">' +
        '<p class="fc-mt-done-time">' + score + " / " + answered + "</p>" +
        '<p class="fc-mt-done-meta">Ended after ' + answered + " of " + p.questions.length + " words</p>" +
        '<p class="fc-mt-done-note">' + (answered ? "The " + answered + (answered === 1 ? " word" : " words") + " you answered count in your stats."
          : "No word answered, so nothing is counted.") + "</p>" +
        doneActionsHtml("fcLsAgain") + "</div>";
      bindDoneActions("fcLsAgain");
    }
    function finish() {
      done = true;
      document.getElementById("fcMtPause").disabled = true;
      var run = recordRun({ mode: "listening", n: p.questions.length, ms: Date.now() - startedAt - pausedMs, right: score,
        setup: setupKey(p.questions.length), missed: missed.map(function (w) { return w.id; }) });
      countEl.textContent = score + " / " + p.questions.length;
      countEl.classList.add("fc-ws-count-done");
      boardEl.innerHTML = '<div class="fc-mt-done" role="status">' +
        '<p class="fc-mt-done-time">' + score + " / " + p.questions.length + "</p>" +
        accuracyStatsHtml("listening", score, p.questions.length, run) +
        '<p class="fc-mt-done-meta">' + (missed.length ? "Words to listen to again:" : "Every word right") + "</p>" +
        (missed.length ? '<ul class="fc-ls-missed">' + missed.map(function (w, i) {
          return '<li><button type="button" class="fc-ls-say" data-m="' + i + '" aria-label="Play">' + SPEAKER_ICON + "</button>" +
            '<span class="fc-ls-missed-word">' + spokenWordHtml(w) + '</span><span class="fc-ls-missed-en">' + esc(w.clue) + "</span></li>";
        }).join("") + "</ul>" : "") +
        doneActionsHtml("fcLsAgain") + "</div>";
      bindDoneActions("fcLsAgain");
    }
    boardEl.addEventListener("click", function (e) {
      if (e.target.closest(".fc-ls-play")) {
        speakWord(p.questions[at].word);
        if (!played) {
          played = true;
          boardEl.querySelector(".fc-ls-hint").textContent = "Tap to hear it again";
          boardEl.querySelector(".fc-ls-play").setAttribute("aria-label", "Play the word again");
        }
        return;
      }
      var choice = e.target.closest(".fc-ls-choice");
      if (choice && !choice.disabled) { answer(choice); return; }
      if (e.target.closest(".fc-ls-next")) { next(); return; }
      var say = e.target.closest(".fc-ls-say");
      if (say) speakWord(missed[+say.dataset.m]);
    });
    // Same words, same questions, from the top.
    function restart() {
      game++;
      hidePauseCard(boardEl);
      at = 0; score = 0; missed = []; played = false; startedAt = Date.now(); pausedMs = 0; pausedAt = null; done = false; pendingNext = false;
      streak.reset();
      var pb = document.getElementById("fcMtPause");
      if (pb) pb.disabled = false;
      countEl.classList.remove("fc-ws-count-done");
      renderQuestion();
    }
    restart();
    var api = { restart: restart, pause: pause };
    activeGame = api;
    return api;
  }

  // -----------------------------------------------------------------------
  // Kana tiles -- spell the word. The English (and ▶ to hear it) on top;
  // under it one slot per kana, and a bank of tiles: the word's own kana,
  // shuffled, plus a few decoys that look or sound close (ぬ/め, シ/ツ, a
  // dakuten pair). Tap tiles in order; tap a placed one to take it back.
  // The last slot filled checks it: right moves on by itself; wrong shakes,
  // shows the spelling, waits for Next and brings the word back once at the
  // end of the round. Small ゃゅょっ and ー are tiles of their own. Only
  // words really written in the script (as the grids' Hiragana/Katakana).
  // Practice only -- never an FSRS review.
  // -----------------------------------------------------------------------
  var KT_DECOYS = 3;
  // Look- and sound-alikes, per script (katakana's shapes aren't
  // hiragana's), then the voiced / small pairs every script shares.
  var KT_LOOKALIKE = {
    hiragana: ["ぬめ", "ねれわ", "るろ", "はほけ", "さちき", "いり", "こに", "あおめ", "くへ", "しつ", "そろ", "たな", "まも", "うつ"],
    katakana: ["シツ", "ソン", "クタケ", "ウワフ", "コユロ", "ナメ", "マアム", "チテ", "ヌス", "ヲラ", "セヤ", "ホネ", "ノメ", "レル"]
  };
  var KT_PAIRS = ["かが", "きぎ", "くぐ", "けげ", "こご", "さざ", "しじ", "すず", "せぜ", "そぞ", "ただ", "ちぢ", "つづっ", "てで", "とど",
    "はばぱ", "ひびぴ", "ふぶぷ", "へべぺ", "ほぼぽ", "やゃ", "ゆゅ", "よょ", "おを", "ずづ", "じぢ"];
  var KT_FILL = { hiragana: "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん",
    katakana: "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン" };
  function kanaDecoys(chars, script) {
    var inWord = {}, near = {};
    chars.forEach(function (c) { inWord[c] = true; });
    var groups = KT_LOOKALIKE[script].concat(KT_PAIRS.map(function (g) { return scriptedAnswer(g, script); }));
    chars.forEach(function (c) {
      groups.forEach(function (g) { if (g.indexOf(c) !== -1) Array.from(g).forEach(function (o) { if (!inWord[o]) near[o] = true; }); });
    });
    var picks = shuffle(Object.keys(near)).slice(0, KT_DECOYS);
    // Too few near ones (a word of ー and ん): top up from the plain row.
    shuffle(Array.from(KT_FILL[script])).some(function (c) {
      if (picks.length >= KT_DECOYS) return true;
      if (!inWord[c] && picks.indexOf(c) === -1) picks.push(c);
      return false;
    });
    return picks;
  }
  function buildKanaTiles(words, limit, script) {
    var picked = weightedOrder(words).slice(0, limit);
    return {
      placements: picked,
      questions: picked.map(function (w) {
        var chars = Array.from(w.answer);
        return { word: w, chars: chars, tiles: shuffle(chars.concat(kanaDecoys(chars, script))) };
      })
    };
  }
  function wireKanaTiles(boardEl, countEl, p) {
    // `queue`: the questions still to go -- a missed word goes back on the
    // end, once. `placed`: the bank indexes in the slots, in order.
    var queue, at, score, missed, retried, placed, game = 0, startedAt, pausedMs, pausedAt, done, locked, streak = streakMeter();
    var total = p.questions.length;
    function count() { setCount(countEl, Math.min(at + 1, total), total); }
    function q() { return queue[0]; }
    function render() {
      var cur = q();
      count();
      placed = [];
      locked = false;
      boardEl.innerHTML =
        '<div class="fc-ls-card fc-kt-card">' +
        '<p class="fc-kt-clue">' + esc(cur.word.clue) + "</p>" +
        (canSpeak() ? '<button type="button" class="fc-kt-say" aria-label="Hear it">' + SPEAKER_ICON + "</button>" : "") +
        '<div class="fc-kt-slots" aria-label="Your spelling">' + cur.chars.map(function (c, i) {
          return '<button type="button" class="fc-kt-slot" data-slot="' + i + '" lang="ja" aria-label="Empty"></button>';
        }).join("") + "</div>" +
        '<p class="fc-kt-answer" aria-live="polite" hidden></p></div>' +
        // Balanced rows, at most 5 tiles each (a phone's width): 6 tiles
        // sit 3 + 3 and 7 sit 4 + 3, never one left alone on a row.
        '<div class="fc-kt-bank" data-cols="' + Math.ceil(cur.tiles.length / Math.ceil(cur.tiles.length / 5)) + '">' + cur.tiles.map(function (c, i) {
          return '<button type="button" class="fc-kt-tile" data-t="' + i + '" lang="ja">' + esc(c) + "</button>";
        }).join("") + "</div>" +
        '<div class="fc-ls-next-row"><button type="button" class="fc-btn fc-btn-primary fc-ls-next" hidden>Next</button></div>';
    }
    function drawSlots() {
      var cur = q();
      boardEl.querySelectorAll(".fc-kt-slot").forEach(function (slot, i) {
        var t = placed[i];
        slot.textContent = t === undefined ? "" : cur.tiles[t];
        slot.classList.toggle("fc-kt-filled", t !== undefined);
        slot.setAttribute("aria-label", t === undefined ? "Empty" : cur.tiles[t]);
      });
      boardEl.querySelectorAll(".fc-kt-tile").forEach(function (tile) {
        tile.disabled = placed.indexOf(+tile.dataset.t) !== -1;
      });
    }
    function check() {
      var cur = q(), spelled = placed.map(function (t) { return cur.tiles[t]; }).join("");
      var right = spelled === cur.word.answer, thisGame = game;
      locked = true;
      var slots = boardEl.querySelector(".fc-kt-slots");
      streak.hit(right);
      if (right) {
        slots.classList.add("fc-kt-right");
        if (!retried[cur.word.id]) score++;
        setTimeout(function () {
          if (thisGame !== game || !boardEl.isConnected) return;
          if (pausedAt !== null) { pendingNext = true; return; }
          next();
        }, 900);
        return;
      }
      slots.classList.add("fc-kt-wrong");
      if (!retried[cur.word.id]) {
        missed.push(cur.word);
        retried[cur.word.id] = true;
        queue.push(cur);
      }
      var ans = boardEl.querySelector(".fc-kt-answer");
      ans.innerHTML = spokenWordHtml(cur.word);
      ans.hidden = false;
      boardEl.querySelectorAll(".fc-kt-tile").forEach(function (t) { t.disabled = true; });
      var nextBtn = boardEl.querySelector(".fc-ls-next");
      nextBtn.hidden = false;
      nextBtn.focus();
    }
    var pendingNext = false;
    function next() {
      queue.shift();
      at++;
      if (!queue.length) { finish(); return; }
      render();
    }
    boardEl.addEventListener("click", function (e) {
      if (done) return;
      if (e.target.closest(".fc-ls-next")) { next(); return; }
      if (e.target.closest(".fc-kt-say")) { speakWord(q().word); return; }
      if (locked) return;
      var tile = e.target.closest(".fc-kt-tile");
      if (tile && !tile.disabled) {
        placed.push(+tile.dataset.t);
        drawSlots();
        if (placed.length === q().chars.length) check();
        return;
      }
      // A placed tile goes back to the bank, and so does every one after
      // it -- a spelling is a sequence, not loose letters.
      var slot = e.target.closest(".fc-kt-slot.fc-kt-filled");
      if (slot) { placed = placed.slice(0, +slot.dataset.slot); drawSlots(); }
    });
    function stats(right, n, run) { return accuracyStatsHtml("kanatiles", right, n, run); }
    function finish() {
      done = true;
      document.getElementById("fcMtPause").disabled = true;
      var run = recordRun({ mode: "kanatiles", n: total, ms: Date.now() - startedAt - pausedMs, right: score,
        setup: setupKey(total), missed: missed.map(function (w) { return w.id; }) });
      countEl.textContent = score + " / " + total;
      countEl.classList.add("fc-ws-count-done");
      boardEl.innerHTML = '<div class="fc-mt-done" role="status">' +
        '<p class="fc-mt-done-time">' + score + " / " + total + "</p>" +
        stats(score, total, run) +
        '<p class="fc-mt-done-meta">' + (missed.length ? "Words to spell again:" : "Every word right first time") + "</p>" +
        (missed.length ? '<ul class="fc-ls-missed">' + missed.map(function (w) {
          return '<li><span class="fc-ls-missed-word">' + spokenWordHtml(w) + '</span><span class="fc-ls-missed-en">' + esc(w.clue) + "</span></li>";
        }).join("") + "</ul>" : "") +
        doneActionsHtml("fcKtAgain") + "</div>";
      bindDoneActions("fcKtAgain");
    }
    function pause() {
      if (done || pausedAt !== null || !boardEl.isConnected) return;
      pausedAt = Date.now();
      showPauseCard(boardEl, Math.min(at + 1, total) + " / " + total, score + " right so far", {
        resume: function () {
          pausedMs += Date.now() - pausedAt; pausedAt = null; hidePauseCard(boardEl);
          if (pendingNext) { pendingNext = false; next(); }
        },
        restart: restart,
        end: endEarly
      });
    }
    // Stopped part-way: the words you finished count (see Listening's).
    function endEarly() {
      done = true;
      document.getElementById("fcMtPause").disabled = true;
      var answered = Math.min(at + (locked ? 1 : 0), total);
      if (answered) recordRun({ mode: "kanatiles", n: answered, ms: (pausedAt || Date.now()) - startedAt - pausedMs, right: score,
        setup: setupKey(total), missed: missed.map(function (w) { return w.id; }), ended: true });
      countEl.classList.add("fc-ws-count-done");
      boardEl.classList.remove("fc-mt-paused");
      boardEl.innerHTML = '<div class="fc-mt-done" role="status">' +
        '<p class="fc-mt-done-time">' + score + " / " + answered + "</p>" +
        '<p class="fc-mt-done-meta">Ended after ' + answered + " of " + total + " words</p>" +
        '<p class="fc-mt-done-note">' + (answered ? "The " + answered + (answered === 1 ? " word" : " words") + " you finished count in your stats."
          : "No word finished, so nothing is counted.") + "</p>" +
        doneActionsHtml("fcKtAgain") + "</div>";
      bindDoneActions("fcKtAgain");
    }
    function restart() {
      game++;
      hidePauseCard(boardEl);
      queue = p.questions.slice(); at = 0; score = 0; missed = []; retried = {};
      streak.reset();
      startedAt = Date.now(); pausedMs = 0; pausedAt = null; done = false; pendingNext = false;
      var pb = document.getElementById("fcMtPause");
      if (pb) pb.disabled = false;
      countEl.classList.remove("fc-ws-count-done");
      render();
    }
    restart();
    var api = { restart: restart, pause: pause };
    activeGame = api;
    return api;
  }

  // -----------------------------------------------------------------------
  // Odd one out -- four words, three from one table and one from another:
  // tap the one that doesn't belong. Words only (in the chosen script) --
  // knowing what they mean is the game. The answer shows every English and
  // names the tables ("くつ is Clothes -- the rest are Fruits"). The odd
  // word comes from another category where there is one (Clothes among
  // Fruits, not Vegetables), and a word that sits in more than one table,
  // or shares its English with another table's word, never plays -- a set
  // must have one right answer. Practice only, like Match.
  // -----------------------------------------------------------------------
  function tableInfo(id) {
    var t = (window.RaumeStudy.data.vocabularyTables || []).filter(function (x) { return String(x.id) === String(id); })[0];
    var custom = window.RaumeStudy.tableCustom && window.RaumeStudy.tableCustom.nameOf(id);
    return { name: custom || (t && t.title) || "another table", category: (t && t.category) || "" };
  }
  function buildOddOne(words, limit) {
    // Anything that turns up in two tables (by English or by spelling) is
    // ambiguous -- which table is it "from"? -- so it sits out.
    var tablesOf = {};
    words.forEach(function (w) {
      [w.clue.toLowerCase(), w.answer].forEach(function (k) {
        (tablesOf[k] = tablesOf[k] || {})[w.tableId] = true;
      });
    });
    var clean = words.filter(function (w) {
      return Object.keys(tablesOf[w.clue.toLowerCase()]).length === 1 && Object.keys(tablesOf[w.answer]).length === 1;
    });
    var byTable = {};
    clean.forEach(function (w) { (byTable[w.tableId] = byTable[w.tableId] || []).push(w); });
    var tableIds = Object.keys(byTable);
    var bases = tableIds.filter(function (id) { return byTable[id].length >= 3; });
    if (!bases.length || tableIds.length < 2) return { placements: [], questions: [], clean: clean.length };
    var questions = [], usedOdd = {};
    for (var n = 0; n < limit; n++) {
      var base = bases[Math.floor(Math.random() * bases.length)];
      var others = tableIds.filter(function (id) { return id !== base; });
      var baseCat = tableInfo(base).category;
      var farther = others.filter(function (id) { return tableInfo(id).category !== baseCat; });
      var oddTable = shuffle(farther.length ? farther : others)[0];
      // A fresh odd word each set while there are any left.
      var oddPool = byTable[oddTable].filter(function (w) { return !usedOdd[w.id]; });
      var odd = shuffle(oddPool.length ? oddPool : byTable[oddTable])[0];
      usedOdd[odd.id] = true;
      var three = shuffle(byTable[base]).slice(0, 3);
      var set = shuffle(three.concat([odd]));
      questions.push({ words: set, odd: set.indexOf(odd), baseTable: base, oddTable: oddTable });
    }
    return { placements: questions.map(function (q) { return q.words[q.odd]; }), questions: questions, clean: clean.length };
  }
  function wireOddOne(boardEl, countEl, p, romajiMode) {
    var at, score, missed, game = 0, startedAt, pausedMs, pausedAt, done, answered, pendingNext, streak = streakMeter();
    var total = p.questions.length;
    function count() { setCount(countEl, Math.min(at + 1, total), total); }
    function render() {
      var q = p.questions[at];
      count();
      answered = false;
      boardEl.innerHTML =
        '<p class="fc-oo-ask">Which one doesn’t belong?</p>' +
        '<div class="fc-oo-grid">' + q.words.map(function (w, i) {
          return '<button type="button" class="fc-mt-tile fc-oo-word" data-i="' + i + '">' +
            '<span class="fc-oo-w"' + (romajiMode ? "" : ' lang="ja"') + ">" + esc(w.answer) + "</span>" +
            '<span class="fc-oo-en" hidden>' + esc(w.clue) + "</span></button>";
        }).join("") + "</div>" +
        '<p class="fc-oo-reveal" aria-live="polite" hidden></p>' +
        '<div class="fc-ls-next-row"><button type="button" class="fc-btn fc-btn-primary fc-ls-next" hidden>Next</button></div>';
    }
    function answer(btn) {
      var q = p.questions[at], i = +btn.dataset.i, right = i === q.odd, thisGame = game;
      answered = true;
      boardEl.querySelectorAll(".fc-oo-word").forEach(function (b) {
        b.disabled = true;
        b.querySelector(".fc-oo-en").hidden = false;
        if (+b.dataset.i === q.odd) b.classList.add("fc-mt-right");
      });
      if (!right) btn.classList.add("fc-mt-wrong", "fc-ls-chosen-wrong");
      answerFeel(boardEl.querySelector('.fc-oo-word[data-i="' + q.odd + '"]'), btn);
      streak.hit(right);
      var oddWord = q.words[q.odd];
      var reveal = boardEl.querySelector(".fc-oo-reveal");
      reveal.innerHTML = '<span' + (romajiMode ? "" : ' lang="ja"') + ">" + esc(oddWord.answer) + "</span> is " +
        esc(tableInfo(q.oddTable).name) + " — the rest are " + esc(tableInfo(q.baseTable).name) + ".";
      reveal.hidden = false;
      if (right) {
        score++;
        setTimeout(function () {
          if (thisGame !== game || !boardEl.isConnected) return;
          if (pausedAt !== null) pendingNext = true; else next();
        }, 1600);
      } else {
        missed.push(oddWord);
        var nextBtn = boardEl.querySelector(".fc-ls-next");
        nextBtn.hidden = false;
        nextBtn.focus();
      }
    }
    function next() {
      at++;
      if (at >= total) { finish(); return; }
      render();
    }
    boardEl.addEventListener("click", function (e) {
      if (done) return;
      if (e.target.closest(".fc-ls-next")) { next(); return; }
      var btn = e.target.closest(".fc-oo-word");
      if (btn && !btn.disabled && !answered) answer(btn);
    });
    function missedHtml() {
      return missed.length ? '<ul class="fc-ls-missed">' + missed.map(function (w) {
        return '<li><span class="fc-ls-missed-word">' + spokenWordHtml(w) + '</span><span class="fc-ls-missed-en">' + esc(w.clue) + "</span></li>";
      }).join("") + "</ul>" : "";
    }
    function finish() {
      done = true;
      document.getElementById("fcMtPause").disabled = true;
      var run = recordRun({ mode: "oddone", n: total, ms: Date.now() - startedAt - pausedMs, right: score,
        setup: setupKey(total), missed: missed.map(function (w) { return w.id; }) });
      countEl.textContent = score + " / " + total;
      countEl.classList.add("fc-ws-count-done");
      boardEl.innerHTML = '<div class="fc-mt-done" role="status">' +
        '<p class="fc-mt-done-time">' + score + " / " + total + "</p>" +
        accuracyStatsHtml("oddone", score, total, run) +
        '<p class="fc-mt-done-meta">' + (missed.length ? "Odd ones you missed:" : "Every set right") + "</p>" +
        missedHtml() + doneActionsHtml("fcOoAgain") + "</div>";
      bindDoneActions("fcOoAgain");
    }
    function pause() {
      if (done || pausedAt !== null || !boardEl.isConnected) return;
      pausedAt = Date.now();
      showPauseCard(boardEl, Math.min(at + 1, total) + " / " + total, score + " right so far", {
        resume: function () {
          pausedMs += Date.now() - pausedAt; pausedAt = null; hidePauseCard(boardEl);
          if (pendingNext) { pendingNext = false; next(); }
        },
        restart: restart,
        end: endEarly
      });
    }
    // Stopped part-way: the sets you answered count (see Listening's).
    function endEarly() {
      done = true;
      document.getElementById("fcMtPause").disabled = true;
      var played = Math.min(at + (answered ? 1 : 0), total);
      if (played) recordRun({ mode: "oddone", n: played, ms: (pausedAt || Date.now()) - startedAt - pausedMs, right: score,
        setup: setupKey(total), missed: missed.map(function (w) { return w.id; }), ended: true });
      countEl.classList.add("fc-ws-count-done");
      boardEl.classList.remove("fc-mt-paused");
      boardEl.innerHTML = '<div class="fc-mt-done" role="status">' +
        '<p class="fc-mt-done-time">' + score + " / " + played + "</p>" +
        '<p class="fc-mt-done-meta">Ended after ' + played + " of " + total + " sets</p>" +
        '<p class="fc-mt-done-note">' + (played ? "The " + played + (played === 1 ? " set" : " sets") + " you answered count in your stats."
          : "No set answered, so nothing is counted.") + "</p>" +
        doneActionsHtml("fcOoAgain") + "</div>";
      bindDoneActions("fcOoAgain");
    }
    function restart() {
      game++;
      hidePauseCard(boardEl);
      at = 0; score = 0; missed = []; startedAt = Date.now(); pausedMs = 0; pausedAt = null; done = false; pendingNext = false;
      streak.reset();
      var pb = document.getElementById("fcMtPause");
      if (pb) pb.disabled = false;
      countEl.classList.remove("fc-ws-count-done");
      render();
    }
    restart();
    var api = { restart: restart, pause: pause };
    activeGame = api;
    return api;
  }

  // -----------------------------------------------------------------------
  // Speed sort -- words one at a time, each tapped into its bucket against
  // the clock: by table (Fruits / Clothes / Time), い- or な-adjective, or
  // u-verb / ru-verb / irregular verb (English names -- the kanji terms are
  // the reference tables' badges, not a game's labels). A wrong bucket adds
  // a second, as in Match, shakes, and rings the right one. Either way the
  // word's English shows under it, with the clock stopped, long enough to
  // read before the next word -- or Next (Enter) goes on at once.
  // A sort is only offered when the words hold enough of each kind.
  // Practice only.
  // -----------------------------------------------------------------------
  var SORT_OPTS = [["tables", "Tables"], ["adj", "Adjectives"], ["verb", "Verbs"]];
  var SORT_MIN = 3;
  function rawRow(id) { return S.vocabIndex.getRawVocabRow ? S.vocabIndex.getRawVocabRow(id) : null; }
  // The buckets a sort would use for these words, or null when it can't
  // be played from them.
  function sortBuckets(words, by) {
    var groups = {};
    words.forEach(function (w) {
      var key = null;
      if (by === "tables") key = String(w.tableId);
      else {
        var row = rawRow(w.id) || {};
        key = by === "adj" ? (row.adj === "i" || row.adj === "na" ? row.adj : null)
          : (row.verbClass === "godan" || row.verbClass === "ichidan" || row.verbClass === "irregular" ? row.verbClass : null);
      }
      if (key !== null) (groups[key] = groups[key] || []).push(w);
    });
    var keys;
    if (by === "tables") {
      // Two or three tables with enough words, from different categories
      // where they can be (Clothes and Time, not Fruits and Vegetables).
      var roomy = shuffle(Object.keys(groups).filter(function (k) { return groups[k].length >= SORT_MIN; }));
      keys = [];
      roomy.forEach(function (k) {
        if (keys.length >= 3) return;
        var cat = tableInfo(k).category;
        if (keys.every(function (o) { return tableInfo(o).category !== cat; })) keys.push(k);
      });
      roomy.forEach(function (k) { if (keys.length < 2 && keys.indexOf(k) === -1) keys.push(k); });
      if (keys.length < 2) return null;
    } else if (by === "adj") {
      keys = ["i", "na"];
      if (keys.some(function (k) { return !groups[k] || groups[k].length < SORT_MIN; })) return null;
    } else {
      if (!groups.godan || !groups.ichidan || groups.godan.length < SORT_MIN || groups.ichidan.length < SORT_MIN) return null;
      // Only a couple of verbs are irregular; a third bucket once there are two.
      keys = ["godan", "ichidan"].concat(groups.irregular && groups.irregular.length >= 2 ? ["irregular"] : []);
    }
    var LABELS = { i: "い-adjective", na: "な-adjective", godan: "u-verb", ichidan: "ru-verb", irregular: "irregular verb" };
    return keys.map(function (k) { return { key: k, label: by === "tables" ? tableInfo(k).name : LABELS[k], words: groups[k] }; });
  }
  function sortOpts(words) { return SORT_OPTS.filter(function (o) { return !!sortBuckets(words, o[0]); }); }
  function buildSpeedSort(words, limit, by) {
    var buckets = sortBuckets(words, by);
    if (!buckets) return { placements: [], items: [], buckets: [] };
    // A word whose English is its table's own name (かぞく "family" into
    // Family, くだもの "fruit" into Fruits) sorts itself -- it sits out.
    function stem(t) { return String(t).toLowerCase().replace(/\s*\(.*\)$/, "").replace(/s$/, "").trim(); }
    var pool = [];
    buckets.forEach(function (b, bi) {
      b.words.forEach(function (w) { if (by !== "tables" || stem(w.clue) !== stem(b.label)) pool.push({ word: w, bucket: bi }); });
    });
    var items = weightedOrder(pool, function (it) { return it.word.weight || 1; }).slice(0, limit);
    return { placements: items.map(function (it) { return it.word; }), items: items, buckets: buckets.map(function (b) { return { key: b.key, label: b.label }; }) };
  }
  // How long a sorted word's English stays up before the next word.
  var SORT_READ_MS = 3000, SORT_READ_WRONG_MS = 4500;
  function wireSpeedSort(boardEl, clockEl, p, romajiMode) {
    var at, acc, runAt, penalty, score, mistakes, game = 0, phase, pendingNext;
    var total = p.items.length;
    function elapsed() { return acc + (runAt === null ? 0 : Date.now() - runAt) + penalty; }
    function tick() { if (!clockEl.isConnected) { stopMatchTimer(); return; } clockEl.textContent = formatClock(elapsed()); }
    function run() { if (runAt !== null) return; runAt = Date.now(); if (!matchTimer) matchTimer = setInterval(tick, 100); }
    function halt() { if (runAt !== null) { acc += Date.now() - runAt; runAt = null; } stopMatchTimer(); tick(); }
    function setPhase(ph) {
      phase = ph;
      var btn = document.getElementById("fcMtPause");
      if (btn) btn.disabled = ph === "done";
    }
    // The English line and the Next row keep their space while hidden, so
    // the buckets never move when a word is answered.
    function render() {
      var it = p.items[at];
      setPhase("play");
      boardEl.innerHTML =
        '<div class="fc-ls-card fc-ss-card"><p class="fc-ss-count">' + (at + 1) + " of " + total + "</p>" +
        '<p class="fc-ss-word"' + (romajiMode ? "" : ' lang="ja"') + ">" + esc(it.word.answer) + "</p>" +
        '<p class="fc-ss-en" aria-live="polite"></p></div>' +
        '<div class="fc-ss-buckets" data-n="' + p.buckets.length + '">' + p.buckets.map(function (b, i) {
          return '<button type="button" class="fc-mt-tile fc-ss-bucket" data-b="' + i + '">' + esc(b.label) + "</button>";
        }).join("") + "</div>" +
        '<div class="fc-ls-next-row"><button type="button" class="fc-btn fc-btn-primary fc-ls-next" hidden>Next</button></div>';
    }
    function next() {
      at++;
      if (at >= total) { finish(); return; }
      render();
      run();
    }
    function answer(btn) {
      var it = p.items[at], chosen = +btn.dataset.b, thisGame = game, thisAt = at, right = chosen === it.bucket;
      setPhase("between");
      halt();
      boardEl.querySelectorAll(".fc-ss-bucket").forEach(function (b) { b.disabled = true; });
      if (right) {
        score++;
        btn.classList.add("fc-mt-right");
        answerFeel(btn, btn);
      } else {
        penalty += MATCH_PENALTY_MS;
        tick();
        mistakes.push({ word: it.word, chosen: chosen, right: it.bucket });
        btn.classList.add("fc-mt-wrong");
        var was = boardEl.querySelector('.fc-ss-bucket[data-b="' + it.bucket + '"]');
        was.classList.add("fc-ss-was");
        answerFeel(was, btn);
      }
      var en = boardEl.querySelector(".fc-ss-en");
      en.textContent = it.word.clue;
      en.classList.add("fc-ss-en-shown");
      var nextBtn = boardEl.querySelector(".fc-ls-next");
      nextBtn.hidden = false;
      nextBtn.focus();
      setTimeout(function () {
        if (thisGame !== game || thisAt !== at || !boardEl.isConnected || phase === "done") return;
        if (phase === "paused") pendingNext = true; else next();
      }, right ? SORT_READ_MS : SORT_READ_WRONG_MS);
    }
    boardEl.addEventListener("click", function (e) {
      if (e.target.closest(".fc-ls-next")) { if (phase === "between") next(); return; }
      var btn = e.target.closest(".fc-ss-bucket");
      if (btn && !btn.disabled && phase === "play") answer(btn);
    });
    function mistakesHtml() {
      return mistakes.length ? '<ul class="fc-ls-missed">' + mistakes.map(function (m) {
        return '<li><span class="fc-ls-missed-word">' + spokenWordHtml(m.word) + '</span><span class="fc-ls-missed-en">' +
          esc(p.buckets[m.right].label) + ", not " + esc(p.buckets[m.chosen].label) + "</span></li>";
      }).join("") + "</ul>" : "";
    }
    function finish() {
      setPhase("done");
      halt();
      var total_ms = elapsed();
      clockEl.classList.add("fc-ws-count-done");
      var run = recordRun({ mode: "speedsort", n: total, ms: total_ms, right: score, setup: setupKey(total) + "|" + state.sortBy,
        missed: mistakes.map(function (m) { return m.word.id; }) });
      boardEl.innerHTML = '<div class="fc-mt-done" role="status">' +
        '<p class="fc-mt-done-time">' + formatClock(total_ms) + "</p>" +
        '<p class="fc-mt-done-meta">' + score + " / " + total + " right · " + (mistakes.length === 1 ? "1 mistake" : mistakes.length + " mistakes") + "</p>" +
        accuracyStatsHtml("speedsort", score, total, run) +
        (mistakes.length ? '<p class="fc-mt-done-meta">Sorted the wrong way:</p>' : "") + mistakesHtml() +
        doneActionsHtml("fcSsAgain") + "</div>";
      bindDoneActions("fcSsAgain");
    }
    function pause() {
      if (phase === "done" || phase === "paused" || !boardEl.isConnected) return;
      var was = phase;
      setPhase("paused");
      halt();
      showPauseCard(boardEl, formatClock(elapsed()), (at + 1) + " of " + total, {
        resume: function () {
          // A word whose English is up keeps the clock stopped until Next.
          hidePauseCard(boardEl); setPhase(was);
          if (pendingNext) { pendingNext = false; next(); } else if (was === "play") run();
        },
        restart: restart,
        end: endEarly
      });
    }
    // Stopped part-way: the words you sorted count (see Listening's).
    function endEarly() {
      setPhase("done");
      halt();
      var sorted = score + mistakes.length;
      if (sorted) recordRun({ mode: "speedsort", n: sorted, ms: elapsed(), right: score, setup: setupKey(total) + "|" + state.sortBy,
        missed: mistakes.map(function (m) { return m.word.id; }), ended: true });
      clockEl.classList.add("fc-ws-count-done");
      boardEl.classList.remove("fc-mt-paused");
      boardEl.innerHTML = '<div class="fc-mt-done" role="status">' +
        '<p class="fc-mt-done-time">' + formatClock(elapsed()) + "</p>" +
        '<p class="fc-mt-done-meta">Ended after ' + sorted + " of " + total + " words · " + score + " right</p>" +
        '<p class="fc-mt-done-note">' + (sorted ? "The " + sorted + (sorted === 1 ? " word" : " words") + " you sorted count in your stats."
          : "No word sorted, so nothing is counted.") + "</p>" +
        doneActionsHtml("fcSsAgain") + "</div>";
      bindDoneActions("fcSsAgain");
    }
    function restart() {
      stopMatchTimer();
      game++;
      hidePauseCard(boardEl);
      at = 0; acc = 0; runAt = null; penalty = 0; score = 0; mistakes = []; pendingNext = false;
      clockEl.classList.remove("fc-ws-count-done");
      render();
      run();
    }
    restart();
    var api = { restart: restart, pause: pause };
    activeGame = api;
    return api;
  }

  // -----------------------------------------------------------------------
  // Word chain (しりとり) -- each word starts with the kana the one before
  // it ends on, and you type it: recall, not recognition. Romaji turns into
  // kana as you go (kanaRomaji.toKana, a Japanese keyboard's romaji input);
  // kana or kanji from a real Japanese keyboard work too. Any word in the
  // whole vocabulary counts, matched on its reading (katakana folded to
  // hiragana, ー read as the vowel it lengthens, so koohii is コーヒー) --
  // a small Words from pool rarely has a word for every kana; Words from
  // still picks the first word and the hints. The usual children's-game
  // rules: a final ー doesn't count (コーヒー ends on ひ), a final small
  // ゃゅょ counts as its big kana (でんしゃ ends on や), dakuten matter (か
  // is not が), and a word ending in ん can't be followed, so it can't be
  // played. A link is right made with no miss; a wrong try, a Hint or a
  // Skip makes it missed. Practice only.
  // -----------------------------------------------------------------------
  var CHAIN_MIN = 5;
  var SMALL_KANA = { "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お", "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "ゎ": "わ", "ゕ": "か", "ゖ": "け" };
  var VOWEL_ROWS = { "あ": "あかさたなはまやらわがざだばぱ", "い": "いきしちにひみりぎじぢびぴ", "う": "うくすつぬふむゆるぐずづぶぷ",
    "え": "えけせてねへめれげぜでべぺ", "お": "おこそとのほもよろをごぞどぼぽ" };
  function chainHead(reading) {
    var c = toHiragana(reading).charAt(0);
    return !c || SMALL_KANA[c] || c === "ー" || c === "ん" || c === "っ" ? null : c;
  }
  function chainTail(reading) {
    var h = toHiragana(reading).replace(/ー+$/, "");
    var c = h.charAt(h.length - 1);
    return !c || c === "っ" ? null : SMALL_KANA[c] || c;
  }
  // A reading as one comparable key: hiragana, ー spelled out as its vowel.
  function chainKey(s) {
    var h = toHiragana(String(s || "")), out = "";
    for (var i = 0; i < h.length; i++) {
      var c = h[i];
      if (c !== "ー") { out += c; continue; }
      var prev = out.charAt(out.length - 1);
      prev = SMALL_KANA[prev] || prev;
      out += Object.keys(VOWEL_ROWS).filter(function (v) { return VOWEL_ROWS[v].indexOf(prev) !== -1; })[0] || "";
    }
    return out;
  }
  // Every word a typed link can be, by key, by written form and by first
  // kana; rebuilt whenever the vocabulary index is.
  var chainDict = null;
  function chainDictionary() {
    var index = vocabIndex();
    if (chainDict && chainDict.index === index) return chainDict;
    var d = { index: index, all: [], byKey: {}, byWritten: {}, byHead: {}, byId: {} };
    Object.keys(index).forEach(function (id) {
      var e = index[id];
      if (!e || e.kanji) return;
      var reading = String(e.jpReading || "").replace(/^〜/, "").trim();
      if (!KANA_ONLY.test(reading)) return;
      var head = chainHead(reading), tail = chainTail(reading);
      var clue = String(e.englishDisplay || "").split(" / ")[0].trim();
      if (!head || !tail || !clue) return;
      var written = String(e.jpPlain || "").replace(/^〜/, "").trim();
      if (!/^[ぁ-ゖァ-ヶー一-龯々]+$/.test(written)) written = reading;
      var key = chainKey(reading);
      if ((d.byKey[key] || []).some(function (o) { return o.written === written; })) return;
      var w = { id: e.vocabId, answer: reading, written: written, clue: clue, head: head, tail: tail, key: key, speak: e.jpReading };
      d.all.push(w);
      d.byId[w.id] = w;
      (d.byKey[key] = d.byKey[key] || []).push(w);
      if (!d.byWritten[written]) d.byWritten[written] = w;
      (d.byHead[head] = d.byHead[head] || []).push(w);
    });
    chainDict = d;
    return d;
  }
  // A word that can carry on: not ending in ん, and something unused
  // starts where it ends (else the chain would be stuck after it).
  function canFollow(d, w, used) {
    return w.tail !== "ん" && (d.byHead[w.tail] || []).some(function (o) { return o.key !== w.key && !used[o.key] && o.tail !== "ん"; });
  }
  function buildTypedChain(pool, limit) {
    var d = chainDictionary(), none = {}, weights = {};
    pool.forEach(function (w) { weights[w.id] = w.weight || 1; });
    var starts = weightedOrder(pool.map(function (w) { return d.byId[w.id]; }).filter(function (w) { return w && canFollow(d, w, none); }),
      function (w) { return weights[w.id]; });
    if (!starts.length) return { start: null, placements: [] };
    var poolIds = {};
    pool.forEach(function (w) { poolIds[w.id] = true; });
    return { start: starts[0], links: Math.min(limit, Math.max(CHAIN_MIN, pool.length)), poolIds: poolIds, placements: [] };
  }
  // One chip of the trail: the word as written and, under it when that's
  // kanji, its reading -- the kana the chain runs on underlined (its first
  // where it carries on from the word before, the one it ends on).
  function chainChipHtml(w, first, isNew) {
    var chars = Array.from(w.answer), end = Array.from(w.answer.replace(/ー+$/, "")).length - 1;
    var marked = chars.map(function (c, i) { return (i === 0 && !first) || i === end ? "<u>" + esc(c) + "</u>" : esc(c); }).join("");
    var kanji = w.written !== w.answer;
    return '<span class="fc-wc-chip' + (isNew ? " fc-wc-chip-new" : "") + '">' +
      '<span class="fc-wc-chip-w" lang="ja">' + (kanji ? esc(w.written) : marked) + "</span>" +
      (kanji ? '<span class="fc-wc-chip-r" lang="ja">' + marked + "</span>" : "") + "</span>";
  }
  var SEND_ICON = '<svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14.5v-11M4.5 8 9 3.5 13.5 8"/></svg>';
  var WC_RULES = "A word ending in ー counts its kana before it (コーヒー → ひ), a final small ゃゅょ counts as its big kana (でんしゃ → や), and か is not が. A word ending in ん ends the chain, so it can’t be played.";
  function wireTypedChain(boardEl, countEl, p) {
    var d = chainDictionary(), kr = window.RaumeStudy.kanaRomaji;
    var at, trail, used, score, missed, help, linkMissed, hinted, game = 0, startedAt, pausedMs, pausedAt, done, locked, streak = streakMeter();
    var total = p.links;
    var field, msg, needEl, enEl, trailEl;
    function last() { return trail[trail.length - 1]; }
    function count() { setCount(countEl, Math.min(at + 1, total), total); }
    function render() {
      boardEl.innerHTML =
        '<div class="fc-wc-trail" aria-label="The chain so far">' + chainChipHtml(trail[0], true, false) + "</div>" +
        '<div class="fc-ls-card fc-ss-card fc-wc-need">' +
        '<button type="button" class="fc-wc-info" aria-label="Word chain rules" aria-expanded="false">' + INFO_ICON + "</button>" +
        '<p class="fc-xw-tip-pop fc-wc-rules" role="note" hidden>' + WC_RULES + "</p>" +
        '<p class="fc-ss-count">Starts with</p><p class="fc-wc-kana" lang="ja"></p><p class="fc-wc-en"></p></div>' +
        '<form class="fc-wc-form" autocomplete="off"><input class="fc-wc-field" type="text" lang="ja" aria-label="The next word, in romaji or kana"' +
        ' autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go">' +
        '<button type="submit" class="fc-wc-go" aria-label="Answer">' + SEND_ICON + "</button></form>" +
        '<p class="fc-wc-msg" aria-live="polite"></p>';
      field = boardEl.querySelector(".fc-wc-field");
      msg = boardEl.querySelector(".fc-wc-msg");
      needEl = boardEl.querySelector(".fc-wc-kana");
      enEl = boardEl.querySelector(".fc-wc-en");
      trailEl = boardEl.querySelector(".fc-wc-trail");
      showNeed();
    }
    function showNeed() {
      var w = last();
      count();
      needEl.textContent = w.tail;
      enEl.innerHTML = '<span lang="ja">' + esc(w.written) + "</span> · " + esc(w.clue);
      trailEl.scrollLeft = trailEl.scrollWidth;
    }
    function say(text, cls) {
      msg.className = "fc-wc-msg" + (cls ? " " + cls : "");
      msg.innerHTML = text;
    }
    function typedKana(final) { return kr.toKana(field.value.trim(), final); }
    function miss(text) {
      say(text, "fc-wc-msg-bad");
      linkMissed = true;
      streak.hit(false);
      var form = field.parentNode;
      form.classList.remove("fc-wc-shake");
      void form.offsetWidth;
      form.classList.add("fc-wc-shake");
    }
    // Answer with what's typed: its reading, or a written form typed with
    // a Japanese keyboard's own conversion. The trail shows the word as
    // it's written (kanji and all).
    function answer() {
      if (locked || done) return;
      var need = last().tail, typed = field.value.trim();
      if (!typed) return;
      var kana = typedKana(true);
      var list = d.byWritten[typed] ? [d.byWritten[typed]] : (d.byKey[chainKey(kana)] || []);
      var head = list.length ? list[0].head : chainHead(kana);
      if (head !== need) { miss("Needs to start with <span lang=\"ja\">" + esc(need) + "</span>"); return; }
      if (!list.length) { miss("Not one of your words"); return; }
      var word = list.filter(function (w) { return !used[w.key]; })[0] || list[0];
      if (used[word.key]) { miss("Already in the chain"); return; }
      if (word.tail === "ん") { miss('<span lang="ja">' + esc(word.written) + "</span> ends on ん — the chain can’t go on"); return; }
      if (at + 1 < total && !canFollow(d, word, used)) {
        miss("No word starts with <span lang=\"ja\">" + esc(word.tail) + "</span> after it — try another"); return;
      }
      link(word, false);
    }
    function link(word, skipped) {
      used[word.key] = true;
      trail.push(word);
      trailEl.insertAdjacentHTML("beforeend", chainChipHtml(word, false, true));
      at++;
      if (!linkMissed && !skipped) { score++; streak.hit(true); }
      else { missed.push(word); if (skipped) streak.hit(false); }
      // The card under the trail now shows the word and its English; the
      // line only says when it was a skip.
      say(skipped ? "Skipped" : "");
      linkMissed = false; hinted = null;
      field.value = "";
      var stuck = !(d.byHead[word.tail] || []).some(function (o) { return !used[o.key] && o.tail !== "ん"; });
      if (at >= total || stuck) {
        locked = true;
        var thisGame = game;
        setTimeout(function () { if (thisGame === game && boardEl.isConnected) finish(); }, 900);
        return;
      }
      showNeed();
      field.focus();
    }
    // One word that would carry on, Words from's first.
    function validWord() {
      var need = last().tail, rest = at + 1 < total;
      var ok = (d.byHead[need] || []).filter(function (w) { return !used[w.key] && w.tail !== "ん"; });
      var going = ok.filter(function (w) { return !rest || canFollow(d, w, used); });
      if (going.length) ok = going;
      var mine = ok.filter(function (w) { return p.poolIds[w.id]; });
      return shuffle(mine.length ? mine : ok)[0] || null;
    }
    function hint() {
      if (locked || done || pausedAt !== null) return;
      if (!hinted) {
        hinted = validWord();
        if (!hinted) return;
        help++;
        linkMissed = true;
        streak.hit(false);
      }
      say("Hint: " + esc(hinted.clue));
      field.focus();
    }
    function skip() {
      if (locked || done || pausedAt !== null) return;
      var w = hinted || validWord();
      if (w) link(w, true);
    }
    boardEl.addEventListener("input", function (e) {
      if (!e.target.classList.contains("fc-wc-field") || e.isComposing) return;
      var conv = typedKana(false);
      if (conv !== field.value) field.value = conv;
    });
    boardEl.addEventListener("submit", function (e) { e.preventDefault(); answer(); field.focus(); });
    boardEl.addEventListener("click", function (e) {
      var info = e.target.closest(".fc-wc-info"), pop = boardEl.querySelector(".fc-wc-rules");
      if (info) { pop.hidden = !pop.hidden; info.setAttribute("aria-expanded", String(!pop.hidden)); return; }
      if (pop && !pop.hidden) { pop.hidden = true; boardEl.querySelector(".fc-wc-info").setAttribute("aria-expanded", "false"); }
    });
    function setup() { return setupKey(total, "kana|type"); }
    function chainLineHtml() {
      return '<p class="fc-wc-chain" lang="ja">' + trail.map(function (w) { return esc(w.written); }).join(" → ") + "</p>";
    }
    function missedHtml() {
      return missed.length ? '<ul class="fc-ls-missed">' + missed.map(function (w) {
        return '<li><span class="fc-ls-missed-word">' + spokenWordHtml(w) + '</span><span class="fc-ls-missed-en">' + esc(w.clue) + "</span></li>";
      }).join("") + "</ul>" : "";
    }
    function finish() {
      done = true;
      document.getElementById("fcMtPause").disabled = true;
      var run = recordRun({ mode: "wordchain", n: at, ms: Date.now() - startedAt - pausedMs, right: score, help: help,
        setup: setup(), missed: missed.map(function (w) { return w.id; }) });
      countEl.textContent = score + " / " + at;
      countEl.classList.add("fc-ws-count-done");
      boardEl.innerHTML = '<div class="fc-mt-done" role="status">' +
        '<p class="fc-mt-done-time">' + score + " / " + at + "</p>" +
        accuracyStatsHtml("wordchain", score, at, run) + chainLineHtml() +
        '<p class="fc-mt-done-meta">' + (missed.length ? "Links you missed:" : "Every link right") + "</p>" +
        missedHtml() + doneActionsHtml("fcWcAgain") + "</div>";
      bindDoneActions("fcWcAgain");
    }
    function pause() {
      if (done || pausedAt !== null || !boardEl.isConnected) return;
      pausedAt = Date.now();
      showPauseCard(boardEl, Math.min(at + 1, total) + " / " + total, score + " right so far", {
        resume: function () { pausedMs += Date.now() - pausedAt; pausedAt = null; hidePauseCard(boardEl); if (field) field.focus(); },
        restart: restart,
        end: endEarly
      });
    }
    // Stopped part-way: the links you made count (see Listening's).
    function endEarly() {
      done = true;
      document.getElementById("fcMtPause").disabled = true;
      if (at) recordRun({ mode: "wordchain", n: at, ms: (pausedAt || Date.now()) - startedAt - pausedMs, right: score, help: help,
        setup: setup(), missed: missed.map(function (w) { return w.id; }), ended: true });
      countEl.classList.add("fc-ws-count-done");
      boardEl.classList.remove("fc-mt-paused");
      boardEl.innerHTML = '<div class="fc-mt-done" role="status">' +
        '<p class="fc-mt-done-time">' + score + " / " + at + "</p>" +
        '<p class="fc-mt-done-meta">Ended after ' + at + " of " + total + " links</p>" +
        '<p class="fc-mt-done-note">' + (at ? "The " + at + (at === 1 ? " link" : " links") + " you made count in your stats."
          : "No link made, so nothing is counted.") + "</p>" +
        doneActionsHtml("fcWcAgain") + "</div>";
      bindDoneActions("fcWcAgain");
    }
    // The same first word, from the top.
    function restart() {
      game++;
      hidePauseCard(boardEl);
      at = 0; trail = [p.start]; used = {}; used[p.start.key] = true; score = 0; missed = []; help = 0;
      linkMissed = false; hinted = null; startedAt = Date.now(); pausedMs = 0; pausedAt = null; done = false; locked = false;
      streak.reset();
      var pb = document.getElementById("fcMtPause");
      if (pb) pb.disabled = false;
      countEl.classList.remove("fc-ws-count-done");
      render();
    }
    restart();
    var api = { restart: restart, pause: pause, hint: hint, skip: skip };
    activeGame = api;
    return api;
  }

  // -----------------------------------------------------------------------
  // State + rendering. Purely a play/print utility -- nothing here persists
  // across a reload; regenerating is free. What's typed into the grid lives
  // only in the live <input> elements, not in this state object -- every
  // path that changes state.puzzle (New puzzle, or a control) tears the grid
  // down and rebuilds it anyway, so there's nothing to carry over.
  // -----------------------------------------------------------------------
  // Romaji is the default script -- a beginner without kana memorized yet
  // still gets a working puzzle; switching to Japanese/Hiragana/Katakana is
  // one tap away once they're ready for it.
  // Puzzles (grids to solve) and Games (timed / scored rounds) are two
  // tabs drawn by this one module, each keeping its own settings and its
  // current puzzle or game; `state` is whichever tab is showing.
  //
  // Each tab opens on its setup screen -- which puzzle or game, the words,
  // the script, how many -- and play starts with Start (`started`). The
  // choices are remembered on this device for next time (SETUP_KEY); the
  // puzzle itself still isn't.
  var SETUP_KEY = "raume-games-setup";
  var SETUP_FIELDS = ["mode", "source", "tables", "script", "size", "sortBy"];
  function loadSetup(kind) {
    try { return (JSON.parse(localStorage.getItem(SETUP_KEY)) || {})[kind] || {}; } catch (e) { return {}; }
  }
  function saveSetup() {
    try {
      var all = JSON.parse(localStorage.getItem(SETUP_KEY)) || {}, mine = {};
      SETUP_FIELDS.forEach(function (k) { mine[k] = state[k]; });
      if (mine.source === "tricky") { mine.source = "flashcards"; mine.tables = []; } // a one-off from Stats
      all[state.kind] = mine;
      localStorage.setItem(SETUP_KEY, JSON.stringify(all));
    } catch (e) { /* private mode: just not remembered */ }
  }
  function freshState(kind) {
    var st = { kind: kind, source: "flashcards", tables: [], tablesOpen: false, mode: kind === "games" ? "match" : "crossword",
      script: "romaji", size: 15, sortBy: "tables", puzzle: null, poolCount: 0, notes: "", started: false };
    var saved = loadSetup(kind);
    var modes = MODE_OPTS.map(function (o) { return o[0]; });
    if (modes.indexOf(saved.mode) !== -1 && (PUZZLE_MODES.indexOf(saved.mode) !== -1) === (kind === "puzzles")) st.mode = saved.mode;
    if (saved.source === "table" && Array.isArray(saved.tables) && saved.tables.length) { st.source = "table"; st.tables = saved.tables.map(String); }
    if (SCRIPT_OPTS.some(function (o) { return o[0] === saved.script; })) st.script = saved.script;
    if (typeof saved.size === "number" && saved.size > 0) st.size = saved.size;
    if (typeof saved.sortBy === "string") st.sortBy = saved.sortBy;
    return st;
  }
  // Filled in at the end of this file: MODE_OPTS and SCRIPT_OPTS come later.
  var states = {};
  var state = null;
  var currentPanel = null;

  function rerender() { S.render(); }

  // "Japanese" is the word as it's written -- kanji and all (水, 食べる,
  // ビール) -- in Match and Word search. A crossword square would need a
  // whole kanji typed through the keyboard's conversion, and words rarely
  // share one to cross on, so the grid styles offer the kana scripts only.
  // null when the row has no clean written form to show.
  function isGridMode() { return state.mode === "crossword" || state.mode === "arroword"; }

  // A wide window puts the clues beside the grid -- but only when the grid
  // fits there at full cell size. Otherwise the puzzle stacks (clues below,
  // grid across the whole width) rather than pushing the page sideways.
  // Sizes match .fc-xw-cell / .fc-ws-cell and the 260px + 24px clue column.
  var GRID_CELL = 40, WS_CELL = 34, SIDE_COLUMN = 284;
  function fitPuzzle() {
    var el = document.querySelector(".fc-xw-puzzle[data-natural]");
    if (!el || !el.clientWidth) return;
    el.classList.toggle("fc-xw-puzzle-stack", Number(el.dataset.natural) + SIDE_COLUMN > el.clientWidth);
  }
  window.addEventListener("resize", fitPuzzle);
  function scriptOpts() {
    if (state.mode === "kanatiles") return SCRIPT_OPTS.filter(function (o) { return o[0] === "hiragana" || o[0] === "katakana"; });
    return isGridMode() ? SCRIPT_OPTS.filter(function (o) { return o[0] !== "native"; }) : SCRIPT_OPTS;
  }
  function writtenForm(w) {
    var entry = vocabIndex()[w.id];
    var written = String((entry && entry.jpPlain) || w.answer).replace(/^〜/, "").trim();
    return /^[ぁ-ゖァ-ヶー一-龯々]+$/.test(written) ? written : null;
  }

  function generate() {
    // The notes pad belongs to one puzzle: a new one starts it blank.
    state.notes = "";
    if (state.script === "native" && isGridMode()) state.script = "hiragana";
    // Kana tiles spells in kana: romaji or the written form (kanji) aren't
    // on offer, so either falls back to Hiragana.
    if (state.mode === "kanatiles" && state.script !== "hiragana" && state.script !== "katakana") state.script = "hiragana";
    // First pick of "A table": the first one with enough words for a real
    // grid (the very first table can be a handful of counters).
    if (state.source === "table" && !state.tables.length) {
      var tables = vocabTables();
      var roomy = tables.filter(function (t) { return tableWordPool([t.id]).length >= MIN_WORDS * 2; })[0] || tables[0];
      if (roomy) state.tables = [roomy.id];
    }
    var pool = wordPool();
    // Listening: you hear the word, so the script doesn't narrow anything --
    // every word in the pool, deduped on the English (a question can't have
    // two right answers).
    if (state.mode === "listening") {
      var seenEn = {};
      var heard = pool.filter(function (w) {
        var key = w.clue.toLowerCase();
        if (seenEn[key]) return false;
        seenEn[key] = true;
        return true;
      });
      state.poolCount = heard.length;
      state.puzzle = buildListening(heard, state.size);
      return;
    }
    // Word chain plays on the reading, whatever the Script -- the chain is
    // in the kana.
    if (state.mode === "wordchain") {
      state.poolCount = pool.length;
      state.puzzle = buildTypedChain(pool, state.size);
      return;
    }
    // Romaji mode only offers words with a usable romaji spelling (a
    // verb-pair's casual/polite split, say, still isn't one) -- filtered
    // before picking, not after, so "Words" still means what it says.
    // Hiragana / Katakana mean words that are really written that way --
    // native words (their reading is hiragana, whether or not the word has
    // kanji) or loanwords (katakana) -- never a word forced into the other
    // script (ビール as びーる, 水 as ミズ), which just teaches a spelling
    // nobody uses.
    var eligible = pool.filter(function (w) {
      if (state.script === "romaji") return !!w.romaji;
      if (state.script === "hiragana") return /^[ぁ-ゖー]+$/.test(w.answer);
      if (state.script === "katakana") return /^[ァ-ヶー]+$/.test(w.answer);
      return !!writtenForm(w);
    });
    // Every eligible word is a candidate; the builder places up to Words of
    // them. Deduped again on the final answer -- folding to one script or to
    // romaji can make two readings spell the same.
    var seen = {};
    var candidates = eligible.map(function (w) {
      var answer = state.script === "romaji" ? w.romaji
        : state.script === "native" ? writtenForm(w)
        : scriptedAnswer(w.answer, state.script);
      return { id: w.id, clue: w.clue, answer: answer, tableId: w.tableId, weight: w.weight };
    }).filter(function (w) { if (seen[w.answer]) return false; seen[w.answer] = true; return true; });
    // A two-letter romaji word turns up by chance all over a word search's
    // filler -- finding "ki" there is luck, not recall.
    if (state.mode === "wordsearch" && state.script === "romaji") candidates = candidates.filter(function (w) { return w.answer.length >= 3; });
    // Likewise a one-kanji word (水) is a single square to spot.
    if (state.mode === "wordsearch" && state.script === "native") candidates = candidates.filter(function (w) { return w.answer.length >= 2; });
    // Match shows clues side by side, and Kana tiles asks you to spell the
    // English: two words that share a meaning would be a coin toss, so
    // keep only the first of them.
    if (state.mode === "match" || state.mode === "kanatiles") {
      var seenClue = {};
      candidates = candidates.filter(function (w) {
        var key = w.clue.toLowerCase();
        if (seenClue[key]) return false;
        seenClue[key] = true;
        return true;
      });
    }
    state.poolCount = candidates.length;
    // Speed sort: only the sorts these words can fill; keep the pick if it
    // still works, else the first that does.
    if (state.mode === "speedsort") {
      state.sortAvail = sortOpts(candidates);
      if (!state.sortAvail.some(function (o) { return o[0] === state.sortBy; }) && state.sortAvail.length) state.sortBy = state.sortAvail[0][0];
    }
    state.puzzle = state.mode === "wordsearch" ? buildWordSearch(candidates, state.size)
      : state.mode === "match" ? buildMatch(candidates, state.size)
      : state.mode === "kanatiles" ? buildKanaTiles(candidates, state.size, state.script)
      : state.mode === "oddone" ? buildOddOne(candidates, state.size)
      : state.mode === "speedsort" ? buildSpeedSort(candidates, state.size, state.sortBy)
      : buildGrid(candidates, state.mode === "arroword", state.size);
  }

  var MODE_OPTS = [["crossword", "Crossword"], ["arroword", "Arroword"], ["wordsearch", "Word search"], ["match", "Match"], ["listening", "Listening"], ["kanatiles", "Kana tiles"], ["oddone", "Odd one out"], ["speedsort", "Speed sort"], ["wordchain", "Word chain"]];
  var PUZZLE_MODES = ["crossword", "arroword", "wordsearch"];
  function modeOpts() {
    return MODE_OPTS.filter(function (o) { return (PUZZLE_MODES.indexOf(o[0]) !== -1) === (state.kind === "puzzles"); });
  }
  var SCRIPT_OPTS = [["romaji", "Romaji"], ["native", "Japanese"], ["hiragana", "Hiragana"], ["katakana", "Katakana"]];
  // A grid stops fitting (and building fast) past 40 words; Match and
  // Listening are just longer games, so they go up to the whole pool.
  var GRID_MAX_WORDS = 40;
  var ALL_WORDS = 9999;
  var GRID_SIZE_OPTS = [10, 15, 20, 30, 40];
  var GAME_SIZE_OPTS = [10, 15, 20, 30, 40, 60, 80, 100, ALL_WORDS];
  function isGame(mode) { return mode === "match" || mode === "listening" || mode === "kanatiles" || mode === "oddone" || mode === "speedsort" || mode === "wordchain"; }
  // Each written out as the row reads it ("15 words", "All words").
  function sizeOpts() {
    return (isGame(state.mode) ? GAME_SIZE_OPTS : GRID_SIZE_OPTS).map(function (n) {
      return [String(n), n === ALL_WORDS ? "All words" : n + " words"];
    });
  }
  // The count the game will really have: never more than the pool holds.
  function sizeLabel() {
    var n = Math.min(state.size, state.poolCount || state.size);
    if (state.size === ALL_WORDS) return "All " + n + " words";
    return n + (n === 1 ? " word" : " words");
  }

  // A native <select> laid invisibly over a control, so a tap opens the
  // platform's own picker (the wheel/menu on iOS). 16px so iOS never zooms.
  var UPDOWN_ICON = '<svg class="fc-xw-updown" viewBox="0 0 18 18" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 7 9 3.5 12.5 7M5.5 11 9 14.5 12.5 11"/></svg>';
  // The toolbar's title: the puzzle or game you're on, as an iOS title
  // menu ("Word search ⌄") -- the one setting you switch often.
  // In play it leads back to the setup screen, ‹ and the name, as an iOS
  // back button -- a different game or other words start from there.
  var BACK_ICON = '<svg class="fc-xw-title-back" viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 3.5 6 9l5.5 5.5"/></svg>';
  function titleMenuHtml() {
    return '<button type="button" class="fc-xw-title" id="fcXwBack" aria-label="' + esc(optionLabel(MODE_OPTS, state.mode)) + ' — back to the ' + (state.kind === "games" ? "game" : "puzzle") + ' setup">' +
      BACK_ICON + '<span class="fc-xw-title-text">' + esc(optionLabel(MODE_OPTS, state.mode)) + "</span></button>";
  }
  function selectedTables() {
    var ids = state.tables.map(String);
    return vocabTables().filter(function (t) { return ids.indexOf(String(t.id)) !== -1; });
  }
  function tablesSummary() {
    var titles = selectedTables().map(function (t) { return tableInfo(t.id).name; });
    if (!titles.length) return "Choose tables";
    if (titles.length <= 2) return titles.join(", ");
    return titles.length + " tables";
  }
  // Checkmark rows grouped by category (the Settings tab's study-direction
  // rows), not a giant segmented control --
  // more than one table can feed a single puzzle (mix "Numbers" + "Time"
  // for a bigger pool). The Words from sheet.
  function tableChecklistHtml() {
    var byCategory = {};
    vocabTables().forEach(function (t) {
      var cat = t.category || "Tables";
      (byCategory[cat] = byCategory[cat] || []).push(t);
    });
    var cats = Object.keys(byCategory).sort(function (a, b) { return a.localeCompare(b); });
    var selected = state.source === "table" ? state.tables.map(String) : [];
    // Where the words come from: your flashcards (or, after Stats' Practise
    // these, your tricky words) on top, then any number of tables.
    var top = '<div class="fc-xw-table-cat">' +
      '<label class="fc-direction-check fc-xw-table-check"><input type="checkbox" data-source="flashcards"' + (state.source === "flashcards" ? " checked" : "") + ">Flashcards</label>" +
      (state.source === "tricky" ? '<label class="fc-direction-check fc-xw-table-check"><input type="checkbox" data-source="tricky" checked>Tricky words</label>' : "") +
      "</div>";
    var groups = top + cats.map(function (cat) {
      var items = byCategory[cat].slice().sort(function (a, b) { return a.title.localeCompare(b.title); })
        .map(function (t) {
          var on = selected.indexOf(String(t.id)) !== -1;
          return '<label class="fc-direction-check fc-xw-table-check"><input type="checkbox" data-table-id="' + t.id + '"' + (on ? " checked" : "") + ">" + esc(tableInfo(t.id).name) + "</label>";
        }).join("");
      return '<div class="fc-xw-table-cat"><div class="fc-xw-table-cat-name">' + esc(cat) + "</div>" + items + "</div>";
    }).join("");
    return '<div class="fc-xw-table-picker" id="fcXwTablePicker">' + groups +
      '<p class="fc-xw-table-none" hidden>No tables match.</p></div>';
  }
  // Words from: a row that opens the checklist -- Flashcards, or any
  // number of tables ticked at once (Mail's mailbox picker, not a menu of
  // one); the row names what's picked. A search field over the list
  // narrows 30-odd tables to the one you're after.
  var ROW_CHEVRON = '<svg class="fc-xw-row-chev" viewBox="0 0 18 18" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4.5 11.5 9 7 13.5"/></svg>';
  function sourceLabel() {
    return state.source === "table" ? tablesSummary() : state.source === "tricky" ? "Tricky words" : "Flashcards";
  }
  var SEARCH_ICON = '<svg class="fc-xw-search-glyph" viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="5"/><path d="m12 12 3.5 3.5"/></svg>';
  function tablesSheetHtml() {
    return '<div class="fc-xw-scrim"' + (state.tablesOpen ? "" : " hidden") + "></div>" +
      '<div class="fc-xw-sheet" id="fcXwSheet" role="dialog" aria-label="Words from"' + (state.tablesOpen ? "" : " hidden") + ">" +
      '<div class="fc-xw-sheet-head"><h4 class="fc-xw-sheet-title">Words from</h4>' +
      '<button type="button" class="fc-xw-sheet-done" id="fcXwTablesDone">Done</button></div>' +
      '<label class="fc-xw-search">' + SEARCH_ICON + '<input type="search" id="fcXwSearch" placeholder="Search" aria-label="Search tables" autocomplete="off"></label>' +
      tableChecklistHtml() + "</div>";
  }
  // The setup screen, as an iOS game's: which one (checkmark rows with a
  // line on how it plays), then the words -- where from, the script, how
  // many -- as Settings value rows, then Start. Stats sits below.
  var MODE_BLURBS = {
    crossword: "Numbered clues beside the grid",
    arroword: "Each clue in a square before its answer",
    wordsearch: "Find the words hidden in a square of letters",
    match: "Pair each word with its meaning, against the clock",
    listening: "Hear a word, pick its meaning",
    kanatiles: "Spell the word from kana tiles",
    oddone: "Spot the word that doesn’t belong",
    speedsort: "Sort each word into its bucket, fast",
    wordchain: "Each word starts on the kana the last one ended"
  };
  var CHECK_ICON = '<svg class="fc-gs-check" viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9.5 7.5 13.5 14.5 5"/></svg>';
  // Script, Word count, Sort by: the same row as Words from -- the value
  // and ⌃⌄ -- opening the same glass menu of checkmark rows; a tap picks
  // and closes it. The menus sit after the card (it clips), each anchored
  // under its own row (.fc-gs-menu-at-N, N = the row's place).
  function setupPickHtml(name, label, shown) {
    return '<button type="button" class="set-row fc-gs-pick" data-pick="' + name + '" aria-haspopup="menu" aria-expanded="false" aria-controls="fcGsMenu-' + name + '">' +
      '<span class="set-label">' + esc(label) + '</span><span class="fc-xw-menu-val">' + esc(shown) + UPDOWN_ICON + "</span></button>";
  }
  function setupMenuHtml(name, label, options, current, at) {
    return '<div class="fc-xw-sheet fc-gs-menu fc-gs-menu-at-' + at + '" id="fcGsMenu-' + name + '" role="menu" aria-label="' + esc(label) + '" hidden>' +
      '<div class="fc-xw-sheet-head fc-gs-menu-head"><h4 class="fc-xw-sheet-title">' + esc(label) + "</h4></div>" +
      options.map(function (o) {
        var val = Array.isArray(o) ? o[0] : String(o), on = String(current) === val;
        return '<button type="button" class="fc-gs-opt" role="menuitemradio" aria-checked="' + on + '" data-pick="' + name + '" data-value="' + esc(val) + '">' +
          '<span class="fc-gs-opt-tx">' + esc(Array.isArray(o) ? o[1] : String(o)) + "</span>" + CHECK_ICON + "</button>";
      }).join("") + "</div>";
  }
  function setupHtml() {
    var games = state.kind === "games";
    var short = state.poolCount < MIN_WORDS;
    var why = state.source === "table" && !state.tables.length ? "Choose a table to play with."
      : "This needs at least " + MIN_WORDS + " usable words" + (state.poolCount ? " — these have " + state.poolCount : "") +
        ". Tick more tables under Words from" + (state.source === "table" ? "" : ", or add words to your flashcards") + ".";
    // [key, label, shown value, options] per row under Words from.
    var picks = [];
    if (state.mode !== "listening" && state.mode !== "wordchain") picks.push(["script", "Script", optionLabel(SCRIPT_OPTS, state.script), scriptOpts()]);
    picks.push(["size", "Word count", sizeLabel(), sizeOpts()]);
    if (state.mode === "speedsort" && state.sortAvail && state.sortAvail.length) picks.push(["sortBy", "Sort by", optionLabel(SORT_OPTS, state.sortBy), state.sortAvail]);
    return '<div class="fc-gs">' +
      '<h3 class="help-head set-head">' + (games ? "Game" : "Puzzle") + "</h3>" +
      '<div class="help-card set-card fc-gs-modes" role="radiogroup" aria-label="' + (games ? "Game" : "Puzzle") + '">' +
      modeOpts().map(function (o) {
        return '<label class="set-row fc-gs-mode"><input type="radio" class="fc-gs-radio" name="fcGsMode" value="' + o[0] + '"' + (o[0] === state.mode ? " checked" : "") + ">" +
          '<span class="fc-gs-mode-tx"><span class="fc-gs-mode-name">' + esc(o[1]) + '</span><span class="help-desc">' + esc(MODE_BLURBS[o[0]]) + "</span></span>" + CHECK_ICON + "</label>";
      }).join("") + "</div>" +
      '<h3 class="help-head set-head">Words</h3>' +
      '<div class="fc-gs-words"><div class="help-card set-card">' +
      '<button type="button" class="set-row fc-gs-pick fc-gs-src" id="fcXwSource" aria-haspopup="dialog" aria-expanded="' + !!state.tablesOpen + '" aria-controls="fcXwSheet">' +
      '<span class="set-label">Words from</span><span class="fc-xw-menu-val">' + esc(sourceLabel()) + UPDOWN_ICON + "</span></button>" +
      picks.map(function (p) { return setupPickHtml(p[0], p[1], p[2]); }).join("") +
      "</div>" + tablesSheetHtml() +
      picks.map(function (p, i) { return setupMenuHtml(p[0], p[1], p[3], state[p[0]], i + 1); }).join("") + "</div>" +
      (short ? '<p class="set-foot fc-gs-why">' + esc(why) + "</p>" : "") +
      '<div class="fc-gs-go"><button type="button" class="fc-btn fc-btn-primary fc-gs-start" id="fcGsStart"' + (short ? " disabled" : "") + ">Start</button></div>" +
      '<div class="help-card set-card fc-gs-more"><button type="button" class="set-row set-action fc-gs-stats" id="fcGsStats">' +
      '<span class="set-label">Stats</span>' + ROW_CHEVRON + "</button></div>" +
      "</div>";
  }
  function renderSetup(panel) {
    if (!state.puzzle) generate();
    panel.innerHTML = setupHtml();
    bindControls(panel);
    panel.querySelectorAll(".fc-gs-radio").forEach(function (r) {
      r.addEventListener("change", function () {
        state.mode = r.value;
        if (!isGame(state.mode) && state.size > GRID_MAX_WORDS) state.size = GRID_MAX_WORDS;
        saveSetup();
        generate();
        rerender();
        var again = currentPanel && currentPanel.querySelector('.fc-gs-radio[value="' + state.mode + '"]');
        if (again) again.focus();
      });
    });
    document.getElementById("fcGsStart").addEventListener("click", function () {
      state.started = true;
      generate();
      rerender();
    });
    document.getElementById("fcGsStats").addEventListener("click", openStats);
  }
  function backToSetup() {
    state.started = false;
    stopMatchTimer();
    activeGame = null;
    rerender();
  }

  function arrowIcon(dir) {
    return dir === "down"
      ? '<svg class="fc-xw-arrow-svg" width="9" height="9" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3v11M4.5 10l4.5 4.5L13.5 10"/></svg>'
      : '<svg class="fc-xw-arrow-svg" width="9" height="9" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h11M10 4.5l4.5 4.5-4.5 4.5"/></svg>';
  }

  // No inline style="" here -- the app's CSP (style-src 'self', no
  // unsafe-inline) silently drops inline styles, so a dynamic grid can't be
  // positioned with style="grid-row/grid-column" the way a build-tooled app
  // might. Instead every cell, including the empty ones, is emitted in
  // row-major order inside its own row -- plain flex rows read that DOM
  // order directly, no per-cell coordinates needed in CSS at all.
  //
  // Every letter cell is a live <input> -- this is a fill-in puzzle, not a
  // picture of one: tap a cell (or a clue) and type the kana straight in,
  // same as any iOS word-game grid.
  function gridHtml(p, arroword, romajiMode) {
    var langAttr = romajiMode ? "" : ' lang="ja"';
    var maxLen = romajiMode ? "1" : "2";
    var rows = [];
    for (var r = 0; r < p.rows; r++) {
      var cells = [];
      for (var c = 0; c < p.cols; c++) {
        var k = r + "," + c;
        if (p.grid[k] !== undefined) {
          var num = !arroword && p.numbers[k] ? '<span class="fc-xw-num">' + p.numbers[k] + "</span>" : "";
          cells.push('<div class="fc-xw-cell fc-xw-cell-letter">' + num +
            '<input class="fc-xw-cell-input" type="text" inputmode="text"' + langAttr + ' autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="' + maxLen + '" data-r="' + r + '" data-c="' + c + '" aria-label="Row ' + (r + 1) + ", column " + (c + 1) + '">' +
            "</div>");
        } else if (p.clueCells[k]) {
          var cc = p.clueCells[k];
          cells.push('<div class="fc-xw-cell fc-xw-cell-clue fc-xw-clue-' + cc.dir + '" data-start="' + cc.start + '" data-dir="' + cc.dir + '" role="button" tabindex="0">' +
            arrowIcon(cc.dir) + '<span class="fc-xw-cluetext">' + esc(cc.clue) + "</span></div>");
        } else {
          cells.push('<div class="fc-xw-cell fc-xw-cell-blank" aria-hidden="true"></div>');
        }
      }
      rows.push('<div class="fc-xw-row">' + cells.join("") + "</div>");
    }
    return rows.join("");
  }

  // A scratch pad beside the clues on a wide window -- readings, guesses,
  // kana while solving. Kept for the puzzle it was written on (across tab
  // switches), blank again with the next one; a phone has no room for it.
  function notesHtml() {
    return '<div class="fc-xw-notes"><h4 class="fc-xw-cluehead"><label for="fcXwNotes">Notes</label></h4>' +
      '<textarea id="fcXwNotes" class="fc-xw-notes-pad" placeholder="Readings, guesses, kana…" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea></div>';
  }

  function clueListHtml(p) {
    var across = p.placements.filter(function (pl) { return pl.dir === "across"; }).sort(function (a, b) { return a.number - b.number; });
    var down = p.placements.filter(function (pl) { return pl.dir === "down"; }).sort(function (a, b) { return a.number - b.number; });
    function group(title, items) {
      if (!items.length) return "";
      return '<div class="fc-xw-cluegroup"><h4 class="fc-xw-cluehead">' + title + "</h4><ol class=\"fc-xw-cluerows\">" +
        items.map(function (pl) { return '<li value="' + pl.number + '" data-start="' + pl.row + "," + pl.col + '" data-dir="' + pl.dir + '" role="button" tabindex="0"><b>' + pl.number + "</b> " + esc(pl.clue) + "</li>"; }).join("") +
        "</ol></div>";
    }
    return '<div class="fc-xw-clues">' + group("Across", across) + group("Down", down) + "</div>";
  }

  // -----------------------------------------------------------------------
  // Interactivity: typing, auto-advance, arrow-key/backspace navigation,
  // tap-a-clue-to-jump, the current word highlighted while its cell is
  // focused (its clue tinted in the list and spelled out in the clue bar
  // above the grid), Check (marks right/wrong without giving anything away)
  // and Reveal (fills the solution in). All of this mutates the live grid
  // DOM directly rather than going through rerender()/innerHTML -- a full
  // re-render on every keystroke would drop focus and, on a phone, close
  // the keyboard (the exact problem the review card's "persistent shell"
  // already solves elsewhere in Flashcards -- see js/flashcards/kana.js).
  //
  // Typing runs along one direction at a time, like any crossword app: the
  // direction of the clue you tapped, of the only word through a cell, or --
  // where an across and a down word cross -- whichever you were already
  // going; tapping that crossing cell again flips it.
  //
  // On a hardware keyboard a kana grid takes romaji, the way a Japanese
  // keyboard does: "ka" fills か, "kya" きゃ across two squares, "nn" ん --
  // no Japanese input method needed. The half-typed syllable waits in its
  // square until it makes a kana. A square turns green as soon as it holds
  // the right kana or letter (a wrong one stays plain until Check), and the
  // last right square finishes the puzzle (`onSolved`).
  // -----------------------------------------------------------------------
  function wireGrid(gridEl, cluesEl, currentEl, p, arroword, script, onSolved) {
    var dir = "across", lastInput = null, kr = window.RaumeStudy.kanaRomaji;
    var kanaGrid = script !== "romaji";
    var pend = null; // { input, buf }: romaji typed into a kana square, not yet a kana
    function inputAt(r, c) {
      return gridEl.querySelector('.fc-xw-cell-input[data-r="' + r + '"][data-c="' + c + '"]');
    }
    function step(input, sign) {
      var r = +input.dataset.r, c = +input.dataset.c;
      return dir === "down" ? inputAt(r + sign, c) : inputAt(r, c + sign);
    }
    function go(el) { if (el) { el.focus(); el.select(); } }
    function placementsAt(key) {
      return p.placements.filter(function (pl) { return cellsForPlacement(pl).indexOf(key) !== -1; });
    }
    function activePlacement(input) {
      var here = placementsAt(input.dataset.r + "," + input.dataset.c);
      return here.filter(function (pl) { return pl.dir === dir; })[0] || here[0] || null;
    }
    function clearWordHighlight() {
      gridEl.querySelectorAll(".fc-xw-cell-active-word").forEach(function (el) { el.classList.remove("fc-xw-cell-active-word"); });
      if (cluesEl) cluesEl.querySelectorAll(".fc-xw-clue-active").forEach(function (el) { el.classList.remove("fc-xw-clue-active"); });
    }
    function setActive(input) {
      if (pend && pend.input !== input) settle();
      lastInput = input;
      clearWordHighlight();
      var pl = activePlacement(input);
      if (!pl) return;
      dir = pl.dir;
      cellsForPlacement(pl).forEach(function (k) {
        var parts = k.split(","), el = inputAt(parts[0], parts[1]);
        if (el) el.closest(".fc-xw-cell").classList.add("fc-xw-cell-active-word");
      });
      var li = cluesEl && cluesEl.querySelector('[data-start="' + pl.row + "," + pl.col + '"][data-dir="' + pl.dir + '"]');
      if (li) li.classList.add("fc-xw-clue-active");
      if (currentEl) {
        var label = arroword ? (pl.dir === "down" ? "Down" : "Across") : pl.number + " " + (pl.dir === "down" ? "Down" : "Across");
        currentEl.innerHTML = '<span class="fc-xw-current-label">' + label + "</span>" + '<span class="fc-xw-current-clue">' + esc(pl.clue) + "</span>";
        currentEl.classList.remove("fc-xw-current-idle");
        currentEl.hidden = false;
      }
    }
    function focusAt(key, d) {
      var parts = key.split(","), el = inputAt(parts[0], parts[1]);
      if (!el) return;
      if (d) dir = d;
      if (document.activeElement === el) setActive(el); // focusin won't fire again
      go(el);
    }
    function clearVerdict(input) {
      input.closest(".fc-xw-cell").classList.remove("fc-xw-cell-correct", "fc-xw-cell-wrong");
    }
    function rightAt(input) { return input.value === p.grid[input.dataset.r + "," + input.dataset.c]; }
    // Green as soon as it's right; the whole grid right is the solve.
    function verdict(input) {
      clearVerdict(input);
      if (!input.value || !rightAt(input)) return;
      input.closest(".fc-xw-cell").classList.add("fc-xw-cell-correct");
      if (onSolved && [].every.call(gridEl.querySelectorAll(".fc-xw-cell-input"), rightAt)) onSolved();
    }
    function kanaFor(s) { return script === "katakana" ? toKatakana(s) : toHiragana(s); }
    // Feed romaji into the square you're on: each finished kana fills a
    // square and moves along the word; what's left (k, ky, n) waits.
    function feedRomaji(input, buf) {
      var out = kr.toKana(buf, false), kana = out.replace(/[a-z'\-]+$/, ""), rest = out.slice(kana.length);
      var at = input;
      Array.from(kana).forEach(function (ch, i) {
        if (i && at) at = step(at, 1) || null;
        if (!at) return;
        at.value = kanaFor(ch);
        verdict(at);
      });
      if (!at) { pend = null; return; }
      var next = kana && rest ? step(at, 1) : at;
      if (rest && next) {
        if (next !== at) { pend = null; go(next); }
        next.value = rest;
        clearVerdict(next);
        pend = { input: next, buf: rest };
      } else {
        pend = null;
        if (kana) go(step(at, 1) || at);
      }
    }
    // Leaving a square with romaji still waiting in it: finish it (a lone n
    // is ん), or clear it when it can't make a kana.
    function settle() {
      var p0 = pend; pend = null;
      if (!p0 || !p0.input.isConnected) return;
      var kana = kr.toKana(p0.buf, true);
      p0.input.value = /^[^a-z'\-]$/.test(kana) ? kanaFor(kana) : "";
      verdict(p0.input);
    }

    gridEl.addEventListener("focusin", function (e) {
      var input = e.target.closest(".fc-xw-cell-input");
      if (input) setActive(input);
    });
    // Leaving the grid entirely (Print, a control, another tab) drops the
    // highlight rather than leaving a stale tinted word on the page; the
    // clue bar keeps showing the last clue, so it doesn't flicker.
    gridEl.addEventListener("focusout", function () {
      window.setTimeout(function () { if (!gridEl.contains(document.activeElement)) clearWordHighlight(); }, 0);
    });
    // A second tap on the cell you're already in flips direction, when an
    // across and a down word both run through it.
    gridEl.addEventListener("pointerdown", function (e) {
      var input = e.target.closest(".fc-xw-cell-input");
      if (!input || document.activeElement !== input) return;
      if (placementsAt(input.dataset.r + "," + input.dataset.c).length < 2) return;
      dir = dir === "across" ? "down" : "across";
      setActive(input);
    });

    // IME composition (typing kana via romaji on a hardware keyboard) fires
    // several "input" events before the character is actually committed --
    // auto-advancing mid-composition would fling focus to the next cell
    // before the reader is done typing. Wait for compositionend; a direct
    // kana keyboard/tap (no composition) still fires a plain "input".
    var composing = false;
    gridEl.addEventListener("compositionstart", function () { composing = true; });
    gridEl.addEventListener("compositionend", function (e) { composing = false; afterType(e.target); });

    function afterType(input) {
      clearVerdict(input);
      // Romaji into a kana square from a keyboard that skipped keydown
      // (Android's sends "Unidentified"): the same conversion.
      if (kanaGrid && /[a-z]/i.test(input.value)) {
        var typed = input.value.toLowerCase().replace(/[^a-z'\-]/g, "").slice(-1);
        var buf = (pend && pend.input === input ? pend.buf : "") + typed;
        input.value = "";
        feedRomaji(input, buf);
        return;
      }
      if (input.value.length > 1) input.value = input.value.slice(-1);
      // Lowercase as typed -- only meaningful for a romaji answer (kana
      // passes through toLowerCase untouched), so this is safe in every mode.
      input.value = input.value.toLowerCase();
      verdict(input);
      if (!input.value) return;
      // Letter cells in a line are always one word (fits() never lets two
      // words run end to end), so the next cell along is still this word.
      go(step(input, 1));
    }
    gridEl.addEventListener("input", function (e) {
      var input = e.target.closest(".fc-xw-cell-input");
      if (input && !composing) afterType(input);
    });

    // The nearest square in a direction, past clue and blank squares.
    function inputToward(input, dr, dc) {
      var r = +input.dataset.r + dr, c = +input.dataset.c + dc;
      for (; r >= 0 && c >= 0 && r < p.rows && c < p.cols; r += dr, c += dc) {
        var el = inputAt(r, c);
        if (el) return el;
      }
      return null;
    }
    // Tab / Shift-Tab: the next / previous word, in clue order.
    function wordStep(input, sign) {
      var list = p.placements.slice().sort(function (a, b) {
        return a.dir === b.dir ? a.row - b.row || a.col - b.col : a.dir === "across" ? -1 : 1;
      });
      var i = list.indexOf(activePlacement(input));
      var pl = list[(i + sign + list.length) % list.length];
      focusAt(pl.row + "," + pl.col, pl.dir);
    }
    gridEl.addEventListener("keydown", function (e) {
      var input = e.target.closest(".fc-xw-cell-input");
      if (!input || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (kanaGrid && /^[a-zA-Z'\-]$/.test(e.key)) {
        e.preventDefault();
        var buf = (pend && pend.input === input ? pend.buf : "") + e.key.toLowerCase();
        input.value = "";
        feedRomaji(input, buf);
        return;
      }
      if (e.key === "Backspace" && pend && pend.input === input) {
        e.preventDefault();
        pend.buf = pend.buf.slice(0, -1);
        input.value = pend.buf;
        if (!pend.buf) pend = null;
        return;
      }
      if (e.key === "Backspace" && !input.value) {
        var prev = step(input, -1);
        if (prev) { e.preventDefault(); prev.value = ""; clearVerdict(prev); go(prev); }
        return;
      }
      if (e.key === "Delete") { e.preventDefault(); input.value = ""; clearVerdict(input); return; }
      if (e.key === "Tab") { e.preventDefault(); wordStep(input, e.shiftKey ? -1 : 1); return; }
      // Space flips direction where two words cross.
      if (e.key === " ") {
        e.preventDefault();
        if (placementsAt(input.dataset.r + "," + input.dataset.c).length > 1) { dir = dir === "across" ? "down" : "across"; setActive(input); }
        return;
      }
      var move = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key];
      if (move) {
        e.preventDefault();
        // An arrow across the way you're typing turns first, where a word
        // runs that way, as crossword apps do; the next press moves.
        var want = move[0] ? "down" : "across";
        if (want !== dir && placementsAt(input.dataset.r + "," + input.dataset.c).some(function (pl) { return pl.dir === want; })) {
          dir = want; setActive(input); return;
        }
        var t = inputToward(input, move[0], move[1]);
        if (t) { dir = want; go(t); }
      }
    });

    function bindJump(el) {
      el.addEventListener("click", function () { focusAt(el.dataset.start, el.dataset.dir); });
      el.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); focusAt(el.dataset.start, el.dataset.dir); } });
    }
    gridEl.querySelectorAll(".fc-xw-cell-clue[data-start]").forEach(bindJump);
    if (cluesEl) cluesEl.querySelectorAll("[data-start]").forEach(bindJump);

    return {
      // The cell the reader was last in -- a toolbar/menu tap has taken focus
      // by the time Hint runs, so it can't just read document.activeElement.
      lastInput: function () { return lastInput; },
      // After a hint, on to the next square of the word.
      after: function (input) { pend = null; verdict(input); go(step(input, 1) || input); },
      activeCells: function () {
        var pl = lastInput && activePlacement(lastInput);
        return pl ? cellsForPlacement(pl) : [];
      }
    };
  }

  // True when every square is filled in and right -- the puzzle is solved.
  // `wrong` (optional) collects the "r,c" of every square marked wrong.
  function checkGrid(gridEl, p, wrong) {
    var all = true;
    gridEl.querySelectorAll(".fc-xw-cell-input").forEach(function (input) {
      var v = input.value.trim();
      var cell = input.closest(".fc-xw-cell");
      cell.classList.remove("fc-xw-cell-correct", "fc-xw-cell-wrong");
      if (!v) { all = false; return; }
      var correct = p.grid[input.dataset.r + "," + input.dataset.c];
      cell.classList.add(v === correct ? "fc-xw-cell-correct" : "fc-xw-cell-wrong");
      if (v !== correct) { all = false; if (wrong) wrong.push(input.dataset.r + "," + input.dataset.c); }
    });
    return all;
  }
  function revealGrid(gridEl, p) {
    gridEl.querySelectorAll(".fc-xw-cell-input").forEach(function (input) {
      input.value = p.grid[input.dataset.r + "," + input.dataset.c];
      var cell = input.closest(".fc-xw-cell");
      cell.classList.remove("fc-xw-cell-wrong");
      cell.classList.add("fc-xw-cell-correct");
    });
  }
  // One cell at a time, not the whole solution: the square you're on unless
  // it's already right (empty or wrong alike), else the next not-right
  // square of that word, else the first in reading order.
  function hintGrid(gridEl, p, nav) {
    function inputFor(k) { var parts = k.split(","); return gridEl.querySelector('.fc-xw-cell-input[data-r="' + parts[0] + '"][data-c="' + parts[1] + '"]'); }
    function open(el) { return el && el.value !== p.grid[el.dataset.r + "," + el.dataset.c]; }
    var last = nav.lastInput();
    var target = open(last) ? last : null;
    if (!target) target = nav.activeCells().map(inputFor).filter(open)[0] || null;
    if (!target) target = [].filter.call(gridEl.querySelectorAll(".fc-xw-cell-input"), open)[0] || null;
    if (!target) return null; // every cell already right
    target.value = p.grid[target.dataset.r + "," + target.dataset.c];
    var cell = target.closest(".fc-xw-cell");
    cell.classList.remove("fc-xw-cell-wrong");
    cell.classList.add("fc-xw-cell-correct");
    nav.after(target);
    return target.dataset.r + "," + target.dataset.c;
  }
  // Clears every typed letter and verdict but keeps the same grid -- for
  // trying the same puzzle again, as opposed to New puzzle's fresh layout.
  function resetGridInputs(gridEl) {
    gridEl.querySelectorAll(".fc-xw-cell-input").forEach(function (input) {
      input.value = "";
      input.closest(".fc-xw-cell").classList.remove("fc-xw-cell-correct", "fc-xw-cell-wrong");
    });
  }

  // The toolbar: one row, as an iOS game screen has it. Leading, the title
  // menu (the puzzle or game); trailing, what you use mid-play -- Hint,
  // Check (or the count / clock) -- and ⋯. Everything else is in ⋯: New
  // puzzle (its own button too on a wide window), the settings as a group
  // of value rows, How to play, Reveal / Clear / Save as PDF, and Stats.
  var NEW_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v10M4 9h10"/></svg>';
  // A page with a folded corner and a down arrow: a file you keep.
  var PDF_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 2H5a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 5 16h8a1.5 1.5 0 0 0 1.5-1.5V6Z"/><path d="M10.5 2v4h4"/><path d="M9 8.5v4.5M7 11l2 2 2-2"/></svg>';
  var MENU_ACTIONS = [["howto", "How to play", INFO_ICON], ["reveal", "Reveal puzzle", EYE_ICON], ["reset", "Clear answers", RESET_ICON], ["print", "Save as PDF", PDF_ICON], ["stats", "Stats", STATS_ICON]];
  // A word search has no letters to type, so its Hint reveals a whole word.
  var WS_MENU_LABELS = { reset: "Clear found words" };
  // Match has nothing to reveal or print mid-game (a reveal would make the
  // clock meaningless): just a new game, or the same words again.
  var MT_MENU_LABELS = { howto: "How to play", reset: "Restart", stats: "Stats" };
  function optionLabel(opts, value) {
    var hit = opts.filter(function (o) { return String(Array.isArray(o) ? o[0] : o) === String(value); })[0];
    return hit ? (Array.isArray(hit) ? hit[1] : String(hit)) : "";
  }
  function howToText() {
    var ws = state.mode === "wordsearch", ls = state.mode === "listening", mt = state.mode === "match";
    return state.mode === "wordchain" ? "Type a word that starts with the kana the last one ends on — romaji turns into kana as you type. Any word in the vocabulary counts. Hint shows one that would work; ⓘ has the rules."
      : state.mode === "speedsort" ? "Tap the bucket each word belongs in, as fast as you can. A wrong bucket adds a second."
      : state.mode === "oddone" ? "Three of the four words come from one table. Tap the one that doesn’t belong."
      : state.mode === "kanatiles" ? "Tap the kana in order to spell the word. Tap a placed one to take it back — a few tiles are look-alikes."
      : ls ? "Tap ▶ to hear a word, then pick its meaning. After you answer, you’ll see how it’s written."
      : mt ? "Tap a word, then its meaning — either side first. A wrong pair adds a second."
      : ws ? "Drag across a word, or tap its first and last letter. Words run in every direction — backwards and diagonally too."
      : "Tap a square or a clue, then type — on a keyboard, romaji turns into kana. A right square turns green. Tap a crossing square again to switch direction.";
  }
  function menuItemHtml(a, label) {
    return '<button type="button" class="fc-xw-menu-item" role="menuitem" id="fcXw' + a[0].charAt(0).toUpperCase() + a[0].slice(1) + '" data-action="' + a[0] + '">' +
      '<span class="menu-item-ic" aria-hidden="true">' + a[2] + '</span><span class="menu-item-tx">' + label + "</span></button>";
  }
  // `bare`: no puzzle to play (too few words) -- the title and a ⋯ of
  // settings + Stats, so the fix is still at hand.
  function toolbarHtml(bare) {
    var ws = state.mode === "wordsearch", ls = state.mode === "listening" || state.mode === "kanatiles" || state.mode === "oddone" || state.mode === "wordchain";
    // Listening and Kana tiles are games like Match: the same short menu,
    // a counter instead of Check.
    var mt = isGame(state.mode);
    var labels = mt ? MT_MENU_LABELS : ws ? WS_MENU_LABELS : {};
    var actions = bare ? MENU_ACTIONS.filter(function (a) { return a[0] === "stats"; })
      : mt ? MENU_ACTIONS.filter(function (a) { return MT_MENU_LABELS[a[0]]; }) : MENU_ACTIONS;
    var newLabel = mt ? "New game" : "New puzzle";
    // Word chain: a Hint (a word that would work, in English) beside ⏸,
    // and Skip -- give up on this link -- first in ⋯.
    var typed = !bare && state.mode === "wordchain";
    if (typed) actions = [["skip", "Skip this link", SKIP_ICON]].concat(actions);
    return '<div class="fc-xw-actions">' + titleMenuHtml() +
      '<div class="fc-xw-actions-end">' +
      (bare ? "" : '<button type="button" class="fc-btn fc-xw-new" id="fcXwNew">' + newLabel + "</button>" +
        (typed ? '<button type="button" class="fc-btn fc-xw-hint" id="fcXwHint" title="A word that would work">' + HINT_ICON + "Hint</button>" : "") +
        (mt ? '<button type="button" class="fc-mt-pause-btn" id="fcMtPause" aria-label="Pause">' + PAUSE_ICON + "</button>"
          : '<button type="button" class="fc-btn fc-xw-hint" id="fcXwHint" title="' + (ws ? "Reveal a word" : "Reveal a letter") + '">' + HINT_ICON + "Hint</button>") +
        (ls ? streakHtml() + '<span class="fc-ws-count" id="fcLsCount" aria-label="Question"></span>'
          : mt ? '<span class="fc-mt-split" id="fcMtSplit" aria-live="polite" hidden></span><span class="fc-ws-count fc-mt-clock" id="fcMtClock" role="timer" aria-label="Time"></span>'
          : ws ? '<span class="fc-ws-count" id="fcWsCount" aria-live="polite"></span>'
          : '<button type="button" class="fc-btn fc-btn-primary" id="fcXwCheck">Check</button>')) +
      '<div class="section-menu fc-xw-menu">' +
      '<button type="button" class="section-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="More">' + MENU_ICON + "</button>" +
      '<div class="section-menu-list fc-xw-menu-list" role="menu" hidden>' +
      (bare ? "" : menuItemHtml(["newMenu", "", NEW_ICON], newLabel).replace('class="fc-xw-menu-item"', 'class="fc-xw-menu-item fc-xw-menu-new"')) +
      actions.map(function (a) { return menuItemHtml(a, labels[a[0]] || a[1]); }).join("") +
      "</div></div>" +
      '<p class="fc-xw-tip-pop" id="fcXwTipPop" role="note" hidden>' + howToText() + "</p>" +
      "</div></div>";
  }


  // Wiring shared by the empty-state and full-puzzle renders below -- every
  // control has to work even when the current source/table pick has
  // nothing yet to build a grid from.
  // The setup rows' menus: one open at a time -- Words from's checklist
  // (state.tablesOpen, kept across the re-render each tick does) or a
  // single-choice menu (openPick, gone with the re-render a pick does).
  // Opening one lands focus on what's picked; closing goes back to its row.
  var openPick = null, tablesQuery = "";
  function setTablesOpen(panel, open) {
    if (open) closePick(panel, false);
    state.tablesOpen = open;
    var sheet = panel.querySelector("#fcXwSheet"), scrim = panel.querySelector(".fc-xw-scrim"), src = panel.querySelector("#fcXwSource");
    if (!sheet) return;
    sheet.hidden = !open;
    if (scrim) scrim.hidden = !open;
    if (src) src.setAttribute("aria-expanded", String(open));
    if (open) {
      if (sheet.scrollIntoView) sheet.scrollIntoView({ block: "nearest" });
      var first = sheet.querySelector("#fcXwTablePicker input:checked");
      if (first) first.focus();
    } else {
      filterTables(panel, "");
      if (src) src.focus();
    }
  }
  function openPickMenu(panel, name) {
    if (state.tablesOpen) setTablesOpen(panel, false);
    closePick(panel, false);
    var menu = panel.querySelector("#fcGsMenu-" + name), row = panel.querySelector('.fc-gs-pick[data-pick="' + name + '"]');
    if (!menu) return;
    openPick = name;
    menu.hidden = false;
    var scrim = panel.querySelector(".fc-xw-scrim");
    if (scrim) scrim.hidden = false;
    if (row) row.setAttribute("aria-expanded", "true");
    if (menu.scrollIntoView) menu.scrollIntoView({ block: "nearest" });
    (menu.querySelector('[aria-checked="true"]') || menu.querySelector(".fc-gs-opt")).focus();
  }
  function closePick(panel, refocus) {
    if (!openPick) return;
    var name = openPick;
    openPick = null;
    var menu = panel.querySelector("#fcGsMenu-" + name), row = panel.querySelector('.fc-gs-pick[data-pick="' + name + '"]');
    var scrim = panel.querySelector(".fc-xw-scrim");
    if (menu) menu.hidden = true;
    if (scrim && !state.tablesOpen) scrim.hidden = true;
    if (row) { row.setAttribute("aria-expanded", "false"); if (refocus) row.focus(); }
  }
  // Search narrows the checklist as you type: a table shows when its name
  // (or its category's) has the words; a category with none left hides.
  function filterTables(panel, query) {
    tablesQuery = query;
    var picker = panel.querySelector("#fcXwTablePicker"), field = panel.querySelector("#fcXwSearch");
    if (!picker) return;
    if (field && field.value !== query) field.value = query;
    var q = query.trim().toLowerCase(), any = false;
    picker.querySelectorAll(".fc-xw-table-cat").forEach(function (cat) {
      var name = cat.querySelector(".fc-xw-table-cat-name"), catHit = !!(q && name && name.textContent.toLowerCase().indexOf(q) !== -1), shown = 0;
      cat.querySelectorAll(".fc-xw-table-check").forEach(function (row) {
        var hit = !q || catHit || row.textContent.toLowerCase().indexOf(q) !== -1;
        row.hidden = !hit;
        if (hit) shown++;
      });
      cat.hidden = !shown;
      if (shown) any = true;
    });
    var none = picker.querySelector(".fc-xw-table-none");
    if (none) none.hidden = any;
  }
  // How to play: a small glass note under the toolbar, from ⋯.
  function setTipOpen(open) {
    var pop = currentPanel && currentPanel.querySelector("#fcXwTipPop");
    if (pop) pop.hidden = !open;
  }
  // Wired once per panel: outside clicks and Escape close the sheet (and How to play).
  var optionsDocWired = false;
  function wireOptionsDismiss() {
    if (optionsDocWired) return;
    optionsDocWired = true;
    document.addEventListener("click", function (e) {
      // A control inside the sheet can re-render the panel before this runs,
      // detaching the clicked node -- that was a click inside, not outside.
      var tip = currentPanel && currentPanel.querySelector("#fcXwTipPop");
      if (tip && !tip.hidden && !tip.contains(e.target) && !(e.target.closest && e.target.closest("#fcXwHowto"))) setTipOpen(false);
      if (!e.target.isConnected || !currentPanel) return;
      var panel = currentPanel;
      if (openPick) {
        var menu = panel.querySelector("#fcGsMenu-" + openPick);
        if (menu && !menu.contains(e.target) && !(e.target.closest && e.target.closest('.fc-gs-pick[data-pick="' + openPick + '"]'))) closePick(panel, false);
      }
      if (!state.tablesOpen) return;
      var box = panel.querySelector("#fcXwSheet");
      if (!box || box.contains(e.target) || (e.target.closest && e.target.closest("#fcXwSource"))) return;
      setTablesOpen(panel, false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setTipOpen(false);
      var panel = currentPanel;
      if (!panel || (!state.tablesOpen && !openPick)) return;
      if (e.key === "Escape") {
        // Escape in a search with words in it clears them first.
        if (e.target.id === "fcXwSearch" && e.target.value) { filterTables(panel, ""); return; }
        if (openPick) closePick(panel, true); else setTablesOpen(panel, false);
        return;
      }
      // Up / down walk the open menu's rows, as a native menu's.
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      var box = panel.querySelector(openPick ? "#fcGsMenu-" + openPick : "#fcXwSheet");
      if (!box) return;
      var items = [].filter.call(box.querySelectorAll(".fc-gs-opt, #fcXwSearch, #fcXwTablePicker input"), function (el) { return !el.closest("[hidden]"); });
      var at = items.indexOf(document.activeElement);
      if (!items.length) return;
      e.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))].focus();
    });
  }
  // Games from a keyboard: the arrows move between the board's tiles and
  // choices by where they sit on screen (Match's two columns, Kana tiles'
  // rows, Speed sort's buckets), Enter or Space picks, 1-9 picks a choice
  // by number, and Enter goes on when there's a Next / Play again to press.
  // A puzzle grid and a word search have their own arrow keys; a typed
  // field keeps its keys.
  var boardKeysWired = false;
  function wireBoardKeys() {
    if (boardKeysWired) return;
    boardKeysWired = true;
    function seen(el) { return !el.disabled && !el.closest("[hidden]") && el.getAttribute("aria-hidden") !== "true"; }
    document.addEventListener("keydown", function (e) {
      var panel = currentPanel;
      if (!panel || !state || !state.started || !isGame(state.mode) || state.mode === "wordchain" || panel.closest("[hidden]") || !panel.isConnected) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      var focus = document.activeElement;
      if (focus && (/^(INPUT|TEXTAREA|SELECT)$/.test(focus.tagName) || focus.isContentEditable)) return;
      if (focus && focus.closest && focus.closest(".section-menu, .fc-xw-actions")) return;
      var board = panel.querySelector(".fc-mt, .fc-ls");
      if (!board) return;
      var items = [].filter.call(board.querySelectorAll("button"), seen);
      if (!items.length) return;
      var go = [].filter.call(board.querySelectorAll(".fc-ls-next, .fc-btn-primary"), seen)[0];
      // Once Next (or Next round, Play again, Resume) shows, the choices are
      // done with: Enter presses it wherever focus is.
      if ((e.key === "Enter" || e.key === " ") && go) { e.preventDefault(); go.click(); return; }
      if (/^[1-9]$/.test(e.key)) {
        var choices = [].filter.call(board.querySelectorAll(".fc-ls-choice, .fc-oo-word, .fc-ss-bucket"), seen);
        var pick = choices[+e.key - 1];
        if (pick) { e.preventDefault(); pick.click(); }
        return;
      }
      var dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
      if (!dir) return;
      e.preventDefault();
      var at = items.indexOf(focus);
      if (at === -1) { (board.querySelector('[aria-pressed="true"]') || items.filter(function (el) { return !el.classList.contains("fc-ls-play"); })[0] || items[0]).focus(); return; }
      var r0 = focus.getBoundingClientRect();
      var cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2, best = null, bestScore = Infinity;
      items.forEach(function (el) {
        if (el === focus) return;
        var r = el.getBoundingClientRect();
        var dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
        var along = dx * dir[0] + dy * dir[1], across = Math.abs(dir[0] ? dy : dx);
        if (along <= 1) return;
        var score = along + across * 2;
        if (score < bestScore) { bestScore = score; best = el; }
      });
      // No layout to measure (nothing laid out yet): reading order.
      if (!r0.width && !r0.height) best = items[at + (dir[0] + dir[1] > 0 ? 1 : -1)] || null;
      if (best) best.focus();
    });
  }
  function bindControls(panel) {
    wireOptionsDismiss();
    wireBoardKeys();
    var done = panel.querySelector("#fcXwTablesDone");
    if (done) done.addEventListener("click", function () { setTablesOpen(panel, false); });
    openPick = null;
    panel.querySelectorAll(".fc-gs-pick[data-pick]").forEach(function (row) {
      row.addEventListener("click", function () {
        if (openPick === row.dataset.pick) closePick(panel, false); else openPickMenu(panel, row.dataset.pick);
      });
    });
    panel.querySelectorAll(".fc-gs-opt").forEach(function (opt) {
      opt.addEventListener("click", function () {
        var key = opt.dataset.pick;
        openPick = null;
        state[key] = key === "size" ? parseInt(opt.dataset.value, 10) : opt.dataset.value;
        saveSetup();
        generate();
        rerender();
        var again = currentPanel && currentPanel.querySelector('.fc-gs-pick[data-pick="' + key + '"]');
        if (again) again.focus();
      });
    });
    var src = panel.querySelector("#fcXwSource");
    if (src) src.addEventListener("click", function () { setTablesOpen(panel, !state.tablesOpen); });
    var search = panel.querySelector("#fcXwSearch");
    if (search) {
      search.addEventListener("input", function () { filterTables(panel, search.value); });
      if (state.tablesOpen && tablesQuery) filterTables(panel, tablesQuery);
    }
    var back = panel.querySelector("#fcXwBack");
    if (back) back.addEventListener("click", backToSetup);
    // Ticking a table switches to tables and adds it; Flashcards (or
    // Tricky words) and tables don't mix -- ticking Flashcards clears the
    // tables, unticking the last table goes back to Flashcards. The game
    // rebuilds as you tick; the sheet stays open until Done.
    panel.querySelectorAll("#fcXwTablePicker input[type=checkbox]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        if (cb.dataset.source) {
          if (!cb.checked) { cb.checked = true; return; }
          state.source = cb.dataset.source; state.tables = [];
        } else {
          var id = cb.dataset.tableId;
          if (state.source !== "table") { state.source = "table"; state.tables = []; }
          var i = state.tables.map(String).indexOf(id);
          if (cb.checked && i === -1) state.tables.push(id);
          else if (!cb.checked && i !== -1) state.tables.splice(i, 1);
          if (!state.tables.length) state.source = "flashcards";
        }
        // The tick re-renders the setup (the row's value, Start); keep the
        // list where it was scrolled and focus on the row just ticked.
        var list = panel.querySelector("#fcXwTablePicker"), top = list ? list.scrollTop : 0;
        var key = cb.dataset.source ? '[data-source="' + cb.dataset.source + '"]' : '[data-table-id="' + cb.dataset.tableId + '"]';
        saveSetup();
        generate();
        rerender();
        var again = currentPanel && currentPanel.querySelector("#fcXwTablePicker");
        if (!again) return;
        again.scrollTop = top;
        var row = again.querySelector("input" + key);
        if (row) row.focus({ preventScroll: true });
      });
    });
  }

  function renderCrosswords(panel) { renderTab(panel, "puzzles"); }
  function renderGames(panel) { renderTab(panel, "games"); }
  function renderTab(panel, kind) {
    if (!panel) return;
    state = states[kind];
    currentPanel = panel;
    stopMatchTimer();
    activeGame = null;
    // Below MIN_WORDS there's no real puzzle to show -- say why, and what
    // would fix it, instead of a two-word grid.
    function notEnough(msg, canRetry) {
      panel.innerHTML = toolbarHtml(true) + '<p class="fc-xw-footnote">' + msg + "</p>" +
        (canRetry ? '<div class="fc-xw-actions"><button type="button" class="fc-btn" id="fcXwNew">Try again</button></div>' : "");
      bindControls(panel);
      bindMenu(panel, {});
      var retry = document.getElementById("fcXwNew");
      if (retry) retry.addEventListener("click", function () { generate(); rerender(); });
    }
    if (!state.started) { renderSetup(panel); return; }
    var more = state.source === "table" ? "go back and tick another table under Words from" : "go back and pick tables under Words from, or add words to flashcards";
    if (!state.puzzle) generate();
    if (state.poolCount < MIN_WORDS) {
      notEnough(state.source === "table" && !state.tables.length
        ? "Choose a table to build a puzzle from (Words from, on the setup screen)."
        : "A puzzle needs at least " + MIN_WORDS + " usable words" + (state.poolCount ? " — this has " + state.poolCount : "") + ". To get more, " + more + ".", false);
      return;
    }
    var p = state.puzzle;
    // Odd one out: enough words, but not from two tables (three or more
    // from one of them) -- say what would make a set.
    if (state.mode === "oddone" && !p.questions.length) {
      notEnough("Odd one out needs words from at least two tables, with three or more from one of them. " +
        "Go back and tick them under Words from.", false);
      return;
    }
    if (state.mode === "speedsort" && !p.items.length) {
      notEnough("Speed sort needs at least 3 words of each kind: from two tables, い- and な-adjectives, or u- and ru-verbs. " +
        "Go back and tick more tables under Words from.", false);
      return;
    }
    if (state.mode === "wordchain" && !p.start) {
      notEnough("None of these words can start a chain — each ends on ん or on a kana no other word starts with. " +
        "Go back and tick more tables under Words from.", false);
      return;
    }
    if (p.placements.length < MIN_WORDS && state.mode !== "oddone" && state.mode !== "speedsort" && state.mode !== "wordchain") {
      notEnough("These words don’t cross each other enough for a " + MIN_WORDS + "-word puzzle. Try again, or " + more + ".", true);
      return;
    }
    var arroword = state.mode === "arroword";
    var wordsearch = state.mode === "wordsearch";
    var romajiMode = state.script === "romaji";
    var placedCount = p.placements.length;
    var wanted = Math.min(state.size, state.poolCount);
    // Only worth a line when the grid came up short -- a full puzzle
    // speaks for itself.
    var footnote = placedCount < wanted ? placedCount + " of " + wanted + " words fit — New puzzle tries another mix." : "";
    var titleLabel = state.source === "table" ? tablesSummary() : "Flashcards";
    var printTitle = optionLabel(MODE_OPTS, state.mode);
    var scriptLabel = SCRIPT_OPTS.filter(function (o) { return o[0] === state.script; })[0][1];
    var printMeta = titleLabel + " · " + placedCount + " words · " + scriptLabel;

    if (state.mode === "listening") {
      panel.innerHTML = toolbarHtml() + '<div class="fc-ls"></div>';
      bindControls(panel);
      document.getElementById("fcXwNew").addEventListener("click", function () { generate(); rerender(); });
      var board = panel.querySelector(".fc-ls");
      // No sound at all -- say so plainly rather than show a silent game.
      if (!canSpeak()) {
        board.innerHTML = '<p class="fc-xw-footnote">Listening needs sound, and this device has no Japanese voice. ' +
          "The app’s recorded words load the first time you’re online — try again in a moment.</p>" +
          '<div class="fc-xw-actions"><button type="button" class="fc-btn" id="fcLsRetry">Try again</button></div>';
        document.getElementById("fcLsRetry").addEventListener("click", rerender);
        document.getElementById("fcMtPause").hidden = true;
        bindMenu(panel, { reset: rerender });
        return;
      }
      var listen = wireListening(board, document.getElementById("fcLsCount"), p);
      document.getElementById("fcMtPause").addEventListener("click", listen.pause);
      bindMenu(panel, { reset: listen.restart });
      return;
    }
    if (state.mode === "speedsort") {
      panel.innerHTML = toolbarHtml() + '<div class="fc-ls fc-ss"></div>';
      bindControls(panel);
      document.getElementById("fcXwNew").addEventListener("click", function () { generate(); rerender(); });
      var sorter = wireSpeedSort(panel.querySelector(".fc-ss"), document.getElementById("fcMtClock"), p, romajiMode);
      document.getElementById("fcMtPause").addEventListener("click", sorter.pause);
      bindMenu(panel, { reset: sorter.restart });
      return;
    }
    if (state.mode === "wordchain") {
      panel.innerHTML = toolbarHtml() + '<div class="fc-ls fc-wc"></div>';
      bindControls(panel);
      document.getElementById("fcXwNew").addEventListener("click", function () { generate(); rerender(); });
      var chain = wireTypedChain(panel.querySelector(".fc-wc"), document.getElementById("fcLsCount"), p);
      document.getElementById("fcMtPause").addEventListener("click", chain.pause);
      bindMenu(panel, { reset: chain.restart, hint: chain.hint, skip: chain.skip });
      return;
    }
    if (state.mode === "oddone") {
      panel.innerHTML = toolbarHtml() + '<div class="fc-ls fc-oo"></div>';
      bindControls(panel);
      document.getElementById("fcXwNew").addEventListener("click", function () { generate(); rerender(); });
      var odd = wireOddOne(panel.querySelector(".fc-oo"), document.getElementById("fcLsCount"), p, romajiMode);
      document.getElementById("fcMtPause").addEventListener("click", odd.pause);
      bindMenu(panel, { reset: odd.restart });
      return;
    }
    if (state.mode === "kanatiles") {
      panel.innerHTML = toolbarHtml() + '<div class="fc-ls fc-kt"></div>';
      bindControls(panel);
      document.getElementById("fcXwNew").addEventListener("click", function () { generate(); rerender(); });
      var tiles = wireKanaTiles(panel.querySelector(".fc-kt"), document.getElementById("fcLsCount"), p);
      document.getElementById("fcMtPause").addEventListener("click", tiles.pause);
      bindMenu(panel, { reset: tiles.restart });
      return;
    }
    if (state.mode === "match") {
      panel.innerHTML = toolbarHtml() + '<div class="fc-mt"></div>';
      bindControls(panel);
      document.getElementById("fcXwNew").addEventListener("click", function () { generate(); rerender(); });
      var game = wireMatch(panel.querySelector(".fc-mt"), document.getElementById("fcMtClock"), p, romajiMode);
      document.getElementById("fcMtPause").addEventListener("click", game.pause);
      bindMenu(panel, { reset: game.restart });
      return;
    }

    // Toolbar, then the puzzle: grid leading with the current clue and the
    // clue lists beside it on a wide window; on a phone the clue bar sits
    // above the grid and the lists below (grid areas, one DOM order).
    panel.innerHTML =
      toolbarHtml() +
      (footnote ? '<p class="fc-xw-footnote">' + esc(footnote) + "</p>" : "") +
      '<div class="fc-xw-puzzle print-target' + (arroword ? " fc-xw-puzzle-arroword" : "") +
      '" data-natural="' + (wordsearch ? p.cols * WS_CELL + 16 : p.cols * GRID_CELL) + '">' +
      '<header class="fc-xw-print-head"><h2 class="fc-xw-print-title">' + esc(printTitle) + "</h2>" +
      '<p class="fc-xw-print-meta">' + esc(printMeta) + "</p></header>" +
      (wordsearch
        ? '<div class="fc-xw-gridwrap">' + wordSearchGridHtml(p, romajiMode) + "</div>"
        : '<p class="fc-xw-current fc-xw-current-idle" aria-live="polite" hidden></p>' +
          '<div class="fc-xw-gridwrap"><div class="fc-xw-grid">' +
          gridHtml(p, arroword, romajiMode) + "</div></div>") +
      '<div class="fc-xw-side">' + (wordsearch ? wordSearchListHtml(p) : arroword ? "" : clueListHtml(p)) + notesHtml() + "</div>" +
      "</div>";

    fitPuzzle();
    bindControls(panel);
    var notes = document.getElementById("fcXwNotes");
    notes.value = state.notes;
    notes.addEventListener("input", function () { state.notes = notes.value; });
    document.getElementById("fcXwNew").addEventListener("click", function () { generate(); rerender(); });
    // A solved grid or word search goes to the Dashboard's log, once per
    // puzzle: the time from when it appeared and how many letters / words
    // were revealed. Revealing the whole puzzle means it wasn't solved.
    var solve = { start: Date.now(), help: 0, done: false, missed: {} };
    // A word you needed a letter of, or got a square of wrong, is missed.
    function missCells(keys) {
      p.placements.forEach(function (pl) {
        var cells = cellsForPlacement(pl);
        if (keys.some(function (k) { return cells.indexOf(k) !== -1; })) solve.missed[pl.id] = true;
      });
    }
    // `pieces` is what a hint reveals one of (words in a word search,
    // squares in a grid): all of them revealed isn't solving it either.
    function solved(n, pieces) {
      if (solve.done) return;
      solve.done = true;
      if (solve.help >= pieces) return;
      recordRun({ mode: state.mode, n: n, ms: Date.now() - solve.start, help: solve.help,
        setup: setupKey(p.placements.length), missed: Object.keys(solve.missed) });
    }
    // Save as PDF: the sheet drawn by puzzle-pdf.js, answer key last.
    function savePdf() {
      var pdf = window.RaumeStudy.flashcards.puzzlePdf;
      if (!pdf) return;
      var wsAnswers = wordsearch ? p.placements.map(function (pl) {
        var entry = vocabIndex()[pl.id];
        var reading = entry ? String(entry.jpReading || "").replace(/^〜/, "").trim() : "";
        return /[一-龯々]/.test(pl.answer) && reading ? pl.answer + "（" + reading + "）" : pl.answer;
      }) : null;
      pdf.save({ mode: state.mode, puzzle: p, title: printTitle, meta: printMeta, wsAnswers: wsAnswers },
        "raume-" + state.mode + "-" + window.RaumeStudy.flashcards.store.localDateStr(new Date()) + ".pdf")
        .catch(function (e) { console.error("Puzzles: could not make the PDF", e); });
    }
    if (wordsearch) {
      var ws = wireWordSearch(panel.querySelector(".fc-ws-grid"), panel.querySelector(".fc-ws-list"), document.getElementById("fcWsCount"), p,
        function () { solved(p.placements.length, p.placements.length); });
      bindMenu(panel, {
        hint: function () { solve.help++; var pl = ws.revealOne(); if (pl) solve.missed[pl.id] = true; },
        reveal: function () { solve.done = true; ws.revealAll(); },
        reset: ws.reset,
        print: savePdf
      });
      return;
    }
    var gridEl = panel.querySelector(".fc-xw-grid");
    var nav = wireGrid(gridEl, panel.querySelector(".fc-xw-clues"), panel.querySelector(".fc-xw-current"), p, arroword, state.script,
      function () { solved(p.placements.length, gridEl.querySelectorAll(".fc-xw-cell-input").length); });

    document.getElementById("fcXwCheck").addEventListener("click", function () {
      var wrong = [];
      var all = checkGrid(gridEl, p, wrong);
      missCells(wrong);
      if (all) solved(p.placements.length, gridEl.querySelectorAll(".fc-xw-cell-input").length);
    });
    bindMenu(panel, {
      hint: function () { solve.help++; var k = hintGrid(gridEl, p, nav); if (k) missCells([k]); },
      reveal: function () { solve.done = true; revealGrid(gridEl, p); },
      reset: function () { resetGridInputs(gridEl); },
      print: savePdf
    });
  }

  // The ⋯ menu's items: New puzzle and Print are the same for every style,
  // the reveal / clear actions come from the style's own wiring.
  function bindMenu(panel, actions) {
    actions.newMenu = function () { generate(); rerender(); };
    actions.stats = openStats;
    actions.howto = function () { setTipOpen(true); };
    var hint = panel.querySelector("#fcXwHint");
    if (hint && actions.hint) hint.addEventListener("click", actions.hint);
    var menu = panel.querySelector(".fc-xw-menu");
    menu.querySelectorAll(".fc-xw-menu-item").forEach(function (item) {
      item.addEventListener("click", function () {
        // The shared handler in interactions.js opens/closes on the ⋯ button
        // and outside taps; a chosen item closes it here.
        menu.querySelector(".section-menu-list").hidden = true;
        menu.querySelector(".section-menu-btn").setAttribute("aria-expanded", "false");
        actions[item.dataset.action]();
      });
    });
  }

  // Stats' "Practise these": the chosen style, from just these words.
  function playWords(kind, mode, ids) {
    var st = states[kind];
    st.mode = mode; st.source = "tricky"; st.trickyIds = ids.slice(); st.tables = []; st.tablesOpen = false;
    st.puzzle = null; st.started = true;
    state = st;
    generate();
  }

  states.puzzles = freshState("puzzles");
  states.games = freshState("games");
  state = states.puzzles;

  return {
    playWords: playWords,
    renderCrosswords: renderCrosswords,
    renderGames: renderGames,
    // pure hooks for scripts/smoke-test.js
    __testHooks: {
      wordPool: wordPool, flashcardsWordPool: flashcardsWordPool, tableWordPool: tableWordPool, weightedOrder: weightedOrder, generate: generate,
      buildGrid: buildGrid, buildWordSearch: buildWordSearch, buildMatch: buildMatch, buildListening: buildListening, buildKanaTiles: buildKanaTiles, kanaDecoys: kanaDecoys, buildOddOne: buildOddOne, buildSpeedSort: buildSpeedSort, sortBuckets: sortBuckets, buildTypedChain: buildTypedChain, chainKey: chainKey, chainDictionary: chainDictionary, chainHead: chainHead, chainTail: chainTail, matchRounds: matchRounds, bestTime: bestTime, toHiragana: toHiragana, toKatakana: toKatakana, scriptedAnswer: scriptedAnswer,
      foldRomajiForGrid: foldRomajiForGrid, isGiveaway: isGiveaway, MIN_WORDS: MIN_WORDS,
      // the tab showing (or last shown): Puzzles' or Games' settings
      get state() { return state; }, states: states
    }
  };
})();
