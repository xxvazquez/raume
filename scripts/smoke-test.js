// A small browser-level smoke test: loads the real index.html/app.js/vocabulary.js
// in jsdom and exercises the behaviors the static checks in validate-vocabulary.js
// can't see -- rendering, category-page navigation, search, view-mode accessible
// state, keyboard-operable toggles, and the print-selection class dance. Not a
// substitute for opening the page; a tripwire for the regressions a text diff
// wouldn't catch.
//
// The Flashcards checks below only cover page navigation, the per-row toggle,
// and pure answer-checking/vocab-index logic (exposed via window.RaumeStudy.flashcards.__testHooks)
// -- none of that needs a network. Everything that talks to Supabase (auth,
// add/remove/restore/delete-forever, review sync, offline-outbox replay) has
// no live project to test against here and needs manual verification instead.
const path = require("path");
const { JSDOM } = require("jsdom");

let failures = 0;
function check(label, cond) {
  if (cond) { console.log("  ok  " + label); }
  else { console.error("  FAIL " + label); failures++; }
}
// Flashcards' click handlers are `async function`s (they await a save/fetch
// before re-rendering) -- a plain .click() returns before that finishes, so
// asserting on the DOM right after can read a stale render. A real macrotask
// tick (not just a microtask) guarantees every pending render has landed.
function flush() { return new Promise((resolve) => setTimeout(resolve, 0)); }

