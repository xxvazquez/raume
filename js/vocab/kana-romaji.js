// Kana -> romaji, for the interactive reading layer: hover (or tap) a kana
// unit to see its romaji, small and directly above, without permanently
// showing it. Handles hiragana and katakana.
//
// Not a general transliterator -- it covers the kana that turns up in the
// vocabulary: the gojuon, yoon combos (きゃ->kya, ジャ->ja), the common
// katakana foreign-sound combos (ファ->fa, チェ->che), the long-vowel mark
// ー (macron, to match the romaji style already in the data), and the sokuon
// っ/ッ (doubles the next consonant). It tokenises into display units so each
// hover target maps to exactly one romaji chunk (ケ->ke, ちょ->cho, ねー->ne
// with a macron). Hiragana is romanised through the same table by normalising
// each char to katakana for the lookup while keeping the original for display.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.kanaRomaji = (function () {
  "use strict";

  // Single katakana -> romaji (small ャュョ / ッ / ー handled specially below).
  var K = {
    "ア": "a", "イ": "i", "ウ": "u", "エ": "e", "オ": "o",
    "カ": "ka", "キ": "ki", "ク": "ku", "ケ": "ke", "コ": "ko",
    "ガ": "ga", "ギ": "gi", "グ": "gu", "ゲ": "ge", "ゴ": "go",
    "サ": "sa", "シ": "shi", "ス": "su", "セ": "se", "ソ": "so",
    "ザ": "za", "ジ": "ji", "ズ": "zu", "ゼ": "ze", "ゾ": "zo",
    "タ": "ta", "チ": "chi", "ツ": "tsu", "テ": "te", "ト": "to",
    "ダ": "da", "ヂ": "ji", "ヅ": "zu", "デ": "de", "ド": "do",
    "ナ": "na", "ニ": "ni", "ヌ": "nu", "ネ": "ne", "ノ": "no",
    "ハ": "ha", "ヒ": "hi", "フ": "fu", "ヘ": "he", "ホ": "ho",
    "バ": "ba", "ビ": "bi", "ブ": "bu", "ベ": "be", "ボ": "bo",
    "パ": "pa", "ピ": "pi", "プ": "pu", "ペ": "pe", "ポ": "po",
    "マ": "ma", "ミ": "mi", "ム": "mu", "メ": "me", "モ": "mo",
    "ヤ": "ya", "ユ": "yu", "ヨ": "yo",
    "ラ": "ra", "リ": "ri", "ル": "ru", "レ": "re", "ロ": "ro",
    "ワ": "wa", "ヰ": "wi", "ヱ": "we", "ヲ": "o", "ン": "n", "ヴ": "vu",
    "ァ": "a", "ィ": "i", "ゥ": "u", "ェ": "e", "ォ": "o",
    "ャ": "ya", "ュ": "yu", "ョ": "yo", "ヮ": "wa"
  };

  // Consonant onset for yoon (base kana + small ヤ/ユ/ヨ).
  var YOON = {
    "キ": "k", "ギ": "g", "シ": "sh", "ジ": "j", "チ": "ch", "ヂ": "j",
    "ニ": "n", "ヒ": "h", "ビ": "b", "ピ": "p", "ミ": "m", "リ": "r"
  };
  var SMALL_Y = { "ャ": "a", "ュ": "u", "ョ": "o" };

  // Two-kana foreign-sound combos (base + small vowel/glide). Katakana only.
  var COMBO = {
    "ウィ": "wi", "ウェ": "we", "ウォ": "wo", "イェ": "ye",
    "ヴァ": "va", "ヴィ": "vi", "ヴェ": "ve", "ヴォ": "vo", "ヴュ": "vyu",
    "ファ": "fa", "フィ": "fi", "フェ": "fe", "フォ": "fo", "フュ": "fyu",
    "ティ": "ti", "トゥ": "tu", "テュ": "tyu",
    "ディ": "di", "ドゥ": "du", "デュ": "dyu",
    "シェ": "she", "ジェ": "je", "チェ": "che",
    "ツァ": "tsa", "ツィ": "tsi", "ツェ": "tse", "ツォ": "tso",
    "クァ": "kwa", "グァ": "gwa"
  };

  var MACRON = { a: "ā", i: "ī", u: "ū", e: "ē", o: "ō" };
  var SMALL_TSU = { "ッ": 1, "っ": 1 };

  function isHiragana(ch) { return ch >= "ぁ" && ch <= "ゖ"; }
  function isKatakana(ch) { return (ch >= "ァ" && ch <= "ヺ") || ch === "ー"; }
  function isKana(ch) { return isHiragana(ch) || isKatakana(ch); }
  // Hiragana -> katakana for the lookup; leaves katakana / ー alone.
  function toKata(ch) {
    return isHiragana(ch) ? String.fromCharCode(ch.charCodeAt(0) + 0x60) : ch;
  }

  // A run of kana -> [{ kana, romaji }] display units. `kana` keeps the
  // original characters (hiragana stays hiragana); the lookup runs on a
  // katakana-normalised copy.
  function tokenize(str) {
    str = String(str || "");
    var norm = "";
    for (var j = 0; j < str.length; j++) norm += toKata(str[j]);

    var units = [], i = 0, geminate = false;
    while (i < str.length) {
      var start = i, c1 = norm[i], c2 = norm[i + 1], romaji;

      if (SMALL_TSU[c1]) { geminate = true; i += 1; continue; }

      if (c2 && COMBO[c1 + c2]) { romaji = COMBO[c1 + c2]; i += 2; }
      else if (c2 && YOON[c1] && SMALL_Y[c2]) {
        var base = YOON[c1];
        romaji = (base === "sh" || base === "ch" || base === "j")
          ? base + SMALL_Y[c2]            // sha / shu / sho, cha..., ja...
          : base + "y" + SMALL_Y[c2];     // kya / gyu / ...
        i += 2;
      }
      else if (K[c1] != null) { romaji = K[c1]; i += 1; }
      else {                             // not kana we know -> passthrough
        if (geminate) { units.push({ kana: str[start - 1] || "", romaji: "" }); geminate = false; }
        units.push({ kana: str[i], romaji: str[i] }); i += 1; continue;
      }

      var from = start;
      if (geminate) {
        romaji = /^ch/.test(romaji) ? "t" + romaji : romaji.charAt(0) + romaji;
        from = start - 1;              // include the っ/ッ in the display unit
        geminate = false;
      }

      while (norm[i] === "ー") {     // ー: lengthen the trailing vowel
        var last = romaji.charAt(romaji.length - 1);
        romaji = MACRON[last] ? romaji.slice(0, -1) + MACRON[last] : romaji + last;
        i += 1;
      }

      units.push({ kana: str.slice(from, i), romaji: romaji });
    }
    if (geminate) units.push({ kana: str.slice(i - 1, i), romaji: "" });
    return units;
  }

  function toRomaji(str) {
    return tokenize(str).map(function (u) { return u.romaji; }).join("");
  }

  // Take raw (unescaped) text; return HTML where each katakana unit is a
  // hover/tap target carrying its romaji in data-r (shown by CSS ::after, so
  // it never lands in the DOM's textContent -- search and sort stay clean).
  // Hiragana is passed through plain -- the per-kana reveal isn't needed
  // there. Everything else is passed through, HTML-escaped.
  function decorate(raw) {
    var esc = window.RaumeStudy.shared.escapeHtml;
    var out = "", run = "";
    function flush() {
      if (!run) return;
      tokenize(run).forEach(function (u) {
        out += (u.romaji && isKatakana(u.kana.charAt(0)))
          ? '<span class="kr" data-r="' + esc(u.romaji) + '">' + esc(u.kana) + "</span>"
          : esc(u.kana);
      });
      run = "";
    }
    for (var i = 0; i < raw.length; i++) {
      if (isKana(raw[i])) run += raw[i];
      else { flush(); out += esc(raw[i]); }
    }
    flush();
    return out;
  }

  return {
    toRomaji: toRomaji, decorate: decorate, isKana: isKana
  };
})();
