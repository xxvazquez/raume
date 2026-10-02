// Kana -> romaji (and back: toKana, below), for the interactive reading layer: hover (or tap) a kana
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


  // Romaji -> hiragana, the other way: what a Japanese keyboard's romaji
  // input does, for typing an answer without one (Word chain). Hepburn and
  // the keyboard spellings both work (shi / si, chi / ti, tsu / tu, fu / hu,
  // ji / zi, sha / sya, ja / jya / zya), a doubled consonant is っ (matcha:
  // tch), - is ー, x / l before a kana makes it small. ん: n' always, n
  // before a consonant, nn before a consonant or at the end, and the first
  // of nn before a vowel (onna -> おんな, as Hepburn writes it). Anything
  // that isn't romaji (kana or kanji from a real keyboard) passes through.
  // `final` is false while typing: a trailing n, nn or half a syllable (ky)
  // stays as letters, ready for the next key; true converts what it can.
  var R = {};
  (function () {
    var V = ["a", "i", "u", "e", "o"];
    var rows = {
      "": "あいうえお", k: "かきくけこ", g: "がぎぐげご", s: "さしすせそ", z: "ざじずぜぞ", t: "たちつてと",
      d: "だぢづでど", n: "なにぬねの", h: "はひふへほ", b: "ばびぶべぼ", p: "ぱぴぷぺぽ", m: "まみむめも",
      r: "らりるれろ", x: "ぁぃぅぇぉ", l: "ぁぃぅぇぉ"
    };
    Object.keys(rows).forEach(function (c) { V.forEach(function (v, i) { R[c + v] = rows[c][i]; }); });
    var yoon = { ky: "き", gy: "ぎ", sy: "し", zy: "じ", jy: "じ", ty: "ち", cy: "ち", dy: "ぢ", ny: "に", hy: "ひ",
      by: "び", py: "ぴ", my: "み", ry: "り" };
    Object.keys(yoon).forEach(function (c) {
      R[c + "a"] = yoon[c] + "ゃ"; R[c + "u"] = yoon[c] + "ゅ"; R[c + "o"] = yoon[c] + "ょ"; R[c + "e"] = yoon[c] + "ぇ";
    });
    [["sh", "し"], ["ch", "ち"], ["j", "じ"]].forEach(function (p) {
      R[p[0] + "a"] = p[1] + "ゃ"; R[p[0] + "u"] = p[1] + "ゅ"; R[p[0] + "o"] = p[1] + "ょ"; R[p[0] + "e"] = p[1] + "ぇ"; R[p[0] + "i"] = p[1];
    });
    var extra = { ya: "や", yu: "ゆ", yo: "よ", ye: "いぇ", wa: "わ", wo: "を", wi: "うぃ", we: "うぇ", tsu: "つ", tu: "つ",
      fa: "ふぁ", fi: "ふぃ", fu: "ふ", fe: "ふぇ", fo: "ふぉ", vu: "ゔ", va: "ゔぁ", vi: "ゔぃ", ve: "ゔぇ", vo: "ゔぉ",
      thi: "てぃ", dhi: "でぃ", twu: "とぅ", dwu: "どぅ", tsa: "つぁ", tse: "つぇ", tso: "つぉ",
      xya: "ゃ", xyu: "ゅ", xyo: "ょ", lya: "ゃ", lyu: "ゅ", lyo: "ょ", xtu: "っ", ltu: "っ", xtsu: "っ", ltsu: "っ", xwa: "ゎ", lwa: "ゎ" };
    Object.keys(extra).forEach(function (k) { R[k] = extra[k]; });
  })();
  var R_KEYS = Object.keys(R);
  function isVowel(c) { return !!c && "aeiou".indexOf(c) !== -1; }
  function isConsonant(c) { return c >= "a" && c <= "z" && !isVowel(c); }
  function toKana(str, final) {
    str = String(str || "").toLowerCase();
    var out = "", i = 0;
    while (i < str.length) {
      var c = str[i], next = str[i + 1] || "", rest = str.slice(i);
      if (c === "-") { out += "ー"; i += 1; continue; }
      if (c === "n") {
        if (next === "'") { out += "ん"; i += 2; continue; }
        if (next === "n") {
          var after = str[i + 2] || "";
          // nn, then a vowel or y: ん, and the second n starts the syllable.
          if (isVowel(after) || after === "y") { out += "ん"; i += 1; continue; }
          if (after === "" && !final) { out += "nn"; break; }
          out += "ん"; i += 2; continue;
        }
        if (isConsonant(next) && next !== "y") { out += "ん"; i += 1; continue; }
        if (next === "") { out += final ? "ん" : "n"; break; }
      }
      // Hepburn's m before b / p (shimbun, tempura) is ん.
      if (c === "m" && (next === "b" || next === "p")) { out += "ん"; i += 1; continue; }
      // A doubled consonant (kk, ss, pp ...) or "tch": っ.
      if (isConsonant(c) && (next === c || (c === "t" && next === "c" && str[i + 2] === "h"))) { out += "っ"; i += 1; continue; }
      var hit = null;
      for (var len = 4; len >= 1 && !hit; len--) if (rest.length >= len && R[rest.slice(0, len)]) hit = rest.slice(0, len);
      if (hit) { out += R[hit]; i += hit.length; continue; }
      // Half a syllable at the end (k, ky, ts): keep it while typing.
      if (!final && isConsonant(c) && R_KEYS.some(function (k) { return k.indexOf(rest) === 0; })) { out += rest; break; }
      out += str[i]; i += 1;
    }
    return out;
  }

  // Romaji folded to one spelling per sound, for matching what someone typed
  // against the data (flashcard answers, search). Lower-cased; apostrophes,
  // hyphens and spaces dropped (kin'en / kinen); macrons folded (ō -> o); a
  // Japanese keyboard's spellings (wāpuro / Kunrei: si, tu, hu, zi, sya, tya,
  // zya, nn) and traditional Hepburn's m before b / p folded to the Hepburn
  // the data uses; then vowel length dropped ("ou" / "oo" -> "o", any doubled
  // vowel -> one), since a long vowel can't be typed as such. A small っ
  // (doubled consonant) is kept -- kite and kitte are different words.
  function foldRomaji(s) {
    return String(s == null ? "" : s).toLowerCase()
      .replace(/['\u2018\u2019\-\s]/g, "")
      .replace(/[\u0101\u00e2]/g, "a").replace(/[\u012b\u00ee]/g, "i").replace(/[\u016b\u00fb]/g, "u")
      .replace(/[\u0113\u00ea]/g, "e").replace(/[\u014d\u00f4]/g, "o")
      .replace(/sy([auo])/g, "sh$1").replace(/(?:zy|jy)([auo])/g, "j$1").replace(/(?:ty|cy)([auo])/g, "ch$1")
      .replace(/si/g, "shi").replace(/ti/g, "chi").replace(/tu/g, "tsu").replace(/zi/g, "ji")
      .replace(/(^|[^cs])hu/g, "$1fu")
      .replace(/nn(?![aiueoy])/g, "n").replace(/m(?=[bp])/g, "n")
      .replace(/ou/g, "o").replace(/([aiueo])\1+/g, "$1");
  }

  return {
    toRomaji: toRomaji, toKana: toKana, decorate: decorate, isKana: isKana, foldRomaji: foldRomaji
  };
})();