async function main() {
  const url = "file://" + path.resolve("index.html");
  const dom = await JSDOM.fromFile(path.resolve("index.html"), {
    url,
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    // js/config.js holds whoever's real project credentials once they've
    // completed SUPABASE_SETUP.md -- this test needs the "not configured yet"
    // path to be reachable regardless of what's actually committed right now.
    // js/config.js only fills RaumeStudy.config in when it isn't already set
    // (its `|| ` guard), so seeding an empty one here before any script runs
    // wins without having to intercept the file load.
    beforeParse(window) {
      window.RaumeStudy = { config: { url: "", anonKey: "" } };
      // Seed a couple of old-prefix keys so the head migration
      // (js/storage-migration.js) has something to move -- checked after load.
      // Both are signed-in cache keys, never read in the guest-mode flow this
      // test exercises, so seeding them perturbs nothing else.
      try {
        window.localStorage.setItem("sakura-flashcards-cache-v1", "{}");
        window.localStorage.setItem("sakura-kana-cache-v1", "{}");
      } catch (e) { /* no usable localStorage in this harness */ }
    }
  });
  const { window } = dom;
  window.print = () => {}; // jsdom has no print engine
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};

  await new Promise((resolve, reject) => {
    window.addEventListener("load", resolve);
    setTimeout(() => reject(new Error("page did not finish loading (external scripts) within 5s")), 5000);
  });
  const document = window.document;

  console.log("Rendering");
  const sections = document.querySelectorAll(".table-section");
  check("renders 23 table sections", sections.length === 23);
  const totalRows = document.querySelectorAll(".vocab tbody tr").length;
  check("renders 529 vocabulary rows", totalRows === 529);
  check("adjective rows carry an い-adj / な-adj pill before the meaning, and only those rows do", (() => {
    const adjSection = [...document.querySelectorAll('.table-section[data-section="grammar"]')]
      .find(s => s.querySelector(".section-title-text").textContent === "Adjectives");
    const pills = [...adjSection.querySelectorAll("tbody tr .adj-pill")];
    if (pills.length < 30) return false;
    const labelsOk = pills.every(p => {
      const i = p.classList.contains("adj-pill-i") && p.textContent === "い-adj";
      const na = p.classList.contains("adj-pill-na") && p.textContent === "な-adj";
      return (i || na) && p.previousElementSibling === null
        && p.nextElementSibling.classList.contains("meaning-text");
    });
    // No pill leaks onto a non-adjective row (e.g. the Verbs table).
    const verbsHavePills = [...document.querySelectorAll('.table-section[data-section="grammar"]')]
      .find(s => s.querySelector(".section-title-text").textContent === "Verbs")
      .querySelectorAll(".adj-pill").length > 0;
    // The pill also rides along in a plain vocabulary table: Taste & Texture's
    // い-adjectives are tagged, its mimetic descriptors (mochimochi, ...) are not.
    const taste = [...document.querySelectorAll(".table-section")]
      .find(s => s.querySelector(".section-title-text").textContent === "Taste & Texture");
    const tasteTagged = taste.querySelectorAll(".adj-pill-i").length >= 10 && taste.querySelectorAll(".adj-pill-na").length === 0;
    const mochiRow = [...taste.querySelectorAll("tbody tr")].find(r => r.cells[1].textContent === "mochimochi");
    const mochiUntagged = mochiRow && !mochiRow.querySelector(".adj-pill");
    // A lone adjective sitting in an otherwise-noun table still gets tagged:
    // 危険 (na-adj) in Signs, Doors & Places.
    const kikenRow = [...document.querySelectorAll("#vocabulary tbody tr")].find(r => r.cells[1].textContent === "kiken");
    const kikenTagged = kikenRow && kikenRow.querySelector(".adj-pill-na");
    return labelsOk && !verbsHavePills && tasteTagged && mochiUntagged && kikenTagged;
  })());
  check("the adjective pill stays out of search matches", (() => {
    const input = document.getElementById("tableSearch");
    input.value = "い-adj";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    const hits = document.querySelectorAll('#vocabulary tbody tr:not(.search-hidden)').length;
    input.value = "";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    return hits === 0;
  })());
  check("every Japanese cell is marked lang=\"ja\"", [...document.querySelectorAll("td.jp")].every(td => td.getAttribute("lang") === "ja"));
  check("every Japanese cell has one speaker button per form, keyed to the kana reading (not the kanji)", [...document.querySelectorAll("td.jp")].every(td => {
    const forms = td.querySelectorAll(".verb-form").length || 1;
    const btns = [...td.querySelectorAll(".jp-speak-btn")];
    // The regression this guards: jpReadingOf must fall back to a segment's
    // own text when it has no kanji/reading (a plain kana or katakana
    // headword), or the speak button silently never renders for those rows.
    return btns.length === forms && btns.every(b => b.dataset.jpSpeak && !/[一-龯]/.test(b.dataset.jpSpeak));
  }));
  check("section toggle is a real <button> (native keyboard activation)", document.querySelector(".section-toggle").tagName === "BUTTON");
  check("controls are siblings of the toggle, not nested inside it", !document.querySelector(".section-toggle .print-one"));
  check("every table section carries its category", [...sections].every(s => s.dataset.category));
  check("every vocab table is named for assistive tech (aria-labelledby its title)", [...document.querySelectorAll("#vocabulary table.vocab")].every(t => {
    const id = t.getAttribute("aria-labelledby");
    const label = id && document.getElementById(id);
    return label && label.classList.contains("section-title-text") && label.textContent.trim().length > 0;
  }));
  // The page's CSP is style-src 'self' with no 'unsafe-inline', so any inline
  // style="" attribute gets silently dropped by the browser (not an error) --
  // easy to introduce by accident and easy to miss without a check like this.
  check("no element relies on an inline style=\"\" attribute (blocked by CSP style-src)", document.querySelectorAll("[style]").length === 0);
  const allCssRules = (() => {
    const flat = [];
    const walk = list => { for (const r of list) { flat.push(r); if (r.cssRules) walk(r.cssRules); } };
    for (const ss of document.styleSheets) { try { walk(ss.cssRules); } catch (e) { /* cross-origin */ } }
    return flat;
  })();
  check("the い-adj and な-adj pills fill with two different accent tokens", (() => {
    const iRule = allCssRules.find(r => r.selectorText === ".adj-pill-i");
    const naRule = allCssRules.find(r => r.selectorText === ".adj-pill-na");
    const bg = r => (r && (r.style.background || r.style.backgroundColor)) || "";
    return /var\(--accent-soft\)/.test(bg(iRule)) && /var\(--accent-2-soft\)/.test(bg(naRule));
  })());
  check("the four section accents are spread far enough apart in hue to read as distinct identities, light and dark", (() => {
    const hexToHue = (hex) => {
      const h = hex.trim().replace("#", "");
      const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      if (d === 0) return 0;
      let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (hue * 60 + 360) % 360;
    };
    const sections = ["vocabulary", "grammar", "travel", "flashcards"];
    // The regression this guards: Vocabulary and Flashcards once sat 5° apart.
    const wellSpread = (rule) => {
      if (!rule) return false;
      const hues = sections.map(s => hexToHue(rule.style.getPropertyValue("--sec-" + s)));
      for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) {
        const d = Math.abs(hues[i] - hues[j]);
        if (Math.min(d, 360 - d) < 20) return false;
      }
      return true;
    };
    const lightRoot = allCssRules.find(r => r.selectorText === ":root");
    const darkRoot = allCssRules.find(r => r.selectorText === ':root[data-theme="dark"]');
    return wellSpread(lightRoot) && wellSpread(darkRoot);
  })());
  check("a prefers-reduced-motion block neutralises animation + transitions", (() => {
    const media = allCssRules.find(r => r.media && /prefers-reduced-motion:\s*reduce/.test(r.media.mediaText));
    if (!media) return false;
    const txt = [...media.cssRules].map(r => r.cssText).join(" ");
    return /transition-duration:\s*0?\.01ms/.test(txt) && /animation-duration:\s*0?\.01ms/.test(txt);
  })());
  check("the search box uses the same outline focus ring as every other control", (() => {
    const rule = allCssRules.find(r => r.selectorText === ".search-box:focus-within");
    return !!rule && rule.style.outline.includes("2px") && rule.style.boxShadow === "";
  })());
  check("flashcard checkboxes are restyled (appearance:none), not left as a raw OS control", (() => {
    const rule = allCssRules.find(r => r.selectorText
      && /\.fc-kana-group input\[type="checkbox"\]/.test(r.selectorText)
      && r.style.appearance === "none");
    const tick = allCssRules.find(r => r.selectorText && /input\[type="checkbox"\]:checked::after/.test(r.selectorText));
    return !!rule && !!tick;
  })());
  check("the review prompt is sized up from the generic .fc-prompt", (() => {
    const rule = allCssRules.find(r => r.selectorText === ".fc-review-card .fc-prompt");
    return !!rule && parseInt(rule.style.fontSize, 10) >= 24;
  })());
  check("speaker buttons stay hidden until a Japanese voice is confirmed available", (() => {
    const base = allCssRules.find(r => r.selectorText === ".jp-speak-btn");
    const revealed = allCssRules.find(r => r.selectorText === "body.ja-voice-ready .jp-speak-btn");
    return !!base && base.style.display === "none" && !!revealed && revealed.style.display === "inline-flex";
  })());
  check("speaker buttons are dropped from print, like the other row-action icons", (() => {
    const rule = allCssRules.find(r => r.selectorText
      && r.selectorText.split(",").map(s => s.trim()).includes(".jp-speak-btn")
      && r.parentRule && /print/.test((r.parentRule.media || r.parentRule.conditionText || {}).mediaText || r.parentRule.conditionText || ""));
    return !!rule && rule.style.display === "none";
  })());
  check("clicking a table row's speaker button calls speech.speak with that button's reading", (() => {
    const speech = window.RaumeStudy.shared.speech;
    const original = speech.speak;
    let got;
    speech.speak = (text) => { got = text; };
    const btn = document.querySelector(".jp-speak-btn");
    btn.click();
    speech.speak = original;
    return !!btn && got === btn.dataset.jpSpeak;
  })());
  check("category labels aren't ALL-CAPS in some places and Title Case in others", (() => {
    // the two that used to be uppercase eyebrows now match the headings
    return [".tindex-cat-name", ".cz-group-title"].every(sel => {
      const r = allCssRules.find(x => x.selectorText === sel);
      return r && r.style.textTransform !== "uppercase";
    });
  })());
  check("text fields draw their fill/border from per-theme tokens (dark stops them looking flat)", (() => {
    // The tokens are redefined under [data-theme="dark"], and the inputs point
    // at them instead of hard-coded --paper/--surface/--line.
    const darkBlock = allCssRules.find(r => r.selectorText === ':root[data-theme="dark"]'
      && r.style.getPropertyValue("--field-fill").trim() !== ""
      && r.style.getPropertyValue("--card-line").trim() !== "");
    const usesToken = (sel, varName) => {
      const r = allCssRules.find(x => x.selectorText === sel);
      return r && new RegExp("var\\(--" + varName + "\\)").test(r.style.cssText);
    };
    // .fc-answer-form input is a bare underline now (the approved design),
    // no fill -- it still has to repaint for dark mode, just via the border
    // token instead of the background one.
    return !!darkBlock && usesToken(".search-box", "field-fill")
      && usesToken(".fc-answer-form input", "field-line")
      && usesToken(".fc-auth-field input", "field-fill");
  })());
  check("all four rating buttons are tone-distinct (regression: Good and Easy used to share one color, Hard had none)", (() => {
    const ratings = ["again", "hard", "good", "easy"];
    const styleFor = (sel) => { const r = allCssRules.find(x => x.selectorText === sel); return r && r.style; };
    // The tone now lives entirely on the key chip (background + text colour) --
    // the row itself is neutral so it reads as one compact control.
    const keyBg = ratings.map(r => styleFor('.fc-rating-btn[data-rating="' + r + '"] .fc-rating-key')?.background);
    const keyColors = ratings.map(r => styleFor('.fc-rating-btn[data-rating="' + r + '"] .fc-rating-key')?.color);
    const allSet = (arr) => arr.every(Boolean);
    const allDistinct = (arr) => new Set(arr).size === arr.length;
    return allSet(keyBg) && allDistinct(keyBg) && allSet(keyColors) && allDistinct(keyColors);
  })());

  console.log("Speech: pronunciation playback (Web Speech API)");
  {
    const speech = window.RaumeStudy.shared.speech;
    check("speech helpers are exposed", !!speech && typeof speech.speak === "function" && typeof speech.onJapaneseVoiceReady === "function");
    check("hasJapaneseVoice reads window.speechSynthesis live, not a cached snapshot from load", (() => {
      const original = window.speechSynthesis;
      window.speechSynthesis = { getVoices: () => [] };
      const before = speech.hasJapaneseVoice();
      window.speechSynthesis = { getVoices: () => [{ lang: "ja-JP", name: "Test JA" }] };
      const after = speech.hasJapaneseVoice();
      window.speechSynthesis = original;
      return before === false && after === true;
    })());
    check("onJapaneseVoiceReady fires immediately once a Japanese voice is already present", (() => {
      const original = window.speechSynthesis;
      window.speechSynthesis = { getVoices: () => [{ lang: "en-US" }, { lang: "ja-JP" }] };
      let fired = false;
      speech.onJapaneseVoiceReady(() => { fired = true; });
      window.speechSynthesis = original;
      return fired === true;
    })());
    check("speak() speaks the text in ja-JP with a Japanese voice, and does NOT cancel when nothing is playing (an unconditional cancel() before speak() wedges the queue in some Chromium builds)", (() => {
      const originalSynth = window.speechSynthesis;
      const originalUtterance = window.SpeechSynthesisUtterance;
      let cancelled = false, spoken = null;
      const jaVoice = { lang: "ja-JP", name: "Kyoko", localService: true };
      window.speechSynthesis = {
        speaking: false, pending: false, paused: false,
        getVoices: () => [{ lang: "en-US" }, jaVoice],
        cancel: () => { cancelled = true; },
        resume: () => {},
        speak: (u) => { spoken = u; }
      };
      window.SpeechSynthesisUtterance = function (text) { this.text = text; };
      speech.speak("チャーシュー");
      window.speechSynthesis = originalSynth;
      window.SpeechSynthesisUtterance = originalUtterance;
      return cancelled === false && !!spoken && spoken.text === "チャーシュー" && spoken.lang === "ja-JP" && spoken.voice === jaVoice;
    })());
    check("speak() DOES interrupt a still-speaking utterance so a second click doesn't queue behind the first", (() => {
      const originalSynth = window.speechSynthesis;
      const originalUtterance = window.SpeechSynthesisUtterance;
      let cancelled = false;
      window.speechSynthesis = {
        speaking: true, pending: false, paused: false,
        getVoices: () => [{ lang: "ja-JP", name: "Kyoko", localService: true }],
        cancel: () => { cancelled = true; },
        resume: () => {},
        speak: () => {}
      };
      window.SpeechSynthesisUtterance = function (text) { this.text = text; };
      speech.speak("みず");
      window.speechSynthesis = originalSynth;
      window.SpeechSynthesisUtterance = originalUtterance;
      return cancelled === true;
    })());
    check("the Japanese voice picker skips the novelty voices for a known-good one (Kyoko), not just the first in the list", (() => {
      const originalSynth = window.speechSynthesis;
      const originalUtterance = window.SpeechSynthesisUtterance;
      const kyoko = { lang: "ja-JP", name: "Kyoko", localService: true };
      let spoken = null;
      window.speechSynthesis = {
        speaking: false, pending: false, paused: false,
        // getVoices() order mirrors current macOS: novelty voices first, Kyoko buried
        getVoices: () => [
          { lang: "ja-JP", name: "Eddy (Japanese (Japan))", localService: true },
          { lang: "ja-JP", name: "Grandma (Japanese (Japan))", localService: true },
          kyoko,
          { lang: "ja-JP", name: "Rocko (Japanese (Japan))", localService: true }
        ],
        cancel: () => {}, resume: () => {}, speak: (u) => { spoken = u; }
      };
      window.SpeechSynthesisUtterance = function (text) { this.text = text; };
      speech.speak("あぶら");
      window.speechSynthesis = originalSynth;
      window.SpeechSynthesisUtterance = originalUtterance;
      return !!spoken && spoken.voice === kyoko;
    })());
    check("speak() is a no-op (never throws) with no speechSynthesis, no text, or no Utterance constructor", (() => {
      const originalSynth = window.speechSynthesis;
      const originalUtterance = window.SpeechSynthesisUtterance;
      try {
        delete window.speechSynthesis;
        speech.speak("こんにちは");
        window.speechSynthesis = { cancel() {}, speak() {}, getVoices: () => [{ lang: "ja-JP" }] };
        delete window.SpeechSynthesisUtterance;
        speech.speak("こんにちは");
        window.SpeechSynthesisUtterance = function (text) { this.text = text; };
        speech.speak("");
        return true;
      } catch (e) {
        return false;
      } finally {
        window.speechSynthesis = originalSynth;
        window.SpeechSynthesisUtterance = originalUtterance;
      }
    })());
  }

  console.log("Kana -> romaji reading layer (hiragana + katakana)");
  const kr = window.RaumeStudy.kanaRomaji;
  check("the converter is exposed", kr && typeof kr.toRomaji === "function");
  const cases = {
    "ケチャップ": "kechappu",   // katakana, ッ doubles the next consonant
    "マヨネーズ": "mayonēzu",   // ー -> macron
    "キャベツ": "kyabetsu",     // yoon kya
    "パーティー": "pātī",
    "だし": "dashi",            // hiragana
    "みりん": "mirin",
    "こしょう": "koshou",       // し + long ょう (no macron for hiragana う)
    "きゃ": "kya",              // hiragana yoon
    "しゅう": "shuu",
    "ちょ": "cho",
    "じゃ": "ja",
    "がっこう": "gakkou",       // hiragana sokuon っ
  };
  Object.keys(cases).forEach(k => check(`${k} -> ${cases[k]}`, kr.toRomaji(k) === cases[k]));
  // Decoration: kana in a table cell becomes hover targets, and the romaji is
  // NOT in the DOM text (so search/sort see only the kana).
  const findCell = re => [...document.querySelectorAll("#vocabulary td.jp")].find(td => td.querySelector(".kr") && re.test(td.textContent));
  const kataCell = findCell(/[ァ-ヺ]/);
  const hiraCell = findCell(/^[ぁ-ゖ]+$/); // a pure-hiragana headword
  check("katakana words render .kr hover targets", !!kataCell);
  check("hiragana words render .kr hover targets too", !!hiraCell);
  check("each .kr carries its romaji in data-r", [...kataCell.querySelectorAll(".kr")].every(s => /^[a-zāīūēō]+$/.test(s.dataset.r || "")));
  check("the romaji stays out of the cell's textContent", !/[a-z]/i.test(kataCell.textContent) && !/[a-z]/i.test(hiraCell.textContent));
  check("furigana readings are left plain (not decorated)", !document.querySelector('#vocabulary td.jp ruby .kr'));

  console.log("Table icons");
  const ic = window.RaumeStudy.icons;
  check("the icon set is exposed with grouped names", ic && ic.groups.length > 0 && ic.names.length > 120);
  check("every grouped icon name resolves to a real path", ic.groups.every(g => g.names.length > 0 && g.names.every(n => ic.has(n) && ic.render(n).indexOf("<svg") === 0)));
  check("render() emits a stroke-only inline SVG for a known name", /^<svg[^>]*stroke="currentColor"/.test(ic.render("coffee")) && ic.render("coffee").indexOf("fill=\"currentColor\"") === -1);
  check("render() emits an <img> for an uploaded data URL", /^<img /.test(ic.render("data:image/png;base64,AAAA")));
  check("render() degrades to nothing for an unknown value", ic.render("definitely-not-an-icon") === "");
  check("the icon picker module is available", !!(window.RaumeStudy.iconPicker && window.RaumeStudy.iconPicker.open));
  check("every table header has an icon button", [...document.querySelectorAll("#vocabulary .table-section")].every(s => !!s.querySelector(".section-head > .section-icon-btn[data-icon-for]")));
  check("an untouched table shows the empty '+' slot, not a chosen icon", (() => {
    const slot = document.querySelector(".section-icon-btn .section-icon");
    // The empty slot is a plain "+" (two strokes), never a box -- a square
    // outline here read as an unchecked checkbox.
    return slot.classList.contains("section-icon-empty")
      && !!slot.querySelector("svg path")
      && !slot.querySelector("rect")
      && !slot.querySelector("[stroke-dasharray]");
  })());
  check("choosing an icon updates the header and directory in place", (() => {
    const btn = document.querySelector('.section-icon-btn[data-icon-for]');
    const id = btn.dataset.iconFor;
    window.RaumeStudy.tableCustom.setIcon(id, "coffee");
    const slot = btn.querySelector(".section-icon");
    const dir = document.querySelector('#tindexMenu a[data-target="' + id + '"] .tindex-icon');
    const ok = !slot.classList.contains("section-icon-empty")
      && /viewBox="0 0 24 24"/.test(slot.innerHTML) && !slot.querySelector("[stroke-dasharray]")
      && dir && /viewBox="0 0 24 24"/.test(dir.innerHTML);
    window.RaumeStudy.tableCustom.setIcon(id, ""); // reset
    return ok;
  })());
  check("sign-in merges local customisations with the account (account wins per table, local-only kept + pushed up)", (() => {
    const tc = window.RaumeStudy.tableCustom;
    const secs = [...document.querySelectorAll(".section-icon-btn[data-icon-for]")];
    const a = secs[0].dataset.iconFor, b = secs[1].dataset.iconFor;
    tc.setIcon(a, "coffee");        // local + on the account -> account should win
    tc.setIcon(b, "leaf");          // local only -> should survive sign-in
    let pushed = null;
    tc.setRemotePush((obj) => { pushed = obj; });
    tc.applyRemote({ [a]: { icon: "star" } });
    const ok = tc.iconOf(a) === "star"
      && tc.iconOf(b) === "leaf"
      && !!(pushed && pushed[b] && pushed[b].icon === "leaf")
      && /viewBox="0 0 24 24"/.test(secs[0].querySelector(".section-icon").innerHTML);
    tc.setRemotePush(null);
    tc.clear(a); tc.clear(b);
    return ok && tc.iconOf(a) === "" && tc.iconOf(b) === "";
  })());

  console.log("Default landing page is Vocabulary");
  check("vocabulary page is visible on load", document.getElementById("vocabPage").hidden === false);
  check("flashcards page starts hidden", document.getElementById("flashcardsPage").hidden === true);
  check("no redundant page heading -- the nav is the only place the section is named", !document.getElementById("vocabPageTitle") && !document.querySelector("#vocabPage .page-title"));
  check("the Vocabulary nav link starts active", document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').classList.contains("active"));
  check("only the Vocabulary section's tables are shown", [...document.querySelectorAll("#vocabulary .table-section")].every(s => s.classList.contains("page-hidden") === (s.dataset.section !== "vocabulary")));
  check("Grammar tables belong to the grammar section", [...document.querySelectorAll('.table-section[data-category="Grammar"]')].every(s => s.dataset.section === "grammar"));
  check("Travel tables belong to the travel section", [...document.querySelectorAll('.table-section[data-category="Travel"]')].every(s => s.dataset.section === "travel"));
  check("every other category belongs to the vocabulary section", [...document.querySelectorAll(".table-section")].filter(s => !["Grammar", "Travel"].includes(s.dataset.category)).every(s => s.dataset.section === "vocabulary"));

  console.log("Vocabulary section: content-category sub-headings + table-index dropdown");
  const catHeads = [...document.querySelectorAll('#vocabulary .cat-heading[data-section="vocabulary"]')];
  check("a sub-heading per Vocabulary category (Food & Ingredients / Kitchen & Dining / Numbers & Counting)", catHeads.length === 3);
  check("sub-headings are visible on the Vocabulary page", catHeads.every(h => !h.classList.contains("page-hidden")));
  check("the reading column, its category rules and the expand bar share one width cap", (() => {
    const mw = el => window.getComputedStyle(el).maxWidth;
    const table = mw(document.querySelector("#vocabulary .table-section"));
    return table && table !== "none"
      && mw(catHeads[0]) === table
      && mw(document.querySelector(".page-vocab .expand-bar")) === table;
  })());
  const tindexMenu = document.getElementById("tindexMenu");
  check("the table-index dropdown menu starts closed", tindexMenu.hidden === true);
  check("its trigger reports collapsed", document.querySelector(".tindex-trigger").getAttribute("aria-expanded") === "false");
  check("the control is named 'Jump to a table' wherever that name is fixed", (() => {
    // The visible label is dynamic (it names the table you're on); the tooltip
    // and the landmark aria-label are the fixed identifiers and must agree.
    return document.querySelector(".tindex-trigger").title === "Jump to a table"
      && document.getElementById("tableIndex").getAttribute("aria-label") === "Jump to a table";
  })());
  const vocPanel = document.querySelector('#tableIndex .tindex-panel[data-section="vocabulary"]');
  check("the Vocabulary panel is the visible one", !!vocPanel && !vocPanel.classList.contains("page-hidden"));
  check("it links every Vocabulary table by name", (() => {
    const links = [...vocPanel.querySelectorAll('a[data-target]')];
    const tables = [...document.querySelectorAll('.table-section[data-section="vocabulary"]')];
    return links.length === tables.length && links.every(a => document.getElementById('table-' + a.dataset.target));
  })());
  check("the Vocabulary panel groups links by category (3 groups, 3 labels)", vocPanel.querySelectorAll('.tindex-cat-group').length === 3 && vocPanel.querySelectorAll('.tindex-cat').length === 3);
  check("category labels are plain text, not expand/collapse buttons", [...vocPanel.querySelectorAll('.tindex-cat')].every(c => c.tagName !== "BUTTON" && !c.hasAttribute("aria-expanded")));
  check("the Grammar panel is a single ungrouped list (no category label)", (() => {
    const g = document.querySelector('#tableIndex .tindex-panel[data-section="grammar"]');
    return g && g.querySelectorAll('.tindex-cat-group').length === 0 && g.querySelectorAll('.tindex-cat').length === 0 && !!g.querySelector('.tindex-list');
  })());
  check("a section with many tables is marked for the two-column layout", vocPanel.classList.contains("tindex-panel--wide") && !document.querySelector('#tableIndex .tindex-panel[data-section="grammar"]').classList.contains("tindex-panel--wide"));
  check("clicking the trigger opens the menu", (() => {
    document.querySelector(".tindex-trigger").click();
    return tindexMenu.hidden === false && document.querySelector(".tindex-trigger").getAttribute("aria-expanded") === "true";
  })());
  check("clicking outside closes it", (() => { document.body.click(); return tindexMenu.hidden === true; })());
  check("every table lands collapsed, nothing presumed more relevant", (() => {
    const tables = [...document.querySelectorAll('#vocabulary .table-section[data-section="vocabulary"]:not(.page-hidden)')];
    return tables.length > 1 && tables.every(s => s.classList.contains("collapsed"));
  })());

  console.log("Four-item top navigation");
  const navLinks = [...document.querySelectorAll("#siteNav .site-nav-link")];
  check("nav is Vocabulary / Grammar / Travel / Flashcards", navLinks.map(l => l.textContent) .join(" ") === "Vocabulary Grammar Travel Flashcards");
  check("the three vocabulary sections carry data-section", navLinks.slice(0, 3).map(l => l.dataset.section).join(",") === "vocabulary,grammar,travel");
  check("last nav item is Flashcards", navLinks[3].dataset.page === "flashcards");
  check("no category is a top-level nav item", !navLinks.some(l => l.dataset.category));

  console.log("Sections behave like separate pages");
  const grammarNav = document.querySelector('#siteNav .site-nav-link[data-section="grammar"]');
  grammarNav.click();
  check("only Grammar tables are shown", [...document.querySelectorAll("#vocabulary .table-section")].every(s => s.classList.contains("page-hidden") === (s.dataset.section !== "grammar")));
  check("the Grammar table-index panel is now the visible one", (() => {
    const shown = [...document.querySelectorAll('#tableIndex .tindex-panel')].filter(t => !t.classList.contains("page-hidden"));
    return shown.length === 1 && shown[0].dataset.section === "grammar";
  })());
  check("the Grammar nav link is active", grammarNav.classList.contains("active"));
  check("the Vocabulary nav link is no longer active", !document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').classList.contains("active"));
  check("Grammar has no in-flow category sub-heading (single category)", ![...document.querySelectorAll('#vocabulary .cat-heading:not(.page-hidden)')].length);

  console.log("\"Show polite\" only appears where verb rows are actually visible");
  check("hidden on Vocabulary (no verb tables)", (() => {
    document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();
    return document.getElementById("politeToggle").hidden === true;
  })());
  check("still hidden on Grammar landing collapsed (Verbs not open)", (() => {
    document.querySelector('#siteNav .site-nav-link[data-section="grammar"]').click();
    return document.getElementById("politeToggle").hidden === true;
  })());
  check("shown once the Verbs table is expanded", (() => {
    const verbs = [...document.querySelectorAll('#vocabulary .table-section:not(.page-hidden)')]
      .find(s => s.querySelector('.verb-form'));
    verbs.querySelector('.section-toggle').click();
    return document.getElementById("politeToggle").hidden === false;
  })());

  console.log("Directory shows aligned counts");
  check("every table link carries an entry count", [...document.querySelectorAll('#tindexMenu .tindex-panel[data-section="vocabulary"] a[data-target]')].every(a => /^\d+$/.test(a.querySelector('.tindex-count')?.textContent || "")));
  check("category labels carry a table count", [...document.querySelectorAll('#tindexMenu .tindex-panel[data-section="vocabulary"] .tindex-cat')].every(c => /^\d+$/.test(c.querySelector('.tindex-count')?.textContent || "")));

  console.log("URL hash routing");
  window.location.hash = "#grammar";
  window.dispatchEvent(new window.Event("popstate"));
  check("#grammar routes to the Grammar section", document.body.dataset.activeSection === "grammar");
  const advId = [...document.querySelectorAll('.table-section[data-section="grammar"]')].find(s => s.querySelector('.section-title-text').textContent === "Adjectives").dataset.table;
  window.location.hash = "#table-" + advId;
  window.dispatchEvent(new window.Event("popstate"));
  check("#table-N reveals and expands that table", (() => {
    const s = document.querySelector('.table-section[data-table="' + advId + '"]');
    return !s.classList.contains("page-hidden") && !s.classList.contains("collapsed") && document.body.dataset.activeSection === "grammar";
  })());
  const verbsRouteId = [...document.querySelectorAll('.table-section[data-section="grammar"]')].find(s => s.querySelector('.section-title-text').textContent === "Verbs").dataset.table;
  window.location.hash = "#table-" + verbsRouteId;
  window.dispatchEvent(new window.Event("popstate"));
  check("routing straight to the Verbs table reveals \"Show polite\"", document.getElementById("politeToggle").hidden === false);
  window.location.hash = "";
  window.dispatchEvent(new window.Event("popstate"));
  check("an empty hash routes back to Vocabulary", document.body.dataset.activeSection === "vocabulary");

  console.log("Theme toggle (System / Light / Dark cycle)");
  const themeBtn = document.getElementById("themeToggle");
  const themeChoice = () => document.documentElement.getAttribute("data-theme-choice");
  const themeResolved = () => document.documentElement.getAttribute("data-theme");
  check("starts following the system (no explicit choice)", themeChoice() === "system");
  themeBtn.click();
  check("first click pins an explicit Light", themeChoice() === "light" && themeResolved() === "light");
  themeBtn.click();
  check("second click goes Dark", themeChoice() === "dark" && themeResolved() === "dark");
  themeBtn.click();
  check("third click returns to System", themeChoice() === "system");
  check("the button shows the icon for the current mode", (() => {
    const vis = (sel) => window.getComputedStyle(themeBtn.querySelector(sel)).display !== "none";
    return vis(".theme-icon-system") && !vis(".theme-icon-light") && !vis(".theme-icon-dark");
  })());

  console.log("Jumping to a table from the dropdown");
  // On Grammar: open the menu, jump to Verbs, menu closes.
  const verbsSec = [...document.querySelectorAll('.table-section[data-section="grammar"]')].find(s => s.querySelector('.section-title-text').textContent === "Verbs");
  document.querySelector(".tindex-trigger").click();
  const verbsIdxLink = document.querySelector('#tableIndex .tindex-panel[data-section="grammar"] a[data-target="' + verbsSec.dataset.table + '"]');
  verbsIdxLink.click();
  check("the target table is revealed and expanded", !verbsSec.classList.contains("page-hidden") && !verbsSec.classList.contains("collapsed"));
  check("its section siblings are collapsed", [...document.querySelectorAll('.table-section[data-section="grammar"]')].filter(s => s !== verbsSec).every(s => s.classList.contains("collapsed")));
  check("picking a table closes the menu", document.getElementById("tindexMenu").hidden === true);

  document.querySelector('#siteNav .site-nav-link[data-section="travel"]').click();
  check("Travel shows the travel section's tables", [...document.querySelectorAll('.table-section[data-category="Travel"]')].every(s => !s.classList.contains("page-hidden")));
  check("Grammar tables are hidden again", document.querySelector('.table-section[data-category="Grammar"]').classList.contains("page-hidden"));

  console.log("The wordmark routes back to Vocabulary");
  document.querySelector(".wordmark").click();
  check("wordmark returns to the Vocabulary section", document.body.dataset.activeSection === "vocabulary" && document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').classList.contains("active"));

  console.log("Search reaches across every section");
  document.querySelector('#siteNav .site-nav-link[data-section="grammar"]').click();
  const input = document.getElementById("tableSearch");
  input.value = "beer";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  const visibleRows = [...document.querySelectorAll(".table-section:not(.search-hidden) tbody tr:not(.search-hidden)")];
  check("searching 'beer' leaves exactly one visible row", visibleRows.length === 1);
  check("the match is highlighted", visibleRows[0] && !!visibleRows[0].querySelector("mark.search-hit"));
  check("the match (a Food table) is revealed even though Grammar was open", !document.querySelector('.table-section[data-table="1"]').classList.contains("page-hidden"));
  check("category sub-headings are hidden during a search", [...document.querySelectorAll("#vocabulary .cat-heading")].every(h => h.classList.contains("search-hidden")));
  check("the table-index dropdown is hidden during a search", document.getElementById("tableIndex").classList.contains("search-hidden"));
  input.value = "";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  // A katakana query spans several .kr units, so its highlight lands on the
  // spans (not a split <mark>); the row must still surface and clear cleanly.
  input.value = "ケチャップ";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  const kataRow = [...document.querySelectorAll(".table-section:not(.search-hidden) tbody tr:not(.search-hidden)")]
    .find(r => r.querySelector("td.jp")?.textContent === "ケチャップ");
  check("a katakana search surfaces its row", !!kataRow);
  check("...with the katakana units highlighted", kataRow && kataRow.querySelectorAll("td.jp .kr.search-hit").length >= 2);
  input.value = "";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("clearing removes the katakana highlight too", !document.querySelector("td.jp .kr.search-hit"));
  check("clearing search shows every table again", document.querySelectorAll(".table-section.search-hidden").length === 0);
  check("clearing search restores the Grammar section", document.querySelector('.table-section[data-category="Grammar"]').classList.contains("page-hidden") === false && document.querySelector('.table-section[data-table="1"]').classList.contains("page-hidden") === true);
  check("...and restores the category sub-headings for the active section", [...document.querySelectorAll("#vocabulary .cat-heading")].every(h => !h.classList.contains("search-hidden")));
  check("...and restores the Grammar table-index dropdown", (() => {
    const ti = document.getElementById("tableIndex");
    const shown = [...ti.querySelectorAll('.tindex-panel')].filter(t => !t.classList.contains("page-hidden"));
    return !ti.classList.contains("search-hidden") && shown.length === 1 && shown[0].dataset.section === "grammar";
  })());

  console.log("Column visibility toggles (each button hides its own thing)");
  const colBtn = k => document.querySelector('.view-mode button[data-col="' + k + '"]');
  colBtn("english").click();
  check("clicking a column button hides that column — pressed means hidden", colBtn("english").getAttribute("aria-pressed") === "true" && colBtn("english").classList.contains("col-hidden"));
  check("its cells are aria-hidden and its sort control is disabled", document.querySelector(".vocab td:nth-child(3)").getAttribute("aria-hidden") === "true" && document.querySelector(".vocab th:nth-child(3) .sort-button").disabled === true);
  check("the other columns are untouched", !colBtn("japanese").classList.contains("col-hidden") && document.querySelector(".vocab td:nth-child(1)").getAttribute("aria-hidden") === null);
  colBtn("romaji").click();
  check("a second column can be hidden independently", colBtn("romaji").classList.contains("col-hidden") && colBtn("english").classList.contains("col-hidden"));
  colBtn("japanese").click();
  check("the last visible column can't be hidden", !colBtn("japanese").classList.contains("col-hidden") && document.querySelector(".vocab td:nth-child(1)").getAttribute("aria-hidden") === null);
  colBtn("english").click();
  colBtn("romaji").click();
  check("clicking again shows a column back", !colBtn("english").classList.contains("col-hidden") && document.querySelector(".vocab td:nth-child(3)").getAttribute("aria-hidden") === null);
  colBtn("furigana").click();
  check("the Furigana toggle hides just the readings, not the Japanese column", colBtn("furigana").classList.contains("col-hidden") && document.querySelector(".vocab .furigana").getAttribute("aria-hidden") === "true" && document.querySelector(".vocab td:nth-child(1)").getAttribute("aria-hidden") === null);
  colBtn("furigana").click();
  check("...and shows the readings again", document.querySelector(".vocab .furigana").getAttribute("aria-hidden") === null);

  console.log("Keyboard-operable table toggle");
  const grammarSection = document.querySelector('.table-section[data-category="Grammar"]');
  const wasCollapsed = grammarSection.classList.contains("collapsed");
  grammarSection.querySelector(".section-toggle").click();
  check("clicking the toggle (the same activation a native button gets from Enter/Space) flips collapsed state", grammarSection.classList.contains("collapsed") !== wasCollapsed);
  check("aria-expanded tracks the toggle", grammarSection.querySelector(".section-toggle").getAttribute("aria-expanded") === String(!grammarSection.classList.contains("collapsed")));

  console.log("Expand all / collapse all");
  document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();
  const expandAllBtn = document.getElementById("expandAllBtn");
  const allCollapsed = () => {
    const tables = [...document.querySelectorAll('#vocabulary .table-section[data-section="vocabulary"]:not(.page-hidden)')];
    return tables.length > 1 && tables.every(s => s.classList.contains("collapsed"));
  };
  check("the expand-all control starts as 'Expand all'", !!expandAllBtn && expandAllBtn.textContent === "Expand all" && expandAllBtn.getAttribute("aria-pressed") === "false");
  expandAllBtn.click();
  check("clicking it expands every visible Vocabulary table", [...document.querySelectorAll('#vocabulary .table-section[data-section="vocabulary"]:not(.page-hidden)')].every(s => !s.classList.contains("collapsed")));
  check("...the button flips to 'Collapse all' and body carries expand-all-mode", expandAllBtn.textContent === "Collapse all" && expandAllBtn.getAttribute("aria-pressed") === "true" && document.body.classList.contains("expand-all-mode"));
  expandAllBtn.click();
  check("clicking again collapses every table", allCollapsed() && !document.body.classList.contains("expand-all-mode") && expandAllBtn.textContent === "Expand all");
  check("a section keeps its own layout across navigation", (() => {
    // Vocabulary: expand all, leave to Grammar, come back -- still expanded.
    expandAllBtn.click();
    const wasExpandAll = document.body.classList.contains("expand-all-mode");
    document.querySelector('#siteNav .site-nav-link[data-section="grammar"]').click();
    // Grammar wasn't left in expand-all, so it shows its own state, not Vocabulary's.
    const grammarIndependent = !document.body.classList.contains("expand-all-mode") && expandAllBtn.textContent === "Expand all";
    document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();
    const vocabRestored = document.body.classList.contains("expand-all-mode") && expandAllBtn.textContent === "Collapse all";
    expandAllBtn.click(); // reset Vocabulary to the default for later checks
    return wasExpandAll && grammarIndependent && vocabRestored;
  })());
  check("a section you've never touched still lands with every table collapsed", (() => {
    document.querySelector('#siteNav .site-nav-link[data-section="travel"]').click();
    const t = [...document.querySelectorAll('.table-section[data-section="travel"]:not(.page-hidden)')];
    const ok = t.length > 1 && t.every(s => s.classList.contains("collapsed"));
    document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();
    return ok;
  })());
  check("a search hides the expand-all bar", (() => {
    const s = document.getElementById("tableSearch");
    s.value = "water";
    s.dispatchEvent(new window.Event("input", { bubbles: true }));
    const hidden = document.querySelector(".expand-bar").classList.contains("search-hidden");
    s.value = "";
    s.dispatchEvent(new window.Event("input", { bubbles: true }));
    return hidden;
  })());

  console.log("Cover answers mode (blank the English column, tap a row to check)");
  document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();
  const selftestBtn = document.getElementById("selftestToggle");
  check("the control is labelled plainly", !!selftestBtn && selftestBtn.textContent.trim() === "Cover answers");
  check("the control starts off", selftestBtn.getAttribute("aria-pressed") === "false" && !document.body.classList.contains("selftest-mode"));
  const selftestHint = document.getElementById("selftestHint");
  check("the how-to hint is hidden until the mode is on", !!selftestHint && window.getComputedStyle(selftestHint).display === "none");
  selftestBtn.click();
  check("clicking it turns on the mode and lights the button", document.body.classList.contains("selftest-mode") && selftestBtn.getAttribute("aria-pressed") === "true" && selftestBtn.classList.contains("active"));
  check("...and the hint line appears", window.getComputedStyle(selftestHint).display !== "none" && /tap a row/i.test(selftestHint.textContent));
  const stRow = document.querySelector('#vocabulary .table-section[data-section="vocabulary"]:not(.page-hidden) tbody tr');
  stRow.cells[2].click();
  check("tapping a row reveals it", stRow.classList.contains("revealed"));
  stRow.cells[2].click();
  check("tapping again re-hides it", !stRow.classList.contains("revealed"));
  stRow.classList.add("revealed");
  selftestBtn.click();
  check("leaving the mode clears it, the hint, and every revealed row", !document.body.classList.contains("selftest-mode") && selftestBtn.getAttribute("aria-pressed") === "false" && window.getComputedStyle(selftestHint).display === "none" && !document.querySelector("#vocabulary .vocab tbody tr.revealed"));

  console.log("Star / favourite rows");
  document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();
  const tc = window.RaumeStudy.tableCustom;
  const starToggle = document.getElementById("starredToggle");
  check("every vocab row carries a star button with its vocab id", [...document.querySelectorAll("#vocabulary .vocab tbody tr")].every(r => {
    const b = r.querySelector(".star-btn");
    return b && b.dataset.vocabId === r.dataset.vocabId;
  }));
  check("the Starred toolbar button is hidden until something is starred", !!starToggle && starToggle.hidden === true && tc.starredList().length === 0);
  const starRow = document.querySelector('#vocabulary .table-section[data-section="vocabulary"]:not(.page-hidden) tbody tr');
  const starVid = starRow.dataset.vocabId;
  starRow.querySelector(".star-btn").click();
  check("clicking a row's star records it in the store and lights the button", tc.isStarred(starVid) &&
    starRow.querySelector(".star-btn").classList.contains("starred") &&
    starRow.querySelector(".star-btn").getAttribute("aria-pressed") === "true");
  check("...and the Starred toolbar button appears with a count", starToggle.hidden === false && starToggle.querySelector(".starred-count").textContent === "1");
  starToggle.click();
  check("opening the Starred view switches on starred-mode and hides the normal list", document.body.classList.contains("starred-mode") &&
    window.getComputedStyle(document.getElementById("vocabulary")).display === "none" &&
    document.getElementById("starredView").hidden === false);
  const collected = document.querySelector('#starredView .table-section[data-table="starred"]');
  check("the view is one real table built from the starred rows", !!collected &&
    !!collected.querySelector('tbody tr[data-vocab-id="' + starVid + '"]') &&
    collected.querySelectorAll("tbody tr").length === 1 &&
    !!collected.querySelector(".sort-button"));
  collected.querySelector('tbody tr[data-vocab-id="' + starVid + '"] .star-btn').click();
  check("un-starring the last row from inside the view empties it", !tc.isStarred(starVid) &&
    !!document.querySelector("#starredView .starred-empty") &&
    starToggle.querySelector(".starred-count").textContent === "0");
  check("the row's star in the main list is back to un-starred", !starRow.querySelector(".star-btn").classList.contains("starred"));
  starToggle.click();
  check("closing the view leaves starred-mode", !document.body.classList.contains("starred-mode") && document.getElementById("starredView").hidden === true);
  starRow.querySelector(".star-btn").click();
  starToggle.click();
  document.querySelector('#siteNav .site-nav-link[data-page="flashcards"]').click();
  check("leaving the reference for another page drops the starred view", !document.body.classList.contains("starred-mode") && document.getElementById("starredView").hidden === true);
  document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();
  starToggle.click();
  document.querySelector('#siteNav .site-nav-link[data-section="grammar"]').click();
  check("switching sections drops the starred view", !document.body.classList.contains("starred-mode"));
  // account sync: signing in unions the account's stars with local ones
  tc.applyRemote({ __starred: ["v0001", "v0002"] });
  check("applyRemote unions remote stars with what was starred locally", tc.isStarred(starVid) && tc.isStarred("v0001") && tc.isStarred("v0002"));
  tc.toggleStar(starVid); tc.toggleStar("v0001"); tc.toggleStar("v0002"); // reset for later checks
  document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();

  console.log("Table directory: every table visible at once, click to jump");
  document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();
  document.querySelector(".tindex-trigger").click();
  const dirPanel = document.querySelector('#tableIndex .tindex-panel[data-section="vocabulary"]');
  check("opening it lists every Vocabulary table with nothing to expand", (() => {
    const links = [...dirPanel.querySelectorAll('a[data-target]')];
    const tables = [...document.querySelectorAll('.table-section[data-section="vocabulary"]')];
    return links.length === tables.length && !dirPanel.querySelector('.collapsed');
  })());
  check("no collapsible category toggles remain", !document.querySelector('.tindex-cat[aria-expanded], button.tindex-cat'));
  const dirLink = dirPanel.querySelector('a[data-target]');
  const dirTargetId = dirLink.dataset.target;
  dirLink.click();
  check("picking a table from the directory jumps to it and closes the menu", (() => {
    const sec = document.querySelector('.table-section[data-table="' + dirTargetId + '"]');
    return document.getElementById("tindexMenu").hidden === true &&
      !sec.classList.contains("page-hidden") && !sec.classList.contains("collapsed");
  })());
  check("the mobile bottom-sheet scrim element is present", !!document.querySelector('#tableIndex .tindex-scrim'));

  console.log("Table columns");
  const countersSection = document.querySelector('.table-section[data-table="0"]');
  check("there is no row-number column — Japanese leads the table", !countersSection.querySelector("td.row-num, .row-num-th"));
  const headerLabels = [...countersSection.querySelectorAll("thead th")].map(th => th.textContent.replace(/[↕↓↑]/g, "").trim());
  check("columns are Japanese → Romaji → English", JSON.stringify(headerLabels) === JSON.stringify(["Japanese", "Romaji", "English"]));

  console.log("Hiding a row");
  const drinksSectionManage = document.querySelector('.table-section[data-table="1"]');
  const firstEyeBtn = drinksSectionManage.querySelector(".row-hide-btn");
  check("the eye icon is there on every row by default -- no mode to turn on first", window.getComputedStyle(firstEyeBtn).display !== "none");
  const firstRow = drinksSectionManage.querySelector("tbody tr");
  firstRow.querySelector(".row-hide-btn").click();
  check("clicking the eye hides that row", firstRow.classList.contains("row-hidden"));
  const status = drinksSectionManage.querySelector(".rows-hidden-status");
  check("the status line appears and reports the count", status.hidden === false && status.querySelector(".rows-hidden-count").textContent === "1 row hidden");
  status.querySelector(".show-all-rows").click();
  check("Show all restores the row", !firstRow.classList.contains("row-hidden"));
  check("the status line hides again once nothing is hidden", drinksSectionManage.querySelector(".rows-hidden-status").hidden === true);

  console.log("Removed controls stay removed");
  check("no print-all button", !document.querySelector(".print-all"));
  check("no print-selected button", !document.querySelector(".print-selected"));
  check("no hide-section button", !document.querySelector(".hide-section"));
  check("no table-pick checkboxes", !document.querySelector(".table-pick"));

  check("print gives the Japanese cell's furigana room, not the uniform row padding", (() => {
    // The uniform print padding (.vocab td, .vocab th) would otherwise crowd
    // the ruby reading against the row's top border -- .vocab td.jp needs its
    // own, taller padding-top inside the same @media print block.
    const printMedia = allCssRules.find(r => r.media && /^print$/.test(r.media.mediaText));
    if (!printMedia) return false;
    const printRules = [...printMedia.cssRules];
    const uniform = printRules.find(r => r.selectorText === ".vocab td, .vocab th");
    const jp = printRules.find(r => r.selectorText === ".vocab td.jp");
    return !!uniform && !!jp && parseInt(jp.style.paddingTop, 10) > parseInt(uniform.style.padding, 10);
  })());

  console.log("Print this table (icon button)");
  const printOneBtn = document.querySelector('.table-section[data-table="0"] .print-icon-btn');
  check("print-one is icon-only with an accessible label", printOneBtn.getAttribute("aria-label") === "Print this table" && printOneBtn.textContent.trim() === "");
  check("narrow screens also get a Print entry inside the overflow menu", !!document.querySelector('.table-section[data-table="0"] .section-menu-list .print-menu-item'));
  printOneBtn.click();
  check("clicking it marks body.print-only", document.body.classList.contains("print-only"));
  check("clicking it marks its own table as the print target", document.querySelector('.table-section[data-table="0"]').classList.contains("print-target"));
  check("other tables are not print targets", !document.querySelector('.table-section[data-table="1"]').classList.contains("print-target"));
  window.dispatchEvent(new window.Event("afterprint"));
  check("afterprint clears print-only", !document.body.classList.contains("print-only"));
  check("afterprint clears print-target", !document.querySelector('.table-section[data-table="0"]').classList.contains("print-target"));

  console.log("Print a whole section or the whole reference");
  document.querySelector('#siteNav .site-nav-link[data-section="grammar"]').click();
  const printMenuBtn = document.querySelector('.expand-bar .print-menu-btn');
  const printMenuList = document.querySelector('.expand-bar .print-menu .section-menu-list');
  check("the expand bar carries a Print… menu, closed", !!printMenuBtn && printMenuBtn.getAttribute("aria-expanded") === "false" && printMenuList.hidden === true);
  printMenuBtn.click();
  check("clicking it opens the menu with This section / Whole reference", printMenuList.hidden === false &&
    !!printMenuList.querySelector('.print-scope[data-scope="section"]') && !!printMenuList.querySelector('.print-scope[data-scope="all"]'));
  printMenuList.querySelector('.print-scope[data-scope="section"]').click();
  check("\"This section\" prints every table in the active section", document.body.classList.contains("print-only") &&
    [...document.querySelectorAll('.table-section[data-section="grammar"]')].every(s => s.classList.contains("print-target")));
  check("...and no other section's tables", [...document.querySelectorAll('.table-section:not([data-section="grammar"])')].every(s => !s.classList.contains("print-target")));
  check("...even the collapsed ones in that section", [...document.querySelectorAll('.table-section[data-section="grammar"].collapsed')].length > 0 &&
    [...document.querySelectorAll('.table-section[data-section="grammar"].collapsed')].every(s => s.classList.contains("print-target")));
  check("the menu closed itself after the pick", printMenuList.hidden === true);
  window.dispatchEvent(new window.Event("afterprint"));
  check("afterprint clears every print target", !document.body.classList.contains("print-only") && !document.querySelector(".table-section.print-target"));
  printMenuBtn.click();
  printMenuList.querySelector('.print-scope[data-scope="all"]').click();
  check("\"Whole reference\" prints every table on the page", document.body.classList.contains("print-only") &&
    [...document.querySelectorAll('#vocabulary .table-section')].every(s => s.classList.contains("print-target")));
  window.dispatchEvent(new window.Event("afterprint"));
  check("no checkbox table-selection UI came back", !document.querySelector(".print-all, .print-selected, .table-pick"));

  console.log("Customize page (rename / re-icon any table)");
  document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();
  const gear = document.getElementById("customizeToggle");
  check("the masthead has a Customize gear", !!gear);
  check("the Customize page starts hidden", document.getElementById("customizePage").hidden === true);
  gear.click();
  check("clicking the gear reveals the Customize page", document.getElementById("customizePage").hidden === false);
  check("...and hides the vocabulary view", document.getElementById("vocabPage").hidden === true);
  check("no nav link is active on the Customize page", !document.querySelector('#siteNav .site-nav-link.active'));
  const czRows = document.querySelectorAll("#customizePage .cz-row");
  check("it lists every one of the 23 tables", czRows.length === 23);
  check("each row has a name field and a reset control", [...czRows].every(r => r.querySelector(".cz-row-name") && r.querySelector(".cz-row-reset")));
  check("each row's icon button reuses the shared picker hook", [...czRows].every(r => r.querySelector('.section-icon-btn[data-icon-for]')));
  check("the name field is a bounded cluster with the reset button, not stretched the full row width", (() => {
    const field = czRows[0].querySelector(".cz-row-field");
    return window.getComputedStyle(field).flexGrow === "0";
  })());
  const czInput = document.querySelector('#customizePage .cz-row[data-table-id="1"] .cz-row-name');
  check("a table with no custom name shows its original as the placeholder", czInput.placeholder === "Drinks" && czInput.value === "");
  czInput.value = "My Drinks";
  czInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  check("committing a custom name updates the vocabulary header in place", document.querySelector('#vocabulary .table-section[data-table="1"] .section-title-text').textContent === "My Drinks");
  check("...and the Jump to a table list", document.querySelector('#tindexMenu a[data-target="1"] .tindex-tname').textContent === "My Drinks");
  check("...and the reset control becomes enabled", document.querySelector('#customizePage .cz-row[data-table-id="1"] .cz-row-reset').disabled === false);
  document.querySelector('#customizePage .cz-row[data-table-id="1"] .cz-row-reset').click();
  check("reset restores the shipped name everywhere", document.querySelector('#vocabulary .table-section[data-table="1"] .section-title-text').textContent === "Drinks" && window.RaumeStudy.tableCustom.nameOf("1") === "");

  console.log("Customize page: reordering tables and categories");
  const foodGroup = () => [...document.querySelectorAll("#customizePage .cz-group")].find(g => g.querySelector(".cz-group-name").textContent === "Food & Ingredients");
  check("rows carry move-up / move-down controls", foodGroup().querySelectorAll(".cz-row .cz-move-up").length > 0 && foodGroup().querySelectorAll(".cz-row .cz-move-down").length > 0);
  check("the first row's move-up and the last row's move-down are disabled", (() => {
    const rows = [...foodGroup().querySelectorAll(".cz-row")];
    return rows[0].querySelector(".cz-move-up").disabled && rows[rows.length - 1].querySelector(".cz-move-down").disabled;
  })());
  const foodIdsBefore = [...foodGroup().querySelectorAll(".cz-row")].map(r => r.dataset.tableId);
  foodGroup().querySelector(".cz-row .cz-move-down").click();
  const foodIdsAfter = [...foodGroup().querySelectorAll(".cz-row")].map(r => r.dataset.tableId);
  check("moving a table down swaps it past the next one", foodIdsAfter[0] === foodIdsBefore[1] && foodIdsAfter[1] === foodIdsBefore[0]);
  check("the vocabulary section order follows in place", (() => {
    const secs = [...document.querySelectorAll('#vocabulary .table-section[data-category="Food & Ingredients"]')].map(s => s.dataset.table);
    return secs[0] === foodIdsBefore[1] && secs[1] === foodIdsBefore[0];
  })());
  check("the Jump to a table list follows too", (() => {
    const grp = [...document.querySelectorAll("#tindexMenu .tindex-cat-group")].find(g => g.querySelector(".tindex-cat-name") && g.querySelector(".tindex-cat-name").textContent === "Food & Ingredients");
    const links = [...grp.querySelectorAll("a[data-target]")].map(a => a.dataset.target);
    return links[0] === foodIdsBefore[1] && links[1] === foodIdsBefore[0];
  })());
  const vocabCats = [...document.querySelectorAll("#customizePage .cz-group-name")].map(e => e.textContent).filter(c => window.RaumeStudy.vocab.sectionOf(c) === "vocabulary");
  const firstVocabGroup = [...document.querySelectorAll("#customizePage .cz-group")].find(g => g.querySelector(".cz-group-name").textContent === vocabCats[0]);
  check("a multi-category section's headers carry move controls", !!firstVocabGroup.querySelector(".cz-group-title .cz-move-down"));
  check("Grammar (single category in its section) has no category move controls", (() => {
    const g = [...document.querySelectorAll("#customizePage .cz-group")].find(x => x.querySelector(".cz-group-name").textContent === "Grammar");
    return !g.querySelector(".cz-group-title .cz-move-btn");
  })());
  firstVocabGroup.querySelector(".cz-group-title .cz-move-down").click();
  const vocabCatsAfter = [...document.querySelectorAll("#customizePage .cz-group-name")].map(e => e.textContent).filter(c => window.RaumeStudy.vocab.sectionOf(c) === "vocabulary");
  check("moving a category down reorders the section", vocabCatsAfter[0] === vocabCats[1] && vocabCatsAfter[1] === vocabCats[0]);
  check("...and the vocabulary category headings follow", (() => {
    const heads = [...document.querySelectorAll('#vocabulary .cat-heading[data-section="vocabulary"]')].map(h => h.dataset.category);
    return heads[0] === vocabCats[1] && heads[1] === vocabCats[0];
  })());
  check("a Reset order control appears once something is reordered", !!document.querySelector("#customizePage .cz-reset-order"));
  document.querySelector("#customizePage .cz-reset-order").click();
  check("Reset order clears the custom sequence and hides the control", !window.RaumeStudy.tableCustom.hasCustomOrder() && !document.querySelector("#customizePage .cz-reset-order"));
  check("...and the section order returns to A-Z", (() => {
    const secs = [...document.querySelectorAll('#vocabulary .table-section[data-category="Food & Ingredients"]')].map(s => s.querySelector(".section-title-text").textContent);
    return secs[0] === "Cooking Ingredients" && secs[1] === "Drinks";
  })());

  gear.click();
  check("clicking the gear again returns to the vocabulary view", document.getElementById("vocabPage").hidden === false && document.getElementById("customizePage").hidden === true);

  console.log("Help page (how this works)");
  const helpBtn = document.getElementById("helpToggle");
  check("the masthead has a help button", !!helpBtn);
  check("the Help page starts hidden", document.getElementById("helpPage").hidden === true);
  helpBtn.click();
  check("clicking it reveals the Help page and hides the reference", document.getElementById("helpPage").hidden === false && document.getElementById("vocabPage").hidden === true);
  check("its content is a real rundown, not a stub", document.querySelectorAll("#helpPage h3").length >= 3 && /Furigana/.test(document.getElementById("helpPage").textContent));
  check("no nav link is active on the Help page", !document.querySelector('#siteNav .site-nav-link.active'));
  check("the help button reflects the active state", helpBtn.classList.contains("active"));
  window.location.hash = "#help";
  check("the #help hash routes to it", document.getElementById("helpPage").hidden === false && document.body.dataset.activePage === "help");
  helpBtn.click();
  check("clicking the help button again returns to the reference", document.getElementById("vocabPage").hidden === false && document.getElementById("helpPage").hidden === true);
  window.location.hash = "";

  console.log("Flashcards: page navigation");
  check("no console errors from vendor/flashcards scripts loading", true); // JSDOM.fromFile above would have rejected on a thrown top-level error
  const flashcardsLink = document.querySelector('#siteNav .site-nav-link[data-page="flashcards"]');
  check("Flashcards nav link exists", !!flashcardsLink);
  flashcardsLink.click();
  check("clicking it reveals the Flashcards page", document.getElementById("flashcardsPage").hidden === false);
  check("clicking it hides the vocabulary view", document.getElementById("vocabPage").hidden === true);
  check("clicking it marks the Flashcards link active", flashcardsLink.classList.contains("active"));
  check("no vocabulary-section nav link stays active on Flashcards", !document.querySelector('#siteNav .site-nav-link[data-section].active'));
  check("without Supabase configured, it explains setup is needed", document.getElementById("flashcardsPage").textContent.includes("SUPABASE_SETUP.md"));
  // Password recovery needs a live Supabase project + a real inbox to
  // exercise end to end (checked by hand); this just guards the exports the
  // UI calls into from silently disappearing. Not called here -- configured()
  // is false in this harness, so getClient() returns null and .auth access
  // on it would throw.
  check("resetPassword / updatePassword / clearPasswordRecovery are exported", (() => {
    var d = window.RaumeStudy.flashcards.dataOps;
    return typeof d.resetPassword === "function" && typeof d.updatePassword === "function"
      && typeof d.clearPasswordRecovery === "function" && "passwordRecovery" in d.authState;
  })());
  document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();
  check("Vocabulary still returns to the reference (unaffected by the Flashcards page)", document.getElementById("vocabPage").hidden === false);

  console.log("Flashcards: per-row add toggle");
  const drinksSectionFc = document.querySelector('.table-section[data-table="2"]');
  const firstRowFc = drinksSectionFc.querySelector("tbody tr");
  check("every rendered row carries its permanent vocab id", /^v\d{4,}$/.test(firstRowFc.dataset.vocabId));
  const fcBtn = firstRowFc.querySelector(".fc-toggle-btn");
  check("the flashcard toggle exists on every row", !!fcBtn);
  // Unlike the old gated eye icon this was never display:none -- it's laid
  // out on every row (so touch and keyboard users can reach it) and kept
  // faintly visible at rest so the feature is discoverable, lifting to full
  // strength on hover/focus so the reading table still stays quiet.
  check("the toggle is present in layout, not display:none", window.getComputedStyle(fcBtn).display !== "none");
  check("it's ghosted at rest (discoverable, not loud) and lifts on hover/focus", (() => {
    const o = parseFloat(window.getComputedStyle(fcBtn).opacity);
    return o > 0 && o < 1;
  })());
  check("star, add-to-flashcards and hide sit together in one action cluster, in that order",
    (() => {
      const cluster = fcBtn.closest(".row-actions");
      return !!cluster && cluster.parentElement.classList.contains("meaning-cell")
        && fcBtn.previousElementSibling.classList.contains("star-btn")
        && fcBtn.nextElementSibling.classList.contains("row-hide-btn");
    })());
  check("that cluster is pinned to the wrapper's right edge, not flowing after the text " +
    "(the flex row lives on a <div> inside the <td>, not the <td> itself -- table-layout:fixed " +
    "stops honouring a cell's own column-width once its display is overridden to flex)",
    (() => {
      const cell = firstRowFc.querySelector("td:last-child");
      const wrap = cell.querySelector(".meaning-cell");
      const cellCs = window.getComputedStyle(cell);
      const wrapCs = window.getComputedStyle(wrap);
      const clusterCs = window.getComputedStyle(cell.querySelector(".row-actions"));
      return cellCs.display === "table-cell" && wrap.parentElement === cell
        && wrapCs.display === "flex" && clusterCs.flexShrink === "0";
    })());
  check("hover/focus within the row is styled to lift the toggle to full opacity", (() => {
    // jsdom doesn't recompute style for a live :focus-within/:hover change, so
    // check the rule itself rather than a getComputedStyle probe after .focus().
    const rule = allCssRules.find(r => r.selectorText
      && r.selectorText.includes(".vocab tbody tr:focus-within .fc-toggle-btn")
      && r.selectorText.includes(".vocab tbody tr:hover .fc-toggle-btn"));
    return !!rule && rule.style.opacity === "1";
  })());
  check("its data-vocab-id matches the row's", fcBtn.dataset.vocabId === firstRowFc.dataset.vocabId);

  console.log("Flashcards: add a whole table at once");
  const fcMenuBtn = drinksSectionFc.querySelector(".section-menu-btn");
  check("secondary table actions sit behind one overflow menu button", !!fcMenuBtn && fcMenuBtn.getAttribute("aria-haspopup") === "true");
  check("the menu starts closed", drinksSectionFc.querySelector(".section-menu-list").hidden === true);
  fcMenuBtn.click();
  check("clicking the menu button opens it", drinksSectionFc.querySelector(".section-menu-list").hidden === false && fcMenuBtn.getAttribute("aria-expanded") === "true");
  const addTableBtn = drinksSectionFc.querySelector(".section-menu-list .fc-add-table-btn");
  check("the menu holds an \"Add to flashcards\" action for this table", !!addTableBtn && addTableBtn.dataset.table === "2");
  check("no \"Manage rows\" mode left to find -- the eye icon is just always there", !document.querySelector(".manage-rows-toggle"));
  document.body.click();
  check("clicking elsewhere dismisses the menu", drinksSectionFc.querySelector(".section-menu-list").hidden === true);
  check("no element relies on an inline style=\"\" attribute, even after rendering the new controls", document.querySelectorAll("[style]").length === 0);

  console.log("Flashcards: guest mode (no account, on-device only -- no network involved, fully testable here)");
  // jsdom treats a bare file:// page as an opaque origin, where the spec
  // says localStorage access itself must throw -- real browsers don't do
  // this for file:// (and never for http/https, which is what the site
  // actually runs as), so this is purely a sandbox artifact. The app
  // already handles it (see getStoredMode/loadCache's own try/catch and
  // the in-memory fallback that keeps guest mode working for the rest of
  // this pageview regardless); this test mirrors that same defensiveness
  // rather than asserting on window.localStorage directly.
  function readLocalStorage(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return undefined; } // undefined = inaccessible here, not "empty"
  }
  const storageUsable = readLocalStorage("raume-flashcards-mode") !== undefined;

  if (storageUsable) {
    check("the head migration moves old sakura- keys onto the raume- prefix", (() => {
      return readLocalStorage("raume-flashcards-cache-v1") === "{}" && readLocalStorage("raume-kana-cache-v1") === "{}"
        && readLocalStorage("sakura-flashcards-cache-v1") === null && readLocalStorage("sakura-kana-cache-v1") === null;
    })());
  }

  document.querySelector('#siteNav .site-nav-link[data-page="flashcards"]').click();
  const guestBtn = document.getElementById("fcUseGuest");
  check("a \"Continue without an account\" option is offered alongside signing in", !!guestBtn);
  // Neither entry button is a filled primary -- the tinted "This device only"
  // card is the only nudge, so two dark buttons don't compete. (The sign-in
  // form's own button only renders with Supabase configured; checked in-browser.)
  check("the guest button is a quiet button, not a filled primary", guestBtn.classList.contains("fc-btn") && !guestBtn.classList.contains("fc-btn-primary"));
  guestBtn.click();
  check("choosing it goes straight to the Dashboard tab, no session needed", !!document.querySelector("#fcPanelDashboard"));
  check("it's labeled as on-device, not signed in", document.getElementById("flashcardsPage").textContent.includes("Using this device only"));

  // Offline / pending-sync chip: hidden while online and clean, surfaced as a
  // live status when the connection drops (which is meaningful even in guest
  // mode, where nothing is queued), cleared again on reconnect.
  check("the sync chip is present and hidden while online, its text an aria-live region", (() => {
    const chip = document.getElementById("fcSyncChip");
    const live = chip && chip.querySelector(".fc-sync-chip-text");
    return chip && chip.hidden === true && !!live && live.getAttribute("aria-live") === "polite";
  })());
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
  window.dispatchEvent(new window.Event("offline"));
  check("going offline surfaces the chip as a live status, in the attention tone", (() => {
    const chip = document.getElementById("fcSyncChip");
    return chip && chip.hidden === false && /offline/i.test(chip.textContent)
      && chip.classList.contains("fc-sync-chip-offline");
  })());
  check("the chip is styled to actually register -- a filled pill, not a hairline ghost", (() => {
    const rule = allCssRules.find(r => r.selectorText === ".fc-sync-chip-offline");
    return !!rule && /var\(--warn/.test(rule.style.background || rule.style.cssText || "");
  })());
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  window.dispatchEvent(new window.Event("online"));
  check("coming back online hides it again", document.getElementById("fcSyncChip").hidden === true);
  check("the manual retry path is wired -- syncNow is exported and the button class is styled", (() => {
    const btnRule = allCssRules.find(r => r.selectorText === ".fc-sync-now");
    return typeof window.RaumeStudy.flashcards.dataOps.syncNow === "function" && !!btnRule;
  })());
  const timeoutOk = await (async () => {
    const withTimeout = window.RaumeStudy.flashcards.dataOps.withTimeout;
    if (typeof withTimeout !== "function") return false;
    const fast = await withTimeout(Promise.resolve(7), "fast", 50);
    let timedOut = false;
    try { await withTimeout(new Promise(() => {}), "hang", 30); } catch (e) { timedOut = /timed out/.test(e.message); }
    return fast === 7 && timedOut;
  })();
  check("a hung sync request is timed out (so it can't leave the queue wedged forever)", timeoutOk);
  if (storageUsable) check("guest mode is remembered in localStorage", readLocalStorage("raume-flashcards-mode") === "guest");
  check("with nothing added yet, the Dashboard shows an empty state (not a grid of zeroes)",
    !document.querySelector(".fc-stats-grid") && /No flashcards yet/.test(document.querySelector("#fcPanelDashboard").textContent));
  document.querySelector('.fc-tab[data-tab="manage"]').click();
  const firstManageTable = document.querySelector("#fcPanelManage .fc-manage-table");
  check("each table starts collapsed (this list gets long fast otherwise)", firstManageTable.classList.contains("fc-manage-table-collapsed"));
  check("...its row list is actually hidden, not just visually collapsed", window.getComputedStyle(firstManageTable.querySelector(".fc-manage-list")).display === "none");
  check("a fresh deck shows no dead buttons -- 'Add table' only, no disabled 'Pause table'",
    firstManageTable.querySelector('[data-table-action="add-table"]') &&
    !firstManageTable.querySelector('[data-table-action="remove-table"]') &&
    !firstManageTable.querySelector('.fc-manage-table-actions .fc-btn[disabled]'));
  check("each table action carries both a text label and an icon (CSS drops the label to icon-only when narrow)", (() => {
    const b = firstManageTable.querySelector('.fc-manage-table-actions .fc-btn-tableaction');
    return b && b.querySelector('.fc-btn-tx') && b.querySelector('.fc-btn-ic svg') && b.getAttribute('aria-label') === 'Add table';
  })());
  check("a multi-table category offers 'Add all'", !!document.querySelector('#fcPanelManage [data-cat-action="add-cat"]'));

  // Fully-added vs. untouched should be structurally distinguishable, not just
  // by colour (jsdom can't resolve the var()-based border anyway -- checked in
  // the browser instead). Add a whole table, assert the count picks up the
  // done flag and the button swaps to Pause, then pause it straight back so
  // the counts the rest of this section expects aren't disturbed.
  console.log("Manage: a fully-added table's count picks up the accent");
  const doneTableId = firstManageTable.querySelector(".fc-manage-table-toggle").dataset.tableId;
  firstManageTable.querySelector('[data-table-action="add-table"]').click();
  await flush();
  const doneTable = document.querySelector('.fc-manage-table-toggle[data-table-id="' + doneTableId + '"]').closest(".fc-manage-table");
  check("its progress count is flagged done once every word in it is added",
    doneTable.querySelector(".fc-manage-table-progress").classList.contains("fc-manage-progress-done"));
  check("'Pause table' replaces 'Add table' once a table is fully added",
    !!doneTable.querySelector('[data-table-action="remove-table"]') && !doneTable.querySelector('[data-table-action="add-table"]'));
  check("a still-untouched table's count and button are unaffected", (() => {
    const untouched = [...document.querySelectorAll("#fcPanelManage .fc-manage-table")].find(t => t !== doneTable);
    return !!untouched && !untouched.querySelector(".fc-manage-table-progress").classList.contains("fc-manage-progress-done")
      && !!untouched.querySelector('[data-table-action="add-table"]');
  })());
  // "Pause table" is an overlay: it marks the whole table dormant without
  // touching any card. It should vanish from "My flashcards" and "Archived",
  // stay under "All vocabulary" with a Resume action, and drop out of review.
  console.log("Manage: pausing a whole table");
  {
    const sched = window.RaumeStudy.flashcards.scheduling;
    const store = window.RaumeStudy.flashcards.store;
    const before = { queue: sched.buildQueue(new Date()).length, total: sched.computeStats(new Date()).total };
    doneTable.querySelector('[data-table-action="remove-table"]').click();
    await flush();
    check("the table is now in pausedTables, its cards untouched", () =>
      store.isTablePaused(doneTableId) && sched.computeStats(new Date()).total === 0 && sched.buildQueue(new Date()).length === 0
      && Object.keys(store.getCache().cards).length > 0);
    const paused = () => document.querySelector('.fc-manage-table-toggle[data-table-id="' + doneTableId + '"]');
    document.querySelector('#fcPanelManage .fc-manage-filters button[data-filter="mine"]').click(); await flush();
    check("a paused table is gone from 'My flashcards'", !paused());
    document.querySelector('#fcPanelManage .fc-manage-filters button[data-filter="archived"]').click(); await flush();
    check("...and gone from 'Archived' too (only individually paused words show there)", !paused());
    document.querySelector('#fcPanelManage .fc-manage-filters button[data-filter="all"]').click(); await flush();
    const t = paused().closest(".fc-manage-table");
    check("...but still under 'All vocabulary', reading 'Paused', with a Resume action and no per-word buttons", () =>
      !!t && /Paused/.test(t.querySelector(".fc-manage-table-progress").textContent)
      && !!t.querySelector('[data-table-action="resume-table"]') && !t.querySelector('[data-table-action="remove-table"]')
      && !t.querySelector('.fc-manage-row .fc-actions [data-action]'));
    t.querySelector('[data-table-action="resume-table"]').click();
    await flush();
    check("Resume table lifts the overlay -- queue, stats and the card all come back exactly as they were", () => {
      const now = new Date();
      return !store.isTablePaused(doneTableId)
        && sched.buildQueue(now).length === before.queue && sched.computeStats(now).total === before.total;
    });
  }

  // Put the table back to paused for the assertions the rest of this section
  // expects (a quiet, empty-ish dashboard).
  document.querySelector('.fc-manage-table-toggle[data-table-id="' + doneTableId + '"]')
    .closest(".fc-manage-table").querySelector('[data-table-action="remove-table"]').click();
  await flush();

  firstManageTable.querySelector(".fc-manage-table-toggle").click(); // sync render -- re-query fresh, this reference is now stale
  check("clicking the toggle expands just that table", !document.querySelector("#fcPanelManage .fc-manage-table").classList.contains("fc-manage-table-collapsed"));
  const firstAddBtn = document.querySelector('#fcPanelManage [data-action="add"]');
  check("Manage lists addable vocabulary in guest mode too", !!firstAddBtn);
  check("per-word actions are icon + label buttons (label drops to icon-only on a phone), aria-labelled", () => {
    const btn = document.querySelector('#fcPanelManage .fc-manage-row [data-action]');
    return !!btn && btn.classList.contains("fc-btn-vocabaction")
      && !!btn.querySelector(".fc-btn-ic svg") && !!btn.querySelector(".fc-btn-tx")
      && /^(Add|Pause|Restore)$/.test(btn.getAttribute("aria-label") || "");
  });
  check("Manage word rows show plain kanji, not the furigana ruby (uniform row height, aligned columns)", () => {
    const jp = document.querySelector("#fcPanelManage .fc-manage-row .fc-jp");
    return !!jp && !jp.querySelector("ruby, rt") && jp.textContent.trim().length > 0;
  });
  check("Manage rows have a fixed min-height so the status glyphs line up down the list", () => {
    const rule = allCssRules.find(r => r.selectorText === ".fc-manage-row");
    return !!rule && /px/.test(rule.style.minHeight || "");
  });
  firstAddBtn.click();
  await flush();
  document.querySelector('.fc-tab[data-tab="dashboard"]').click();
  const totalTileAfter = document.querySelector(".fc-stat-tile:nth-child(2) .fc-stat-value").textContent;
  check("adding a word in guest mode updates the count with zero network calls", totalTileAfter === "4");
  if (storageUsable) check("its data actually lives in localStorage (not just in-memory)", /"active":true/.test(readLocalStorage("raume-flashcards-guest-v1") || ""));

  await flush(); // let the async weekly-activity load resolve and re-render
  check("the card-progress breakdown labels all three states", (() => {
    const legend = document.querySelector("#fcPanelDashboard .fc-breakdown-legend");
    return legend && /New/.test(legend.textContent) && /Learning/.test(legend.textContent) && /Review/.test(legend.textContent);
  })());
  check("the reviews-this-week chart marks today's column and only that one", (() => {
    const cols = document.querySelectorAll("#fcPanelDashboard .fc-week-col");
    if (cols.length !== 7) return false;
    return cols[6].classList.contains("fc-week-col-today")
      && [...cols].slice(0, 6).every(c => !c.classList.contains("fc-week-col-today"));
  })());

  console.log("Flashcards: Dashboard with cards but no review history");
  {
    const dash = document.querySelector("#fcPanelDashboard").textContent;
    check("a zero-review week says so, not just a bare axis", /No reviews yet this week/.test(dash));
    check("'Missed today' and 'Words to Review' fold into one line until there's history",
      !document.getElementById("fcWordsToReview") && !/Missed today/.test(dash)
      && /Words to review/.test(dash) && /Nothing to review yet/.test(dash));
    check("the next-review card always carries a second line", (() => {
      const sub = document.querySelector("#fcPanelDashboard .fc-next-review-sub");
      return !!sub && sub.textContent.trim().length > 0;
    })());
    check("Estimated retention spells out its pending state, not a bare \"—\"", (() => {
      const tile = [...document.querySelectorAll("#fcPanelDashboard .fc-stat-tile")]
        .find(t => /Estimated retention/.test(t.querySelector(".fc-stat-label").textContent));
      const val = tile && tile.querySelector(".fc-stat-value").textContent;
      return tile && tile.classList.contains("fc-stat-tile-pending") && val !== "—" && /reviews/i.test(val);
    })());
    check("only Day streak carries a coloured stat-tile variant -- Total cards and Reviews completed stay the plain, quiet tile", (() => {
      const tiles = [...document.querySelectorAll("#fcPanelDashboard .fc-stat-tile")];
      const byLabel = (re) => tiles.find(t => re.test(t.querySelector(".fc-stat-label").textContent));
      const hasVariant = (t) => !!t && (t.classList.contains("fc-stat-streak") || t.classList.contains("fc-stat-attention"));
      return hasVariant(byLabel(/Day streak/))
        && !hasVariant(byLabel(/Total cards/))
        && !hasVariant(byLabel(/Reviews completed/));
    })());
    check("the dashboard is capped, not run to the full sheet -- a 2-up row shouldn't balloon", (() => {
      const rule = allCssRules.find(r => r.selectorText === "#fcPanelDashboard");
      return !!rule && parseInt(rule.style.maxWidth, 10) > 0;
    })());
    check("the top row, the stat tiles and the viz cards share one 12-col grid past 620px, so their seams line up", (() => {
      const media = allCssRules.find(r => r.media && /min-width:\s*620px/.test(r.media.mediaText));
      if (!media) return false;
      const rules = [...media.cssRules];
      const cols = (cls) => {
        const r = rules.find(r => r.selectorText && r.selectorText.split(",").map(s => s.trim()).includes(cls));
        return r && r.style.gridTemplateColumns;
      };
      const grid12 = /repeat\(\s*12\s*,/;
      return grid12.test(cols(".fc-top-row") || "") && grid12.test(cols(".fc-stats-grid") || "") && grid12.test(cols(".fc-viz-grid") || "");
    })());
  }

  console.log("Flashcards: review session bookends");
  document.getElementById("fcStudyNow").click();
  check("Study now opens a review card", !!document.querySelector(".fc-review-card"));
  check("the review card has an in-session way out", !!document.getElementById("fcEndSession"));
  check("the panel centres the card vertically during a session (desktop)", (() => {
    // A stylesheet rule (not layout, which jsdom can't do): on a wide window the
    // panel holding a review card / wrap-up becomes a centred flex column with a
    // min-height. Nested in a min-width media query, so walk into those too.
    const flat = [];
    const walk = list => { for (const r of list) { flat.push(r); if (r.cssRules) walk(r.cssRules); } };
    for (const ss of document.styleSheets) { try { walk(ss.cssRules); } catch (e) { /* cross-origin */ } }
    const rule = flat.find(r => r.selectorText
      && r.selectorText.includes(":has(> .fc-review-card)")
      && r.selectorText.includes(".fc-session-done"));
    return !!rule && rule.style.justifyContent === "center"
      && /vh|px/.test(rule.style.minHeight)
      && rule.parentRule && /min-width/.test(rule.parentRule.conditionText || rule.parentRule.media.mediaText);
  })());
  const answerInput = document.getElementById("fcAnswerInput");
  check("the answer field is named with its prompt for a screen reader", (() => {
    const al = answerInput.getAttribute("aria-label") || "";
    const promptText = (document.querySelector(".fc-prompt") || {}).textContent || "x";
    return /^(Type the English meaning|Type the romaji reading): /.test(al) && al.indexOf(promptText.trim()) !== -1;
  })());
  answerInput.value = "definitely-not-right";
  answerInput.focus();
  // Enter from the focused field must check -- it's wired explicitly, not left
  // to the form's implicit submission (which some browsers won't fire here).
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  check("pressing Enter in the answer field checks and reveals the four rating buttons", document.querySelectorAll(".fc-rating-btn").length === 4);
  check("checking updates the card in place -- same <input> node, focus kept (a phone keyboard stays up)", () =>
    document.getElementById("fcAnswerInput") === answerInput
    && document.activeElement === answerInput
    && answerInput.classList.contains("fc-answer-locked"));
  check("the vocabulary card has no visible Check button -- Enter (or a mobile keyboard's Go) checks instead", () => {
    return !document.querySelector(".fc-answer-form .fc-check-btn");
  });
  check("the result drops into an aria-live region, so it's announced without moving focus off the field", () => {
    const dyn = document.querySelector(".fc-review-dynamic");
    return !!dyn && dyn.getAttribute("aria-live") === "polite" && dyn.contains(document.querySelector(".fc-review-verdict"));
  });
  check("the checked result is focusable and announces the outcome plus the answer", (() => {
    const res = document.querySelector(".fc-review-verdict");
    const al = res && res.getAttribute("aria-label") || "";
    return !!res && res.getAttribute("tabindex") === "-1"
      && /^(Correct|Not quite)\./.test(al) && /Answer: .+\.$/.test(al);
  })());
  check("the reveal recedes the prompt to a small reminder, furigana included", (() => {
    const small = document.querySelector(".fc-prompt-small");
    return !!small && small.textContent.trim().length > 0;
  })());
  check("the reveal also shows one field of context (meaning/reading), not just the answer", (() => {
    const meaningEl = document.querySelector(".fc-stage-meaning");
    return !!meaningEl && meaningEl.textContent.trim().length > 0;
  })());
  check("the verdict is a compact badge, not an oversized word -- feedback stays out of the way", (() => {
    const tag = document.querySelector(".fc-verdict-tag");
    // jsdom doesn't reliably resolve a var()-bearing computed style through a
    // shorthand property, so (as elsewhere in this file) check the declared
    // rule itself rather than getComputedStyle.
    const rule = allCssRules.find(r => r.selectorText === ".fc-verdict-tag");
    return !!tag && /^(Correct|Almost correct)$/.test(tag.textContent)
      && !!rule && parseFloat(rule.style.fontSize) <= 13;
  })());
  check("every rating button carries the data-rating the tone-coding CSS keys off", (() => {
    const got = [...document.querySelectorAll('.fc-rating-btn')].map(b => b.dataset.rating);
    return JSON.stringify(got) === JSON.stringify(["again", "hard", "good", "easy"]);
  })());
  check("the 1-4 key hint is a real coloured chip, not near-invisible micro text", (() => {
    const rule = allCssRules.find(r => r.selectorText === '.fc-rating-btn[data-rating="again"] .fc-rating-key');
    return !!rule && /var\(--wrong-soft\)/.test(rule.style.background);
  })());
  check("a wrong answer marks only the letters that differ, not the whole word", (() => {
    // "definitely-not-right" is wrong regardless of direction, so .fc-stage-compare
    // should always be there; whether it carries <mark>s depends on whether this
    // session's card landed on a romaji-target direction (jp-ro/en-ro) -- English
    // targets accept multiple synonyms, so those show the two words plain, no marks.
    const compare = document.querySelector(".fc-stage-compare");
    if (!compare) return false;
    const marks = compare.querySelectorAll("mark.fc-diff-you, mark.fc-diff-co");
    if (!marks.length) return true;
    const totalLetters = compare.textContent.replace(/[\s→]/g, "").length;
    return marks.length < totalLetters;
  })());
  document.querySelector('.fc-rating-btn[data-rating="again"]').click();
  await flush();
  check("rating advances in place -- the answer field survives to the next card, ratings + lock cleared", () =>
    document.getElementById("fcAnswerInput") === answerInput
    && document.querySelectorAll(".fc-rating-btn").length === 0
    && !answerInput.classList.contains("fc-answer-locked")
    && answerInput.value === ""
    && /\b2 \/ /.test(document.querySelector(".fc-review-progress").textContent));
  document.getElementById("fcEndSession").click();
  const doneText = (document.querySelector(".fc-session-done") || {}).textContent || "";
  check("ending mid-session shows a wrap-up, not a blank panel", /reviewed/.test(doneText));
  check("the wrap-up heading takes focus so it isn't lost to the body", (() => {
    const t = document.querySelector(".fc-session-done-title");
    return !!t && t.getAttribute("tabindex") === "-1";
  })());
  check("the wrap-up counts the card just reviewed", /1 reviewed/.test(doneText) && /correct/.test(doneText));
  document.getElementById("fcBackToDashboard").click();
  check("Back to Dashboard leaves the session for the dashboard", !document.querySelector(".fc-session-done") && !!document.querySelector(".fc-stats-grid"));
  await flush(); // the dashboard's async insight + weekly-activity loads
  check("a review just done shows on the dashboard's Today count and today's weekly bar", (() => {
    // Regression guard for the offline-history merge refactor: the review
    // computation (loadReviewInsights / loadWeeklyActivity) must still count a
    // review the moment it lands. Guest here; the signed-in outbox path adds to
    // the same computation and needs live verification.
    const todayText = (document.querySelector("#fcPanelDashboard .fc-today-count") || {}).textContent || "";
    const reviewed = parseInt((todayText.match(/(\d+)\s*\//) || [])[1], 10) || 0;
    const cols = document.querySelectorAll("#fcPanelDashboard .fc-week-col");
    const todayCount = parseInt((cols[cols.length - 1].querySelector(".fc-week-count") || {}).textContent, 10) || 0;
    return reviewed >= 1 && todayCount >= 1;
  })());

  console.log("Flashcards: the daily new-card allowance holds across sessions, not just one queue build");
  {
    // The regression this guards: buildQueue used to hand out up to
    // queue_new_cards_per_day fresh cards on every call with no memory of
    // cards already introduced earlier the same day -- so three short
    // sessions in a day gave three times the configured allowance. Exercise
    // it directly against the real cache/scheduler rather than the UI, and
    // restore whatever was there before so later checks in this file are
    // unaffected.
    const fcStore = window.RaumeStudy.flashcards.store;
    const fcSched = window.RaumeStudy.flashcards.scheduling;
    const c = fcStore.getCache();
    const saved = { settings: c.settings, day: c.day, cards: c.cards };
    c.settings = Object.assign({}, c.settings, { queue_new_cards_per_day: 2 });
    c.day = null;
    c.cards = {};
    for (let i = 0; i < 5; i++) {
      const id = "dailycap-test-" + i;
      c.cards[id] = { id, vocabId: "v0001", direction: "jp-en", active: true, state: 0, due: new Date().toISOString(), stability: 0, difficulty: 0, scheduled_days: 0, reps: 0, lapses: 0, learning_steps: 0, last_review: null };
    }
    fcStore.saveCache();
    const now = new Date();
    const q1 = fcSched.buildQueue(now);
    check("a fresh day's queue offers exactly the configured allowance of new cards", q1.length === 2);
    const farFuture = new Date(now.getTime() + 365 * 86400000).toISOString();
    q1.forEach((id) => {
      const card = fcStore.getCache().cards[id];
      card.state = 2; card.due = farFuture; // out of the ready-to-study window, isolating just the new-card allowance
      fcSched.bumpNewToday(now);
    });
    fcStore.saveCache();
    check("a second session the same day offers zero more new cards once the allowance is used",
      fcSched.buildQueue(now).length === 0);
    const tomorrow = new Date(now.getTime() + 86400000);
    check("the allowance resets on a new calendar day", fcSched.buildQueue(tomorrow).length === 2);
    c.settings = saved.settings; c.day = saved.day; c.cards = saved.cards;
    fcStore.saveCache();
  }

  console.log("Flashcards: Estimated retention colours the tile only once it's meaningfully under target");
  {
    // Give a few cards enough review history to be scored, but stale enough
    // (long overdue against a low stability) that FSRS predicts poor recall --
    // forces stats.estimatedRetention well under the 0.9 default target.
    const fcStore = window.RaumeStudy.flashcards.store;
    const c = fcStore.getCache();
    const saved = { cards: c.cards };
    c.cards = {};
    for (let i = 0; i < 6; i++) {
      const id = "retention-test-" + i;
      c.cards[id] = {
        id, vocabId: "v0001", direction: "jp-en", active: true, state: 2,
        due: new Date(Date.now() - 30 * 86400000).toISOString(),
        stability: 1, difficulty: 5, scheduled_days: 5, reps: 3, lapses: 0, learning_steps: 0,
        last_review: new Date(Date.now() - 35 * 86400000).toISOString()
      };
    }
    fcStore.saveCache();
    window.RaumeStudy.flashcards.render();
    check("a retention well under target gets the amber attention tile, not the plain quiet rule", (() => {
      const tiles = [...document.querySelectorAll("#fcPanelDashboard .fc-stat-tile")];
      const tile = tiles.find(t => /Estimated retention/.test(t.querySelector(".fc-stat-label").textContent));
      return !!tile && tile.classList.contains("fc-stat-attention") && !tile.classList.contains("fc-stat-tile-pending");
    })());
    c.cards = saved.cards;
    fcStore.saveCache();
    window.RaumeStudy.flashcards.render();
  }

  console.log("Flashcards: Kana tab");
  const kd = window.RaumeStudy.flashcards.kanaData;
  check("the kana tables expose the named groups per script with counts", (() => {
    const g = kd.groups();
    return g.length === 10 && g.filter(x => x.script === "hiragana").length === 5
      && g.find(x => x.id === "hira-gojuon").count === 46
      && g.find(x => x.id === "hira-yoon").count === 33
      && g.find(x => x.id === "kata-dakuten").count === 20
      && g.find(x => x.id === "hira-handakuten").count === 5
      && g.find(x => x.label === "Yōon (combinations)");
  })());
  const kh = window.RaumeStudy.flashcards.kana.__testHooks;
  const shiItem = kd.itemsFor(["hira-gojuon"]).find(it => it.kana === "し");
  check("a kana item carries its romaji derived from the reading layer", !!shiItem && shiItem.romaji === "shi");
  check("checking accepts the Hepburn spelling and a common alternate, rejects a wrong one",
    kh.checkKana(shiItem, "shi") && kh.checkKana(shiItem, " SI ") && !kh.checkKana(shiItem, "chi"));
  // Vowel length matters in a reading trainer: unlike the vocab cards, "ii"
  // is not "i". Macron <-> doubled vowel both ways; おう long o accepts
  // ou / oo / ō; but a short vowel never matches a long one.
  const gojuon = kd.itemsFor(["hira-gojuon"]);
  const iItem = gojuon.find(it => it.kana === "い");
  const oItem = gojuon.find(it => it.kana === "お");
  check("a short vowel is not a long vowel (い rejects \"ii\", お rejects \"oo\")",
    kh.checkKana(iItem, "i") && !kh.checkKana(iItem, "ii")
    && kh.checkKana(oItem, "o") && !kh.checkKana(oItem, "oo"));
  const gakkou = kd.itemsFor(["hira-sokuon"]).find(it => it.romaji === "gakkou");
  check("がっこう accepts gakkou / gakkoo / gakkō, rejects gakko",
    !!gakkou && kh.checkKana(gakkou, "gakkou") && kh.checkKana(gakkou, "gakkoo")
    && kh.checkKana(gakkou, "gakkō") && !kh.checkKana(gakkou, "gakko"));
  const sakka = kd.itemsFor(["kata-sokuon"]).find(it => /kk[aā]+$/.test(it.romaji));
  check("a macron long vowel (サッカー) accepts the doubled-vowel typing, rejects the short one",
    !!sakka && kh.checkKana(sakka, "sakkaa") && !kh.checkKana(sakka, "sakka"));
  const sokuon = kd.itemsFor(["hira-sokuon"]);
  check("sokuon is drilled as short doubled-consonant words", sokuon.length > 3 && sokuon.every(it => it.word && it.kana.length > 1 && /[a-z]/.test(it.romaji)));

  document.querySelector('.fc-tab[data-tab="kana"]').click();
  check("the Kana tab opens on a group picker with a Study button", !!document.getElementById("fcKanaStart") && document.querySelectorAll("#fcPanelKana .fc-kana-group-cb").length === 10);
  check("hiragana gojūon is on by default", document.querySelector('#fcPanelKana .fc-kana-group-cb[data-group="hira-gojuon"]').checked);
  // Each toggle re-renders the panel, so re-query the checkbox every time.
  document.querySelector('#fcPanelKana .fc-kana-group-cb[data-group="hira-gojuon"]').click();
  check("clearing every group disables Study and says so", document.getElementById("fcKanaStart").disabled && /at least one/i.test(document.getElementById("fcKanaSummary").textContent));
  document.querySelector('#fcPanelKana .fc-kana-group-cb[data-group="hira-gojuon"]').click();
  check("re-selecting a group re-enables Study", !document.getElementById("fcKanaStart").disabled);
  if (storageUsable) check("the group choice is saved to its own key", /hira-gojuon/.test(readLocalStorage("raume-kana-v1") || ""));

  check("the picker offers both study directions, on by default",
    document.querySelectorAll("#fcPanelKana .fc-kana-dir-cb").length === 2
    && [...document.querySelectorAll("#fcPanelKana .fc-kana-dir-cb")].every(cb => cb.checked));

  // --- kana -> romaji: the typed direction (drill r2k off so the queue is
  // all k2r and the first card is deterministic). ---
  kh.setDir("r2k", false);
  document.getElementById("fcKanaStart").click();
  check("Study now opens a kana review card", !!document.querySelector("#fcPanelKana .fc-review-card .fc-prompt-kana"));
  const kanaGlyph = document.querySelector("#fcPanelKana .fc-prompt-kana").textContent;
  const kanaInput = document.getElementById("fcKanaInput");
  check("the kana answer field is named with its prompt for a screen reader",
    (kanaInput.getAttribute("aria-label") || "").indexOf(kanaGlyph) !== -1);
  kanaInput.value = window.RaumeStudy.kanaRomaji.toRomaji(kanaGlyph);
  kanaInput.focus();
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  check("a correct reading is marked correct with four FSRS-timed ratings", (() => {
    const p = document.getElementById("fcPanelKana");
    return !!p.querySelector(".fc-verdict-ok") && p.querySelectorAll(".fc-rating-btn").length === 4
      && [...p.querySelectorAll(".fc-rating-interval")].every(e => e.textContent.length > 0);
  })());
  check("the checked kana result is focusable and announces the outcome", (() => {
    const res = document.querySelector("#fcPanelKana .fc-review-verdict");
    return !!res && res.getAttribute("tabindex") === "-1" && /^(Correct|Not quite)\./.test(res.getAttribute("aria-label") || "");
  })());
  check("checking updates the kana card in place -- same <input> node, focus kept", () =>
    document.getElementById("fcKanaInput") === kanaInput
    && document.activeElement === kanaInput
    && document.querySelector("#fcPanelKana .fc-review-dynamic")?.getAttribute("aria-live") === "polite");
  document.querySelector('#fcPanelKana .fc-rating-btn[data-rating="good"]').click();
  check("rating advances to the next card", /2 \/ /.test(document.querySelector("#fcPanelKana .fc-review-meta span").textContent));
  check("rating advances the kana card in place too -- the answer field survives", () =>
    document.getElementById("fcKanaInput") === kanaInput
    && document.querySelectorAll("#fcPanelKana .fc-rating-btn").length === 0
    && !kanaInput.classList.contains("fc-answer-locked"));
  if (storageUsable) check("the reviewed kana is now an FSRS card in local storage", /"reps":1/.test(readLocalStorage("raume-kana-v1") || ""));
  document.getElementById("fcKanaEnd").click();
  check("ending shows a wrap-up", /reviewed/.test((document.querySelector("#fcPanelKana .fc-session-done") || {}).textContent || ""));
  document.getElementById("fcKanaBack").click();

  // --- romaji -> kana: also typed, graded on the glyph. Drill handakuten only
  // (ぱぴぷぺぽ -- five unambiguous readings, so the prompt maps to one kana). ---
  kh.setDir("r2k", true);
  kh.setDir("k2r", false);
  kh.setGroup("hira-gojuon", false);
  kh.setGroup("hira-handakuten", true);
  check("checkR2k wants the kana glyph, not the romaji", (() => {
    const pa = kd.itemsFor(["hira-handakuten"]).find(it => it.kana === "ぱ");
    return kh.checkR2k(pa, "ぱ") && kh.checkR2k(pa, " ぱ ") && !kh.checkR2k(pa, "pa");
  })());
  document.getElementById("fcKanaStart").click();
  check("romaji → kana shows a romaji prompt and a text input, no Reveal button",
    !!document.querySelector("#fcPanelKana .fc-prompt-romaji")
    && !!document.getElementById("fcKanaInput") && !document.getElementById("fcKanaReveal"));
  const r2kRomaji = document.querySelector("#fcPanelKana .fc-prompt-romaji").textContent;
  const r2kItem = kd.itemsFor(["hira-handakuten"]).find(it => it.romaji === r2kRomaji);
  document.getElementById("fcKanaInput").value = r2kItem.kana;
  document.getElementById("fcKanaForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  check("typing the right kana is marked correct with four ratings and the glyph shown", (() => {
    const p = document.getElementById("fcPanelKana");
    return !!p.querySelector(".fc-verdict-ok")
      && !!p.querySelector(".fc-stage-expected[lang=\"ja\"]")
      && p.querySelectorAll(".fc-rating-btn").length === 4;
  })());
  document.querySelector('#fcPanelKana .fc-rating-btn[data-rating="good"]').click();
  check("rating advances to the next card", /2 \/ /.test(document.querySelector("#fcPanelKana .fc-review-meta span").textContent));
  if (storageUsable) check("the romaji → kana review is stored under its own |r2k key", /\|r2k"/.test(readLocalStorage("raume-kana-v1") || ""));
  document.getElementById("fcKanaEnd").click();
  document.getElementById("fcKanaBack").click();
  kh.setDir("k2r", true);
  kh.setGroup("hira-handakuten", false);
  kh.setGroup("hira-gojuon", true);
  check("Back to groups returns to the picker, now showing progress", !!document.getElementById("fcKanaStart") && /started/.test(document.getElementById("fcKanaSummary").textContent));

  // Guest mode keeps no sync outbox -- its local kana cache is the record,
  // exactly like the guest vocab cache. (The signed-in path -- kana_cards /
  // kana_review_logs, the offline outbox -- needs a live Supabase project and
  // is covered by the manual checklist in SUPABASE_SETUP.md.)
  const kanaStore = window.RaumeStudy.flashcards.store;
  const kanaDataOps = window.RaumeStudy.flashcards.dataOps;
  check("the kana cache is exposed from the store, guest key, no queued reviews", (() => {
    const kc = kanaStore.getKanaCache();
    return !!kc && Array.isArray(kc.logsOutbox) && kc.logsOutbox.length === 0
      && kanaDataOps.kanaPendingCount() === 0;
  })());
  if (storageUsable) check("guest reviews land in raume-kana-v1, never a signed-in cache key",
    !!readLocalStorage("raume-kana-v1") && readLocalStorage("raume-kana-cache-v1") === null);

  console.log("Flashcards: Settings tab");
  document.querySelector('.fc-tab[data-tab="settings"]').click();
  check("Settings card titles are sentence case, like the Help tab's", (() => {
    const titles = [...document.querySelectorAll("#fcPanelSettings .fc-settings-section h3")].map(h => h.textContent.trim());
    // no title has a Title-Cased second word (acronyms like FSRS are fine)
    return titles.length >= 3 && titles.every(t => !/ [A-Z][a-z]/.test(t));
  })());
  check("Help and Settings hold a readable measure, not the full sheet", (() => {
    const rule = allCssRules.find(r => r.selectorText
      && /#fcPanelHelp/.test(r.selectorText) && /#fcPanelSettings/.test(r.selectorText));
    return !!rule && parseInt(rule.style.maxWidth, 10) > 0 && parseInt(rule.style.maxWidth, 10) <= 720;
  })());
  check("the Kana scheduling block doesn't repeat the vocab knobs' helper text", (() => {
    // its fields carry labels but not their own paragraph of grey micro-text
    const kanaField = document.getElementById("fcKanaRetention").closest(".fc-settings-field");
    return kanaField && !kanaField.querySelector(".fc-settings-help");
  })());
  check("a settings field's label sits with its control, not flung to the row's opposite edge", (() => {
    const row = document.getElementById("fcRetention").closest(".fc-settings-field-row");
    return window.getComputedStyle(row).justifyContent !== "space-between";
  })());
  const dirChecks = [...document.querySelectorAll(".fc-dir-checkbox")];
  check("all 4 directions are offered as a setting", dirChecks.length === 4);
  check("all 4 are enabled by default", dirChecks.every(cb => cb.checked));
  check("one Save button covers the whole tab (not one per section)",
    !!document.getElementById("fcSaveSettings") && !document.getElementById("fcSaveDirections") && !document.getElementById("fcSaveFsrs"));
  dirChecks.forEach(cb => { cb.checked = false; });
  document.getElementById("fcSaveSettings").click();
  check("saving with no direction enabled is rejected", document.getElementById("fcDirError").hidden === false);
  document.querySelector('.fc-tab[data-tab="settings"]').click(); // re-render fresh
  check("...and nothing was actually saved (still all on)", [...document.querySelectorAll(".fc-dir-checkbox")].every(cb => cb.checked));
  document.querySelector('.fc-dir-checkbox[data-direction="ro-en"]').checked = false;
  document.getElementById("fcSaveSettings").click();
  await flush();
  check("a successful save is acknowledged inline", document.getElementById("fcSettingsSaved").hidden === false);
  document.querySelector('.fc-tab[data-tab="settings"]').click();
  const roEnBox = document.querySelector('.fc-dir-checkbox[data-direction="ro-en"]');
  check("turning off just one direction is remembered", !roEnBox.checked && document.querySelector('.fc-dir-checkbox[data-direction="jp-en"]').checked);
  roEnBox.checked = true;
  document.getElementById("fcSaveSettings").click(); // leave every direction enabled again for later checks
  await flush();

  // The Kana trainer's own FSRS knobs, in the same tab under the same Save.
  document.querySelector('.fc-tab[data-tab="settings"]').click();
  check("Settings also exposes the Kana trainer's own FSRS knobs, defaulting to 90%", (() => {
    return ["fcKanaRetention", "fcKanaMaxInterval", "fcKanaFuzz", "fcKanaNewPerDay"].every(id => !!document.getElementById(id))
      && document.getElementById("fcKanaRetention").value === "90"
      && document.getElementById("fcKanaNewPerDay").value === "15";
  })());
  document.getElementById("fcKanaRetention").value = "85";
  document.getElementById("fcKanaNewPerDay").value = "3";
  document.getElementById("fcKanaMaxInterval").value = "9999999"; // above the ceiling -> clamps to 36500
  document.getElementById("fcSaveSettings").click();
  await flush();
  if (storageUsable) check("the kana knobs persist to the kana cache, independent of the vocab knobs and clamped", (() => {
    const f = (JSON.parse(readLocalStorage("raume-kana-v1") || "{}").fsrs) || {};
    return f.fsrs_request_retention === 0.85 && f.new_per_day === 3 && f.fsrs_maximum_interval === 36500;
  })());
  document.querySelector('.fc-tab[data-tab="settings"]').click();
  check("the clamped kana values are reflected back into the fields", document.getElementById("fcKanaMaxInterval").value === "36500");
  check("the Kana queue honours the new per-day cap", (() => {
    kh.setGroup("hira-gojuon", true);
    const q = kh.buildQueue(new Date());
    return q.length > 0 && q.length <= 6; // 3 new + any leftover due/learning, vs 90+ uncapped
  })());
  document.getElementById("fcKanaRetention").value = "90";
  document.getElementById("fcKanaNewPerDay").value = "15";
  document.getElementById("fcSaveSettings").click(); // restore defaults for later checks
  await flush();

  console.log("Flashcards: Help tab");
  document.querySelector('.fc-tab[data-tab="help"]').click();
  check("the Manage status legend documents all four states, including Paused", (() => {
    const items = [...document.querySelectorAll("#fcPanelHelp .fc-help-status li")].map(li => li.textContent.trim());
    return items.length === 4 && items.some(t => t.includes("Not added")) && items.some(t => t.includes("In flashcards"))
      && items.some(t => t.includes("Due for review")) && items.some(t => t.includes("Paused"));
  })());
  check("Words to Review's icon-choosing button is hidden -- it's a synthetic table, nothing to persist an icon against", (() => {
    // Regression: this used to target a class (.section-title-icon) that never
    // existed anywhere in the rendered markup, so the rule was a silent no-op
    // and the button rendered live. Check the fixed selector is what's there.
    const rule = allCssRules.find(r => r.selectorText === "#fcWordsToReview .section-icon-btn");
    return !!rule && rule.style.display === "none";
  })());
  check("Words to Review opts into the column-visibility toggles so you can quiz off it", (() => {
    const sampleRow = window.RaumeStudy.data.vocabularyTables[0].rows.find(r => r.id);
    const withToggles = window.RaumeStudy.vocab.buildVocabSection({
      id: "wtr", title: "Words to review", rows: [sampleRow], presort: false,
      controls: { print: true, viewMode: true }
    });
    const without = window.RaumeStudy.vocab.buildVocabSection({
      id: "wtr", title: "Words to review", rows: [sampleRow], presort: false, controls: { print: true }
    });
    const wrap = document.createElement("div");
    wrap.innerHTML = withToggles;
    const cols = [...wrap.querySelectorAll(".section-head .view-mode button")].map(b => b.dataset.col);
    return typeof window.RaumeStudy.vocab.applyColVisibility === "function"
      && !/view-mode/.test(without)
      && ["japanese", "furigana", "romaji", "english"].every(k => cols.includes(k));
  })());

  const goAccountBtn = document.getElementById("fcGoAccount");
  check("guest mode offers a way to switch to syncing", !!goAccountBtn);
  goAccountBtn.click();
  check("switching to sign-in returns to the entry choice", !document.querySelector(".fc-stats-grid") && !!document.getElementById("fcUseGuest"));
  if (storageUsable) {
    check("...forgets the guest *preference*...", readLocalStorage("raume-flashcards-mode") !== "guest");
    check("...but never touches the guest data itself", /"active":true/.test(readLocalStorage("raume-flashcards-guest-v1") || ""));
  } else {
    // Without persistent storage in this sandbox, "not forgotten" shows up
    // as the in-memory fallback instead: picking guest mode again still has
    // the card we just added, proving setStoredMode/loadCache's in-memory
    // fallback (not just localStorage) is what's actually keeping state.
    document.getElementById("fcUseGuest").click();
    document.querySelector('.fc-tab[data-tab="dashboard"]').click(); // last tab left active was Settings
    const totalTileAgain = document.querySelector(".fc-stat-tile:nth-child(2) .fc-stat-value").textContent;
    check("...the in-memory fallback keeps the session's guest data reachable regardless", totalTileAgain === "4");
  }
  document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();

  console.log("Flashcards: answer checking and vocab index (pure-logic hooks)");
  const fc = window.RaumeStudy.flashcards.__testHooks;
  check("test hooks are exposed", !!fc);
  check("normalizeAnswer trims/collapses/lowercases", fc.normalizeAnswer("  Hot   Water  ", false) === "hot water");
  check("normalizeAnswer folds macrons for romaji", fc.normalizeAnswer("Kōhī", true) === "kohi");
  check("romaji answer-checking is long-vowel insensitive (can't type macrons)",
    fc.normalizeAnswer("koohii", true) === fc.normalizeAnswer("Kōhī", true)
    && fc.normalizeAnswer("kouhii", true) === fc.normalizeAnswer("Kōhī", true)
    && fc.normalizeAnswer("satou", true) === fc.normalizeAnswer("satō", true)
    && fc.normalizeAnswer("gakkou", true) === fc.normalizeAnswer("gakkō", true));
  check("normalizeAnswer strips a leading ~ for romaji (counters)", fc.normalizeAnswer("~ko", true) === "ko");
  const vocabIndex = fc.getVocabIndex();
  const beerEntry = Object.values(vocabIndex).find(e => e.englishDisplay === "beer");
  check("vocab index resolves a known entry by content", !!beerEntry);
  check("checkAnswer accepts an exact (normalized) match", fc.checkAnswer(beerEntry, "jp-en", "  BEER "));
  check("checkAnswer rejects a clearly wrong answer", !fc.checkAnswer(beerEntry, "jp-en", "wine"));
  const listenEntry = Object.values(vocabIndex).find(e => e.englishDisplay === "hear / listen / ask");
  check("multi-answer English fields accept any listed alternative", !!listenEntry && fc.checkAnswer(listenEntry, "jp-en", "listen") && fc.checkAnswer(listenEntry, "jp-en", "ask"));
  check("multi-answer English fields still reject an unlisted word", !fc.checkAnswer(listenEntry, "jp-en", "speak"));
  const numberEntry = Object.values(vocabIndex).find(e => e.englishDisplay === "0");
  check("the Numbers table now carries real romaji (not kana), so the row is romaji-usable", !!numberEntry && numberEntry.romajiUsable === true);
  check("...so all four directions are offered for it", JSON.stringify(fc.directionsForEntry(numberEntry)) === JSON.stringify(["jp-en", "jp-ro", "ro-en", "en-ro"]));
  check("a normal entry offers all four directions", JSON.stringify(fc.directionsForEntry(beerEntry)) === JSON.stringify(["jp-en", "jp-ro", "ro-en", "en-ro"]));
  check("the jp-en/jp-ro prompt for a word entry carries a speaker button keyed to its reading", (() => {
    const prompt = fc.promptFor(beerEntry, "jp-en");
    return prompt.lang === "ja" && /class="jp-speak-btn" data-jp-speak="[^"]+"/.test(prompt.html);
  })());
  const verbPairEntry = Object.values(vocabIndex).find(e => (e.romajiDisplay || "").includes(" / "));
  check("a verb-pair entry's prompt carries one speaker button per form (plain and polite)", (() => {
    if (!verbPairEntry) return false;
    const html = fc.promptFor(verbPairEntry, "jp-en").html;
    const matches = [...html.matchAll(/class="jp-speak-btn" data-jp-speak="([^"]+)"/g)].map(m => m[1]);
    return matches.length === 2 && matches[0] !== matches[1] && matches.every(Boolean);
  })());

  console.log(failures === 0 ? "\nSmoke test passed." : "\n" + failures + " smoke test check(s) failed.");
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
