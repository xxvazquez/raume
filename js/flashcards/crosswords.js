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
  var HINT_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2.5a4.5 4.5 0 0 0-2.5 8.25c.4.28.6.7.6 1.15v.6h4v-.6c0-.45.2-.87.6-1.15A4.5 4.5 0 0 0 9 2.5Z"/><path d="M7 15h4M7.5 13.4h3"/></svg>';
  var RESET_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 9A5.5 5.5 0 1 1 12.9 5.1"/><path d="M14.5 3v4h-4"/></svg>';
  // Same ⋯ glyph as a reference table's overflow menu (js/vocab/render.js's
  // MENU_ICON) -- the menu itself reuses that one's markup, so the delegated
  // open/close/Escape handling in js/vocab/interactions.js covers it too.
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
  function flashcardsWordPool() {
    var index = vocabIndex();
    var cards = store.getCache().cards;
    var vocabIds = {};
    Object.keys(cards).forEach(function (key) {
      var card = cards[key];
      if (card.active) vocabIds[card.vocabId] = true;
    });
    var entries = Object.keys(vocabIds)
      .map(function (id) { return index[id]; })
      .filter(function (entry) { return entry && !store.isTablePaused(entry.tableId); });
    return poolFromEntries(entries);
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
  function wordPool() {
    return state.source === "table" ? tableWordPool(state.tables) : flashcardsWordPool();
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
    var list = shuffle(words);
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
    shuffle(words).some(function (w) {
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
      countEl.textContent = n === found.length ? "All " + n + " found" : n + " of " + found.length + " found";
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
      revealOne: function () {
        var i = found.indexOf(false);
        if (i === -1) return;
        var ends = placementEnds(p.placements[i]);
        markFound(i, ends[0], ends[1]);
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
  // per word set (source + script + pair count) is the one thing this tab
  // keeps -- practice only, never an FSRS review.
  // -----------------------------------------------------------------------
  var MATCH_ROUND = 6;
  var MATCH_PENALTY_MS = 1000;
  var MATCH_BEST_KEY = "raume-match-best";
  function matchRounds(n) {
    var count = Math.ceil(n / MATCH_ROUND), sizes = [];
    for (var i = 0; i < count; i++) sizes.push(Math.floor(n / count) + (i < n % count ? 1 : 0));
    return sizes;
  }
  function buildMatch(words, limit) {
    var picked = shuffle(words).slice(0, limit);
    var rounds = [], at = 0;
    matchRounds(picked.length).forEach(function (size) { rounds.push(picked.slice(at, at + size)); at += size; });
    return { placements: picked, rounds: rounds };
  }
  function formatClock(ms) {
    var tenths = Math.floor(ms / 100), s = Math.floor(tenths / 10);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + "." + (tenths % 10);
  }
  function matchBestKey(p) {
    var src = state.source === "table" ? "tables:" + state.tables.map(String).sort().join(",") : "flashcards";
    return src + "|" + state.script + "|" + p.placements.length;
  }
  function readBest() {
    try { return JSON.parse(localStorage.getItem(MATCH_BEST_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveBest(key, ms) {
    // A private window can refuse storage -- the game still plays, it just
    // can't remember a best.
    try { var all = readBest(); all[key] = ms; localStorage.setItem(MATCH_BEST_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ }
  }
  // Every finished Match / Listening game goes to the Dashboard's log.
  function recordRun(run) {
    var runs = window.RaumeStudy.flashcards.puzzleRuns;
    return runs ? runs.record(run) : null;
  }
  // Under a finished Match: pace per pair and where this run ranks among
  // every run of the same setup, then a sparkline of the last ten -- this
  // one the highlighted dot. Faster is higher on the line.
  function ordinal(n) {
    var t = n % 100, u = n % 10;
    return n + (t >= 11 && t <= 13 ? "th" : u === 1 ? "st" : u === 2 ? "nd" : u === 3 ? "rd" : "th");
  }
  // Under a finished Listening game: this game's accuracy beside your
  // average over every Listening game so far.
  function listeningStatsHtml(right, n, run) {
    var runs = window.RaumeStudy.flashcards.puzzleRuns;
    var all = runs ? runs.all().filter(function (r) { return r.mode === "listening"; }) : [];
    if (run && !all.some(function (r) { return r.id === run.id; })) all.push(run);
    var asked = 0, got = 0;
    all.forEach(function (r) { asked += r.n; got += r.right || 0; });
    return '<div class="fc-mt-stats"><div class="fc-mt-stat"><span class="fc-mt-stat-val">' + Math.round(right / n * 100) + '%</span><span class="fc-mt-stat-lbl">this game</span></div>' +
      (all.length > 1 ? '<div class="fc-mt-stat"><span class="fc-mt-stat-val">' + Math.round(got / asked * 100) + '%</span><span class="fc-mt-stat-lbl">over ' + all.length + " games</span></div>" : "") +
      "</div>";
  }
  function matchStatsHtml(key, total, pairs, run) {
    var runs = window.RaumeStudy.flashcards.puzzleRuns;
    var same = runs ? runs.all().filter(function (r) { return r.mode === "match" && r.setup === key; }) : [];
    if (run && !same.some(function (r) { return r.id === run.id; })) same.push(run);
    var rank = 1 + same.filter(function (r) { return r.ms < total; }).length;
    var cells = '<div class="fc-mt-stat"><span class="fc-mt-stat-val">' + (total / pairs / 1000).toFixed(1) + 's</span><span class="fc-mt-stat-lbl">per pair</span></div>' +
      (same.length > 1 ? '<div class="fc-mt-stat"><span class="fc-mt-stat-val">' + ordinal(rank) + '</span><span class="fc-mt-stat-lbl">of ' + same.length + " runs</span></div>" : "");
    var last = same.slice(-10), spark = "";
    if (last.length > 1) {
      var max = Math.max.apply(null, last.map(function (r) { return r.ms; }));
      var min = Math.min.apply(null, last.map(function (r) { return r.ms; }));
      var span = Math.max(1, max - min), w = 120, h = 32, step = w / (last.length - 1);
      var pts = last.map(function (r, i) { return [Math.round(i * step * 10) / 10, Math.round((4 + (r.ms - min) / span * (h - 8)) * 10) / 10]; });
      var end = pts[pts.length - 1];
      spark = '<svg class="fc-mt-spark" viewBox="-4 0 128 32" width="128" height="32" role="img" aria-label="Your last ' + last.length + ' times on these words">' +
        '<polyline points="' + pts.map(function (q) { return q.join(","); }).join(" ") + '"/>' +
        '<circle cx="' + end[0] + '" cy="' + end[1] + '" r="3.2"/></svg>' +
        '<span class="fc-mt-spark-lbl">last ' + last.length + " runs</span>";
    }
    return '<div class="fc-mt-stats">' + cells + "</div>" + spark;
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
    (runs ? runs.all() : []).forEach(function (r) {
      if (r.mode === "match" && r.setup === key && r.splits && r.splits.length === rounds && (!best || r.ms < best.ms)) best = r;
    });
    return best ? best.splits : null;
  }
  function wireMatch(boardEl, clockEl, p, romajiMode) {
    var round, start, penalty, misses, selected, left, game = 0, splits, pb;
    var splitEl = document.getElementById("fcMtSplit");
    function showSplit(i, at) {
      if (!splitEl || !pb || pb[i] == null) return;
      var d = at - pb[i], ahead = d <= 0;
      splitEl.textContent = (ahead ? "−" : "+") + (Math.abs(d) / 1000).toFixed(1) + "s";
      splitEl.className = "fc-mt-split " + (ahead ? "fc-mt-split-ahead" : "fc-mt-split-behind");
      splitEl.setAttribute("aria-label", (Math.abs(d) / 1000).toFixed(1) + " seconds " + (ahead ? "ahead of" : "behind") + " your best");
      splitEl.hidden = false;
    }
    function elapsed() { return start === null ? 0 : Date.now() - start + penalty; }
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
      boardEl.innerHTML =
        (p.rounds.length > 1 ? '<p class="fc-mt-round">Round ' + (round + 1) + " of " + p.rounds.length + "</p>" : "") +
        '<div class="fc-mt-cols">' +
        '<div class="fc-mt-col">' + shuffle(order).map(function (i) { return tileHtml("l", i, words[i].answer); }).join("") + "</div>" +
        '<div class="fc-mt-col">' + shuffle(order).map(function (i) { return tileHtml("r", i, words[i].clue); }).join("") + "</div>" +
        "</div>";
    }
    function finish() {
      stopMatchTimer();
      var total = splits.length ? splits[splits.length - 1] : elapsed();
      if (splitEl) splitEl.hidden = true;
      clockEl.textContent = formatClock(total);
      clockEl.classList.add("fc-ws-count-done");
      var key = matchBestKey(p), best = readBest()[key];
      var isBest = typeof best !== "number" || total < best;
      if (isBest) saveBest(key, total);
      var run = recordRun({ mode: "match", n: p.placements.length, ms: total, miss: misses, setup: key, splits: splits });
      var missText = misses === 0 ? "no misses" : misses + (misses === 1 ? " miss" : " misses");
      var outcome = typeof best !== "number" ? "New best"
        : isBest ? "New best · " + ((best - total) / 1000).toFixed(1) + "s faster"
        : ((total - best) / 1000).toFixed(1) + "s off your best";
      boardEl.innerHTML = '<div class="fc-mt-done" role="status">' +
        '<p class="fc-mt-done-time">' + formatClock(total) + "</p>" +
        '<p class="fc-mt-done-meta">' + outcome + " · " + missText + "</p>" +
        matchStatsHtml(key, total, p.placements.length, run) +
        '<button type="button" class="fc-btn fc-btn-primary" id="fcMtAgain">Play again</button></div>';
      document.getElementById("fcMtAgain").addEventListener("click", function () { generate(); rerender(); });
    }
    function select(tile) {
      if (selected) selected.setAttribute("aria-pressed", "false");
      selected = tile;
      if (tile) tile.setAttribute("aria-pressed", "true");
    }
    boardEl.addEventListener("click", function (e) {
      var tile = e.target.closest(".fc-mt-tile");
      if (!tile || tile.disabled) return;
      if (start === null) { start = Date.now(); matchTimer = setInterval(tick, 100); }
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
        if (round + 1 < p.rounds.length) showSplit(round, at);
        else stopMatchTimer();
        setTimeout(function () {
          if (thisGame !== game || !boardEl.isConnected) return;
          if (round + 1 < p.rounds.length) { round++; renderRound(); } else finish();
        }, 350);
      } else {
        penalty += MATCH_PENALTY_MS;
        misses++;
        tick();
        pair.forEach(function (t) { t.classList.remove("fc-mt-wrong"); void t.offsetWidth; t.classList.add("fc-mt-wrong"); });
        setTimeout(function () { pair.forEach(function (t) { t.classList.remove("fc-mt-wrong"); }); }, 450);
      }
    });
    // Same words, reshuffled, clock back to zero.
    function restart() {
      stopMatchTimer();
      game++;
      round = 0; start = null; penalty = 0; misses = 0; splits = [];
      pb = bestSplits(matchBestKey(p), p.rounds.length);
      if (splitEl) splitEl.hidden = true;
      clockEl.textContent = formatClock(0);
      clockEl.classList.remove("fc-ws-count-done");
      renderRound();
    }
    restart();
    return { restart: restart };
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
    var picked = shuffle(words).slice(0, limit);
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
  var PLAY_ICON = '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z"/></svg>';
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
    var at, score, missed, game = 0, played, startedAt;
    function count() { countEl.textContent = Math.min(at + 1, p.questions.length) + " / " + p.questions.length; }
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
      var q = p.questions[at], chosen = q.choices[+btn.dataset.i], right = chosen === q.word, thisGame = game;
      boardEl.querySelectorAll(".fc-ls-choice").forEach(function (b) {
        b.disabled = true;
        if (q.choices[+b.dataset.i] === q.word) b.classList.add("fc-mt-right");
      });
      if (!right) btn.classList.add("fc-mt-wrong", "fc-ls-chosen-wrong");
      var word = boardEl.querySelector(".fc-ls-word");
      word.innerHTML = spokenWordHtml(q.word);
      word.hidden = false;
      boardEl.querySelector(".fc-ls-hint").hidden = true;
      if (right) {
        score++;
        setTimeout(function () { if (thisGame === game && boardEl.isConnected) next(); }, 1100);
      } else {
        missed.push(q.word);
        var nextBtn = boardEl.querySelector(".fc-ls-next");
        nextBtn.hidden = false;
        nextBtn.focus();
      }
    }
    function finish() {
      var run = recordRun({ mode: "listening", n: p.questions.length, ms: Date.now() - startedAt, right: score });
      countEl.textContent = score + " / " + p.questions.length;
      countEl.classList.add("fc-ws-count-done");
      boardEl.innerHTML = '<div class="fc-mt-done" role="status">' +
        '<p class="fc-mt-done-time">' + score + " / " + p.questions.length + "</p>" +
        listeningStatsHtml(score, p.questions.length, run) +
        '<p class="fc-mt-done-meta">' + (missed.length ? "Words to listen to again:" : "Every word right") + "</p>" +
        (missed.length ? '<ul class="fc-ls-missed">' + missed.map(function (w, i) {
          return '<li><button type="button" class="fc-ls-say" data-m="' + i + '" aria-label="Play">' + SPEAKER_ICON + "</button>" +
            '<span class="fc-ls-missed-word">' + spokenWordHtml(w) + '</span><span class="fc-ls-missed-en">' + esc(w.clue) + "</span></li>";
        }).join("") + "</ul>" : "") +
        '<button type="button" class="fc-btn fc-btn-primary" id="fcLsAgain">Play again</button></div>';
      document.getElementById("fcLsAgain").addEventListener("click", function () { generate(); rerender(); });
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
      at = 0; score = 0; missed = []; played = false; startedAt = Date.now();
      countEl.classList.remove("fc-ws-count-done");
      renderQuestion();
    }
    restart();
    return { restart: restart };
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
  function freshState(kind) {
    return { kind: kind, source: "flashcards", tables: [], tablesOpen: false, mode: kind === "games" ? "match" : "crossword",
      script: "romaji", size: 15, puzzle: null, poolCount: 0, notes: "" };
  }
  var states = { puzzles: freshState("puzzles"), games: freshState("games") };
  var state = states.puzzles;
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
      return { id: w.id, clue: w.clue, answer: answer };
    }).filter(function (w) { if (seen[w.answer]) return false; seen[w.answer] = true; return true; });
    // A two-letter romaji word turns up by chance all over a word search's
    // filler -- finding "ki" there is luck, not recall.
    if (state.mode === "wordsearch" && state.script === "romaji") candidates = candidates.filter(function (w) { return w.answer.length >= 3; });
    // Likewise a one-kanji word (水) is a single square to spot.
    if (state.mode === "wordsearch" && state.script === "native") candidates = candidates.filter(function (w) { return w.answer.length >= 2; });
    // Match shows clues side by side: two words that share an English
    // meaning would be a coin toss, so keep only the first of them.
    if (state.mode === "match") {
      var seenClue = {};
      candidates = candidates.filter(function (w) {
        var key = w.clue.toLowerCase();
        if (seenClue[key]) return false;
        seenClue[key] = true;
        return true;
      });
    }
    state.poolCount = candidates.length;
    state.puzzle = state.mode === "wordsearch" ? buildWordSearch(candidates, state.size)
      : state.mode === "match" ? buildMatch(candidates, state.size)
      : buildGrid(candidates, state.mode === "arroword", state.size);
  }

  var MODE_OPTS = [["crossword", "Crossword"], ["arroword", "Arroword"], ["wordsearch", "Word search"], ["match", "Match"], ["listening", "Listening"]];
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
  var GAME_SIZE_OPTS = [10, 15, 20, 30, 40, 60, 80, 100, [String(ALL_WORDS), "All"]];
  function isGame(mode) { return mode === "match" || mode === "listening"; }
  function sizeOpts() { return isGame(state.mode) ? GAME_SIZE_OPTS : GRID_SIZE_OPTS; }
  // The count the game will really have: never more than the pool holds.
  function sizeLabel() {
    var n = Math.min(state.size, state.poolCount || state.size);
    if (state.size === ALL_WORDS) return "All " + n + " words";
    return n + (n === 1 ? " word" : " words");
  }

  // An iOS pull-down button (UIButton's menu as its primary action): a
  // white capsule showing the current value and a small up/down chevron. A
  // real <select> sits invisibly over it, so one tap opens the platform's
  // own menu and a second picks -- no sheet to open first. The select is
  // 16px so iOS never zooms in on it; its aria-label names the setting.
  var UPDOWN_ICON = '<svg class="fc-xw-updown" viewBox="0 0 18 18" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 7 9 3.5 12.5 7M5.5 11 9 14.5 12.5 11"/></svg>';
  function optionsHtml(options, current) {
    return options.map(function (o) {
      var val = Array.isArray(o) ? o[0] : String(o);
      var text = Array.isArray(o) ? o[1] : String(o);
      return '<option value="' + esc(val) + '"' + (String(current) === val ? " selected" : "") + ">" + esc(text) + "</option>";
    }).join("");
  }
  function chipHtml(name, label, shown, optsHtml) {
    return '<label class="fc-xw-chip"><span class="fc-xw-chip-text">' + esc(shown) + "</span>" + UPDOWN_ICON +
      '<select class="fc-xw-pick-select" data-pick="' + name + '" aria-label="' + esc(label) + '">' + optsHtml + "</select></label>";
  }
  function pickChip(name, label, options, current) {
    return chipHtml(name, label, optionLabel(options, current), optionsHtml(options, current));
  }

  function selectedTables() {
    var ids = state.tables.map(String);
    return vocabTables().filter(function (t) { return ids.indexOf(String(t.id)) !== -1; });
  }
  function tablesSummary() {
    var titles = selectedTables().map(function (t) { return t.title; });
    if (!titles.length) return "Choose tables";
    if (titles.length <= 2) return titles.join(", ");
    return titles.length + " tables";
  }
  // Checkmark rows grouped by category (the Settings tab's study-direction
  // rows), not a giant segmented control --
  // more than one table can feed a single puzzle (mix "Numbers" + "Time"
  // for a bigger pool). Shown in the "Several tables…" popover.
  function tableChecklistHtml() {
    var byCategory = {};
    vocabTables().forEach(function (t) {
      var cat = t.category || "Tables";
      (byCategory[cat] = byCategory[cat] || []).push(t);
    });
    var cats = Object.keys(byCategory).sort(function (a, b) { return a.localeCompare(b); });
    var selected = state.tables.map(String);
    var groups = cats.map(function (cat) {
      var items = byCategory[cat].slice().sort(function (a, b) { return a.title.localeCompare(b.title); })
        .map(function (t) {
          var on = selected.indexOf(String(t.id)) !== -1;
          return '<label class="fc-direction-check fc-xw-table-check"><input type="checkbox" data-table-id="' + t.id + '"' + (on ? " checked" : "") + ">" + esc(t.title) + "</label>";
        }).join("");
      return '<div class="fc-xw-table-cat"><div class="fc-xw-table-cat-name">' + esc(cat) + "</div>" + items + "</div>";
    }).join("");
    return '<div class="fc-xw-table-picker" id="fcXwTablePicker">' + groups + "</div>";
  }
  // Source is one pull-down too: Flashcards, or any single table (grouped
  // by category) -- the common case in two taps. "Several tables…" opens
  // the checklist as a popover (a bottom sheet on a phone) to mix tables
  // into one pool; while several are picked the button names them.
  function sourceChipHtml() {
    var picked = state.source === "table" ? state.tables.map(String) : [];
    var several = picked.length > 1;
    var byCategory = {};
    vocabTables().forEach(function (t) { (byCategory[t.category || "Tables"] = byCategory[t.category || "Tables"] || []).push(t); });
    var opts = '<option value="flashcards"' + (state.source === "flashcards" ? " selected" : "") + ">Flashcards</option>" +
      (several ? '<option value="multi" selected>' + esc(tablesSummary()) + "</option>" : "") +
      Object.keys(byCategory).sort(function (a, b) { return a.localeCompare(b); }).map(function (cat) {
        return '<optgroup label="' + esc(cat) + '">' + byCategory[cat].slice().sort(function (a, b) { return a.title.localeCompare(b.title); }).map(function (t) {
          var on = !several && picked[0] === String(t.id);
          return '<option value="t:' + esc(String(t.id)) + '"' + (on ? " selected" : "") + ">" + esc(t.title) + "</option>";
        }).join("") + "</optgroup>";
      }).join("") +
      '<option value="several">Several tables…</option>';
    var shown = state.source === "table" ? tablesSummary() : "Flashcards";
    return '<div class="fc-xw-source">' + chipHtml("source", "Words from", shown, opts) +
      '<div class="fc-xw-scrim"' + (state.tablesOpen ? "" : " hidden") + "></div>" +
      '<div class="fc-xw-sheet" id="fcXwSheet" role="dialog" aria-label="Tables"' + (state.tablesOpen ? "" : " hidden") + ">" +
      '<div class="fc-xw-sheet-head"><h4 class="fc-xw-sheet-title">Tables</h4>' +
      '<button type="button" class="fc-xw-sheet-done" id="fcXwTablesDone">Done</button></div>' +
      tableChecklistHtml() + "</div></div>";
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
  // -----------------------------------------------------------------------
  function wireGrid(gridEl, cluesEl, currentEl, p, arroword) {
    var dir = "across", lastInput = null;
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
      if (input.value.length > 1) input.value = input.value.slice(-1);
      // Lowercase as typed -- only meaningful for a romaji answer (kana
      // passes through toLowerCase untouched), so this is safe in every mode.
      input.value = input.value.toLowerCase();
      if (!input.value) return;
      // Letter cells in a line are always one word (fits() never lets two
      // words run end to end), so the next cell along is still this word.
      go(step(input, 1));
    }
    gridEl.addEventListener("input", function (e) {
      var input = e.target.closest(".fc-xw-cell-input");
      if (input && !composing) afterType(input);
    });

    gridEl.addEventListener("keydown", function (e) {
      var input = e.target.closest(".fc-xw-cell-input");
      if (!input) return;
      if (e.key === "Backspace" && !input.value) {
        var prev = step(input, -1);
        if (prev) { e.preventDefault(); prev.value = ""; clearVerdict(prev); go(prev); }
        return;
      }
      var move = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key];
      if (move) {
        var t = inputAt(+input.dataset.r + move[0], +input.dataset.c + move[1]);
        if (t) { e.preventDefault(); dir = move[0] ? "down" : "across"; go(t); }
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
      activeCells: function () {
        var pl = lastInput && activePlacement(lastInput);
        return pl ? cellsForPlacement(pl) : [];
      }
    };
  }

  // True when every square is filled in and right -- the puzzle is solved.
  function checkGrid(gridEl, p) {
    var all = true;
    gridEl.querySelectorAll(".fc-xw-cell-input").forEach(function (input) {
      var v = input.value.trim();
      var cell = input.closest(".fc-xw-cell");
      cell.classList.remove("fc-xw-cell-correct", "fc-xw-cell-wrong");
      if (!v) { all = false; return; }
      var correct = p.grid[input.dataset.r + "," + input.dataset.c];
      cell.classList.add(v === correct ? "fc-xw-cell-correct" : "fc-xw-cell-wrong");
      if (v !== correct) all = false;
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
  // One cell at a time, not the whole solution: the cell you were last in
  // if it's still empty, else the next empty cell of that word, else the
  // first empty cell in reading order.
  function hintGrid(gridEl, p, nav) {
    function inputFor(k) { var parts = k.split(","); return gridEl.querySelector('.fc-xw-cell-input[data-r="' + parts[0] + '"][data-c="' + parts[1] + '"]'); }
    var last = nav.lastInput();
    var target = last && !last.value ? last : null;
    if (!target) target = nav.activeCells().map(inputFor).filter(function (el) { return el && !el.value; })[0] || null;
    if (!target) target = [].filter.call(gridEl.querySelectorAll(".fc-xw-cell-input"), function (el) { return !el.value; })[0] || null;
    if (!target) return; // every cell already filled
    target.value = p.grid[target.dataset.r + "," + target.dataset.c];
    var cell = target.closest(".fc-xw-cell");
    cell.classList.remove("fc-xw-cell-wrong");
    cell.classList.add("fc-xw-cell-correct");
    target.focus();
  }
  // Clears every typed letter and verdict but keeps the same grid -- for
  // trying the same puzzle again, as opposed to New puzzle's fresh layout.
  function resetGridInputs(gridEl) {
    gridEl.querySelectorAll(".fc-xw-cell-input").forEach(function (input) {
      input.value = "";
      input.closest(".fc-xw-cell").classList.remove("fc-xw-cell-correct", "fc-xw-cell-wrong");
    });
  }

  // The settings as a row of pull-down buttons, always in view: Style,
  // where the words come from, how many, and the script (not for
  // Listening -- you hear the word). Changing one makes a new puzzle.
  function picksHtml() {
    return '<div class="fc-xw-picks">' +
      pickChip("mode", state.kind === "games" ? "Game" : "Puzzle", modeOpts(), state.mode) +
      sourceChipHtml() +
      chipHtml("size", "Words", sizeLabel(), optionsHtml(sizeOpts(), state.size)) +
      (state.mode !== "listening" ? pickChip("script", "Script", scriptOpts(), state.script) : "") +
      "</div>";
  }

  // The toolbar: the settings leading; trailing, New puzzle, the ⓘ how-to,
  // Hint (the help you reach for mid-solve, so a labelled button of its own,
  // not buried in a menu) and Check filled; the rarer Reveal puzzle / Clear /
  // Save as PDF in a ⋯ menu. New puzzle is also in the menu, shown there
  // only on a phone, where the toolbar has no room for its own button.
  var NEW_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v10M4 9h10"/></svg>';
  // A page with a folded corner and a down arrow: a file you keep.
  var PDF_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 2H5a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 5 16h8a1.5 1.5 0 0 0 1.5-1.5V6Z"/><path d="M10.5 2v4h4"/><path d="M9 8.5v4.5M7 11l2 2 2-2"/></svg>';
  var MENU_ACTIONS = [["newMenu", "New puzzle", NEW_ICON], ["reveal", "Reveal puzzle", EYE_ICON], ["reset", "Clear answers", RESET_ICON], ["print", "Save as PDF", PDF_ICON]];
  // A word search has no letters to type, so its Hint reveals a whole word.
  var WS_MENU_LABELS = { reset: "Clear found words" };
  // Match has nothing to reveal or print mid-game (a reveal would make the
  // clock meaningless): just a new game, or the same words again.
  var MT_MENU_LABELS = { newMenu: "New game", reset: "Restart" };
  function optionLabel(opts, value) {
    var hit = opts.filter(function (o) { return String(Array.isArray(o) ? o[0] : o) === String(value); })[0];
    return hit ? (Array.isArray(hit) ? hit[1] : String(hit)) : "";
  }
  function toolbarHtml() {
    var ws = state.mode === "wordsearch", ls = state.mode === "listening";
    // Listening is a game like Match: the same short menu, a counter
    // instead of Check.
    var mt = state.mode === "match" || ls;
    var labels = mt ? MT_MENU_LABELS : ws ? WS_MENU_LABELS : {};
    var actions = mt ? MENU_ACTIONS.filter(function (a) { return MT_MENU_LABELS[a[0]]; }) : MENU_ACTIONS;
    return '<div class="fc-xw-actions">' + picksHtml() +
      '<div class="fc-xw-actions-end">' +
      '<button type="button" class="fc-btn" id="fcXwNew">' + (mt ? "New game" : "New puzzle") + "</button>" +
      '<div class="fc-xw-tip">' +
      '<button type="button" class="fc-xw-tip-btn" id="fcXwTip" aria-expanded="false" aria-controls="fcXwTipPop" aria-label="How to solve">' + INFO_ICON + "</button>" +
      '<p class="fc-xw-tip-pop" id="fcXwTipPop" role="note" hidden>' + (ls
        ? "Tap ▶ to hear a word, then pick its meaning. After you answer, you’ll see how it’s written."
        : mt
        ? "Tap a word, then its meaning — either side first. A wrong pair adds a second."
        : ws
        ? "Drag across a word, or tap its first and last letter. Words run in every direction — backwards and diagonally too."
        : "Tap a square or a clue, then type. Tap a crossing square again to switch direction.") + "</p>" +
      "</div>" +
      (mt ? "" : '<button type="button" class="fc-btn fc-xw-hint" id="fcXwHint" title="' + (ws ? "Reveal a word" : "Reveal a letter") + '">' + HINT_ICON + "Hint</button>") +
      (ls ? '<span class="fc-ws-count" id="fcLsCount" aria-label="Question"></span>'
        : mt ? '<span class="fc-mt-split" id="fcMtSplit" aria-live="polite" hidden></span><span class="fc-ws-count fc-mt-clock" id="fcMtClock" role="timer" aria-label="Time"></span>'
        : ws ? '<span class="fc-ws-count" id="fcWsCount" aria-live="polite"></span>'
        : '<button type="button" class="fc-btn fc-btn-primary" id="fcXwCheck">Check</button>') +
      '<div class="section-menu fc-xw-menu">' +
      '<button type="button" class="section-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="More puzzle actions">' + MENU_ICON + "</button>" +
      '<div class="section-menu-list" role="menu" hidden>' +
      actions.map(function (a) {
        return '<button type="button" class="fc-xw-menu-item" role="menuitem" id="fcXw' + a[0].charAt(0).toUpperCase() + a[0].slice(1) + '" data-action="' + a[0] + '">' +
          '<span class="menu-item-ic" aria-hidden="true">' + a[2] + '</span><span class="menu-item-tx">' + (labels[a[0]] || a[1]) + "</span></button>";
      }).join("") +
      "</div></div></div></div>";
  }

  // Wiring shared by the empty-state and full-puzzle renders below -- every
  // control has to work even when the current source/table pick has
  // nothing yet to build a grid from.
  function setTablesOpen(panel, open) {
    state.tablesOpen = open;
    var sheet = panel.querySelector(".fc-xw-sheet"), scrim = panel.querySelector(".fc-xw-scrim");
    if (!sheet) return;
    sheet.hidden = !open;
    if (scrim) scrim.hidden = !open;
    if (!open) panel.querySelector('[data-pick="source"]').focus();
  }
  function setTipOpen(open) {
    var btn = document.getElementById("fcXwTip"), pop = document.getElementById("fcXwTipPop");
    if (!btn || !pop) return;
    btn.setAttribute("aria-expanded", String(open));
    pop.hidden = !open;
  }
  // Wired once per panel: outside clicks and Escape close the sheet (and the ⓘ tip).
  var optionsDocWired = false;
  function wireOptionsDismiss() {
    if (optionsDocWired) return;
    optionsDocWired = true;
    document.addEventListener("click", function (e) {
      // A control inside the sheet can re-render the panel before this runs,
      // detaching the clicked node -- that was a click inside, not outside.
      var tip = currentPanel && currentPanel.querySelector(".fc-xw-tip");
      if (tip && !tip.contains(e.target)) setTipOpen(false);
      if (!state.tablesOpen || !e.target.isConnected) return;
      var panel = currentPanel;
      var box = panel && panel.querySelector(".fc-xw-source");
      if (!box || (box.contains(e.target) && !e.target.classList.contains("fc-xw-scrim"))) return;
      setTablesOpen(panel, false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setTipOpen(false);
      if (e.key !== "Escape" || !state.tablesOpen) return;
      var panel = currentPanel;
      if (panel) setTablesOpen(panel, false);
    });
  }
  function bindControls(panel) {
    wireOptionsDismiss();
    var tip = panel.querySelector("#fcXwTip");
    if (tip) tip.addEventListener("click", function () { setTipOpen(this.getAttribute("aria-expanded") !== "true"); });
    var done = panel.querySelector("#fcXwTablesDone");
    if (done) done.addEventListener("click", function () { setTablesOpen(panel, false); });
    panel.querySelectorAll(".fc-xw-pick-select").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var key = sel.dataset.pick;
        if (key === "source") {
          if (sel.value === "multi") return;
          if (sel.value === "several") {
            // Opens the checklist on what's picked now (the first roomy
            // table, coming from Flashcards).
            if (state.source !== "table") { state.source = "table"; state.tables = []; generate(); }
            state.tablesOpen = true;
            rerender();
            return;
          }
          state.source = sel.value === "flashcards" ? "flashcards" : "table";
          state.tables = sel.value === "flashcards" ? [] : [sel.value.slice(2)];
          state.tablesOpen = false;
        } else {
          state[key] = key === "size" ? parseInt(sel.value, 10) : sel.value;
        }
        if (key === "mode" && !isGame(state.mode) && state.size > GRID_MAX_WORDS) state.size = GRID_MAX_WORDS;
        generate();
        rerender();
      });
    });
    panel.querySelectorAll("#fcXwTablePicker input[type=checkbox]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.dataset.tableId;
        var i = state.tables.map(String).indexOf(id);
        if (cb.checked && i === -1) state.tables.push(id);
        else if (!cb.checked && i !== -1) state.tables.splice(i, 1);
        generate();
        rerender();
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
    // Below MIN_WORDS there's no real puzzle to show -- say why, and what
    // would fix it, instead of a two-word grid.
    function notEnough(msg, canRetry) {
      panel.innerHTML = '<div class="fc-xw-actions">' + picksHtml() + "</div>" + '<p class="fc-xw-footnote">' + msg + "</p>" +
        (canRetry ? '<div class="fc-xw-actions"><button type="button" class="fc-btn" id="fcXwNew">Try again</button></div>' : "");
      bindControls(panel);
      var retry = document.getElementById("fcXwNew");
      if (retry) retry.addEventListener("click", function () { generate(); rerender(); });
    }
    var more = state.source === "table" ? "add another table" : "add more words to flashcards, or build one from a table";
    if (!state.puzzle) generate();
    if (state.poolCount < MIN_WORDS) {
      notEnough(state.source === "table" && !state.tables.length
        ? "Choose a table to build a puzzle from."
        : "A puzzle needs at least " + MIN_WORDS + " usable words" + (state.poolCount ? " — this has " + state.poolCount : "") + ". To get more, " + more + ".", false);
      return;
    }
    var p = state.puzzle;
    if (p.placements.length < MIN_WORDS) {
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
        bindMenu(panel, { reset: rerender });
        return;
      }
      var listen = wireListening(board, document.getElementById("fcLsCount"), p);
      bindMenu(panel, { reset: listen.restart });
      return;
    }
    if (state.mode === "match") {
      panel.innerHTML = toolbarHtml() + '<div class="fc-mt"></div>';
      bindControls(panel);
      document.getElementById("fcXwNew").addEventListener("click", function () { generate(); rerender(); });
      var game = wireMatch(panel.querySelector(".fc-mt"), document.getElementById("fcMtClock"), p, romajiMode);
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
    var solve = { start: Date.now(), help: 0, done: false };
    // `pieces` is what a hint reveals one of (words in a word search,
    // squares in a grid): all of them revealed isn't solving it either.
    function solved(n, pieces) {
      if (solve.done) return;
      solve.done = true;
      if (solve.help >= pieces) return;
      recordRun({ mode: state.mode, n: n, ms: Date.now() - solve.start, help: solve.help });
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
        hint: function () { solve.help++; ws.revealOne(); },
        reveal: function () { solve.done = true; ws.revealAll(); },
        reset: ws.reset,
        print: savePdf
      });
      return;
    }
    var gridEl = panel.querySelector(".fc-xw-grid");
    var nav = wireGrid(gridEl, panel.querySelector(".fc-xw-clues"), panel.querySelector(".fc-xw-current"), p, arroword);

    document.getElementById("fcXwCheck").addEventListener("click", function () {
      if (checkGrid(gridEl, p)) solved(p.placements.length, gridEl.querySelectorAll(".fc-xw-cell-input").length);
    });
    bindMenu(panel, {
      hint: function () { solve.help++; hintGrid(gridEl, p, nav); },
      reveal: function () { solve.done = true; revealGrid(gridEl, p); },
      reset: function () { resetGridInputs(gridEl); },
      print: savePdf
    });
  }

  // The ⋯ menu's items: New puzzle and Print are the same for every style,
  // the reveal / clear actions come from the style's own wiring.
  function bindMenu(panel, actions) {
    actions.newMenu = function () { generate(); rerender(); };
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

  return {
    renderCrosswords: renderCrosswords,
    renderGames: renderGames,
    // pure hooks for scripts/smoke-test.js
    __testHooks: {
      wordPool: wordPool, flashcardsWordPool: flashcardsWordPool, tableWordPool: tableWordPool,
      buildGrid: buildGrid, buildWordSearch: buildWordSearch, buildMatch: buildMatch, buildListening: buildListening, matchRounds: matchRounds, MATCH_BEST_KEY: MATCH_BEST_KEY, toHiragana: toHiragana, toKatakana: toKatakana, scriptedAnswer: scriptedAnswer,
      foldRomajiForGrid: foldRomajiForGrid, isGiveaway: isGiveaway, MIN_WORDS: MIN_WORDS,
      // the tab showing (or last shown): Puzzles' or Games' settings
      get state() { return state; }, states: states
    }
  };
})();
