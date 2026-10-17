// Flashcards -- built-in kana tables for the Kana trainer
// (RaumeStudy.flashcards.kanaData).
//
// The hiragana / katakana a learner drills, by the names the kana are actually
// taught under: gojūon (the base syllabary), dakuten (voiced), handakuten
// (the ° mark), yōon (small-ya combinations), and sokuon (the small tsu that
// doubles a consonant -- practised in short example words, since it has no
// reading on its own). Six concepts, per script. Data only -- no state, no
// storage, no DOM.
//
// Romaji is derived from js/vocab/kana-romaji.js (the site's one kana->romaji
// source) so the trainer and the page's reading layer can never disagree.
// A few well-known alternate spellings are also accepted on top of the
// Hepburn the trainer shows: si/ti/tu/hu and the sya/tya/zya yōon forms
// (nihon-shiki / wāpuro), plus "wo" for を and "nn" for ん.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.flashcards = window.RaumeStudy.flashcards || {};
window.RaumeStudy.flashcards.kanaData = (function () {
  "use strict";

  function kr() { return window.RaumeStudy.kanaRomaji; }

  // Hiragana sources; katakana groups reuse these, converted char-by-char.
  var GOJUON = [
    "あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ",
    "さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と",
    "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ",
    "ま", "み", "む", "め", "も", "や", "ゆ", "よ",
    "ら", "り", "る", "れ", "ろ", "わ", "を", "ん"
  ];
  var DAKUTEN = [
    "が", "ぎ", "ぐ", "げ", "ご", "ざ", "じ", "ず", "ぜ", "ぞ",
    "だ", "ぢ", "づ", "で", "ど", "ば", "び", "ぶ", "べ", "ぼ"
  ];
  var HANDAKUTEN = ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"];
  var YOON = [
    "きゃ", "きゅ", "きょ", "しゃ", "しゅ", "しょ", "ちゃ", "ちゅ", "ちょ",
    "にゃ", "にゅ", "にょ", "ひゃ", "ひゅ", "ひょ", "みゃ", "みゅ", "みょ",
    "りゃ", "りゅ", "りょ", "ぎゃ", "ぎゅ", "ぎょ", "じゃ", "じゅ", "じょ",
    "びゃ", "びゅ", "びょ", "ぴゃ", "ぴゅ", "ぴょ"
  ];
  // Sokuon has no reading alone -- drill it in short words where the っ / ッ
  // doubles the next consonant. These are already in their final script;
  // each carries its meaning, shown once answered (a word is never left
  // without its English).
  var SOKUON_HIRA = ["きって", "がっこう", "ざっし", "きっぷ", "けっこん", "ちょっと", "いっぱい", "しゅっぱつ"];
  var SOKUON_KATA = ["コップ", "ベッド", "サッカー", "マッチ", "スリッパ", "バッグ", "チケット", "ネックレス"];
  var WORD_ENGLISH = {
    "きって": "stamp", "がっこう": "school", "ざっし": "magazine", "きっぷ": "ticket",
    "けっこん": "marriage", "ちょっと": "a little", "いっぱい": "full, a lot", "しゅっぱつ": "departure",
    "コップ": "cup, glass", "ベッド": "bed", "サッカー": "soccer", "マッチ": "match",
    "スリッパ": "slippers", "バッグ": "bag", "チケット": "ticket", "ネックレス": "necklace"
  };

  // Extra accepted spellings, keyed by the Hepburn romaji the trainer shows.
  var ALT_BY_ROMAJI = {
    shi: ["si"], chi: ["ti"], tsu: ["tu"], fu: ["hu"], ji: ["zi", "di"], zu: ["du"],
    sha: ["sya"], shu: ["syu"], sho: ["syo"], cha: ["tya"], chu: ["tyu"], cho: ["tyo"],
    ja: ["zya", "jya"], ju: ["zyu", "jyu"], jo: ["zyo", "jyo"]
  };
  // Keyed by the kana glyph itself (either script).
  var ALT_BY_KANA = { "を": ["wo"], "ヲ": ["wo"], "ん": ["nn"], "ン": ["nn"] };

  var GROUP_DEFS = [
    { id: "hira-gojuon", script: "hiragana", label: "Gojūon", src: GOJUON },
    { id: "hira-dakuten", script: "hiragana", label: "Dakuten", src: DAKUTEN },
    { id: "hira-handakuten", script: "hiragana", label: "Handakuten", src: HANDAKUTEN },
    { id: "hira-yoon", script: "hiragana", label: "Yōon (combinations)", src: YOON },
    { id: "hira-sokuon", script: "hiragana", label: "Sokuon", src: SOKUON_HIRA, words: true },
    { id: "kata-gojuon", script: "katakana", label: "Gojūon", src: GOJUON, kata: true },
    { id: "kata-dakuten", script: "katakana", label: "Dakuten", src: DAKUTEN, kata: true },
    { id: "kata-handakuten", script: "katakana", label: "Handakuten", src: HANDAKUTEN, kata: true },
    { id: "kata-yoon", script: "katakana", label: "Yōon (combinations)", src: YOON, kata: true },
    { id: "kata-sokuon", script: "katakana", label: "Sokuon", src: SOKUON_KATA, words: true }
  ];
  var DEFAULT_GROUPS = ["hira-gojuon"];

  function toKata(s) {
    return s.replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
  }
  function uniq(arr) {
    var seen = Object.create(null), out = [];
    arr.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  // One drill item: a kana glyph (or short sokuon word), its shown romaji, and
  // every spelling that counts as correct. `id` is stable (group + glyph) so a
  // stored FSRS card keeps tracking the same kana across reloads.
  function buildItem(entry, def) {
    var kana = def.words ? entry : (def.kata ? toKata(entry) : entry);
    var romaji = kr().toRomaji(kana);
    var answers = def.words
      ? [romaji]
      : uniq([romaji].concat(ALT_BY_ROMAJI[romaji] || []).concat(ALT_BY_KANA[kana] || []));
    return { id: def.id + ":" + kana, kana: kana, romaji: romaji, answers: answers, script: def.script, groupId: def.id, word: !!def.words, english: def.words ? WORD_ENGLISH[kana] || "" : "" };
  }

  var itemCache = null;
  function allItems() {
    if (!itemCache) {
      itemCache = {};
      GROUP_DEFS.forEach(function (def) {
        itemCache[def.id] = def.src.map(function (e) { return buildItem(e, def); });
      });
    }
    return itemCache;
  }

  // Group metadata for the picker (id, label, script, how many items).
  function groups() {
    var byId = allItems();
    return GROUP_DEFS.map(function (def) {
      return { id: def.id, label: def.label, script: def.script, count: byId[def.id].length };
    });
  }
  // The items across a set of group ids, in group order, de-duped by id.
  function itemsFor(groupIds) {
    var byId = allItems(), seen = Object.create(null), out = [];
    GROUP_DEFS.forEach(function (def) {
      if (groupIds.indexOf(def.id) === -1) return;
      byId[def.id].forEach(function (item) { if (!seen[item.id]) { seen[item.id] = 1; out.push(item); } });
    });
    return out;
  }
  function isGroupId(id) { return GROUP_DEFS.some(function (d) { return d.id === id; }); }

  return {
    groups: groups, itemsFor: itemsFor, allItems: allItems,
    isGroupId: isGroupId, DEFAULT_GROUPS: DEFAULT_GROUPS
  };
})();
