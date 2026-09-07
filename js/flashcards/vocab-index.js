// Flashcards -- vocabulary index (RaumeStudy.flashcards.vocabIndex).
//
// Turns RaumeStudy.data.vocabularyTables into a lookup keyed by each row's
// permanent id: display markup, the study directions it supports, and the
// normalized accepted answers for checking. Pure -- reads the dataset live,
// never copies content anywhere. This is what scripts/smoke-test.js exercises
// through the flashcards test hooks.
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
    return segments.map(function (seg) { return seg.kanji ? seg.kanji : seg.text; }).join("");
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
          // plain display) -- each form tagged verb-form-plain/-polite so the
          // same body.show-polite toggle that picks which form is visible
          // also picks which button is.
          entry.jpPromptHtml = row.forms.map(function (f, fi) {
            return '<div class="verb-form ' + (fi === 0 ? "verb-form-plain" : "verb-form-polite") + '"><span class="jpword">' + jpHtmlFn(f.jp) + "</span>" + speakBtnFn(jpReadingFn(f.jp)) + "</div>";
          }).join("");
          // The dictionary (plain) form's reading, regardless of which form
          // show-polite currently displays -- good enough for the reveal's
          // autoplay without tracking that toggle's state here too.
          entry.jpReading = jpReadingFn(row.forms[0].jp);
          entry.romajiDisplay = row.forms.map(function (f) { return f.romaji; }).join(" / ");
          entry.romajiUsable = row.forms.every(function (f) { return isRomajiUsable(f.romaji); });
          entry.romajiAnswers = entry.romajiUsable
            ? row.forms.map(function (f) { return normalizeAnswer(f.romaji, true); })
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
    return { label: "Japanese", value: entry.jpPlain }; // ro-en, en-ro
  }
  function checkAnswer(entry, direction, input) {
    var isRomajiTarget = direction === "jp-ro" || direction === "en-ro";
    var norm = normalizeAnswer(input, isRomajiTarget);
    var answers = isRomajiTarget ? entry.romajiAnswers : entry.englishAnswers;
    return answers.indexOf(norm) !== -1;
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
    getVocabIndex: getVocabIndex, directionsForEntry: directionsForEntry,
    promptFor: promptFor, askLabelFor: askLabelFor, answerPlaceholderFor: answerPlaceholderFor,
    expectedDisplayFor: expectedDisplayFor, contextDisplayFor: contextDisplayFor, checkAnswer: checkAnswer,
    normalizeAnswer: normalizeAnswer, isRomajiUsable: isRomajiUsable,
    getRawVocabRow: getRawVocabRow
  };
})();
