// Flashcards -- the Crosswords tab (RaumeStudy.flashcards.crosswords).
//
// A printable crossword / arroword generator, built from either of two word
// sources: whatever's currently in flashcards (every added word, minus
// individually paused words and whole paused tables -- the same "in your
// deck" set vocabState() in views.js reads), or a single vocabulary table
// picked straight from the reference data, flashcards status aside -- for a
// themed puzzle ("Numbers", "Drinks"...) without first adding the table to
// flashcards. Each answer is the word's own kana reading, reconstructed from
// its furigana exactly like the pronunciation layer does (js/vocab/render.js's
// jpReadingOf) -- kanji is never shown or typed here. English meanings are
// the clues.
//
// Two layouts share one grid builder: a classic crossword (numbered
// across/down clue list) or an arroword (the clue sits in a cell right
// before the answer starts, an arrow pointing into it -- no separate list).
// Every square is a live text field, so it plays on screen as well as
// printing as a worksheet. Nothing here is scheduled, scored, or saved --
// regenerating is free.
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
  var CHEVRON_ICON = '<svg class="fc-xw-chevron" viewBox="0 0 18 18" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 7l3.5 4 3.5-4"/></svg>';

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
      if (!entry) return;
      var reading = String(entry.jpReading || "").replace(/^〜/, "").trim();
      if (reading.length < MIN_LEN || reading.length > MAX_LEN) return;
      if (!KANA_ONLY.test(reading)) return;
      if (seen[reading]) return;
      seen[reading] = true;
      var clue = String(entry.englishDisplay || "").split(" / ")[0].trim();
      if (!clue) return;
      if (isGiveaway(reading, foldRomajiForGrid(entry.romajiDisplay), clue)) return;
      var romaji = entry.romajiUsable ? foldRomajiForGrid(entry.romajiDisplay) : "";
      if (romaji.length < MIN_LEN + 1 || romaji.length > MAX_LEN * 2) romaji = "";
      pool.push({ id: entry.vocabId, answer: reading, clue: clue, romaji: romaji || null });
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
  function vocabTables() { return window.RaumeStudy.data.vocabularyTables || []; }

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
          if (existing !== answer[i]) return -1;
          crosses++;
        } else if (grid[key(r + dc, c + dr)] !== undefined || grid[key(r - dc, c - dr)] !== undefined) {
          return -1; // would run flush alongside another word with no crossing
        }
      }
      return crosses;
    }

    function place(word, row, col, dir) {
      var dr = dir === "down" ? 1 : 0, dc = dir === "across" ? 1 : 0;
      for (var i = 0; i < word.answer.length; i++) grid[key(row + dr * i, col + dc * i)] = word.answer[i];
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
  // State + rendering. Purely a play/print utility -- nothing here persists
  // across a reload; regenerating is free. What's typed into the grid lives
  // only in the live <input> elements, not in this state object -- every
  // path that changes state.puzzle (New puzzle, or a control) tears the grid
  // down and rebuilds it anyway, so there's nothing to carry over.
  // -----------------------------------------------------------------------
  // Romaji is the default script -- a beginner without kana memorized yet
  // still gets a working puzzle; switching to Japanese/Hiragana/Katakana is
  // one tap away once they're ready for it.
  var state = { source: "flashcards", tables: [], tablesOpen: false, mode: "crossword", script: "romaji", size: 15, puzzle: null, poolCount: 0 };

  function rerender() { S.render(); }

  function generate() {
    // First pick of "A table": the first one with enough words for a real
    // grid (the very first table can be a handful of counters).
    if (state.source === "table" && !state.tables.length) {
      var tables = vocabTables();
      var roomy = tables.filter(function (t) { return tableWordPool([t.id]).length >= MIN_WORDS * 2; })[0] || tables[0];
      if (roomy) state.tables = [roomy.id];
    }
    var pool = wordPool();
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
      return true;
    });
    // Every eligible word is a candidate; the builder places up to Words of
    // them. Deduped again on the final answer -- folding to one script or to
    // romaji can make two readings spell the same.
    var seen = {};
    var candidates = eligible.map(function (w) {
      var answer = state.script === "romaji" ? w.romaji : scriptedAnswer(w.answer, state.script);
      return { id: w.id, clue: w.clue, answer: answer };
    }).filter(function (w) { if (seen[w.answer]) return false; seen[w.answer] = true; return true; });
    state.poolCount = candidates.length;
    state.puzzle = buildGrid(candidates, state.mode === "arroword", state.size);
  }

  var SOURCE_OPTS = [["flashcards", "Flashcards"], ["table", "Tables"]];
  var MODE_OPTS = [["crossword", "Crossword"], ["arroword", "Arroword"]];
  var SCRIPT_OPTS = [["romaji", "Romaji"], ["native", "Japanese"], ["hiragana", "Hiragana"], ["katakana", "Katakana"]];
  var SIZE_OPTS = [10, 15, 20, 30, 40];

  // An iOS pop-up button row: label left, the current value and a small
  // up/down chevron right, the whole 44px row the tap target. A real
  // <select> sits invisibly over the row, so a tap opens the platform's own
  // picker (the wheel/menu on iOS) -- no oversized segmented control per
  // setting. The select is 16px so iOS never zooms in on it.
  var UPDOWN_ICON = '<svg class="fc-xw-updown" viewBox="0 0 18 18" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 7 9 3.5 12.5 7M5.5 11 9 14.5 12.5 11"/></svg>';
  function pickerRow(name, label, options, current) {
    var currentText = "";
    var opts = options.map(function (o) {
      var val = Array.isArray(o) ? o[0] : String(o);
      var text = Array.isArray(o) ? o[1] : String(o);
      if (String(current) === val) currentText = text;
      return '<option value="' + val + '"' + (String(current) === val ? " selected" : "") + ">" + esc(text) + "</option>";
    }).join("");
    return '<div class="fc-settings-field fc-xw-field"><label class="fc-xw-pick">' +
      '<span class="fc-xw-pick-label">' + esc(label) + "</span>" +
      '<span class="fc-xw-field-value"><span class="fc-xw-value-text">' + esc(currentText) + "</span>" + UPDOWN_ICON + "</span>" +
      '<select class="fc-xw-pick-select" data-pick="' + name + '">' + opts + "</select></label></div>";
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
  // for a bigger pool). Collapsed behind the Table row until tapped, since
  // 30+ options shown open by default is its own kind of clutter.
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
  function tableFieldRowHtml() {
    return '<div class="fc-settings-field fc-xw-field">' +
      '<button type="button" class="fc-settings-field-row fc-xw-field-row fc-xw-field-btn" id="fcXwTablesToggle" aria-expanded="' + state.tablesOpen + '" aria-controls="fcXwTablePicker">' +
      '<span class="fc-xw-pick-label">Tables</span><span class="fc-xw-field-value"><span class="fc-xw-value-text">' + esc(tablesSummary()) + "</span>" + CHEVRON_ICON + "</span></button>" +
      (state.tablesOpen ? tableChecklistHtml() : "") +
      "</div>";
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

  function checkGrid(gridEl, p) {
    gridEl.querySelectorAll(".fc-xw-cell-input").forEach(function (input) {
      var v = input.value.trim();
      var cell = input.closest(".fc-xw-cell");
      cell.classList.remove("fc-xw-cell-correct", "fc-xw-cell-wrong");
      if (!v) return;
      var correct = p.grid[input.dataset.r + "," + input.dataset.c];
      cell.classList.add(v === correct ? "fc-xw-cell-correct" : "fc-xw-cell-wrong");
    });
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

  // One inset-grouped card of 44px rows, iOS Settings-style: Source (and
  // Tables, when it applies), Style, Script, Words -- all in view; at 44px a
  // row is cheaper than a "More options" disclosure hiding three of them.
  function configCardHtml() {
    var rows = pickerRow("source", "Source", SOURCE_OPTS, state.source);
    if (state.source === "table") rows += tableFieldRowHtml();
    rows += pickerRow("mode", "Style", MODE_OPTS, state.mode);
    rows += pickerRow("script", "Script", SCRIPT_OPTS, state.script);
    rows += pickerRow("size", "Words", SIZE_OPTS, state.size);
    return '<div class="fc-settings-section fc-xw-config">' + rows + "</div>";
  }

  // The toolbar: one tinted New puzzle on the leading edge, the one action
  // you reach for while solving -- Check -- filled on the trailing edge, and
  // everything occasional (Hint, Reveal, Clear, Print) in a ⋯ menu beside
  // it. A row of unlabeled icon circles made every action look equally
  // important and none of them recognisable.
  var MENU_ACTIONS = [["hint", "Reveal a letter", HINT_ICON], ["reveal", "Reveal puzzle", EYE_ICON], ["reset", "Clear answers", RESET_ICON], ["print", "Print", PRINT_ICON]];
  function toolbarHtml() {
    return '<div class="fc-xw-actions">' +
      '<button type="button" class="fc-btn" id="fcXwNew">New puzzle</button>' +
      '<div class="fc-xw-actions-end">' +
      '<button type="button" class="fc-btn fc-btn-primary" id="fcXwCheck">Check</button>' +
      '<div class="section-menu fc-xw-menu">' +
      '<button type="button" class="section-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="More puzzle actions">' + MENU_ICON + "</button>" +
      '<div class="section-menu-list" role="menu" hidden>' +
      MENU_ACTIONS.map(function (a) {
        return '<button type="button" class="fc-xw-menu-item" role="menuitem" id="fcXw' + a[0].charAt(0).toUpperCase() + a[0].slice(1) + '" data-action="' + a[0] + '">' +
          '<span class="menu-item-ic" aria-hidden="true">' + a[2] + '</span><span class="menu-item-tx">' + a[1] + "</span></button>";
      }).join("") +
      "</div></div></div></div>";
  }

  // Wiring shared by the empty-state and full-puzzle renders below -- every
  // control has to work even when the current source/table pick has
  // nothing yet to build a grid from.
  function bindControls(panel) {
    panel.querySelectorAll(".fc-xw-pick-select").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var key = sel.dataset.pick;
        state[key] = key === "size" ? parseInt(sel.value, 10) : sel.value;
        generate();
        rerender();
      });
    });
    var tablesToggle = document.getElementById("fcXwTablesToggle");
    if (tablesToggle) tablesToggle.addEventListener("click", function () { state.tablesOpen = !state.tablesOpen; rerender(); });
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

  function renderCrosswords(panel) {
    if (!panel) return;
    // Below MIN_WORDS there's no real puzzle to show -- say why, and what
    // would fix it, instead of a two-word grid.
    function notEnough(msg, canRetry) {
      panel.innerHTML = configCardHtml() + '<p class="fc-xw-footnote">' + msg + "</p>" +
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
    var romajiMode = state.script === "romaji";
    var placedCount = p.placements.length;
    var wanted = Math.min(state.size, state.poolCount);
    // Only worth a line when the grid came up short -- a full puzzle
    // speaks for itself.
    var footnote = placedCount < wanted ? placedCount + " of " + wanted + " words fit — New puzzle tries another mix." : "";
    var titleLabel = state.source === "table" ? tablesSummary() : "Flashcards";
    var printTitle = arroword ? "Arroword" : "Crossword";
    var scriptLabel = SCRIPT_OPTS.filter(function (o) { return o[0] === state.script; })[0][1];
    var printMeta = titleLabel + " · " + placedCount + " words · " + scriptLabel;

    panel.innerHTML =
      configCardHtml() +
      (footnote ? '<p class="fc-xw-footnote">' + esc(footnote) + "</p>" : "") +
      toolbarHtml() +
      '<p class="fc-xw-current fc-xw-current-idle" aria-live="polite">Tap a square or a clue to start.</p>' +
      '<div class="fc-xw-puzzle print-target">' +
      '<header class="fc-xw-print-head"><h2 class="fc-xw-print-title">' + esc(printTitle) + "</h2>" +
      '<p class="fc-xw-print-meta">' + esc(printMeta) + "</p></header>" +
      '<div class="fc-xw-gridwrap"><div class="fc-xw-grid">' +
      gridHtml(p, arroword, romajiMode) + "</div></div>" +
      (arroword ? "" : clueListHtml(p)) +
      "</div>";

    bindControls(panel);
    var gridEl = panel.querySelector(".fc-xw-grid");
    var nav = wireGrid(gridEl, panel.querySelector(".fc-xw-clues"), panel.querySelector(".fc-xw-current"), p, arroword);

    document.getElementById("fcXwNew").addEventListener("click", function () { generate(); rerender(); });
    document.getElementById("fcXwCheck").addEventListener("click", function () { checkGrid(gridEl, p); });
    var menu = panel.querySelector(".fc-xw-menu");
    var actions = {
      hint: function () { hintGrid(gridEl, p, nav); },
      reveal: function () { revealGrid(gridEl, p); },
      reset: function () { resetGridInputs(gridEl); },
      print: function () { document.body.classList.add("print-only"); window.print(); }
    };
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
    // pure hooks for scripts/smoke-test.js
    __testHooks: {
      wordPool: wordPool, flashcardsWordPool: flashcardsWordPool, tableWordPool: tableWordPool,
      buildGrid: buildGrid, toHiragana: toHiragana, toKatakana: toKatakana, scriptedAnswer: scriptedAnswer,
      foldRomajiForGrid: foldRomajiForGrid, isGiveaway: isGiveaway, MIN_WORDS: MIN_WORDS, state: state
    }
  };
})();
