// Flashcards -- vocabulary index (RaumeStudy.flashcards.vocabIndex).
//
// Turns RaumeStudy.data.vocabularyTables into a lookup keyed by each row's
// permanent id: display markup, the study directions it supports, and the
// normalized accepted answers for checking, plus the letter-level diff used
// to mark a wrong romaji answer against the closest accepted spelling. Pure
// -- reads the dataset live, never copies content anywhere. This is what
// scripts/smoke-test.js exercises through the flashcards test hooks.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.vocabIndex = (function () {
  "use strict";

  var DIRECTIONS = window.RaumeStudy.flashcards.store.DIRECTIONS;

  var JAPANESE_SCRIPT = /[ぁ-ゖァ-ヺ一-鿏々〆ヵヶ]/;

  function isRomajiUsable(str) {
    return !JAPANESE_SCRIPT.test(String(str || ""));
  }

  function foldMacrons(s) {
    return s
      .replace(/[āâ]/g, "a").replace(/[īî]/g, "i").replace(/[ūû]/g, "u")
      .replace(/[ēê]/g, "e").replace(/[ōô]/g, "o");
  }

  // Long vowels can't be typed on a normal keyboard, so answer-checking is
  // length-insensitive: after the macrons are folded (ō -> o), "ou"/"oo" ->
  // "o", any doubled vowel -> single. Applied to BOTH the stored answer and
  // the typed one, so "koohii" / "kouhii" / "kōhī" all compare equal.
  function foldLongVowels(v) {
    return v.replace(/ou/g, "o").replace(/([aiueo])\1+/g, "$1");
  }

  function normalizeAnswer(s, romaji) {
    var v = String(s == null ? "" : s).trim().replace(/\s+/g, " ").toLowerCase();
    // Sentence punctuation isn't meaningful for matching -- a phrase card whose
    // answer is "Onamae wa?" / "What is your name?" has to accept the same
    // words typed without the mark. Kept for the expected-answer *display*
    // (that reads the raw field), stripped only here for the comparison.
    v = v.replace(/[?!.,;:。、！？「」『』（）()]/g, "").replace(/\s+/g, " ").trim();
    if (romaji) {
      v = foldMacrons(v);
      v = foldLongVowels(v);
      v = v.replace(/^~/, "");
    }
    return v;
  }

  function splitAlternatives(s) {
    return String(s || "").split(" / ").map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function jpPlainOf(segments) {
    return segments.map(function (seg) { return seg.kanji ? seg.kanji : (seg.text || seg.p || ""); }).join("");
  }

  var vocabIndex = null;
  function buildVocabIndex() {
    var index = {};
    (window.RaumeStudy.data.vocabularyTables || []).forEach(function (table) {
      table.rows.forEach(function (row) {
        if (!row.id) return;
        var entry = { vocabId: row.id, category: table.category || "", tableTitle: table.title, tableId: table.id };
        var jpHtmlFn = window.RaumeStudy.vocab.jpSegmentsHtml || function () { return ""; };
        var jpReadingFn = window.RaumeStudy.vocab.jpReadingOf || function () { return ""; };
        var speakBtnFn = window.RaumeStudy.vocab.speakButtonHtml || function () { return ""; };
        if (row.type === "verb-pair") {
          entry.jpHtml = row.forms.map(function (f) {
            return '<div class="verb-form"><span class="jpword">' + jpHtmlFn(f.jp) + "</span></div>";
          }).join("");
          // Same forms on one line ("plain / polite"), for compact lists.
          entry.jpInlineHtml = row.forms.map(function (f) {
            return '<span class="jpword">' + jpHtmlFn(f.jp) + "</span>";
          }).join('<span class="fc-jp-slash"> / </span>');
          entry.jpPlain = row.forms.map(function (f) { return jpPlainOf(f.jp); }).join(" / ");
          // Only the review card's prompt gets a speaker button (the Manage
          // list and "Missed today" tile above reuse jpHtml/jpInlineHtml as
          // plain display). Both forms always show here, one line, slash-
          // separated like jpInlineHtml above -- deliberately NOT gated by
          // body.show-polite (that toggle is a Vocabulary-page-only
          // reference control): both casual and polite are accepted answers
          // for every verb-pair card today, so the prompt should show both,
          // regardless of what the reference page's toggle is set to.
          entry.jpPromptHtml = row.forms.map(function (f) {
            return '<span class="jpword">' + jpHtmlFn(f.jp) + "</span>" + speakBtnFn(jpReadingFn(f.jp));
          }).join('<span class="fc-jp-slash"> / </span>');
          // The dictionary (plain) form's reading, regardless of which form
          // show-polite currently displays -- good enough for the reveal's
          // autoplay without tracking that toggle's state here too.
          entry.jpReading = jpReadingFn(row.forms[0].jp);
          entry.romajiDisplay = row.forms.map(function (f) { return f.romaji; }).join(" / ");
          entry.romajiUsable = row.forms.every(function (f) { return isRomajiUsable(f.romaji); });
          entry.romajiAnswers = entry.romajiUsable
            ? row.forms.map(function (f) { return normalizeAnswer(f.romaji, true); })
            : [];
          // Also accept both forms typed together, the way the app itself
          // displays them everywhere (romajiDisplay/jpInlineHtml): either
          // slash style, either order -- someone typing what they see on
          // screen shouldn't be marked wrong for including both forms.
          if (entry.romajiUsable && row.forms.length > 1) {
            var romajiForms = row.forms.map(function (f) { return f.romaji; });
            var reversedForms = romajiForms.slice().reverse();
            [romajiForms.join(" / "), romajiForms.join("/"),
              reversedForms.join(" / "), reversedForms.join("/")].forEach(function (combo) {
              var norm = normalizeAnswer(combo, true);
              if (entry.romajiAnswers.indexOf(norm) === -1) entry.romajiAnswers.push(norm);
            });
          }
          // Un-normalized romaji, same order/length as romajiAnswers -- lets
          // the wrong-answer diff show "kaerimasu", not the folded form used
          // for matching.
          entry.romajiAnswerDisplays = entry.romajiUsable
            ? row.forms.map(function (f) { return f.romaji; })
            : [];
        } else {
          entry.jpHtml = '<span class="jpword">' + jpHtmlFn(row.jp) + "</span>";
          entry.jpInlineHtml = entry.jpHtml;
          entry.jpPlain = jpPlainOf(row.jp);
          entry.jpPromptHtml = entry.jpHtml + speakBtnFn(jpReadingFn(row.jp));
          entry.jpReading = jpReadingFn(row.jp);
          entry.romajiDisplay = row.romaji;
          entry.romajiUsable = isRomajiUsable(row.romaji);
          entry.romajiAnswers = entry.romajiUsable ? [normalizeAnswer(row.romaji, true)] : [];
          entry.romajiAnswerDisplays = entry.romajiUsable ? [row.romaji] : [];
        }
        entry.englishDisplay = row.english;
        entry.englishAnswers = splitAlternatives(row.english).map(function (a) { return normalizeAnswer(a, false); });
        index[row.id] = entry;
      });
    });
    return index;
  }
  function getVocabIndex() {
    if (!vocabIndex) vocabIndex = buildVocabIndex();
    return vocabIndex;
  }
  // Drop the cached index + raw-row map so the next read rebuilds from the
  // live dataset -- called after custom vocab is added or synced in
  // (js/vocab/custom-vocab.js merges its rows straight into
  // RaumeStudy.data.vocabularyTables, which this index is built from).
  function resetIndex() { vocabIndex = null; rawRowById = null; }
  function directionsForEntry(entry) {
    return entry.romajiUsable ? DIRECTIONS.slice() : ["jp-en"];
  }

  function promptFor(entry, direction) {
    if (direction === "jp-en" || direction === "jp-ro") return { html: entry.jpPromptHtml, lang: "ja" };
    if (direction === "ro-en") return { text: entry.romajiDisplay };
    return { text: entry.englishDisplay }; // en-ro
  }
  function askLabelFor(direction) {
    return direction === "jp-en" || direction === "ro-en" ? "Type the English meaning" : "Type the romaji reading";
  }
  // Same "which language" cue as the label above the prompt, but repeated
  // right inside the input itself -- the label can be easy to skim past,
  // and this is exactly where your eyes are when you start typing.
  function answerPlaceholderFor(direction) {
    return direction === "jp-en" || direction === "ro-en" ? "English…" : "Romaji…";
  }
  function expectedDisplayFor(entry, direction) {
    return direction === "jp-en" || direction === "ro-en" ? entry.englishDisplay : entry.romajiDisplay;
  }
  // One extra field for the answer reveal, beyond the one actually tested --
  // so a review reinforces the whole word, not just the half you typed.
  // Whichever of Japanese/romaji/English isn't already on screen as the
  // prompt: jp-en and jp-ro both prompt with Japanese, so they add the other
  // of {romaji, English}; ro-en and en-ro both prompt with something already
  // covering half the word, so they add Japanese -- never English for en-ro,
  // since English is already the prompt there.
  function contextDisplayFor(entry, direction) {
    if (direction === "jp-en") return { label: "Romaji", value: entry.romajiDisplay };
    if (direction === "jp-ro") return { label: "English", value: entry.englishDisplay };
    // ro-en, en-ro. Japanese always carries its furigana -- `html` is the
    // ruby markup to show, `value` the plain text for comparisons and labels.
    return { label: "Japanese", value: entry.jpPlain, html: entry.jpInlineHtml };
  }
  function checkAnswer(entry, direction, input) {
    var isRomajiTarget = direction === "jp-ro" || direction === "en-ro";
    var norm = normalizeAnswer(input, isRomajiTarget);
    var answers = isRomajiTarget ? entry.romajiAnswers : entry.englishAnswers;
    return answers.indexOf(norm) !== -1;
  }
  // A wrong answer that is really the right answer in the other language --
  // the romaji typed on a card that asks for the English, or the English on
  // one that asks for the romaji. Both card kinds can show the same kanji, so
  // this is a mix-up about the question, not a lapse in memory: the review
  // says which one it wants and lets you answer again instead of grading it.
  function otherLanguageHint(entry, direction, input) {
    var isRomajiTarget = direction === "jp-ro" || direction === "en-ro";
    if (isRomajiTarget) {
      return entry.englishAnswers.indexOf(normalizeAnswer(input, false)) !== -1
        ? "That’s the meaning — type the romaji reading." : "";
    }
    return entry.romajiUsable && entry.romajiAnswers.indexOf(normalizeAnswer(input, true)) !== -1
      ? "That’s the reading — type the English meaning." : "";
  }

  var esc = window.RaumeStudy.shared.escapeHtml;

  // Character-level alignment (Levenshtein) between what was typed and a
  // target string -- returns one array of {you, co, bad} pairs, always the
  // same length as the longer side (a null on one side renders as nothing,
  // not a gap character), so a wrong-answer reveal can mark just the letters
  // that differ instead of re-showing the whole word as an error.
  function alignChars(target, typed) {
    var a = typed, b = target, n = a.length, m = b.length;
    var dp = [], i, j;
    for (i = 0; i <= n; i++) { dp.push(new Array(m + 1).fill(0)); dp[i][0] = i; }
    for (j = 0; j <= m; j++) dp[0][j] = j;
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
    i = n; j = m;
    var pairs = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) { pairs.unshift({ you: a[i - 1], co: b[j - 1], bad: false }); i--; j--; }
      else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) { pairs.unshift({ you: a[i - 1], co: b[j - 1], bad: true }); i--; j--; }
      else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) { pairs.unshift({ you: a[i - 1], co: null, bad: true }); i--; }
      else { pairs.unshift({ you: null, co: b[j - 1], bad: true }); j--; }
    }
    return { pairs: pairs, distance: dp[n][m] };
  }
  function wordDiffHtml(pairs, side) {
    return pairs.map(function (p) {
      var ch = p[side];
      if (ch == null) return "";
      if (!p.bad) return esc(ch);
      return '<mark class="fc-diff-' + (side === "you" ? "you" : "co") + '">' + esc(ch) + "</mark>";
    }).join("");
  }
  // Verb-pairs accept two independent romaji forms -- diff against whichever
  // one the typed answer is actually closest to, so a near-miss on the
  // polite form doesn't get compared against the casual one.
  function closestRomajiDisplay(entry, typedNormalized) {
    var displays = entry.romajiAnswerDisplays || [];
    if (displays.length < 2) return displays[0] || entry.romajiDisplay;
    var best = 0, bestDist = Infinity;
    displays.forEach(function (disp, idx) {
      var norm = entry.romajiAnswers[idx] || normalizeAnswer(disp, true);
      var dist = alignChars(norm, typedNormalized).distance;
      if (dist < bestDist) { bestDist = dist; best = idx; }
    });
    return displays[best];
  }
  // Builds the wrong-answer "you wrote / correct" comparison for the review
  // card's reveal. Romaji targets get a real letter-level diff (a fair,
  // single-spelling comparison); English targets accept several synonyms, so
  // diffing characters against just one of them isn't fair -- those show the
  // two words plain, no marks.
  function answerCompareHtml(entry, direction, typedRaw) {
    var isRomajiTarget = direction === "jp-ro" || direction === "en-ro";
    var typed = String(typedRaw == null ? "" : typedRaw).trim();
    if (!isRomajiTarget) {
      return { youHtml: esc(typed || "(nothing)"), correctHtml: esc(entry.englishDisplay), note: "", near: false, marked: false };
    }
    var correctDisplay = closestRomajiDisplay(entry, normalizeAnswer(typed, true));
    var aligned = alignChars(String(correctDisplay || "").toLowerCase(), typed.toLowerCase());
    var pairs = aligned.pairs;
    var bad = pairs.filter(function (p) { return p.bad; });
    // Only the clean single-substitution case gets a note spelling it out --
    // "N letters off" for anything messier wasn't telling you anything the
    // marked letters above it don't already show, so it's left blank instead.
    var note = "";
    if (bad.length === 1 && bad[0].you != null && bad[0].co != null) {
      note = "1 letter off &middot; <b>" + esc(bad[0].you) + "</b> should be <b>" + esc(bad[0].co) + "</b>";
    } else if (bad.length === 1 && bad[0].you == null && bad[0].co != null) {
      note = "1 letter missing &middot; <b>" + esc(bad[0].co) + "</b>";
    } else if (bad.length === 1 && bad[0].co == null && bad[0].you != null) {
      note = "1 extra letter &middot; <b>" + esc(bad[0].you) + "</b>";
    }
    // A different word altogether lights up every letter, which is noise, not
    // help -- only mark the letters when it's a slip of a couple of them.
    var marked = bad.length <= 2;
    return {
      youHtml: typed ? (marked ? wordDiffHtml(pairs, "you") : esc(typed)) : "(nothing)",
      correctHtml: marked ? wordDiffHtml(pairs, "co") : esc(String(correctDisplay || "")),
      note: note,
      // Exactly one letter wrong / missing / extra: a typo, not a different word.
      near: !!typed && bad.length === 1,
      marked: marked
    };
  }

  var rawRowById = null;
  function getRawVocabRow(vocabId) {
    if (!rawRowById) {
      rawRowById = {};
      (window.RaumeStudy.data.vocabularyTables || []).forEach(function (t) {
        t.rows.forEach(function (r) { if (r.id) rawRowById[r.id] = r; });
      });
    }
    return rawRowById[vocabId] || null;
  }

  return {
    getVocabIndex: getVocabIndex, resetIndex: resetIndex, directionsForEntry: directionsForEntry,
    promptFor: promptFor, askLabelFor: askLabelFor, answerPlaceholderFor: answerPlaceholderFor,
    expectedDisplayFor: expectedDisplayFor, contextDisplayFor: contextDisplayFor, checkAnswer: checkAnswer,
    otherLanguageHint: otherLanguageHint,
    answerCompareHtml: answerCompareHtml,
    normalizeAnswer: normalizeAnswer, isRomajiUsable: isRomajiUsable,
    getRawVocabRow: getRawVocabRow
  };
})();
