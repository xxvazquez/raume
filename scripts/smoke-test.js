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

  console.log("Global pull-to-refresh (touch)");
  (() => {
    function touch(type, y, opts) {
      opts = opts || {};
      const target = opts.target || document;
      const e = new window.Event(type, { bubbles: true, cancelable: true });
      e.touches = y == null ? [] : [{ clientY: y }];
      target.dispatchEvent(e);
      return e;
    }
    check("starts with no bar in the DOM -- it's created on first use, not eagerly", !document.querySelector(".pull-refresh"));
    touch("touchstart", 0);
    const tapDrift = touch("touchmove", 5); // a plain tap's incidental jitter, well under TAP_TOLERANCE
    check("a few px of drift (an ordinary tap) doesn't claim the gesture -- no bar, default not prevented, so the tap's own click still fires", !document.querySelector(".pull-refresh") && !tapDrift.defaultPrevented);
    touch("touchend", null);
    check("a gesture starting on a tappable control (the romaji reveal word) is never tracked at all -- even a big drift doesn't claim it, so the control's own tap always gets through", (() => {
      const jpword = document.querySelector(".jpword[data-romaji]");
      touch("touchstart", 0, { target: jpword });
      const bigDrift = touch("touchmove", 30, { target: jpword });
      touch("touchend", null, { target: jpword });
      return !!jpword && !document.querySelector(".pull-refresh") && !bigDrift.defaultPrevented;
    })());
    touch("touchstart", 0);
    touch("touchmove", 20);
    check("a small pull shows the bar in its neutral 'pulling' state", (() => {
      const bar = document.querySelector(".pull-refresh");
      return !!bar && bar.classList.contains("pull-refresh-pulling") && /pull to refresh/i.test(bar.textContent);
    })());
    touch("touchend", null);
    check("releasing before the threshold just snaps back, no refresh triggered", (() => {
      const bar = document.querySelector(".pull-refresh");
      return bar.className === "pull-refresh" && bar.textContent === "";
    })());
    touch("touchstart", 0);
    touch("touchmove", 80);
    check("pulling past the threshold switches it to 'ready to release'", (() => {
      const bar = document.querySelector(".pull-refresh");
      return bar.classList.contains("pull-refresh-ready") && /release to refresh/i.test(bar.textContent);
    })());
    const moveEvt = touch("touchmove", 80);
    check("once past threshold, the gesture is taken over (default prevented) so the page doesn't also scroll/bounce", moveEvt.defaultPrevented);
    // Cancel by dragging back up rather than releasing -- releasing while
    // "ready" would trigger the actual refresh, which the next check isn't
    // testing for and would then be blocked by (a refresh in flight ignores
    // new gestures, see js/pull-refresh.js onTouchStart).
    touch("touchmove", 0);
    touch("touchend", null);
    check("scrolled away from the top, a fresh downward drag does nothing at all", (() => {
      Object.defineProperty(window, "scrollY", { configurable: true, value: 50 });
      touch("touchstart", 0);
      touch("touchmove", 90);
      const idle = document.querySelector(".pull-refresh").className === "pull-refresh";
      Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
      touch("touchend", null);
      return idle;
    })());
    // Releasing while "ready" schedules a real window.location.reload()
    // after HOLD_MS (see js/pull-refresh.js runRefresh()) -- jsdom's
    // `resources: "usable"` makes that an actual, slow reparse-the-whole-
    // page navigation, and unlike most browser APIs jsdom's Location.reload
    // isn't writable/configurable, so it can't be stubbed out the normal
    // way. Swallowing window.setTimeout for just this one synchronous
    // dispatch -- the only thing runRefresh() schedules -- stops that timer
    // from ever being registered, without needing to touch reload() itself
    // or leave a real 500ms-plus-navigation delay sitting in this file's
    // way.
    const realSetTimeout = window.setTimeout;
    window.setTimeout = () => 0;
    touch("touchstart", 0);
    touch("touchmove", 80);
    touch("touchend", null);
    window.setTimeout = realSetTimeout;
    check("releasing while ready starts the refresh (busy, spinning)", (() => {
      const bar = document.querySelector(".pull-refresh");
      return bar.classList.contains("pull-refresh-busy") && /refreshing/i.test(bar.textContent);
    })());
    check("a new gesture is ignored while a refresh is still in flight", (() => {
      touch("touchstart", 0);
      touch("touchmove", 20);
      const bar = document.querySelector(".pull-refresh");
      return bar.classList.contains("pull-refresh-busy"); // unchanged, not "pulling"
    })());
    // pull-refresh's own state stays "busy" for the rest of this process
    // (its one timer was swallowed above, so nothing will ever move it to
    // idle) -- harmless, since nothing else in this file simulates a touch
    // gesture or queries .pull-refresh again.
  })();

  console.log("Rendering");
  const sections = document.querySelectorAll(".table-section");
  check("renders 47 table sections", sections.length === 47);
  const totalRows = document.querySelectorAll(".vocab tbody tr").length;
  check("renders 990 vocabulary rows", totalRows === 990);
  check("the Kanji section: 102 N5 kanji in 7 themed tables, themes in teaching order (Numbers & Money first, not A-Z), kanji in authored order (一 first), each a tile -- the bare character over its on readings and then its kun readings, each on its own line, the meaning kept for search and the sheet", (() => {
    const kanjiSecs = [...document.querySelectorAll('#vocabulary .table-section[data-category="N5 Kanji"]')];
    const rows = kanjiSecs.flatMap(s => [...s.querySelectorAll("tbody tr")]);
    const yama = rows.find(r => r.querySelector(".kanji-char").textContent === "山");
    const miru = rows.find(r => r.querySelector(".kanji-char").textContent === "見");
    return kanjiSecs.length === 7 && kanjiSecs.every(s => s.dataset.section === "kanji") && rows.length === 102
      && kanjiSecs.map(s => s.querySelector(".section-title-text").textContent).join(",") === "Numbers & Money,Days & Time,People & Body,Places & Directions,Nature & Things,Verbs,Adjectives"
      && kanjiSecs[0].querySelector("tbody tr .kanji-char").textContent === "一"
      && rows.every(r => r.classList.contains("kanji-tile") && r.tabIndex === 0 && !r.cells[0].querySelector("ruby") && r.cells[0].querySelector(".kanji-readings.furigana"))
      && yama.querySelector(".kanji-on").textContent === "サン" && yama.querySelector(".kanji-kun").textContent === "やま"
      && rows.find(r => r.querySelector(".kanji-char").textContent === "九").querySelector(".kanji-on").textContent === "キュウ・ク"
      && yama.querySelector(".jpword").dataset.romaji === "yama / san"
      && miru.querySelector(".kanji-okuri").textContent === "る" && yama.cells[1].querySelector(".meaning-text").textContent === "mountain";
  })());
  check("tapping a kanji tile opens its sheet -- readings, strokes and radical, an example with furigana, the reader's words that use it folded away (not repeating the example), Add to flashcards -- and Escape closes it, back on the tile", (() => {
    const sheet = document.getElementById("kanjiSheet"), scrim = document.getElementById("kanjiScrim");
    const tile = [...document.querySelectorAll("#vocabulary .vocab-kanji tr.kanji-tile")].find(r => r.querySelector(".kanji-char").textContent === "新");
    const closedAtStart = sheet.hidden && scrim.hidden;
    tile.querySelector(".kanji-char").click();
    const opened = !sheet.hidden && !scrim.hidden && sheet.querySelector(".ks-char").textContent === "新"
      && sheet.querySelector(".ks-meaning").textContent === "new" && /シン/.test(sheet.textContent) && /あたらしい/.test(sheet.textContent)
      && !!sheet.querySelector(".ks-example ruby rt") && sheet.querySelectorAll(".ks-words .ks-example").length >= 1 && !sheet.querySelector(".ks-words").open
      && /Strokes13/.test(sheet.textContent.replace(/\s/g, "")) && /斤おのづくり/.test(sheet.textContent.replace(/\s/g, ""))
      && [...sheet.querySelectorAll(".ks-words .ks-example-en")].some(e => e.textContent === "new")
      && ![...sheet.querySelectorAll(".ks-words .ks-example-jp")].some(e => e.textContent.includes("新幹線"))
      && sheet.querySelector(".ks-add").dataset.vocabId === tile.dataset.vocabId
      && document.activeElement === sheet.querySelector(".ks-close");
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return closedAtStart && opened && sheet.hidden && scrim.hidden && sheet.innerHTML === "" && document.activeElement === tile;
  })());
  check("each sheet row's ⓘ opens a popover explaining it -- every kanji in it with furigana, a sorting-only radical saying so -- tapping elsewhere or Escape closes it, Escape again closes the sheet", (() => {
    const sheet = document.getElementById("kanjiSheet");
    const tile = [...document.querySelectorAll("#vocabulary .vocab-kanji tr.kanji-tile")].find(r => r.querySelector(".kanji-char").textContent === "九");
    tile.click();
    const infos = [...sheet.querySelectorAll(".ks-info")];
    const rad = sheet.querySelector('.ks-info[data-help="radical"]');
    rad.click();
    let pop = document.querySelector(".kanji-help-pop");
    const opened = infos.map(b => b.dataset.help).join(",") === "on,kun,romaji,strokes,radical" && !!pop
      && infos.map(b => b.closest(".ks-row").querySelector(".ks-label").textContent).join(",") === "On,Kun,Romaji,Strokes,Radical"
      && !!pop.querySelector(".kh-title") && pop.querySelectorAll(".kh-item").length >= 3
      && /just for sorting/.test(pop.textContent) && rad.getAttribute("aria-expanded") === "true";
    const allRuby = infos.every(b => {
      b.click();
      const p = document.querySelector(".kanji-help-pop");
      const bare = p.cloneNode(true);
      bare.querySelectorAll("ruby").forEach(r => r.remove());
      return !/[一-龯]/.test(bare.textContent);
    });
    sheet.querySelector(".ks-meaning").click();
    const tappedAway = !document.querySelector(".kanji-help-pop");
    rad.click();
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const escPop = !document.querySelector(".kanji-help-pop") && !sheet.hidden;
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return opened && allRuby && tappedAway && escPop && sheet.hidden;
  })());
  check("every kanji has its KanjiVG stroke order, as many strokes as its row says; the sheet draws them in order -- faint outline, numbered strokes, a credit -- and Replay starts over", (() => {
    const S = window.RaumeStudy.data.kanjiStrokes;
    const rows = window.RaumeStudy.data.vocabularyTables.filter(t => t.tableClass === "vocab-kanji").flatMap(t => t.rows);
    const allData = rows.every(r => S[r.jp[0].kanji] && S[r.jp[0].kanji].p.length === r.strokes && S[r.jp[0].kanji].n.length === r.strokes);
    const sheet = document.getElementById("kanjiSheet");
    [...document.querySelectorAll("#vocabulary .vocab-kanji tr.kanji-tile")].find(r => r.querySelector(".kanji-char").textContent === "休").click();
    const svg = sheet.querySelector(".ks-so .so-svg");
    const strokes = svg ? [...svg.querySelectorAll(".so-strokes path")] : [];
    const drawn = strokes.length === 6 && strokes.every((p, i) => p.getAttribute("pathLength") === "1" && p.classList.contains("so-" + (i + 1)))
      && svg.querySelectorAll(".so-guide path").length === 6 && [...svg.querySelectorAll(".so-nums text")].map(t => t.textContent).join("") === "123456"
      && /KanjiVG/.test(sheet.querySelector(".ks-credit").textContent)
      && [...sheet.querySelectorAll(".ks-credit a")].map(a => a.getAttribute("href")).join(" ") === "http://kanjivg.tagaini.net http://creativecommons.org/licenses/by-sa/3.0/";
    sheet.querySelector(".ks-replay").click();
    const replayed = sheet.querySelector(".ks-so .so-svg") !== svg && sheet.querySelectorAll(".ks-so .so-svg").length === 1;
    window.RaumeStudy.vocab.closeKanjiSheet();
    return allData && drawn && replayed;
  })());
  check("Write it judges strokes: every kanji's own KanjiVG strokes pass; a reversed stroke, a stroke in the wrong place and the right shape out of order fail", (() => {
    const kw = window.RaumeStudy.kanjiWrite, S = window.RaumeStudy.data.kanjiStrokes;
    const own = Object.keys(S).every(ch => S[ch].p.every(d => kw.judge(kw.parsePath(d), d).ok));
    const one = kw.parsePath(S["一"].p[0]);
    const reversed = !kw.judge(one.slice().reverse(), S["一"].p[0]).ok;
    const moved = !kw.judge(one.map(q => [q[0], q[1] - 35]), S["一"].p[0]).ok;
    const outOfOrder = !kw.judge(kw.parsePath(S["三"].p[2]), S["三"].p[0]).ok; // 三's bottom stroke drawn first
    return own && reversed && moved && outOfOrder;
  })());
  check("Write it opens a pad from the kanji sheet, counts strokes and misses, finishes, and Back returns to the sheet", (() => {
    const kw = window.RaumeStudy.kanjiWrite, S = window.RaumeStudy.data.kanjiStrokes;
    const sheet = document.getElementById("kanjiSheet");
    [...document.querySelectorAll("#vocabulary .vocab-kanji tr.kanji-tile")].find(r => r.querySelector(".kanji-char").textContent === "三").click();
    sheet.querySelector(".ks-write").click();
    const opened = !!sheet.querySelector(".kw-pad") && /Stroke 1 of 3/.test(sheet.querySelector(".kw-status").textContent)
      && sheet.querySelector(".kw-pad").classList.contains("kw-outline");
    kw.submit(kw.parsePath(S["三"].p[2])); // wrong stroke first
    const missed = /1 miss/.test(sheet.querySelector(".kw-status").textContent);
    S["三"].p.forEach(d => kw.submit(kw.parsePath(d)));
    const fin = sheet.querySelector(".kw-finish");
    const finished = !!fin && /3 \/ 3 strokes/.test(fin.textContent) && /1 miss/.test(fin.textContent)
      && sheet.querySelectorAll(".kw-done .kw-stroke").length === 3 && !!sheet.querySelector(".kw-next");
    sheet.querySelector(".kw-back").click();
    const back = !!sheet.querySelector(".ks-write") && !sheet.querySelector(".kw-pad");
    window.RaumeStudy.vocab.closeKanjiSheet();
    return opened && missed && finished && back && !kw.isOpen();
  })());
  check("Words with ... draws on every other table, never the kanji or sentence tables, shortest first, all of them", (() => {
    const w = window.RaumeStudy.vocab.wordsWithKanji("日", "");
    return w.length > 8 && w.every(x => x.text.includes("日")) && w.every((x, i) => !i || w[i - 1].text.length <= x.text.length)
      && window.RaumeStudy.vocab.wordsWithKanji("新", "").some(x => x.english === "new");
  })());
  check("adjective rows tint the Japanese text い-adj/な-adj, with a visually-hidden note, and only those rows do", (() => {
    const adjSection = [...document.querySelectorAll('.table-section[data-section="grammar"]')]
      .find(s => s.querySelector(".section-title-text").textContent === "Adjectives");
    const tagged = [...adjSection.querySelectorAll("tbody tr td.jp.adj-i, tbody tr td.jp.adj-na")];
    if (tagged.length < 30) return false;
    const labelsOk = tagged.every(td => {
      const note = td.querySelector(".visually-hidden");
      // "(い-adjective)", or with a usage note after it: "(い-adjective — …)".
      const i = td.classList.contains("adj-i") && note && /^\(い-adjective( — .+)?\)$/.test(note.textContent);
      const na = td.classList.contains("adj-na") && note && /^\(な-adjective( — .+)?\)$/.test(note.textContent);
      return i || na;
    });
    // No tag leaks onto a non-adjective row (e.g. the Verbs table).
    const verbsTagged = [...document.querySelectorAll('.table-section[data-section="grammar"]')]
      .find(s => s.querySelector(".section-title-text").textContent === "Verbs")
      .querySelectorAll("td.jp.adj-i, td.jp.adj-na").length > 0;
    // The tag also rides along in a plain vocabulary table: Taste & Texture's
    // い-adjectives are tagged, its mimetic descriptors (mochimochi, ...) are not.
    const taste = [...document.querySelectorAll(".table-section")]
      .find(s => s.querySelector(".section-title-text").textContent === "Taste & Texture");
    const tasteTagged = taste.querySelectorAll("td.jp.adj-i").length >= 10 && taste.querySelectorAll("td.jp.adj-na").length === 0;
    const romajiOf = r => { const w = r.querySelector(".jpword[data-romaji]"); return w ? w.dataset.romaji : ""; };
    const mochiRow = [...taste.querySelectorAll("tbody tr")].find(r => romajiOf(r) === "mochimochi");
    const mochiUntagged = mochiRow && !mochiRow.cells[0].classList.contains("adj-i") && !mochiRow.cells[0].classList.contains("adj-na");
    // A lone adjective sitting in an otherwise-noun table still gets tagged:
    // 危険 (na-adj) in Signs, Doors & Places.
    const kikenRow = [...document.querySelectorAll("#vocabulary tbody tr")].find(r => romajiOf(r) === "kiken");
    const kikenTagged = kikenRow && kikenRow.cells[0].classList.contains("adj-na");
    return labelsOk && !verbsTagged && tasteTagged && mochiUntagged && kikenTagged;
  })());
  check("the legend explaining the two colours is aria-hidden (real semantics live in the per-row note, not this)", (() => {
    const legend = document.querySelector(".adj-legend");
    return !!legend && legend.getAttribute("aria-hidden") === "true" && legend.querySelectorAll(".adj-legend-swatch").length === 2;
  })());
  check("the legend stays hidden for the current table when it has no tinted rows, and shows once it does", (() => {
    // Exercises updateAdjLegend(current) directly (same call syncTableIndexActive
    // makes for whichever table is under the sticky toolbar) instead of routing
    // there, which would also touch that section's remembered accordion layout.
    const legend = document.querySelector(".adj-legend");
    const counters = document.querySelector('.table-section[data-table="0"]'); // no adjectives
    window.RaumeStudy.vocab.updateAdjLegend(counters);
    // Both the IDL property and the computed style -- the `hidden` attribute
    // alone does nothing if a class rule sets its own `display` (as .adj-legend
    // does), which silently wins over the browser default [hidden] { display: none }.
    const hiddenOnCounters = legend.hidden === true && window.getComputedStyle(legend).display === "none";
    const adjTable = [...document.querySelectorAll('.table-section[data-section="grammar"]')]
      .find(s => s.querySelector('.section-title-text').textContent === "Adjectives");
    window.RaumeStudy.vocab.updateAdjLegend(adjTable);
    const shownOnAdjectives = legend.hidden === false && window.getComputedStyle(legend).display !== "none";
    window.RaumeStudy.vocab.updateAdjLegend(counters); // leave it back the way we found it
    return hiddenOnCounters && shownOnAdjectives;
  })());
  check("the adjective note stays out of search matches (visually-hidden text isn't in .meaning-text)", (() => {
    const input = document.getElementById("tableSearch");
    input.value = "adjective";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    const hits = document.querySelectorAll('#vocabulary tbody tr:not(.search-hidden)').length;
    input.value = "";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    return hits === 0;
  })());
  check("every Japanese cell is marked lang=\"ja\"", [...document.querySelectorAll("td.jp")].every(td => td.getAttribute("lang") === "ja"));
  // A kanji tile has none -- its sheet carries the speaker.
  check("every Japanese cell has one speaker button per form, keyed to the kana reading (not the kanji)", [...document.querySelectorAll("tr:not(.kanji-tile) > td.jp")].every(td => {
    const forms = td.querySelectorAll(".verb-form").length || 1;
    const btns = [...td.querySelectorAll(".jp-speak-btn")];
    // The regression this guards: jpReadingOf must fall back to a segment's
    // own text when it has no kanji/reading (a plain kana or katakana
    // headword), or the speak button silently never renders for those rows.
    return btns.length === forms && btns.every(b => b.dataset.jpSpeak && !/[一-龯]/.test(b.dataset.jpSpeak));
  }));
  console.log("Particles (blue + bold, everywhere)");
  const particleCells = (() => {
    const t = [...document.querySelectorAll(".table-section")]
      .find(s => s.querySelector(".section-title-text").textContent === "Particles");
    return [...t.querySelectorAll("td.jp")];
  })();
  check("every Particles row renders a .particle span", particleCells.length >= 10
    && particleCells.every(td => td.querySelector("span.particle") && td.querySelector("span.particle").textContent.trim()));
  check("a particle never renders as ruby or a kana-romaji target", particleCells.every(td => !td.querySelector("ruby") && !td.querySelector(".kr")));
  check("a particle still speaks (jpReadingOf falls through to seg.p)", particleCells.every(td => {
    const b = td.querySelector(".jp-speak-btn");
    return b && b.dataset.jpSpeak && b.dataset.jpSpeak.trim();
  }));
  check("each particle carries its reading for the hover layer (は -> wa, not ha)", (() => {
    const wa = particleCells.map(td => td.querySelector(".particle")).find(p => p && p.textContent === "は");
    const e = particleCells.map(td => td.querySelector(".particle")).find(p => p && p.textContent === "へ");
    return wa && wa.dataset.r === "wa" && e && e.dataset.r === "e";
  })());

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
  check("い-adj and な-adj are capsule badges in two different, distinctly-saturated tokens (no edge bar, not tinted text)", (() => {
    const iRule = allCssRules.find(r => r.selectorText === ".adj-badge-i");
    const naRule = allCssRules.find(r => r.selectorText === ".adj-badge-na");
    const bar = allCssRules.find(r => r.selectorText === ".vocab td.jp.adj-i" && r.style.boxShadow);
    return !!iRule && /var\(--adj-i-ink\)/.test(iRule.style.color)
      && !!naRule && /var\(--adj-na-ink\)/.test(naRule.style.color) && !bar;
  })());
  check("each adjective row has one badge in its English cell (not the Japanese cell's text); a plain row's badge is a static span (the pill + legend already say い/な-adjective, so a popover repeating that is redundant), only an irregular one is a clickable button carrying its reason in data-role, not a permanent footnote", (() => {
    const adjSection = [...document.querySelectorAll('.table-section[data-section="grammar"]')]
      .find(s => s.querySelector(".section-title-text").textContent === "Adjectives");
    const rows = [...adjSection.querySelectorAll("tbody tr")];
    const badgeOk = rows.every(r => r.cells[1].querySelectorAll(".adj-badge").length === 1 && r.cells[0].querySelectorAll(".adj-badge").length === 0
      && r.cells[1].querySelector(".adj-badge").textContent === "");
    const irr = rows.filter(r => r.cells[1].querySelector(".adj-badge-irr"));
    const plain = rows.filter(r => !r.cells[1].querySelector(".adj-badge-irr"));
    const kirei = rows.find(r => r.cells[0].textContent.includes("きれい"));
    const ii = rows.find(r => r.cells[0].querySelector(".jpword").textContent.replace(/\s/g, "") === "いい");
    return badgeOk && document.querySelectorAll(".vocab .adj-note").length === 0
      && irr.length === 6 && irr.every(r => r.cells[1].querySelector(".adj-badge-irr").tagName === "BUTTON" && /—/.test(r.cells[1].querySelector(".adj-badge-irr").dataset.role))
      && kirei.classList.contains("irregular-row") === false && kirei.cells[0].classList.contains("adj-na")
      && !!ii && ii.cells[0].classList.contains("adj-i") && !!ii.cells[1].querySelector(".adj-badge-irr")
      && plain.every(r => r.cells[1].querySelector(".adj-badge").tagName === "SPAN" && r.cells[1].querySelector(".adj-badge").dataset.role === undefined);
  })());
  check("五段/一段/変格 are capsule badges in three distinct tokens (godan/ichidan dedicated, irregular reuses --irregular-ink)", (() => {
    const godanRule = allCssRules.find(r => r.selectorText === ".verb-badge-godan");
    const ichidanRule = allCssRules.find(r => r.selectorText === ".verb-badge-ichidan");
    const irrRule = allCssRules.find(r => r.selectorText === ".verb-badge-irregular");
    return !!godanRule && /var\(--verb-godan-ink\)/.test(godanRule.style.color)
      && !!ichidanRule && /var\(--verb-ichidan-ink\)/.test(ichidanRule.style.color)
      && !!irrRule && /var\(--irregular-ink\)/.test(irrRule.style.color);
  })());
  check("every verb-pair row has one clickable verb-group badge in its English cell (not the Japanese cell), reading included; the six exceptions (look-alikes, ある, 来る) are outlined and carry their word-specific reason, every other 変格 row still explains why it's irregular (not just named), and godan/ichidan rows carry no reason at all", (() => {
    const verbsSection = [...document.querySelectorAll('.table-section[data-section="grammar"]')]
      .find(s => s.querySelector(".section-title-text").textContent === "Verbs");
    const rows = [...verbsSection.querySelectorAll("tbody tr")];
    const badgeOk = rows.every(r => r.cells[1].querySelectorAll("button.verb-badge").length === 1 && r.cells[0].querySelectorAll(".verb-badge").length === 0
      && r.cells[1].querySelector(".verb-badge").textContent === "" && r.cells[1].querySelector(".verb-badge").dataset.reading);
    const irr = rows.filter(r => r.cells[1].querySelector(".verb-badge-irr"));
    const irregularClass = rows.filter(r => r.cells[1].querySelector(".verb-badge-irregular"));
    const godanIchidan = rows.filter(r => !r.cells[1].querySelector(".verb-badge-irregular"));
    const kiru = rows.find(r => r.querySelector(".jpword").dataset.romaji === "kiru");
    const kuru = rows.find(r => r.querySelector(".jpword").dataset.romaji === "kuru");
    return badgeOk && rows.length === 79 && document.querySelectorAll(".vocab .adj-note").length === 0
      && irr.length === 6 && irr.every(r => /—/.test(r.cells[1].querySelector(".verb-badge-irr").dataset.role))
      && !!kiru && kiru.cells[1].querySelector(".verb-badge-godan.verb-badge-irr")
      && !!kuru && kuru.cells[1].querySelector(".verb-badge-irregular.verb-badge-irr")
      && kuru.cells[1].querySelector(".verb-badge").dataset.reading === "へんかく"
      // every 変格 row explains itself, outlined or not (verbNote or the class's own genericNote)
      && irregularClass.length > 0 && irregularClass.every(r => /—/.test(r.cells[1].querySelector(".verb-badge").dataset.role))
      // godan/ichidan rows with nothing worth a second look carry no reason at all
      && godanIchidan.filter(r => !r.cells[1].querySelector(".verb-badge-irr, [data-usage]")).every(r => !/—/.test(r.cells[1].querySelector(".verb-badge").dataset.role));
  })());
  check("the verb-group legend follows the same show-only-when-relevant rule as the adjective legend", (() => {
    const legend = document.querySelector(".verb-legend");
    if (!legend || legend.getAttribute("aria-hidden") !== "true") return false;
    const counters = document.querySelector('.table-section[data-table="0"]'); // no verbs
    window.RaumeStudy.vocab.updateAdjLegend(counters);
    const hiddenOnCounters = legend.hidden === true && window.getComputedStyle(legend).display === "none";
    const verbsTable = [...document.querySelectorAll('.table-section[data-section="grammar"]')]
      .find(s => s.querySelector(".section-title-text").textContent === "Verbs");
    window.RaumeStudy.vocab.updateAdjLegend(verbsTable);
    const shownOnVerbs = legend.hidden === false && window.getComputedStyle(legend).display !== "none";
    window.RaumeStudy.vocab.updateAdjLegend(counters); // leave it back the way we found it
    return hiddenOnCounters && shownOnVerbs;
  })());
  check("verbs and が-taking adjectives show the particles they take as trailing chip buttons with no caption line, and none is left blank", (() => {
    const section = (name) => [...document.querySelectorAll('.table-section[data-section="grammar"]')].find(s => s.querySelector(".section-title-text").textContent === name);
    const row = (sec, romaji) => [...sec.querySelectorAll("tbody tr")].find(r => r.querySelector(".jpword").dataset.romaji === romaji);
    const chips = (r) => [...r.cells[1].querySelectorAll("button.particle-chip")].map(c => c.dataset.badge).join(",");
    const verbs = section("Verbs"), adjs = section("Adjectives");
    const eat = row(verbs, "taberu"), listen = row(verbs, "kiku"), go = row(verbs, "iku"), sleep = row(verbs, "neru"), suki = row(adjs, "suki");
    const talk = row(verbs, "hanasu"), doIt = row(verbs, "suru");
    const labelOf = (r, i) => r.cells[1].querySelectorAll("button.particle-chip")[i].getAttribute("aria-label");
    return chips(eat) === "を" && chips(listen) === "を,に" && chips(go) === "に/へ" && chips(sleep) === ""
      && chips(suki) === "が" && !!suki.cells[1].querySelector(".adj-badge-na")
      && chips(talk) === "と,を" && chips(doIt) === "を,に"
      && labelOf(listen, 1) === "Particle に: who you ask" && labelOf(doIt, 1) === "Particle に: what you choose"
      && document.querySelectorAll(".particle-note").length === 0
      && [...verbs.querySelectorAll("tbody tr")].every(r => !r.cells[0].querySelector(".particle-chip"))
      // chips trail the meaning (after it in the cell), so the meaning keeps one left edge
      && [...verbs.querySelectorAll("tbody tr")].every(r => { const c = r.cells[1].querySelector(".meaning-cell"); return !c.querySelector(".particle-chip") || c.firstElementChild.classList.contains("meaning-text"); });
  })());
  check("tapping a particle chip opens a popover with just that chip's own role, never the row's other particle too; the other chip's own tap swaps it; outside tap, Escape and Cover answers behave", (() => {
    const verbs = [...document.querySelectorAll('.table-section[data-section="grammar"]')].find(s => s.querySelector(".section-title-text").textContent === "Verbs");
    const listen = [...verbs.querySelectorAll("tbody tr")].find(r => r.querySelector(".jpword").dataset.romaji === "kiku");
    const [wo, ni] = listen.querySelectorAll("button.particle-chip");
    const pop = () => document.querySelector(".role-pop");
    ni.click();
    const opened = !!pop() && /who you ask/.test(pop().textContent) && !/what you listen to/.test(pop().textContent)
      && ni.getAttribute("aria-expanded") === "true" && pop().getAttribute("aria-hidden") === "true";
    wo.click();
    const swapped = !!pop() && /what you listen to/.test(pop().textContent) && !/who you ask/.test(pop().textContent)
      && wo.getAttribute("aria-expanded") === "true" && ni.getAttribute("aria-expanded") === "false";
    document.body.click();
    const closedOutside = !pop() && wo.getAttribute("aria-expanded") === "false";
    wo.click(); document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    const closedEsc = !pop();
    document.body.classList.add("selftest-mode"); wo.click();
    const blockedInCover = !pop();
    document.body.classList.remove("selftest-mode");
    return opened && swapped && closedOutside && closedEsc && blockedInCover;
  })());
  check("an adjective or verb badge opens the same popover mechanism, showing its own colour and (for an irregular one) its reason", (() => {
    const adjs = [...document.querySelectorAll('.table-section[data-section="grammar"]')].find(s => s.querySelector(".section-title-text").textContent === "Adjectives");
    const kirei = [...adjs.querySelectorAll("tbody tr")].find(r => r.cells[0].textContent.includes("きれい"));
    const badge = kirei.cells[1].querySelector("button.adj-badge");
    const pop = () => document.querySelector(".role-pop");
    badge.click();
    const opened = !!pop() && /な-adjective/.test(pop().textContent) && /Ends in い but takes な/.test(pop().textContent)
      && !!pop().querySelector(".adj-badge.adj-badge-na") && badge.getAttribute("aria-expanded") === "true";
    document.body.click();
    return opened && !pop();
  })());
  check("a row with grammar shows one ⓘ instead of badges; it opens every note on the row in one popover", (() => {
    const row = [...document.querySelectorAll("#vocabulary .vocab tbody tr")].find(r => r.querySelectorAll(".row-badges [data-badge]").length >= 2);
    if (!row) return false;
    const btn = row.querySelector(".row-info-btn");
    const hiddenRule = allCssRules.find(r => r.selectorText === ".meaning-cell .row-badges" && r.style.display === "none");
    btn.click();
    const pop = document.querySelector(".role-pop-list");
    const lines = pop ? pop.querySelectorAll(".role-pop-line").length : 0;
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.click();
    return !!btn && !!hiddenRule && lines === row.querySelectorAll(".row-badges [data-badge]").length && expanded
      && !document.querySelector(".role-pop-list");
  })());
  check("a regular adjective's usage note (多い) keeps the plain badge and shows as its line in the ⓘ popover", (() => {
    const row = document.querySelector('#vocabulary tr[data-vocab-id="v0115"]');
    if (!row) return false;
    const badge = row.querySelector(".row-badges .adj-badge");
    const btn = row.querySelector(".row-info-btn");
    btn.click();
    const pop = document.querySelector(".role-pop-list");
    const shown = !!pop && /多くの人/.test(pop.textContent) && /い-adjective/.test(pop.textContent);
    btn.click();
    return shown && badge.tagName === "SPAN" && !badge.classList.contains("adj-badge-irr")
      && /多くの人/.test(row.cells[0].querySelector(".visually-hidden").textContent);
  })());
  check("a regular verb's usage note (遊ぶ) joins its popover line without the exception outline", (() => {
    const row = document.querySelector('#vocabulary tr[data-vocab-id="v0147"]');
    const badge = row && row.querySelector(".verb-badge");
    return !!badge && badge.hasAttribute("data-usage") && !badge.classList.contains("verb-badge-irr")
      && /テニスをする/.test(badge.dataset.role) && /u-verb/.test(badge.dataset.role);
  })());
  check("rows with nothing to explain get no ⓘ", (() => {
    const plain = [...document.querySelectorAll("#vocabulary .vocab tbody tr")].find(r => !r.querySelector(".row-badges"));
    return !!plain && !plain.querySelector(".row-info-btn");
  })());
  check("the particle chip is the app's particle blue, and the particle legend explains it", (() => {
    const chip = allCssRules.find(r => r.selectorText === ".particle-chip");
    return !!chip && /var\(--particle\)/.test(chip.style.color) && !!document.querySelector(".particle-legend");
  })());
  check("the .particle rule is blue (var(--particle)) and bold", (() => {
    const r = allCssRules.find(x => x.selectorText === ".particle");
    return !!r && /var\(--particle\)/.test(r.style.color) && String(r.style.fontWeight) === "700";
  })());
  check("--particle is a real colour in both themes, not left as an alias", (() => {
    const light = allCssRules.find(r => r.selectorText === ":root");
    const dark = allCssRules.find(r => r.selectorText === ':root[data-theme="dark"]');
    return /^\s*#[0-9a-f]{3,8}\s*$/i.test(light.style.getPropertyValue("--particle"))
      && /^\s*#[0-9a-f]{3,8}\s*$/i.test(dark.style.getPropertyValue("--particle"));
  })());
  check("the particle reading tooltip is wired (::after hidden by default, shown on hover/tap)", (() => {
    // jsdom's CSSOM drops `content: attr(data-r)`, so assert on the opacity flip.
    const base = allCssRules.find(r => r.selectorText === ".particle[data-r]::after");
    const on = allCssRules.find(r => r.selectorText && /\.particle\[data-r\](:hover|\.particle-on)::after/.test(r.selectorText));
    return !!base && base.style.opacity === "0" && !!on && on.style.opacity === "1";
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
  check("the kana group picker and study-directions block render as iOS-style checkmark rows, not checkbox squares", (() => {
    const hidden = allCssRules.find(r => r.selectorText
      && /\.fc-kana-group input\[type="checkbox"\]/.test(r.selectorText)
      && r.style.position === "absolute" && r.style.opacity === "0");
    const tick = allCssRules.find(r => r.selectorText && /\.fc-kana-group:has\(input:checked\)::after/.test(r.selectorText));
    return !!hidden && !!tick;
  })());
  check("the Fuzz setting is a restyled (appearance:none) iOS switch, not a checkmark row", (() => {
    const rule = allCssRules.find(r => r.selectorText === ".set-switch" && r.style.appearance === "none");
    const tick = allCssRules.find(r => r.selectorText === ".set-switch:checked::after");
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
    // The tone lives on the rating's own label text now -- no key chip, no
    // pill, just a coloured word in an otherwise plain text-action row.
    const nameColors = ratings.map(r => styleFor('.fc-rating-btn[data-rating="' + r + '"] .fc-rating-name')?.color);
    const allSet = (arr) => arr.every(Boolean);
    const allDistinct = (arr) => new Set(arr).size === arr.length;
    return allSet(nameColors) && allDistinct(nameColors);
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
  // Decoration: kana in a table cell becomes hover targets, and the per-unit
  // romaji is NOT in the DOM text (so search/sort see only the kana). The
  // whole-word romaji reveal (see jpCell in js/vocab/render.js) is likewise
  // NOT in the DOM text -- it's a data-romaji attribute, not a text node --
  // so plain textContent already reflects what the cell would search/sort by.
  const plainJpText = td => { const c = td.cloneNode(true); const n = c.querySelector(".visually-hidden"); if (n) n.remove(); return c.textContent; };
  const findCell = re => [...document.querySelectorAll("#vocabulary td.jp")].find(td => td.querySelector(".kr") && re.test(plainJpText(td)));
  const kataCell = findCell(/[ァ-ヺ]/);
  const hiraCell = [...document.querySelectorAll("#vocabulary td.jp")].find(td => /^[ぁ-ゖ]+$/.test(plainJpText(td))); // a pure-hiragana headword
  check("katakana words render .kr hover targets", !!kataCell);
  check("hiragana words do not render .kr hover targets", !!hiraCell && !hiraCell.querySelector(".kr"));
  check("each .kr carries its romaji in data-r", [...kataCell.querySelectorAll(".kr")].every(s => /^[a-zāīūēō]+$/.test(s.dataset.r || "")));
  check("the per-unit kana romaji stays out of the cell's searchable text", !/[a-z]/i.test(plainJpText(kataCell)) && !/[a-z]/i.test(plainJpText(hiraCell)));
  check("the whole-word romaji reveal is still in the DOM, just set apart from the kana", !!kataCell.querySelector(".jpword[data-romaji]") && !!hiraCell.querySelector(".jpword[data-romaji]"));
  check("furigana readings are left plain (not decorated)", !document.querySelector('#vocabulary td.jp ruby .kr'));

  console.log("Table icons");
  const ic = window.RaumeStudy.icons;
  check("the icon set is exposed with grouped names", ic && ic.groups.length > 0 && ic.names.length > 120);
  check("every grouped icon name resolves to a real path", ic.groups.every(g => g.names.length > 0 && g.names.every(n => ic.has(n) && ic.render(n).indexOf("<svg") === 0)));
  check("render() emits a stroke-only inline SVG for a known name", /^<svg[^>]*stroke="currentColor"/.test(ic.render("coffee")) && ic.render("coffee").indexOf("fill=\"currentColor\"") === -1);
  check("render() emits an <img> for an uploaded data URL", /^<img /.test(ic.render("data:image/png;base64,AAAA")));
  check("render() degrades to nothing for an unknown value", ic.render("definitely-not-an-icon") === "");
  check("the icon picker module is available", !!(window.RaumeStudy.iconPicker && window.RaumeStudy.iconPicker.open));
  // Choosing an icon lives in the table's "Table options" menu now (Choose
  // icon…, not an always-visible header button) -- see render.js
  // sectionMarkup + interactions.js. The header glyph itself is decorative,
  // reusing the same .section-icon slot markup either way.
  check("every table header shows a decorative icon slot", [...document.querySelectorAll("#vocabulary .table-section")].every(s => !!s.querySelector(".section-head > .section-icon")));
  check("every table's menu offers a Choose icon item wired to the picker hook", [...document.querySelectorAll("#vocabulary .table-section")].every(s => !!s.querySelector(".section-menu-list .section-icon-btn[data-icon-for]")));
  check("every shipped table starts with a default icon from the library, drawn in the header", (() => {
    const tables = window.RaumeStudy.data.vocabularyTables;
    const V = window.RaumeStudy.vocab;
    return tables.every(t => {
      const v = V.tableIconValue(t.id);
      const slot = document.querySelector('#vocabulary .table-section[data-table="' + t.id + '"] .section-head > .section-icon');
      return !!v && ic.has(v) && !!slot && !slot.classList.contains("section-icon-empty") && !!slot.querySelector("svg");
    });
  })());
  check("a table with no icon of its own and no default keeps the quiet '+' slot", (() => {
    const V = window.RaumeStudy.vocab;
    const html = V.tableIconGlyph("no-such-table");
    return V.tableIconValue("no-such-table") === "" && /<path/.test(html) && !/<rect/.test(html) && !/stroke-dasharray/.test(html);
  })());
  check("choosing an icon updates the header and directory in place", (() => {
    const btn = document.querySelector('.section-menu-list .section-icon-btn[data-icon-for]');
    const id = btn.dataset.iconFor;
    window.RaumeStudy.tableCustom.setIcon(id, "coffee");
    const slot = btn.closest(".table-section").querySelector(".section-icon");
    const dir = document.querySelector('#tindexMenu a[data-target="' + id + '"] .tindex-icon');
    const ok = !slot.classList.contains("section-icon-empty")
      && /viewBox="0 0 24 24"/.test(slot.innerHTML) && !slot.querySelector("[stroke-dasharray]")
      && dir && /viewBox="0 0 24 24"/.test(dir.innerHTML);
    window.RaumeStudy.tableCustom.setIcon(id, ""); // reset
    return ok;
  })());
  console.log("Icons + colours for a table of your own");
  check("icons.suggest picks an icon from a table's name (plural, multi-word, unknown)", (() => {
    const sg = ic.suggest;
    return sg("Animals") === "paw" && sg("Family members") === "users" && sg("Fruits") === "apple"
      && sg("Kitchen tools") === "microwave" && sg("At the hospital") === "heart" && sg("Xyzzy") === "" && sg("") === "";
  })());
  check("a table of your own gets an icon suggested from its name, a bookmark if none fits, and the reader's pick wins", (() => {
    const V = window.RaumeStudy.vocab, tc = window.RaumeStudy.tableCustom, all = window.RaumeStudy.data.vocabularyTables;
    all.push({ id: "ct-test", title: "Animals", category: "My vocabulary", rows: [], __custom: true });
    all.push({ id: "ct-test2", title: "Xyzzy", category: "My vocabulary", rows: [], __custom: true });
    const auto = V.tableIconValue("ct-test"), fallback = V.tableIconValue("ct-test2");
    tc.setName("ct-test", "Fruit stall");
    const renamed = V.tableIconValue("ct-test");
    tc.setIcon("ct-test", "star");
    const picked = V.tableIconValue("ct-test");
    tc.clear("ct-test");
    all.splice(all.length - 2, 2);
    // The data was edited directly, not through custom-vocab (which re-renders
    // on its own) -- re-sync so the directory drops the fake tables' links.
    V.applyTableOrder();
    return auto === "paw" && fallback === "bookmark" && renamed === "apple" && picked === "star";
  })());
  check("deleting a table of your own forgets its customisation record and its place in a saved order", (() => {
    const tc = window.RaumeStudy.tableCustom;
    tc.setName("ct-gone", "Old table");
    tc.setHidden("ct-gone", true);
    tc.setTableOrder("My vocabulary", ["ct-keep", "ct-gone"]);
    tc.forget("ct-gone");
    const ok = !("ct-gone" in tc.getAll()) && tc.tableOrder("My vocabulary").join() === "ct-keep";
    tc.resetOrder();
    return ok;
  })());
  check("a table's tile colour: its category's hue, then the icon group's for your own tables, then your own pick", (() => {
    const V = window.RaumeStudy.vocab, tc = window.RaumeStudy.tableCustom, all = window.RaumeStudy.data.vocabularyTables;
    all.push({ id: "ct-test3", title: "Fruit", category: "My vocabulary", rows: [], __custom: true });
    const known = V.tableTile("3", "Food & Ingredients");
    const own = V.tableTile("ct-test3", "My vocabulary");
    tc.setColor("ct-test3", "clay");
    const picked = V.tableTile("ct-test3", "My vocabulary");
    tc.setColor("ct-test3", "not-a-colour");
    const bogus = V.tableTile("ct-test3", "My vocabulary");
    tc.clear("ct-test3");
    all.pop();
    V.applyTableOrder();
    return known === "green" && own === "green" && picked === "clay" && bogus === "green";
  })());
  check("picking a colour re-tints the table header in place (data-tile) and Reset returns to the automatic one", (() => {
    const tc = window.RaumeStudy.tableCustom;
    const sec = document.querySelector('#vocabulary .table-section[data-table="3"]');
    // A change can rebuild the directory, so look the link up fresh each time.
    const link = () => document.querySelector('#tindexMenu a[data-target="3"]');
    const before = sec.dataset.tile;
    tc.setColor("3", "purple");
    const during = sec.dataset.tile, linkDuring = link().dataset.tile;
    tc.setColor("3", "");
    return before === "green" && during === "purple" && linkDuring === "purple" && sec.dataset.tile === "green" && link().dataset.tile === "green";
  })());
  check("every table-index link carries the same coloured icon tile as its table", [...document.querySelectorAll("#tindexMenu a[data-target]")].every(a => {
    const sec = document.querySelector('#vocabulary .table-section[data-table="' + a.dataset.target + '"]');
    return !!a.querySelector(".tindex-icon svg") && !!a.dataset.tile && !!sec && a.dataset.tile === sec.dataset.tile;
  }));
  check("the icon picker offers an Auto pill plus one swatch per hue, and a swatch applies without closing it", (() => {
    const chosen = [];
    window.RaumeStudy.iconPicker.open("coffee", () => {}, null, { color: "", autoColor: () => "green", onColor: (k) => chosen.push(k), resettable: false });
    const root = document.querySelector(".icon-picker-root");
    const swatches = [...root.querySelectorAll(".swatch")];
    const auto = root.querySelector(".swatch-auto");
    const clay = root.querySelector('.swatch[data-color="clay"]');
    clay.click();
    const stillOpen = !root.hidden && clay.classList.contains("selected") && !auto.classList.contains("selected");
    const resetHidden = root.querySelector(".icon-picker-remove").hidden === true;
    window.RaumeStudy.iconPicker.close();
    return swatches.length === 1 + ic.colors.length && auto.classList.contains("selected") === false && chosen.join() === "clay" && stillOpen && resetHidden;
  })());
  check("sign-in merges local customisations with the account (account wins per table, local-only kept + pushed up)", (() => {
    const tc = window.RaumeStudy.tableCustom;
    const secs = [...document.querySelectorAll("#vocabulary .table-section[data-table]")];
    const a = secs[0].dataset.table, b = secs[1].dataset.table;
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
  check("the reference pages carry a real <h1> naming the active section -- shown on screen at phone width only (desktop's top nav already names it), but visually-hidden rather than display:none on desktop so it still gives a screen reader an entry point there", (() => {
    const t = document.getElementById("screenTitle");
    const base = allCssRules.find(r => r.selectorText === ".screen-title");
    return !!t && t.tagName === "H1" && t.textContent === "Vocabulary" && !!base && base.style.display !== "none" && base.style.position === "absolute" && base.style.clip === "rect(0px, 0px, 0px, 0px)";
  })());
  check("every other screen's own title is a real <h1> too (Practice, Customize tables, Help)", (() => {
    const flashTitle = document.querySelector(".page-flashcards h1");
    return !!flashTitle && flashTitle.textContent === "Practice"
      && document.querySelector(".page-help h1").textContent === "Help";
  })());
  check("on a phone the main nav is pinned to the bottom as a tab bar; desktop keeps the sticky top nav", (() => {
    const base = allCssRules.find(r => r.selectorText === ".site-nav");
    const phone = allCssRules.find(r => r.media && /max-width:\s*640px/.test(r.media.mediaText)
      && [...r.cssRules].some(x => x.selectorText === ".site-nav" && x.style.position === "fixed" && x.style.bottom === "0px"));
    return !!base && base.style.position === "sticky" && !!phone
      && /viewport-fit=cover/.test(document.querySelector('meta[name="viewport"]').content);
  })());
  check("each tab carries an icon (a CSS mask on ::before), so the JS-built nav markup is unchanged", (() => {
    const phone = allCssRules.find(r => r.media && /max-width:\s*640px/.test(r.media.mediaText)
      && [...r.cssRules].some(x => x.selectorText === ".site-nav-link::before"));
    if (!phone) return false;
    const rules = [...phone.cssRules].map(x => x.selectorText || "");
    return ["vocabulary", "grammar", "kanji", "travel"].every(sec => rules.some(t => t.includes('data-section="' + sec + '"') && t.includes("::before")))
      && rules.some(t => t.includes('data-page="flashcards"') && t.includes("::before"))
      && document.querySelectorAll("#siteNav .site-nav-link").length === 5;
  })());
  check("the Vocabulary nav link starts active", document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').classList.contains("active"));
  check("only the Vocabulary section's tables are shown", [...document.querySelectorAll("#vocabulary .table-section")].every(s => s.classList.contains("page-hidden") === (s.dataset.section !== "vocabulary")));
  check("Grammar tables belong to the grammar section", [...document.querySelectorAll('.table-section[data-category="Grammar"]')].every(s => s.dataset.section === "grammar"));
  check("Travel tables belong to the travel section", [...document.querySelectorAll('.table-section[data-category="Travel"]')].every(s => s.dataset.section === "travel"));
  check("there's no Phrases section any more", !document.querySelector('.table-section[data-category="Phrases"], .site-nav-link[data-section="phrases"]'));
  check("every other category belongs to the vocabulary section", [...document.querySelectorAll(".table-section")].filter(s => !["Grammar", "N5 Kanji", "Travel"].includes(s.dataset.category)).every(s => s.dataset.section === "vocabulary"));

  console.log("Vocabulary section: content-category sub-headings + table-index dropdown");
  const catHeads = [...document.querySelectorAll('#vocabulary .cat-heading[data-section="vocabulary"]')];
  check("a sub-heading per Vocabulary category (Food & Ingredients / Kitchen & Dining / Numbers & Counting / People & Daily Life / Time & Calendar)", catHeads.length === 5);
  check("sub-headings are visible on the Vocabulary page", catHeads.every(h => !h.classList.contains("page-hidden")));
  check("the reading column and its category rules share one width cap", (() => {
    const mw = el => window.getComputedStyle(el).maxWidth;
    const table = mw(document.querySelector("#vocabulary .table-section"));
    return table && table !== "none" && mw(catHeads[0]) === table;
  })());
  console.log("Options sheet (the sticky bar is just search + one Options button)");
  const optionsBtn = document.getElementById("optionsBtn");
  const optionsSheet = document.getElementById("optionsSheet");
  const optionsDot = document.getElementById("optionsDot");
  check("the sticky toolbar's bar holds only the search field and one shared capsule of Tables + Options", (() => {
    const bar = document.querySelector(".vocab-toolbar .vocab-bar");
    const kids = [...bar.children].map(c => c.className.split(" ")[0]);
    const cap = bar.querySelector(":scope > .bar-capsule");
    return !!bar && kids.includes("search-box") && !!cap
      && !!cap.querySelector(":scope > #tableIndex") && !!cap.querySelector(":scope > .options-btn")
      && !bar.querySelector(".view-mode");
  })());
  check("the Options button is labelled, announces a dialog, and starts collapsed", !!optionsBtn && optionsBtn.getAttribute("aria-label") === "Options" && optionsBtn.getAttribute("aria-haspopup") === "dialog" && optionsBtn.getAttribute("aria-expanded") === "false" && optionsSheet.hidden === true);
  check("no dot while everything is at its default", optionsDot.hidden === true);
  check("the column switches, Cover answers, Show polite, Expand all and Print live in the sheet", (() => {
    const inSheet = sel => !!optionsSheet.querySelector(sel);
    return ["japanese", "furigana", "english"].every(k => inSheet('.opt-switch[data-col="' + k + '"]'))
      && inSheet("#selftestToggle") && inSheet("#politeToggle") && inSheet("#expandAllBtn")
      && inSheet('.print-scope[data-scope="section"]') && inSheet('.print-scope[data-scope="all"]')
      && inSheet(".adj-legend") && inSheet(".verb-legend") && inSheet(".particle-legend")
      && optionsSheet.querySelector(".expand-bar #expandAllBtn");
  })());
  optionsBtn.click();
  check("tapping Options opens the sheet, flips aria-expanded and lifts the toolbar", optionsSheet.hidden === false && optionsBtn.getAttribute("aria-expanded") === "true" && document.querySelector(".vocab-toolbar").classList.contains("options-open") && document.getElementById("optionsScrim").hidden === false);
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  check("Esc closes it again", optionsSheet.hidden === true && optionsBtn.getAttribute("aria-expanded") === "false" && !document.querySelector(".vocab-toolbar").classList.contains("options-open"));
  optionsBtn.click();
  document.getElementById("vocabulary").click();
  check("a click outside the sheet closes it", optionsSheet.hidden === true);
  const tindexMenu = document.getElementById("tindexMenu");
  check("the table-index dropdown menu starts closed", tindexMenu.hidden === true);
  check("its trigger reports collapsed", document.querySelector(".tindex-trigger").getAttribute("aria-expanded") === "false");
  check("the trigger is a permanent button in the sticky search bar, not a row of its own above it",
    !!document.querySelector(".vocab-toolbar .vocab-bar #tableIndex .tindex-trigger") && document.querySelector(".tindex-trigger").hidden === false);
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
  check("the Vocabulary panel groups links by category (5 groups, 5 labels)", vocPanel.querySelectorAll('.tindex-cat-group').length === 5 && vocPanel.querySelectorAll('.tindex-cat').length === 5);
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

  console.log("Top navigation");
  const navLinks = [...document.querySelectorAll("#siteNav .site-nav-link")];
  check("nav is Vocabulary / Grammar / Kanji / Travel / Practice", navLinks.map(l => l.textContent) .join(" ") === "Vocabulary Grammar Kanji Travel Practice");
  check("the four reference sections carry data-section", navLinks.slice(0, 4).map(l => l.dataset.section).join(",") === "vocabulary,grammar,kanji,travel");
  check("last nav item is Practice, at #practice", navLinks[navLinks.length - 1].dataset.page === "flashcards" && navLinks[navLinks.length - 1].getAttribute("href") === "#practice");
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

  console.log("Romaji reveal");
  const saltRow = document.querySelector('#vocabulary .table-section:not([data-section="grammar"]) tbody tr .jpword[data-romaji="shio"]').closest("tr");
  check("romaji sits behind a tap on the word itself, hidden until then", (() => {
    const jpword = saltRow.cells[0].querySelector('.jpword[data-romaji]');
    return !!jpword && !jpword.classList.contains('jp-romaji-on');
  })());
  check(".jpword[data-romaji]::after is hidden until revealed (display:none by default)", (() => {
    const r = allCssRules.find(x => x.selectorText === ".jpword[data-romaji]::after");
    return !!r && r.style.display === "none";
  })());
  check("the whole-word reveal has no :hover trigger -- click/tap only, unlike .kr/.particle below", (() => {
    return !allCssRules.some(r => r.selectorText === ".jpword[data-romaji]:hover::after" || r.selectorText === ".jpword:hover::after");
  })());
  check("the .kr/.particle reading layers: a tap-pinned reveal can't be re-hidden by a stuck :hover match (iOS can leave a tapped element in :hover) -- the pinned rule matches the hover-none suppression's specificity and is declared after it, so it wins the tie", (() => {
    const isHoverNone = r => r.parentRule && r.parentRule.media && /hover:\s*none/.test(r.parentRule.media.mediaText);
    const check1 = (hoverSel, onSel) => {
      const noneIdx = allCssRules.findIndex(r => r.selectorText === hoverSel && isHoverNone(r));
      const onIdx = allCssRules.findIndex(r => r.selectorText === onSel);
      return noneIdx !== -1 && onIdx !== -1 && onIdx > noneIdx;
    };
    return check1(".kr:hover::after", ".kr.kr-on::after")
      && check1(".particle[data-r]:hover::after", ".particle[data-r].particle-on::after");
  })());
  check("clicking the Japanese word reveals its romaji (touch path) and toggles the pinned state", (() => {
    const jpword = saltRow.querySelector('td.jp .jpword[data-romaji]');
    jpword.click();
    const opened = jpword.classList.contains('jp-romaji-on');
    jpword.click();
    return opened && !jpword.classList.contains('jp-romaji-on');
  })());
  check("a romaji-only match tints the furigana it spells, adds no romaji line, and clears with the query (shi -> し over 塩)", (() => {
    const input = document.getElementById("tableSearch");
    input.value = "shi";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    const jpword = saltRow.querySelector('.jpword[data-romaji]');
    const marks = [...jpword.querySelectorAll('rt mark.search-hit')].map(m => m.textContent);
    const hit = !saltRow.classList.contains("search-hidden") && marks.join("|") === "し"
      && !jpword.querySelector('.jp-romaji-line') && !jpword.querySelector('rb mark, .jpmain mark');
    input.value = "";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    return hit && !jpword.querySelector('mark');
  })());
  check("a reading split over furigana and okurigana is tinted across both (ookii -> おお + きい on 大きい)", (() => {
    const input = document.getElementById("tableSearch");
    input.value = "ookii";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    const w = document.querySelector('#vocabulary .jpword[data-romaji="ōkii"]');
    const marks = w ? [...w.querySelectorAll('mark.search-hit')].map(m => m.textContent).join("") : "";
    input.value = "";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    return marks === "おおきい";
  })());
  check("when the kana can't be matched (koohii vs コーヒー) the romaji line shows with just the run marked", (() => {
    const input = document.getElementById("tableSearch");
    input.value = "koohii";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    const w = document.querySelector('#vocabulary .jpword[data-romaji="kōhī"]');
    const line = w && w.querySelector('.jp-romaji-line');
    const marks = line ? [...line.querySelectorAll('mark.search-hit')].map(m => m.textContent).join("|") : "";
    input.value = "";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    return marks === "kōhī";
  })());
  check("a kanji found by romaji marks the reading it spells, with no extra romaji line (mizu -> みず on 水)", (() => {
    const input = document.getElementById("tableSearch");
    input.value = "mizu";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    const tile = [...document.querySelectorAll("#vocabulary .vocab-kanji tr.kanji-tile")].find(r => r.querySelector(".kanji-char").textContent === "水");
    const marks = tile ? [...tile.querySelectorAll(".kanji-readings mark.search-hit")].map(m => m.textContent) : [];
    const ok = !!tile && !tile.classList.contains("search-hidden") && marks.join("|") === "みず" && !tile.querySelector(".jp-romaji-line");
    input.value = "";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    return ok && !tile.querySelector(".kanji-readings mark");
  })());

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

  console.log("Phone account menu (one masthead button on a phone)");
  const acctMenu = document.getElementById("accountMenu");
  check("the account menu starts hidden and lists Sign in (a guest; Account once signed in) / Customize tables / Help / Support raume + an Appearance switch", !!acctMenu && acctMenu.hidden
    && [...acctMenu.querySelectorAll(".account-menu-item:not([hidden])")].map(b => b.textContent.replace(/[›↗]/, "").trim()).join("|") === "Sign in|Customize tables|Help|Support raume"
    && acctMenu.querySelector('[data-menu-go="signout"]').hidden
    && acctMenu.querySelector('a[href="https://ko-fi.com/raume"]').rel === "noopener"
    && acctMenu.querySelectorAll("[data-theme-set]").length === 3);
  window.RaumeStudy.vocab.toggleAccountMenu();
  check("opening it marks the account button expanded", !acctMenu.hidden && document.getElementById("accountToggle").getAttribute("aria-expanded") === "true");
  acctMenu.querySelector('[data-theme-set="dark"]').click();
  check("Appearance applies at once, marks its choice, and leaves the menu open", themeChoice() === "dark" && !acctMenu.hidden
    && acctMenu.querySelector('[data-theme-set="dark"]').getAttribute("aria-pressed") === "true");
  acctMenu.querySelector('[data-theme-set="system"]').click();
  acctMenu.querySelector('[data-menu-go="help"]').click();
  check("a page item opens that page and closes the menu", acctMenu.hidden && document.body.dataset.activePage === "help");
  window.location.hash = "";
  window.dispatchEvent(new window.Event("popstate"));

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
    .find(r => { const td = r.querySelector("td.jp"); return td && plainJpText(td) === "ケチャップ"; });
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

  console.log("Column visibility switches (each one shows its own thing)");
  const colBtn = k => document.querySelector('.opt-switch[data-col="' + k + '"]');
  const colHidden = k => !colBtn(k).classList.contains("active");
  check("there's no Romaji switch any more -- it's not a column", !colBtn("romaji"));
  check("every column switch starts on (pressed means showing)", ["japanese", "furigana", "english"].every(k => colBtn(k).getAttribute("aria-pressed") === "true" && !colHidden(k)));
  colBtn("english").click();
  check("switching a column off hides it — the switch reads off, body carries hide-english", colBtn("english").getAttribute("aria-pressed") === "false" && colHidden("english") && document.body.classList.contains("hide-english"));
  check("...and the Options button shows a dot with an updated label", optionsDot.hidden === false && optionsBtn.getAttribute("aria-label") === "Options (some changed)");
  check("its cells are aria-hidden and its sort control is disabled", document.querySelector(".vocab td:nth-child(2)").getAttribute("aria-hidden") === "true" && document.querySelector(".vocab th:nth-child(2) .sort-button").disabled === true);
  check("the header keeps its label -- only tbody cells go transparent (CSS), and the header itself stays out of aria-hidden (JS)", (() => {
    const th = document.querySelector(".vocab th:nth-child(2)");
    const scopedToTbody = allCssRules.some(r => r.selectorText && r.selectorText.includes("body.hide-english .vocab tbody td:nth-child(2)"));
    return th.getAttribute("aria-hidden") === null && scopedToTbody;
  })());
  check("the other column is untouched", !colHidden("japanese") && document.querySelector(".vocab td:nth-child(1)").getAttribute("aria-hidden") === null);
  colBtn("japanese").click();
  check("the last visible column can't be switched off", !colHidden("japanese") && document.querySelector(".vocab td:nth-child(1)").getAttribute("aria-hidden") === null);
  colBtn("english").click();
  check("switching it back on shows the column again, and the dot clears", !colHidden("english") && document.querySelector(".vocab td:nth-child(2)").getAttribute("aria-hidden") === null && optionsDot.hidden === true);
  colBtn("furigana").click();
  check("the Furigana switch hides just the readings, not the Japanese column", colHidden("furigana") && document.querySelector(".vocab .furigana").getAttribute("aria-hidden") === "true" && document.querySelector(".vocab td:nth-child(1)").getAttribute("aria-hidden") === null);
  colBtn("furigana").click();
  check("...and shows the readings again", document.querySelector(".vocab .furigana").getAttribute("aria-hidden") === null);

  console.log("Keyboard-operable table toggle");
  const grammarSection = document.querySelector('.table-section[data-category="Grammar"]');
  const wasCollapsed = grammarSection.classList.contains("collapsed");
  grammarSection.querySelector(".section-toggle").click();
  check("clicking the toggle (the same activation a native button gets from Enter/Space) flips collapsed state", grammarSection.classList.contains("collapsed") !== wasCollapsed);
  check("aria-expanded tracks the toggle", grammarSection.querySelector(".section-toggle").getAttribute("aria-expanded") === String(!grammarSection.classList.contains("collapsed")));

  console.log("Opening or closing a table never makes a row appear or the tapped row move");
  document.querySelector('#siteNav .site-nav-link[data-section="grammar"]').click();
  const gTrigger = document.querySelector(".tindex-trigger");
  const adjSection = document.querySelector('.table-section[data-section="grammar"]:not(.collapsed)') ||
    document.querySelector('.table-section[data-section="grammar"]');
  if (!adjSection.classList.contains("collapsed")) adjSection.querySelector(".section-toggle").click(); // start from collapsed
  check("with every Grammar table collapsed the trigger still shows, labelled \"Tables\"",
    gTrigger.hidden === false && gTrigger.querySelector(".tindex-trigger-label").textContent === "Tables");
  adjSection.querySelector(".section-toggle").click();
  check("still there, unchanged, once a table opens", gTrigger.hidden === false);
  adjSection.querySelector(".section-toggle").click();
  check("and once it closes again", gTrigger.hidden === false);
  check("opening the menu lifts the sticky bar above the tab bar, closing drops it back", (() => {
    const bar = document.querySelector(".vocab-toolbar");
    gTrigger.click();
    const lifted = bar.classList.contains("tindex-open");
    gTrigger.click();
    return lifted && !bar.classList.contains("tindex-open");
  })());
  document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();

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
  check("...and the Options dot lights so a covered table never looks broken", document.getElementById("optionsDot").hidden === false);
  const stRow = document.querySelector('#vocabulary .table-section[data-section="vocabulary"]:not(.page-hidden) tbody tr');
  stRow.cells[1].click();
  check("tapping a row reveals it", stRow.classList.contains("revealed"));
  stRow.cells[1].click();
  check("tapping again re-hides it", !stRow.classList.contains("revealed"));
  stRow.classList.add("revealed");
  selftestBtn.click();
  check("leaving the mode clears it, the hint, and every revealed row", !document.body.classList.contains("selftest-mode") && selftestBtn.getAttribute("aria-pressed") === "false" && window.getComputedStyle(selftestHint).display === "none" && !document.querySelector("#vocabulary .vocab tbody tr.revealed"));
  check("...and the dot clears again", document.getElementById("optionsDot").hidden === true);

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
  check("columns are Japanese → English (romaji lives in the Japanese cell now)", JSON.stringify(headerLabels) === JSON.stringify(["Japanese", "English"]));

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

  check("print gives furigana room by raising the shared first-line geometry (--row-top), not a padding that would break the one-line row", (() => {
    // Word rows keep the screen's --row-top / --l1 geometry in print so the
    // word and the English's first line stay on one line; print only grows
    // the room above that line. A uniform padding-top on .vocab td (or a
    // .vocab td.jp override) would pull the two apart.
    const printMedia = allCssRules.find(r => r.media && /^print$/.test(r.media.mediaText));
    if (!printMedia) return false;
    const printRules = [...printMedia.cssRules];
    const screenBase = allCssRules.find(r => !((r.parentRule || {}).media) && r.selectorText === ".vocab:not(.vocab-sentences)");
    const printBase = printRules.find(r => r.selectorText === "html .vocab:not(.vocab-sentences)");
    const td = printRules.find(r => r.selectorText === ".vocab td");
    return !!screenBase && !!printBase && !!td
      && parseFloat(printBase.style.getPropertyValue("--row-top")) > parseFloat(screenBase.style.getPropertyValue("--row-top"))
      && !td.style.paddingTop && !td.style.padding
      && !printRules.some(r => r.selectorText === ".vocab td.jp");
  })());
  check("print adds a vertical hairline between columns (not on screen)", (() => {
    const printMedia = allCssRules.find(r => r.media && /^print$/.test(r.media.mediaText));
    const printRule = printMedia && [...printMedia.cssRules].find(r => r.selectorText === ".vocab :is(th, td):not(:first-child)");
    const screenRule = allCssRules.find(r => !((r.parentRule || {}).media) && r.selectorText === ".vocab :is(th, td):not(:first-child)");
    return !!printRule && parseFloat(printRule.style.borderLeft) > 0 && /solid/.test(printRule.style.borderLeft) && !screenRule;
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
  const printSection = document.querySelector('#optionsSheet .print-scope[data-scope="section"]');
  const printAll = document.querySelector('#optionsSheet .print-scope[data-scope="all"]');
  check("the Options sheet carries Print this section / Print whole reference", !!printSection && !!printAll && !document.querySelector(".print-menu-btn"));
  document.getElementById("optionsBtn").click();
  printSection.click();
  check("\"This section\" prints every table in the active section", document.body.classList.contains("print-only") &&
    [...document.querySelectorAll('.table-section[data-section="grammar"]')].every(s => s.classList.contains("print-target")));
  check("...and no other section's tables", [...document.querySelectorAll('.table-section:not([data-section="grammar"])')].every(s => !s.classList.contains("print-target")));
  check("...even the collapsed ones in that section", [...document.querySelectorAll('.table-section[data-section="grammar"].collapsed')].length > 0 &&
    [...document.querySelectorAll('.table-section[data-section="grammar"].collapsed')].every(s => s.classList.contains("print-target")));
  check("the sheet closed itself after the pick", document.getElementById("optionsSheet").hidden === true);
  window.dispatchEvent(new window.Event("afterprint"));
  check("afterprint clears every print target", !document.body.classList.contains("print-only") && !document.querySelector(".table-section.print-target"));
  document.getElementById("optionsBtn").click();
  printAll.click();
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
  check("its own title is a real <h1>, this screen's entry point for a screen reader", document.querySelector(".cz-intro h1").textContent.startsWith("Customize tables"));
  check("no nav link is active on the Customize page", !document.querySelector('#siteNav .site-nav-link.active'));
  const czRows = document.querySelectorAll("#customizePage .cz-row");
  check("it lists every one of the 47 tables", czRows.length === 47);
  check("each row has a name field, a reset control and a Hide button", [...czRows].every(r => r.querySelector(".cz-row-name") && r.querySelector(".cz-row-reset[data-reset-for]") && r.querySelector(".cz-row-vis")));
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
  // One reorder control, as in iOS edit mode: the drag handle, which also
  // moves its item one step on Up / Down.
  const arrowKey = (el, key) => el.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  check("no separate move-up / move-down buttons -- the drag handle is the one reorder control", !document.querySelector("#customizePage .cz-move-btn"));
  check("Up on the first row's handle and Down on the last's change nothing", (() => {
    const before = [...foodGroup().querySelectorAll(".cz-row")].map(r => r.dataset.tableId).join();
    const rows = [...foodGroup().querySelectorAll(".cz-row")];
    arrowKey(rows[0].querySelector(".cz-drag-handle"), "ArrowUp");
    arrowKey([...foodGroup().querySelectorAll(".cz-row")].pop().querySelector(".cz-drag-handle"), "ArrowDown");
    return [...foodGroup().querySelectorAll(".cz-row")].map(r => r.dataset.tableId).join() === before && !window.RaumeStudy.tableCustom.hasCustomOrder();
  })());
  const foodIdsBefore = [...foodGroup().querySelectorAll(".cz-row")].map(r => r.dataset.tableId);
  arrowKey(foodGroup().querySelector(".cz-row .cz-drag-handle"), "ArrowDown");
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
  check("the moved row's handle keeps focus and names its new position", (() => {
    const h = document.activeElement;
    return !!h && h.classList.contains("cz-drag-handle") && h.closest(".cz-row").dataset.tableId === foodIdsBefore[0] && / 2 of \d+$/.test(h.getAttribute("aria-label"));
  })());
  arrowKey(firstVocabGroup.querySelector(".cz-group-title .cz-drag-handle"), "ArrowDown");
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

  console.log("Customize page: drag-to-reorder");
  // firstVocabGroup (above) is a snapshot from before the move-down + reset
  // clicks already re-rendered #customizePage -- a stale, now-detached node.
  // vocabCats[0] is just the name string, so it's still good as a lookup key
  // for querying the *current* live element fresh each time.
  const freshFirstVocabGroup = () => [...document.querySelectorAll("#customizePage .cz-group")].find(g => g.querySelector(".cz-group-name").textContent === vocabCats[0]);
  check("every row carries a drag handle -- a real button in the tab order, labelled with its position, for keyboard and screen-reader users too", (() => {
    const handles = [...foodGroup().querySelectorAll(".cz-row .cz-drag-handle")];
    return handles.length === 7 && handles.every((h, i) => h.tagName === "BUTTON" && h.tabIndex === 0 && !h.hasAttribute("aria-hidden")
      && new RegExp("^Reorder .+, " + (i + 1) + " of 7$").test(h.getAttribute("aria-label")));
  })());
  check("a multi-category section's header carries one too", !!freshFirstVocabGroup().querySelector(".cz-group-title .cz-drag-handle"));
  check("Grammar (single category in its section) has no category drag handle -- nothing to drag it against", (() => {
    const g = [...document.querySelectorAll("#customizePage .cz-group")].find(x => x.querySelector(".cz-group-name").textContent === "Grammar");
    return !g.querySelector(".cz-group-title .cz-drag-handle");
  })());
  check("clicking a category's handle (as a stray click after a drag might) doesn't also toggle its <details>", (() => {
    const g = freshFirstVocabGroup();
    g.open = false;
    g.querySelector(".cz-group-title .cz-drag-handle").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    return g.open === false;
  })());

  // getBoundingClientRect is always zeroed in jsdom, so a real drag needs its
  // own deterministic stand-in for the duration of one gesture -- every
  // sibling stacked rowHeight apart, in current DOM order, matching the flat
  // list dragTarget() reorders within.
  function withMockRects(list, rowHeight, fn) {
    const items = [...list.children];
    const originals = items.map(el => el.getBoundingClientRect);
    items.forEach((el, i) => {
      el.getBoundingClientRect = () => ({ top: i * rowHeight, bottom: (i + 1) * rowHeight, height: rowHeight, left: 0, right: 100, width: 100 });
    });
    try { fn(); } finally { items.forEach((el, i) => { el.getBoundingClientRect = originals[i]; }); }
  }
  function dragGesture(handle, fromY, toY, pointerId) {
    const base = { clientX: 10, pointerId, bubbles: true, cancelable: true };
    handle.dispatchEvent(new window.PointerEvent("pointerdown", Object.assign({}, base, { clientY: fromY })));
    document.dispatchEvent(new window.PointerEvent("pointermove", Object.assign({}, base, { clientY: toY })));
    document.dispatchEvent(new window.PointerEvent("pointerup", Object.assign({}, base, { clientY: toY })));
  }
  check("dragging the last row's handle to the top reorders it there, through the same tc().setTableOrder the arrow keys use", (() => {
    const rowsBefore = [...foodGroup().querySelectorAll(".cz-row")];
    const last = rowsBefore[rowsBefore.length - 1]; // Vegetables, A-Z last
    const handle = last.querySelector(".cz-drag-handle");
    withMockRects(foodGroup().querySelector(".cz-list"), 44, () => {
      dragGesture(handle, 6 * 44 + 22, 0, 101);
    });
    const idsAfter = [...foodGroup().querySelectorAll(".cz-row")].map(r => r.dataset.tableId);
    return idsAfter[0] === last.dataset.tableId
      && document.querySelector('#vocabulary .table-section[data-category="Food & Ingredients"]').dataset.table === last.dataset.tableId;
  })());
  check("dropping a handle back where it picked up is a no-op -- no needless re-render (the same row node is still in the document)", (() => {
    const row = foodGroup().querySelector(".cz-row");
    const handle = row.querySelector(".cz-drag-handle");
    withMockRects(foodGroup().querySelector(".cz-list"), 44, () => { dragGesture(handle, 22, 22, 102); });
    return document.contains(row);
  })());
  check("a second finger picking up a different handle mid-drag is ignored -- one drag at a time, so it can't orphan the first row mid-transform", (() => {
    const rows = [...foodGroup().querySelectorAll(".cz-row")];
    const [rowA, rowB] = rows;
    const handleA = rowA.querySelector(".cz-drag-handle");
    const handleB = rowB.querySelector(".cz-drag-handle");
    let secondIgnored;
    withMockRects(foodGroup().querySelector(".cz-list"), 44, () => {
      handleA.dispatchEvent(new window.PointerEvent("pointerdown", { clientX: 10, clientY: 22, pointerId: 201, bubbles: true, cancelable: true }));
      handleB.dispatchEvent(new window.PointerEvent("pointerdown", { clientX: 10, clientY: 66, pointerId: 202, bubbles: true, cancelable: true }));
      secondIgnored = !rowB.classList.contains("cz-dragging");
      document.dispatchEvent(new window.PointerEvent("pointerup", { clientX: 10, clientY: 22, pointerId: 201, bubbles: true, cancelable: true }));
    });
    return secondIgnored && !rowA.classList.contains("cz-dragging") && !rowB.classList.contains("cz-dragging");
  })());
  check("picking up an open category collapses it -- nothing to usefully drag past its neighbours while expanded, and it matches the closed state it lands in", (() => {
    const g = freshFirstVocabGroup();
    g.open = true;
    const handle = g.querySelector(".cz-group-title .cz-drag-handle");
    handle.dispatchEvent(new window.PointerEvent("pointerdown", { clientX: 10, clientY: 5, pointerId: 103, bubbles: true, cancelable: true }));
    const collapsedOnPickup = g.open === false;
    document.dispatchEvent(new window.PointerEvent("pointerup", { clientX: 10, clientY: 5, pointerId: 103, bubbles: true, cancelable: true }));
    return collapsedOnPickup;
  })());
  check("dragging a category's handle past a sibling reorders the section, through the same tc().setCategoryOrder the arrow keys use", (() => {
    const before = [...document.querySelectorAll("#customizePage .cz-groups > .cz-section-block")]
      .find(s => s.querySelector(".cz-section-label")?.textContent.includes("Vocabulary"))
      .querySelector(".cz-section-body");
    const names = [...before.children].map(g => g.dataset.category);
    const last = before.children[before.children.length - 1];
    const handle = last.querySelector(".cz-drag-handle");
    withMockRects(before, 40, () => { dragGesture(handle, (names.length - 1) * 40 + 20, 0, 104); });
    const section = document.querySelector("#customizePage .cz-groups > .cz-section-block:has(.cz-section-label)").querySelector(".cz-section-body");
    return section.children[0].dataset.category === last.dataset.category;
  })());
  if (window.RaumeStudy.tableCustom.hasCustomOrder()) window.RaumeStudy.tableCustom.resetOrder();

  console.log("Hiding a whole table from the reference");
  document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();
  const hideTc = window.RaumeStudy.tableCustom;
  const hideSec = [...document.querySelectorAll('#vocabulary .table-section[data-section="vocabulary"]')].find(s => s.querySelector(".hide-table-btn"));
  const hideId = hideSec.dataset.table;
  const hideCat = hideSec.dataset.category;
  const catCountBefore = Number(document.querySelector('#vocabulary .cat-heading[data-category="' + hideCat + '"] .cat-heading-count').textContent);
  hideSec.querySelector(".section-menu-btn").click();
  hideSec.querySelector(".hide-table-btn").click();
  check("the table's ⋯ menu has Hide table, and it hides the table (stored with the other table customisations)",
    hideTc.isHidden(hideId) && hideSec.classList.contains("user-hidden") && window.getComputedStyle(hideSec).display === "none");
  check("...parked after every visible table, so it never splits a group's rounded card",
    [...document.querySelectorAll("#vocabulary .table-section")].pop() === hideSec);
  check("...dropped from the Tables directory", !document.querySelector('#tindexMenu a[data-target="' + hideId + '"]'));
  check("...and its category heading counts one table fewer",
    Number(document.querySelector('#vocabulary .cat-heading[data-category="' + hideCat + '"] .cat-heading-count').textContent) === catCountBefore - 1);
  check("...and it never turns up in search results", (() => {
    const input = document.getElementById("tableSearch");
    const word = hideSec.querySelector("tbody tr td.en, tbody tr td:last-child").textContent.trim().split(/\s+/)[0];
    input.value = word;
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    const found = hideSec.querySelectorAll("tbody tr:not(.search-hidden)").length;
    input.value = "";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    return found === 0;
  })());
  document.getElementById("customizeToggle").click();
  check("Customize lists it as hidden, with a Show button in place of Hide", (() => {
    const row = document.querySelector('#customizePage .cz-row[data-table-id="' + hideId + '"]');
    return row.classList.contains("cz-row-hidden") && row.querySelector(".cz-row-vis").textContent === "Show";
  })());
  document.querySelector('#customizePage .cz-row[data-table-id="' + hideId + '"] .cz-row-vis').click();
  check("Show brings it back: no longer hidden, back in the directory, and the stored record is cleaned up",
    !hideTc.isHidden(hideId) && !hideSec.classList.contains("user-hidden")
    && !!document.querySelector('#tindexMenu a[data-target="' + hideId + '"]') && !hideTc.getAll()[hideId]);
  check("Reset on Customize leaves a hidden table hidden (it only resets name / icon / colour)", (() => {
    hideTc.setHidden(hideId, true); hideTc.setName(hideId, "Tmp"); hideTc.clear(hideId);
    const ok = hideTc.isHidden(hideId) && !hideTc.nameOf(hideId);
    hideTc.setHidden(hideId, false);
    return ok && !hideTc.getAll()[hideId];
  })());
  // Leaves the Customize page open, as the Custom vocabulary checks below expect.

  console.log("Custom vocabulary (your own rows / tables)");
  const cvNs = window.RaumeStudy.customVocab;
  check("RaumeStudy.customVocab is published", !!cvNs && typeof cvNs.parseFurigana === "function");
  {
    const seg = s => { const r = cvNs.parseFurigana(s); return r.error ? "ERR" : r.segments; };
    const kaeru = seg("帰(かえ)る");
    check("parseFurigana splits a kanji run + its kana tail", Array.isArray(kaeru) && kaeru.length === 2
      && kaeru[0].kanji === "帰" && kaeru[0].reading === "かえ" && kaeru[1].text === "る");
    const ocha = seg("お茶(ちゃ)");
    check("...leading kana becomes its own text segment", Array.isArray(ocha) && ocha.length === 2
      && ocha[0].text === "お" && ocha[1].kanji === "茶");
    const goma = seg("ごま油(あぶら)");
    check("...only the kanji before the ( ) carries the reading", Array.isArray(goma)
      && goma[0].text === "ごま" && goma[1].kanji === "油" && goma[1].reading === "あぶら");
    check("...a multi-kanji run with one reading stays one segment", (() => {
      const r = seg("醤油(しょうゆ)"); return Array.isArray(r) && r.length === 1 && r[0].kanji === "醤油";
    })());
    check("...a kana-only word needs no parentheses", (() => {
      const r = seg("ビール"); return Array.isArray(r) && r.length === 1 && r[0].text === "ビール";
    })());
    check("...a kanji with no reading is rejected", cvNs.parseFurigana("帰る").error != null);
    check("...text with no Japanese is rejected", cvNs.parseFurigana("hello").error != null);
  }
  {
    const res = cvNs.parseImport([
      "japanese,romaji,english",
      "人参(にんじん),ninjin,carrot",
      "broken row",
      "大根,daikon,radish",
      'すし,sushi,"sushi, the rice dish"'
    ].join("\n"));
    check("parseImport keeps the good rows and skips the bad", res.rows.length === 2 && res.skipped.length === 2);
    check("...the header line is dropped silently", !res.skipped.some(s => /japanese/i.test(s.raw)));
    check("...each skip carries a line number and a reason", res.skipped.every(s => s.line > 0 && s.reason));
    check("...an English value with a comma survives intact", res.rows.some(r => r.english === "sushi, the rice dish"));
  }
  {
    const vegTable = window.RaumeStudy.data.vocabularyTables.find(t => t.title === "Vegetables");
    const before = vegTable.rows.length;
    const parsed = cvNs.parseImport("茄子(なす),nasu,eggplant").rows[0];
    const made = cvNs.addRow(String(vegTable.id), parsed);
    check("addRow merges a custom row into the built-in table", vegTable.rows.length === before + 1
      && /^cv-/.test(made.id) && vegTable.rows.some(r => r.id === made.id && r.__custom));
    const idx = window.RaumeStudy.flashcards.vocabIndex.getVocabIndex();
    const entry = idx[made.id];
    check("...the flashcards index picks it up with all four directions", !!entry
      && window.RaumeStudy.flashcards.vocabIndex.directionsForEntry(entry).length === 4);
    check("...answer checking accepts the romaji and the English", !!entry
      && window.RaumeStudy.flashcards.vocabIndex.checkAnswer(entry, "jp-ro", "nasu")
      && window.RaumeStudy.flashcards.vocabIndex.checkAnswer(entry, "jp-en", "eggplant"));
    check("a kanji gets two cards -- meaning and a reading, from the bare character (no furigana to give the reading away); any one reading counts", (() => {
      const vi = window.RaumeStudy.flashcards.vocabIndex;
      const k = Object.values(idx).find(e => e.kanji && e.jpPlain === "山");
      return !!k && vi.directionsForEntry(k).join(",") === "jp-en,jp-ro" && !/<ruby/.test(k.jpHtml)
        && vi.checkAnswer(k, "jp-ro", "yama") && vi.checkAnswer(k, "jp-ro", "san") && vi.checkAnswer(k, "jp-en", "mountain");
    })());
    check("...it renders on the vocabulary page with real furigana", (() => {
      const tr = document.querySelector('#vocabulary tr[data-vocab-id="' + made.id + '"]');
      return !!tr && !!tr.querySelector("ruby rt") && /eggplant/.test(tr.textContent);
    })());
    const delBtn = () => document.querySelector('#customizePage .cv-del-row[data-row="' + made.id + '"]');
    check("deleting your own word asks first with the iOS action sheet, not the browser's confirm -- Cancel keeps it", (() => {
      if (!delBtn()) return false;
      delBtn().click();
      const sheet = document.querySelector(".ios-confirm");
      const ok = !!sheet && /Delete this word\?/.test(sheet.textContent) && document.getElementById("iosConfirmGo").textContent === "Delete Word"
        && document.activeElement === document.getElementById("iosConfirmCancel");
      document.getElementById("iosConfirmCancel").click();
      return ok && !document.querySelector(".ios-confirm") && vegTable.rows.some(r => r.id === made.id);
    })());
    if (delBtn()) { delBtn().click(); document.getElementById("iosConfirmGo").click(); } else cvNs.deleteRow(made.id);
    check("Delete Word removes it again, restoring the dataset", vegTable.rows.length === before
      && !window.RaumeStudy.flashcards.vocabIndex.getVocabIndex()[made.id]);
  }
  check("the Customize page has a Your vocabulary block", !!document.querySelector("#customizePage .cv-section"));
  check("...a guest sees no New table card (accounts only)", (() => {
    const heads = [...document.querySelectorAll("#customizePage .cv-card h3, #customizePage .cv-card-summary")]
      .map(h => h.firstChild ? h.firstChild.textContent : h.textContent);
    return heads.includes("Add a word") && heads.includes("Import a list") && !heads.includes("New table");
  })());

  gear.click();
  check("clicking the gear again returns to the vocabulary view", document.getElementById("vocabPage").hidden === false && document.getElementById("customizePage").hidden === true);

  console.log("Help page (how this works)");
  const helpBtn = document.getElementById("helpToggle");
  check("the masthead has a help button", !!helpBtn);
  check("the Help page starts hidden", document.getElementById("helpPage").hidden === true);
  helpBtn.click();
  check("clicking it reveals the Help page and hides the reference", document.getElementById("helpPage").hidden === false && document.getElementById("vocabPage").hidden === true);
  check("Help is a short menu of four topic rows, each closed until tapped", (() => {
    const g = [...document.querySelectorAll("#helpPage .help-group")];
    return g.length === 4 && g.every(d => !d.open && !!d.querySelector("summary h3") && !!d.querySelector(".help-sub") && d.querySelectorAll("li").length >= 3);
  })());
  check("it ends with the Ko-fi support link, opening in a new tab", (() => { const a = document.querySelector("#helpPage .help-support"); return !!a && a.href === "https://ko-fi.com/raume" && a.target === "_blank"; })());
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
  check("clicking it reveals the Practice page, and the URL says #practice", document.getElementById("flashcardsPage").hidden === false && window.location.hash === "#practice");
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
  check("an old #flashcards link still opens Practice", (() => {
    window.location.hash = "#flashcards";
    window.dispatchEvent(new window.Event("popstate"));
    const ok = document.getElementById("flashcardsPage").hidden === false;
    document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();
    return ok;
  })());

  console.log("Flashcards: per-row add toggle appears only while searching");
  const drinksSectionFc = document.querySelector('.table-section[data-table="2"]');
  const firstRowFc = drinksSectionFc.querySelector("tbody tr");
  check("every rendered row carries its permanent vocab id", /^v\d{4,}$/.test(firstRowFc.dataset.vocabId));
  // The permanent per-row icon was removed as clutter (Manage owns bulk
  // add/remove); it's back only as a search-result affordance, hidden at rest.
  const rowToggle = firstRowFc.querySelector(".fc-toggle-btn");
  check("each row has an add toggle keyed to its vocab id, in the row-action cluster before the hide button", !!rowToggle && rowToggle.dataset.vocabId === firstRowFc.dataset.vocabId
    && [...firstRowFc.querySelector(".row-actions").children].map(c => c.className.split(" ")[0]).join(",") === "fc-toggle-btn,row-hide-btn");
  check("...hidden while nothing is being searched", window.getComputedStyle(rowToggle).display === "none");
  const searchBox = document.getElementById("tableSearch");
  searchBox.value = "cooking oil";
  searchBox.dispatchEvent(new window.Event("input", { bubbles: true }));
  const shownToggle = [...document.querySelectorAll('#vocabulary tbody tr:not(.search-hidden) .fc-toggle-btn')][0];
  check("...and shown on the rows a search matches", !!shownToggle && document.body.classList.contains("is-searching") && window.getComputedStyle(shownToggle).display !== "none");
  searchBox.value = "";
  searchBox.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("...hidden again once the search is cleared", !document.body.classList.contains("is-searching") && window.getComputedStyle(rowToggle).display === "none");

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
  check("with sign-ups off (config.allowSignups false) the form offers Sign in only -- no Sign up link that would just error", (() => {
    // The page is seeded unconfigured (no auth form at all), so point it at a
    // placeholder project just long enough to render the form -- rendering
    // never touches the network.
    const cfg = window.RaumeStudy.config;
    cfg.url = "https://example.invalid"; cfg.anonKey = "test";
    cfg.allowSignups = false;
    window.RaumeStudy.flashcards.render();
    const off = !document.getElementById("fcAuthSwitch") && !!document.getElementById("fcEmail");
    cfg.allowSignups = true;
    window.RaumeStudy.flashcards.render();
    const on = !!document.getElementById("fcAuthSwitch");
    cfg.url = ""; cfg.anonKey = ""; delete cfg.allowSignups;
    window.RaumeStudy.flashcards.render();
    return off && on;
  })());
  const guestBtn = document.getElementById("fcUseGuest");
  check("a \"Continue without an account\" option is offered alongside signing in", !!guestBtn);
  // Neither entry button is a filled primary -- the tinted "This device only"
  // card is the only nudge, so two dark buttons don't compete. (The sign-in
  // form's own button only renders with Supabase configured; checked in-browser.)
  check("the guest button is a quiet button, not a filled primary", guestBtn.classList.contains("fc-btn") && !guestBtn.classList.contains("fc-btn-primary"));
  guestBtn.click();
  check("choosing it goes straight to the Dashboard tab, no session needed", !!document.querySelector("#fcPanelDashboard"));
  check("the account menu labels it on-device, not signed in", document.getElementById("accountMenuStatus").textContent.includes("This device only"));
  const starterCards = Object.values(window.RaumeStudy.flashcards.store.getCache().cards);
  const fruitIds = window.RaumeStudy.data.vocabularyTables.find(t => t.id === 3).rows.map(r => r.id);
  check("a first-time guest starts with the Fruits table added, not an empty deck",
    starterCards.length > 0 && starterCards.every(c => fruitIds.includes(c.vocabId))
    && fruitIds.every(id => starterCards.some(c => c.vocabId === id)));
  check("...and only into a deck that has never held a card", window.RaumeStudy.flashcards.dataOps.seedGuestStarter() === false);
  // Clear the starter set so the checks below start from a pristine deck.
  starterCards.forEach(c => { delete window.RaumeStudy.flashcards.store.getCache().cards[c.id]; });
  window.RaumeStudy.flashcards.store.saveCache();
  window.RaumeStudy.flashcards.render();

  // The vocabulary page's own "Add to flashcards" (table-options kebab) used
  // to call addVocabsRemote/fetchAllFromServer unconditionally, so it threw
  // "Cannot read properties of null (reading 'id')" for every guest -- the
  // one mode that button is reachable from without ever signing in. Manage's
  // "Add table" (tested below) took the correct addVocabs/refreshData path
  // all along, which is why this regressed unnoticed.
  console.log("Flashcards: the vocabulary page's own \"Add to flashcards\" works in guest mode too");
  document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').click();
  const kebabTable = document.querySelector('.table-section[data-table="2"]');
  kebabTable.querySelector(".section-menu-btn").click();
  kebabTable.querySelector(".fc-add-table-btn").click();
  await flush();
  const cacheAfterKebabAdd = window.RaumeStudy.flashcards.store.getCache();
  const kebabAddedIds = Object.keys(cacheAfterKebabAdd.cards);
  check("it adds cards with no thrown error, not just from Manage's \"Add table\"", kebabAddedIds.length > 0);
  // Wipe those cards back out directly -- archiveVocabs would leave an
  // "archived" record behind, a different state from "never added" that the
  // Manage-page checks just below rely on staying pristine.
  kebabAddedIds.forEach((id) => { delete cacheAfterKebabAdd.cards[id]; });
  window.RaumeStudy.flashcards.store.saveCache();
  window.RaumeStudy.flashcards.render(); // the add's own rerender left the (hidden) dashboard populated
  document.querySelector('#siteNav .site-nav-link[data-page="flashcards"]').click();

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
  // The "what's pending?" detail list: pendingItems() itemises the same
  // sources getSyncState() counts (guest mode has nothing to sync, so it's
  // always empty there -- the itemised version can't be exercised against a
  // real account without Supabase, same limit as the rest of this file).
  check("pendingItems is exported and empty in guest mode", (() => {
    const pendingItems = window.RaumeStudy.flashcards.dataOps.pendingItems;
    return typeof pendingItems === "function" && Array.isArray(pendingItems()) && pendingItems().length === 0;
  })());
  check("the sync detail list and its toggle are styled", (() => {
    const listRule = allCssRules.find(r => r.selectorText === ".fc-sync-detail");
    const toggleRule = allCssRules.find(r => r.selectorText === ".fc-sync-details-toggle");
    return !!listRule && !!toggleRule;
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
  check("tapping Add shows it at once -- the button reads Adding… and disables while the change is saved",
    firstAddBtn.disabled === true && firstAddBtn.querySelector(".fc-btn-tx").textContent === "Adding…");
  await flush();
  document.querySelector('.fc-tab[data-tab="dashboard"]').click();
  const totalTileAfter = document.querySelector(".fc-stat-tile:nth-child(1) .fc-stat-value").textContent;
  check("adding a word in guest mode updates the count with zero network calls", totalTileAfter === "4");
  if (storageUsable) check("its data actually lives in localStorage (not just in-memory)", /"active":true/.test(readLocalStorage("raume-flashcards-guest-v1") || ""));

  console.log("Flashcards: guest-mode backup & restore");
  const backupApi = window.RaumeStudy.flashcards.backup;
  check("backup is offered in guest mode", !!backupApi && backupApi.available() === true);
  const liveCardCount = Object.keys(window.RaumeStudy.flashcards.store.getCache().cards).length;
  const builtBackup = backupApi.buildBackup();
  check("a backup carries its format + version and the guest flashcards, with no account or sync queue", builtBackup.format === "raume-backup" && builtBackup.version === 1
    && Object.keys(builtBackup.data.flashcards.cards).length === liveCardCount && builtBackup.data.flashcards.userId === null && builtBackup.data.flashcards.logsOutbox.length === 0);
  check("it names the file by date", /^raume-backup-\d{4}-\d{2}-\d{2}\.json$/.test(backupApi.fileName()));
  const parsedBackup = backupApi.parseBackup(JSON.stringify(builtBackup));
  check("a backup round-trips through parse, with a summary a confirm can show", parsedBackup.ok && parsedBackup.summary.cards === liveCardCount && parsedBackup.summary.words >= 1);
  const badFile = (obj) => backupApi.parseBackup(typeof obj === "string" ? obj : JSON.stringify(obj));
  check("a file that isn't JSON is refused", badFile("not json {").ok === false);
  check("JSON that isn't a raume backup is refused", badFile({ hello: "world" }).ok === false && badFile([1, 2]).ok === false);
  check("a backup from a newer version is refused with a hint to reload", (() => { const r = badFile(Object.assign({}, builtBackup, { version: 99 })); return r.ok === false && /newer version/.test(r.error); })());
  check("a damaged flashcards section is refused rather than half-restored", badFile(Object.assign({}, builtBackup, { data: Object.assign({}, builtBackup.data, { flashcards: { nope: 1 } }) })).ok === false);
  check("invalid card records inside a section are dropped, valid ones kept", (() => {
    const tampered = JSON.parse(JSON.stringify(builtBackup));
    const firstId = Object.keys(tampered.data.flashcards.cards)[0];
    tampered.data.flashcards.cards[firstId] = { id: 5 };
    const r = backupApi.parseBackup(JSON.stringify(tampered));
    return r.ok && r.summary.cards === liveCardCount - 1;
  })());
  // Applying writes localStorage, which file:// jsdom won't allow -- swap in a
  // tiny in-memory Storage for just this block, then put the real one back.
  const realStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
  const fakeMem = {};
  let failOnWriteNo = 0, writes = 0;
  const fakeStorage = {
    getItem: (k) => (k in fakeMem ? fakeMem[k] : null),
    setItem: (k, v) => { writes++; if (failOnWriteNo && writes === failOnWriteNo) throw new Error("quota"); fakeMem[k] = String(v); },
    removeItem: (k) => { delete fakeMem[k]; }
  };
  Object.defineProperty(window, "localStorage", { value: fakeStorage, configurable: true });
  try {
    fakeMem["raume-table-custom"] = JSON.stringify({ "1": { name: "Old" } });
    fakeMem["raume-flashcards-guest-v1"] = "OLD-FLASHCARDS";
    const applied = backupApi.applyBackup(parsedBackup.backup);
    check("applying a backup writes the guest flashcards + kana caches", applied.ok && Object.keys(JSON.parse(fakeMem["raume-flashcards-guest-v1"]).cards).length === liveCardCount && !!fakeMem["raume-kana-v1"]);
    check("...and clears a section the backup didn't have (restore replaces, it doesn't merge)", fakeMem["raume-table-custom"] === undefined);
    fakeMem["raume-table-custom"] = JSON.stringify({ "1": { name: "Old" } });
    fakeMem["raume-flashcards-guest-v1"] = "OLD-FLASHCARDS";
    writes = 0; failOnWriteNo = 2; // fail on the second write (the kana cache)
    const failed = backupApi.applyBackup(parsedBackup.backup);
    check("a write that fails part-way rolls every section back and says nothing was changed", failed.ok === false && /Nothing was changed/.test(failed.error)
      && fakeMem["raume-flashcards-guest-v1"] === "OLD-FLASHCARDS" && fakeMem["raume-table-custom"] === JSON.stringify({ "1": { name: "Old" } }));
    failOnWriteNo = 0;
    const withExtras = JSON.parse(JSON.stringify(builtBackup));
    withExtras.data.knownKanji = { v0901: { k: 1, t: 1 }, v0902: { k: 0, t: 2 }, junk: 5 };
    withExtras.data.puzzleRuns = [{ id: "a", at: "2026-09-01T00:00:00Z", mode: "match", n: 10, ms: 20000, miss: 1 }, { id: "b" }];
    const px = backupApi.parseBackup(JSON.stringify(withExtras));
    backupApi.applyBackup(px.backup);
    check("a backup carries Known kanji and puzzle games, cleaned, and counts them",
      px.ok && px.summary.knownKanji === 1 && px.summary.puzzleGames === 1
      && Object.keys(JSON.parse(fakeMem["raume-kanji-known"])).length === 2 && JSON.parse(fakeMem["raume-puzzle-runs"]).length === 1);
    fakeMem["raume-kanji-known"] = "KEEP";
    const older = JSON.parse(JSON.stringify(builtBackup));
    delete older.data.knownKanji; delete older.data.puzzleRuns;
    backupApi.applyBackup(backupApi.parseBackup(JSON.stringify(older)).backup);
    check("...and a backup from before them leaves the device's own untouched", fakeMem["raume-kanji-known"] === "KEEP");
  } finally {
    if (realStorage) Object.defineProperty(window, "localStorage", realStorage); else delete window.localStorage;
  }
  // Settings and Help open like a pushed screen from the title bar; Back
  // returns to the segment you came from.
  const fcOpenPushed = t => {
    const back = document.getElementById("fcBack");
    if (back) back.click();
    document.querySelector('#flashcardsPage .fc-titlebar-btn[data-tab="' + t + '"]').click();
  };
  check("the Flashcards sub-tabs are five segments -- Settings and Help moved to the title bar",
    [...document.querySelectorAll("#flashcardsPage .fc-tab")].map(b => b.textContent).join("|") === "Dashboard|Kana|Puzzles|Games|Library"
    && [...document.querySelectorAll("#flashcardsPage .fc-titlebar-btn")].map(b => b.textContent).join("|") === "Settings|Help");
  document.querySelector('.fc-tab[data-tab="manage"]').click();
  fcOpenPushed("settings");
  check("Settings opens as a pushed screen: its own title, a Back button, no segmented control",
    document.querySelector("#flashcardsPage .fc-titlebar h1").textContent === "Settings"
    && !!document.getElementById("fcBack") && !document.querySelector("#flashcardsPage .fc-tabs"));
  check("Settings offers Download backup / Restore in guest mode", !!document.getElementById("fcBackupExport") && !!document.getElementById("fcBackupImport") && !!document.getElementById("fcBackupFile"));
  {
    const fileInput = document.getElementById("fcBackupFile");
    const cardsBefore = JSON.stringify(window.RaumeStudy.flashcards.store.getCache().cards);
    Object.defineProperty(fileInput, "files", { configurable: true, value: [{ text: () => Promise.resolve(JSON.stringify(builtBackup)) }] });
    fileInput.dispatchEvent(new window.Event("change"));
    await flush();
    check("choosing a backup asks with the iOS action sheet (what it holds, a red Restore) -- Cancel changes nothing", (() => {
      const sheet = document.querySelector(".ios-confirm");
      const ok = !!sheet && /Restore the backup/.test(sheet.querySelector(".ios-confirm-title").textContent) && /It holds/.test(sheet.textContent)
        && document.getElementById("iosConfirmGo").textContent === "Restore";
      if (sheet) document.getElementById("iosConfirmCancel").click();
      return ok && !document.querySelector(".ios-confirm") && JSON.stringify(window.RaumeStudy.flashcards.store.getCache().cards) === cardsBefore;
    })());
    delete fileInput.files;
  }
  document.getElementById("fcBack").click();
  check("Back returns to the segment you came from", document.querySelector("#flashcardsPage .fc-tab.active").dataset.tab === "manage");
  document.querySelector('.fc-tab[data-tab="dashboard"]').click();

  await flush(); // let the async weekly-activity load resolve and re-render
  check("the card-progress breakdown labels all three states", (() => {
    const legend = document.querySelector("#fcPanelDashboard .fc-breakdown-legend");
    return legend && /New/.test(legend.textContent) && /Learning/.test(legend.textContent) && /Review/.test(legend.textContent);
  })());
  check("reviews this week: with no reviews it's one line, not an empty chart; otherwise today's column (only) is marked", (() => {
    const cols = document.querySelectorAll("#fcPanelDashboard .fc-week-col");
    if (document.querySelector("#fcPanelDashboard .fc-week-none")) return cols.length === 0;
    if (cols.length !== 7) return false;
    return cols[6].classList.contains("fc-week-col-today")
      && [...cols].slice(0, 6).every(c => !c.classList.contains("fc-week-col-today"));
  })());
  check("the dashboard has a Due next 7 days card; with only new cards it says nothing is scheduled instead of drawing a flat chart", (() => {
    const card = [...document.querySelectorAll("#fcPanelDashboard .fc-viz-card")].find(c => /Due next 7 days/.test(c.textContent));
    return !!card && !!card.querySelector(".fc-due-none") && !card.querySelector(".fc-due-chart");
  })());
  check("due forecast buckets cards by day: overdue folds into Today, later days and beyond 7 days are counted apart", (() => {
    const dash = window.RaumeStudy.flashcards.dashboard;
    const cards = window.RaumeStudy.flashcards.scheduling.studyableCards().slice(0, 4);
    if (cards.length < 4) return false;
    const saved = cards.map(c => ({ state: c.state, due: c.due }));
    const at = (daysAhead) => { const d = new Date(); d.setDate(d.getDate() + daysAhead); d.setHours(12, 0, 0, 0); return d.toISOString(); };
    try {
      cards[0].state = 2; cards[0].due = at(-3);  // overdue -> Today
      cards[1].state = 2; cards[1].due = at(0);   // due today
      cards[2].state = 2; cards[2].due = at(2);   // two days out
      cards[3].state = 2; cards[3].due = at(30);  // beyond the window
      const f = dash.dueForecast(new Date());
      const chartHtml = (() => { window.RaumeStudy.flashcards.render(); return document.querySelector("#fcPanelDashboard .fc-due-chart"); })();
      return f.days.length === 7 && f.days[0].label === "Today" && f.days[0].count === 2 && f.days[2].count === 1 && f.total === 3 && f.later === 1
        && !!chartHtml && chartHtml.querySelectorAll(".fc-due-col").length === 7 && chartHtml.querySelector(".fc-due-col-today") === chartHtml.querySelector(".fc-due-col")
        && /1 more is due after that/.test(chartHtml.parentElement.textContent);
    } finally {
      cards.forEach((c, i) => { c.state = saved[i].state; c.due = saved[i].due; });
      window.RaumeStudy.flashcards.render();
    }
  })());

  console.log("Flashcards: Leeches (words that keep lapsing)");
  {
    const fcNs = window.RaumeStudy.flashcards;
    const sched = fcNs.scheduling;
    const leechCard = () => [...document.querySelectorAll("#fcPanelDashboard .fc-leech-card")][0];
    const word = sched.studyableCards()[0];
    const wordCards = () => Object.values(fcNs.store.getCache().cards).filter(c => c.vocabId === word.vocabId);
    const saved = wordCards().map(c => ({ c, lapses: c.lapses, active: c.active }));
    const restore = () => {
      saved.forEach(s => { s.c.lapses = s.lapses; s.c.active = s.active; });
      fcNs.store.unkeepLeech(word.vocabId);
      fcNs.store.saveCache();
      fcNs.render();
    };
    try {
      check("no leech card while nothing has lapsed much", sched.leechWords().length === 0 && !leechCard());
      word.lapses = sched.LEECH_LAPSES - 1;
      check("one lapse under the threshold is not a leech", sched.leechWords().length === 0);
      word.lapses = sched.LEECH_LAPSES;
      fcNs.render();
      const flagged = sched.leechWords();
      check("a card at the threshold flags its word, with that card's count", flagged.length === 1 && flagged[0].vocabId === word.vocabId && flagged[0].lapses === sched.LEECH_LAPSES);
      check("the Leeches card lists it with the count and offers Pause and Keep", (() => {
        const card = leechCard();
        return !!card && /Forgotten 8×/.test(card.textContent)
          && !!card.querySelector('[data-leech-pause="' + word.vocabId + '"]') && !!card.querySelector('[data-leech-keep="' + word.vocabId + '"]');
      })());
      check("Manage marks the same word with a Leech tag", (() => {
        document.querySelector('.fc-tab[data-tab="manage"]').click();
        const tagged = document.querySelectorAll("#fcPanelManage .fc-tag-leech").length;
        document.querySelector('.fc-tab[data-tab="dashboard"]').click();
        return tagged >= 1;
      })());
      document.querySelector("[data-leech-keep]").click();
      await flush();
      check("Keep clears the flag but changes nothing about the word", sched.leechWords().length === 0 && !leechCard() && word.active === true && word.lapses === sched.LEECH_LAPSES);
      check("Keep is recorded in the cache itself (so it syncs to the account and is in a backup), at the word's lapse count", fcNs.store.getCache().leechKept[word.vocabId] === sched.LEECH_LAPSES);
      check("merging kept-maps takes the higher lapse count per word and drops junk", (() => {
        const m = fcNs.store.mergeLeechKept({ a: 9, b: 12, bad: "x" }, { a: 13, b: 8, c: -1, e: 10 });
        return JSON.stringify(Object.keys(m).sort().map(k => [k, m[k]])) === JSON.stringify([["a", 13], ["b", 12], ["e", 10]]);
      })());
      check("a kept word survives the cache validator (a reload / restore), and junk in that field is cleaned", (() => {
        const raw = JSON.parse(JSON.stringify(fcNs.store.getCache()));
        const ok = fcNs.store.validateCache(raw);
        raw.leechKept = { keep: 9, junk: "nope" };
        const cleaned = fcNs.store.validateCache(raw);
        return !!ok && ok.leechKept[word.vocabId] === sched.LEECH_LAPSES && !!cleaned && cleaned.leechKept.keep === 9 && !("junk" in cleaned.leechKept);
      })());
      word.lapses = sched.LEECH_LAPSES + 3;
      check("a kept word stays quiet through a few more lapses...", sched.leechWords().length === 0);
      word.lapses = sched.LEECH_LAPSES + 4;
      check("...and is flagged again after another four", sched.leechWords().length === 1);
      fcNs.render();
      document.querySelector("[data-leech-pause]").click();
      await flush();
      check("Pause archives the word's cards but keeps their lapse history", wordCards().every(c => c.active === false) && word.lapses === sched.LEECH_LAPSES + 4);
      check("a paused word is no longer a leech and the card is gone", sched.leechWords().length === 0 && !leechCard());
    } finally {
      restore();
    }
    await flush(); // Pause invalidated the cached insights -- let them reload before the next section reads the dashboard
  }

  console.log("Flashcards: Dashboard with cards but no review history");
  {
    const dash = document.querySelector("#fcPanelDashboard").textContent;
    check("a zero-review week says so, not just a bare axis", /No reviews yet this week/.test(dash));
    check("'Missed today' and 'Words to Review' fold into one line until there's history",
      !document.getElementById("fcWordsToReview") && !/Missed today/.test(dash)
      && /Words to review/.test(dash) && /Nothing to review yet/.test(dash));
    check("the rings card always carries its line beside Study now", (() => {
      const line = document.querySelector("#fcPanelDashboard .fc-now-row .fc-rings-line");
      return !!line && line.textContent.trim().length > 0;
    })());
    check("Estimated retention spells out its pending state, not a bare \"—\"", (() => {
      const tile = [...document.querySelectorAll("#fcPanelDashboard .fc-stat-tile")]
        .find(t => /Estimated retention/.test(t.querySelector(".fc-stat-label").textContent));
      const val = tile && tile.querySelector(".fc-stat-value").textContent;
      return tile && tile.classList.contains("fc-stat-tile-pending") && val !== "—" && /reviews/i.test(val);
    })());
    check("the streak is its own strip -- the number, this week as seven days with today marked -- and the stat row keeps three plain tiles", (() => {
      const strip = document.querySelector("#fcPanelDashboard .fc-dash-streak");
      const tiles = [...document.querySelectorAll("#fcPanelDashboard .fc-dash-stats .fc-stat-tile")];
      return !!strip && /^\d+$/.test(strip.querySelector(".fc-streak-num").textContent) && /day streak/.test(strip.textContent)
        && strip.querySelectorAll(".fc-streak-day").length === 7 && strip.querySelectorAll(".fc-streak-is-today").length === 1
        && tiles.length === 3 && !tiles.some(t => /Day streak/.test(t.textContent))
        && !tiles.some(t => t.classList.contains("fc-stat-attention"));
    })());
    check("the dashboard is capped, not run to the full sheet -- a 2-up row shouldn't balloon", (() => {
      const rule = allCssRules.find(r => r.selectorText === "#fcPanelDashboard");
      return !!rule && parseInt(rule.style.maxWidth, 10) > 0;
    })());
    check("the stat tiles and the viz cards share one 12-col grid past 620px, so their seams line up", (() => {
      const media = allCssRules.find(r => r.media && /min-width:\s*620px/.test(r.media.mediaText));
      if (!media) return false;
      const rules = [...media.cssRules];
      const cols = (cls) => {
        const r = rules.find(r => r.selectorText && r.selectorText.split(",").map(s => s.trim()).includes(cls));
        return r && r.style.gridTemplateColumns;
      };
      const grid12 = /repeat\(\s*12\s*,/;
      return grid12.test(cols(".fc-stats-grid") || "") && grid12.test(cols(".fc-viz-grid") || "");
    })());
    check("the right-now card is Today's rings -- Review, Learn, Play read out as one image, a legend beside them -- with Study now and what it holds on one row", (() => {
      const card = document.querySelector("#fcPanelDashboard .fc-dash-now");
      const svg = card && card.querySelector("svg.fc-rings[role=img]");
      const legend = card ? [...card.querySelectorAll(".fc-rings-legend li")].map(li => li.querySelector(".fc-rings-name").textContent) : [];
      const row = card && card.querySelector(".fc-now-row");
      return !!svg && /^Review .+, Learn \d+ of \d+, Play \d+ of 1$/.test(svg.getAttribute("aria-label"))
        && svg.querySelectorAll(".fc-ring").length === 3 && legend.join("|") === "Review|Learn|Play"
        && !!row.querySelector("#fcStudyNow") && /\d+ cards? to study/.test(row.querySelector(".fc-rings-line").textContent)
        && document.querySelectorAll("#fcPanelDashboard [style]").length === 0;
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
      && /^(Correct|Almost|Not quite)\./.test(al) && /Answer: .+\.$/.test(al);
  })());
  check("the reveal doesn't repeat the prompt -- the original above is still there", (() => {
    return document.querySelectorAll(".fc-review-card .fc-prompt-small").length === 0
      && document.querySelectorAll(".fc-review-card .fc-prompt").length === 1;
  })());
  check("the reveal shows one field of context (meaning/reading), not just the answer -- the reading sits under the word for Japanese -> English, the meaning line under the answer for the other three directions", (() => {
    const direction = (document.querySelector(".fc-review-progress") || {}).textContent || "";
    if (direction.indexOf("Japanese → English") === 0) {
      // ...unless the word is kana-only (レモン) -- then it is its own reading.
      const readingEl = document.querySelector(".fc-prompt-reading");
      const word = document.querySelector(".fc-review-card .fc-prompt").textContent.trim();
      if (/^[\u3040-\u30ff\s]+$/.test(word)) return !!readingEl && readingEl.hidden;
      return !!readingEl && !readingEl.hidden && readingEl.textContent.trim().length > 0;
    }
    const meaningEl = document.querySelector(".fc-stage-meaning");
    // A Japanese meaning line keeps its furigana, like Japanese everywhere else.
    const jpLine = meaningEl && meaningEl.querySelector('[lang="ja"]');
    if (jpLine && /[\u4e00-\u9faf]/.test(jpLine.textContent) && !jpLine.querySelector("ruby rt")) return false;
    return !!meaningEl && meaningEl.textContent.trim().length > 0;
  })());
  check("every long vowel can be typed doubled (aa ii uu ee oo, or ou) for its macron, and a wrong answer's letter marks treat them as the same sound", (() => {
    const vi = window.RaumeStudy.flashcards.vocabIndex;
    const cook = Object.values(vi.getVocabIndex()).find(e => e.romajiDisplay === "ryōri suru / ryōri shimasu");
    const fake = { romajiUsable: true, romajiAnswers: ["kādo", "ōkii", "sūji", "onēsan", "okāsan"].map(r => vi.normalizeAnswer(r, true)) };
    const accepted = ["kaado", "ookii", "suuji", "oneesan", "okaasan", "oukii"].every(t => fake.romajiAnswers.indexOf(vi.normalizeAnswer(t, true)) !== -1);
    const cmp = vi.answerCompareHtml(cook, "en-ro", "ryoori shimasi");
    return accepted && cmp.near && (cmp.youHtml.match(/<mark/g) || []).length === 1 && /<mark[^>]*>i<\/mark>$/.test(cmp.youHtml);
  })());
  check("a noun + suru verb accepts the optional を typed in (ryoori o shimasu / wo suru), and a plain verb doesn't take a stray o", (() => {
    const vi = window.RaumeStudy.flashcards.vocabIndex;
    const entries = Object.values(vi.getVocabIndex());
    const cook = entries.find(e => e.romajiDisplay === "ryōri suru / ryōri shimasu");
    const plain = entries.find(e => /^\S+ \/ \S+$/.test(e.romajiDisplay || "") && e.romajiUsable);
    return !!cook && !!plain
      && vi.checkAnswer(cook, "en-ro", "ryoori o shimasu") && vi.checkAnswer(cook, "en-ro", "ryōri wo suru")
      && vi.checkAnswer(cook, "en-ro", "ryouri shimasu")
      && !vi.checkAnswer(plain, "en-ro", "o " + plain.romajiDisplay.split(" / ")[0]);
  })());
  check("an English answer doesn't need its notes: parentheses and '...' are optional, the full wording still counts", (() => {
    const vi = window.RaumeStudy.flashcards.vocabIndex;
    const idx = vi.getVocabIndex();
    const dono = Object.values(idx).find(e => e.vocabId === "v0825");
    return !!dono && vi.checkAnswer(dono, "jp-en", "which") && vi.checkAnswer(dono, "jp-en", "which before a noun")
      && vi.checkAnswer(idx.v0509, "jp-en", "hot") && vi.checkAnswer(idx.v0509, "jp-en", "hot (weather)")
      && !vi.checkAnswer(idx.v0509, "jp-en", "weather");
  })());
  check("several right answers typed together count (grandfather, old man / yon / shi), and each reading of a two-reading word counts alone", (() => {
    const vi = window.RaumeStudy.flashcards.vocabIndex;
    const idx = vi.getVocabIndex();
    return vi.checkAnswer(idx.v0856, "jp-en", "grandfather, old man") && vi.checkAnswer(idx.v0856, "jp-en", "old man or grandfather")
      && !vi.checkAnswer(idx.v0856, "jp-en", "grandfather, cat")
      && vi.checkAnswer(idx.v0166, "jp-ro", "yon") && vi.checkAnswer(idx.v0166, "jp-ro", "shi") && vi.checkAnswer(idx.v0166, "jp-ro", "yon / shi")
      && vi.checkAnswer(idx.v0622, "jp-ro", "mainen");
  })());
  check("a meaning's note is its own field: shown under the English in the table, never required in an answer", (() => {
    const cell = document.querySelector('tr[data-vocab-id="v0825"] .meaning-text');
    const note = cell && cell.querySelector(".meaning-note");
    const vi = window.RaumeStudy.flashcards.vocabIndex;
    const e = vi.getVocabIndex().v0825;
    return !!note && note.textContent === "before a noun" && cell.firstChild.textContent.trim() === "which"
      && e.englishNote === "before a noun" && e.englishFull === "which (before a noun)"
      && vi.promptFor(e, "en-ro").note === "before a noun"
      && vi.checkAnswer(e, "jp-en", "which") && !vi.checkAnswer(e, "jp-en", "before a noun");
  })());
  check("a Romaji -> English card accepts any same-spelled word's meaning (atsui: 暑い / 熱い / 厚い), but no other direction does", (() => {
    const vi = window.RaumeStudy.flashcards.vocabIndex;
    const idx = vi.getVocabIndex();
    const weather = idx.v0509, touch = idx.v0318;
    return !!weather && !!touch && weather.homophoneIds.length === 2
      && vi.homophonesOf(weather).some(h => h === touch)
      && vi.checkAnswer(weather, "ro-en", "hot to the touch") && vi.checkAnswer(weather, "ro-en", "thick (flat things)")
      && !vi.checkAnswer(weather, "jp-en", "hot to the touch")
      && !vi.checkAnswer(weather, "ro-en", "cold (weather)")
      && idx.v0111.homophoneIds.length === 0;
  })());
  check("a session deals one card per word per round, reshuffling each round -- never the same word order twice in a row, never a word back to back", (() => {
    const sched = window.RaumeStudy.flashcards.scheduling;
    const cards = [];
    for (let w = 0; w < 6; w++) for (let d = 0; d < 4; d++) cards.push({ vocabId: "w" + w, d });
    let reordered = false;
    for (let run = 0; run < 20; run++) {
      const ids = sched.spaceByVocab(cards.slice()).map(c => c.vocabId);
      if (ids.length !== 24) return false;
      for (let i = 1; i < ids.length; i++) if (ids[i] === ids[i - 1]) return false;
      const rounds = [0, 6, 12, 18].map(i => ids.slice(i, i + 6));
      if (rounds.some(r => new Set(r).size !== 6)) return false;
      if (rounds.some((r, i) => i && r.join() !== rounds[i - 1].join())) reordered = true;
    }
    return reordered;
  })());
  check("the Japanese line on a Romaji/English-prompt reveal carries furigana, not plain kanji", (() => {
    const vi = window.RaumeStudy.flashcards.vocabIndex;
    const entry = Object.values(vi.getVocabIndex()).find(e => / \/ /.test(e.jpPlain) && /[\u4e00-\u9faf]/.test(e.jpPlain));
    const ctx = entry && vi.contextDisplayFor(entry, "ro-en");
    return !!ctx && ctx.value === entry.jpPlain && /<rt[ >]/.test(ctx.html);
  })());
  check("the verdict is an icon-only badge, not a text word -- feedback stays out of the way", (() => {
    const badge = document.querySelector(".fc-verdict-badge");
    // jsdom doesn't reliably resolve a var()-bearing computed style through a
    // shorthand property, so (as elsewhere in this file) check the declared
    // rule itself rather than getComputedStyle.
    const rule = allCssRules.find(r => r.selectorText === ".fc-verdict-badge");
    return !!badge && badge.textContent.trim() === "" && !!badge.querySelector("svg")
      && !!rule && parseFloat(rule.style.width) <= 30;
  })());
  check("every rating button carries the data-rating the tone-coding CSS keys off", (() => {
    const got = [...document.querySelectorAll('.fc-rating-btn')].map(b => b.dataset.rating);
    return JSON.stringify(got) === JSON.stringify(["again", "hard", "good", "easy"]);
  })());
  check("the rating row has no separate key-hint chip -- the label text itself carries the colour now", (() => {
    return document.querySelectorAll(".fc-rating-key").length === 0;
  })());
  check("what you typed shows as a quiet secondary line below the big answer, never struck through", (() => {
    const typedEl = document.querySelector(".fc-stage-typed");
    return !!typedEl && /you wrote/i.test(typedEl.textContent) && !typedEl.querySelector("s");
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
  check("ending mid-session shows a wrap-up, not a blank panel", /Session ended/.test(doneText));
  check("the wrap-up heading takes focus so it isn't lost to the body", (() => {
    const t = document.querySelector(".fc-session-done-title");
    return !!t && t.getAttribute("tabindex") === "-1";
  })());
  check("the wrap-up counts the card just reviewed: cards · % right · minutes", /1 card · \d+% right · \d+ min/.test(doneText));
  check("the wrap-up shows today's rings, a news card only with real news, and Keep going (cards left) before Done", (() => {
    const done = document.querySelector(".fc-session-done");
    const rows = [...done.querySelectorAll(".fc-done-news .set-row")].map(r => r.textContent);
    const btns = [...done.querySelectorAll(".fc-cta-row .fc-btn")];
    return !!done.querySelector("svg.fc-rings[role=img]") && rows.every(t => !/\b0\b/.test(t))
      && rows.every(t => / in a row$| mastered$|^New award: /.test(t))
      && btns.map(b => b.textContent).join("|") === "Keep going|Done" && btns[0].classList.contains("fc-btn-primary")
      && document.querySelectorAll(".fc-session-done [style]").length === 0;
  })());
  document.getElementById("fcBackToDashboard").click();
  check("Done leaves the session for the dashboard", !document.querySelector(".fc-session-done") && !!document.querySelector(".fc-stats-grid"));
  await flush(); // the dashboard's async insight + weekly-activity loads
  check("a review just done shows on the dashboard's rings and today's weekly bar", (() => {
    // Regression guard for the offline-history merge refactor: the review
    // computation (loadReviewInsights / loadWeeklyActivity) must still count a
    // review the moment it lands. Guest here; the signed-in outbox path adds to
    // the same computation and needs live verification. The card was new, so
    // it's the Learn ring that moves.
    const learn = [...document.querySelectorAll("#fcPanelDashboard .fc-rings-legend li")].find(li => /Learn/.test(li.textContent));
    const reviewed = parseInt(((learn && learn.querySelector(".fc-rings-val").textContent) || "").split("/")[0], 10) || 0;
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

  console.log("Flashcards: Today's rings count from a seeded deck");
  {
    const fcStore = window.RaumeStudy.flashcards.store;
    const fcSched = window.RaumeStudy.flashcards.scheduling;
    const c = fcStore.getCache();
    const saved = { settings: c.settings, day: c.day, cards: c.cards };
    const now = new Date();
    const far = new Date(now.getTime() + 30 * 86400000).toISOString();
    const card = (id, state, due) => ({ id, vocabId: "v0001", direction: "jp-en", active: true, state, due, stability: state ? 3 : 0, difficulty: 5,
      scheduled_days: 0, reps: state ? 2 : 0, lapses: 0, learning_steps: 0, last_review: state ? now.toISOString() : null });
    c.settings = Object.assign({}, c.settings, { queue_new_cards_per_day: 4 });
    c.cards = {};
    // Introduced today (f0), reviewed today (r0, r1), still due today (d0-d2), new (n0-n2).
    [card("f0", 1, now.toISOString()), card("r0", 2, far), card("r1", 2, far), card("d0", 2, now.toISOString()), card("d1", 2, now.toISOString()),
      card("d2", 2, now.toISOString()), card("n0", 0, now.toISOString()), card("n1", 0, now.toISOString()), card("n2", 0, now.toISOString())]
      .forEach(k => { c.cards[k.id] = k; });
    c.day = null;
    fcSched.bumpNewToday(now, "f0");
    fcSched.markReviewedToday(now, "r0"); fcSched.markReviewedToday(now, "r1"); fcSched.markReviewedToday(now, "r1");
    fcSched.markReviewedToday(now, "f0"); // a card met today and seen again is Learn's, not Review's
    fcStore.saveCache();
    window.RaumeStudy.flashcards.setActiveTab("dashboard");
    window.RaumeStudy.flashcards.render();
    const label = (document.querySelector("#fcPanelDashboard svg.fc-rings") || { getAttribute: () => "" }).getAttribute("aria-label");
    check("Review counts today's due cards cleared of all due today, Learn the new cards met of the day's allowance, Play today's finished games",
      /^Review 2 of 5, Learn 1 of 4, Play \d+ of 1$/.test(label));
    check("today's streak dot is half until the Review ring closes",
      !!document.querySelector("#fcPanelDashboard .fc-streak-is-today.fc-streak-today"));
    c.settings = saved.settings; c.day = saved.day; c.cards = saved.cards;
    fcStore.saveCache();
    window.RaumeStudy.flashcards.render();
  }

  console.log("Flashcards: the N5 journey -- level, awards, the Awards screen");
  {
    const F = window.RaumeStudy.flashcards;
    const fcStore = F.store;
    const c = fcStore.getCache();
    const saved = { cards: c.cards, journey: c.journey, settings: c.settings };
    const now = new Date();
    const far = new Date(now.getTime() + 40 * 86400000).toISOString();
    const vocabIds = [];
    window.RaumeStudy.data.vocabularyTables.forEach(t => t.rows.forEach(r => { if (r.id && vocabIds.length < 30) vocabIds.push(r.id); }));
    c.cards = {};
    vocabIds.forEach((v, i) => {
      c.cards["jr" + i] = { id: "jr" + i, vocabId: v, direction: "jp-en", active: true, state: 2, due: far,
        stability: i < 26 ? 30 : 4, difficulty: 5, scheduled_days: 30, reps: 4, lapses: 0, learning_steps: 0, last_review: now.toISOString() };
    });
    c.journey = fcStore.cleanJourney(null);
    c.settings = Object.assign({}, c.settings, { current_streak: 0, longest_streak: 0, last_study_date: null });
    fcStore.saveCache();
    F.setActiveTab("dashboard");
    F.render();
    const panel = document.getElementById("fcPanelDashboard");
    const journey = panel.querySelector(".fc-dash-stats.fc-journey");
    check("the journey card: Level 2 from 26 words mastered, 24 to the next, then Kana / Kanji / Words and the three tiles",
      !!journey && /^Level 2$/.test(journey.querySelector(".fc-journey-level").textContent)
      && /^24 words to Level 3$/.test(journey.querySelector(".fc-journey-next").textContent)
      && [...journey.querySelectorAll(".fc-journey-lbl")].map(l => l.textContent).join("|") === "Kana started|Kanji known|Words mastered"
      && /^26\/30$/.test(journey.querySelectorAll(".fc-journey-val")[2].textContent)
      && journey.querySelectorAll(".fc-stat-tile").length === 3);
    const today = fcStore.localDateStr(now);
    check("an award unlocks the day it's earned and is noted in the synced journey (25 words mastered; 100 reviews from 30 cards x 4 reps)",
      c.journey.awards["words-25"] === today && c.journey.awards["reviews-100"] === today
      && !c.journey.awards["words-100"] && Object.keys(c.journey.mastered).length === 26);
    const medals = [...panel.querySelectorAll(".fc-dash-awards .fc-award")];
    check("the Dashboard shows six medals, earned first (filled), then the nearest locked with their progress ring and count",
      medals.length === 6 && !medals[0].querySelector(".fc-medal-locked")
      && medals.some(m => m.dataset.award === "words-25") && medals.some(m => m.querySelector(".fc-medal-locked .fc-medal-ring-arc"))
      && medals.filter(m => m.querySelector(".fc-medal-locked")).every(m => !!m.querySelector(".fc-award-cap")));
    // Seen once: a later day re-rendering never re-dates or re-adds it.
    c.journey.awards["words-25"] = "2026-01-02";
    F.render();
    check("an award is noted once -- a later render keeps its first day", c.journey.awards["words-25"] === "2026-01-02");
    // Forget every mastered word: the level holds.
    Object.keys(c.cards).forEach(id => { c.cards[id].stability = 2; });
    fcStore.saveCache();
    F.render();
    check("forgetting words never drops a level -- it counts words ever mastered",
      /^Level 2$/.test(document.querySelector("#fcPanelDashboard .fc-journey-level").textContent)
      && /^0\/30$/.test(document.querySelectorAll("#fcPanelDashboard .fc-journey-val")[2].textContent));
    check("the journey merges as a union, the earlier day winning, and a backup keeps it", (() => {
      const m = fcStore.mergeJourney({ mastered: { a: "2026-02-01" }, awards: { x: "2026-03-01", bad: 7 } }, { mastered: { a: "2026-01-01", b: "2026-05-05" }, awards: { x: "2026-04-01" } });
      const raw = JSON.parse(JSON.stringify(c));
      const kept = fcStore.validateCache(raw);
      return m.mastered.a === "2026-01-01" && m.mastered.b === "2026-05-05" && m.awards.x === "2026-03-01" && !("bad" in m.awards)
        && !!kept && kept.journey.awards["reviews-100"] === today;
    })());
    document.getElementById("fcAwardsAll").click();
    const awardsPanel = document.getElementById("fcPanelAwards");
    check("Show all pushes the Awards screen: back to Practice, a count, every award grouped by kind",
      F.getActiveTab() === "awards" && !awardsPanel.hidden && !!document.getElementById("fcBack")
      && /^\d+ of \d+ earned$/.test(awardsPanel.querySelector(".fc-awards-count").textContent)
      && [...awardsPanel.querySelectorAll(".help-head")].map(h => h.textContent).slice(0, 3).join("|") === "Streaks|Reviews|Words"
      && awardsPanel.querySelectorAll(".fc-award").length >= 20);
    awardsPanel.querySelector('[data-award="words-100"]').click();
    const sheet = document.querySelector(".fc-medal-host");
    check("a medal opens its sheet: the medal large, its name, what it's for, how far along",
      !!sheet && /100 words mastered/.test(sheet.textContent) && /Master 100 words/.test(sheet.textContent)
      && /26\/100 so far/.test(sheet.querySelector(".fc-medal-when").textContent) && !!sheet.querySelector(".fc-medal-big"));
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    check("Escape closes the medal sheet", !document.querySelector(".fc-medal-host"));
    check("no inline styles on the Awards screen", document.querySelectorAll("#fcPanelAwards [style]").length === 0);
    c.cards = saved.cards; c.journey = saved.journey; c.settings = saved.settings;
    fcStore.saveCache();
    F.setActiveTab("dashboard");
    F.render();
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
    check("what Estimated retention means waits behind its ⓘ, shown only on tap", (() => {
      const info = document.querySelector("#fcPanelDashboard .fc-stat-info");
      const note = document.getElementById("fcRetentionNote");
      if (!info || !note || !note.hidden) return false;
      info.click();
      const shown = !note.hidden && info.getAttribute("aria-expanded") === "true";
      info.click();
      return shown && note.hidden;
    })());
    c.cards = saved.cards;
    fcStore.saveCache();
    window.RaumeStudy.flashcards.render();
  }

  console.log("Flashcards: a restored session keeps its own cache");
  {
    const fcStore = window.RaumeStudy.flashcards.store;
    const c = fcStore.getCache();
    const saved = JSON.stringify(c);
    c.userId = "user-a";
    c.logsOutbox = [{ clientReviewId: "r1", cardId: "x" }];
    fcStore.saveCache();
    const cardCount = Object.keys(c.cards).length;
    fcStore.resetCacheForUser("user-a");
    const kept = Object.keys(fcStore.getCache().cards).length === cardCount && fcStore.getCache().logsOutbox.length === 1;
    fcStore.resetCacheForUser("user-b");
    const wiped = Object.keys(fcStore.getCache().cards).length === 0 && fcStore.getCache().userId === "user-b";
    check("the same account coming back keeps its cards and offline outbox; another account starts empty", cardCount > 0 && kept && wiped);
    Object.assign(fcStore.getCache(), JSON.parse(saved));
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

  check("the picker has no direction choice -- kana -> romaji is the only drill",
    !document.querySelector("#fcPanelKana .fc-kana-dir-cb") && !/Romaji → kana/.test(document.getElementById("fcPanelKana").textContent));

  // --- kana -> romaji: the typed drill. ---
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

  console.log("Flashcards: Crosswords (Puzzles) tab");
  const xw = window.RaumeStudy.flashcards.crosswords.__testHooks;
  const xwPick = (name, value) => {
    const sel = document.querySelector('#flashcardsPage .fc-tabpanel:not([hidden]) [data-pick="' + name + '"]');
    sel.value = value;
    sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  };
  // Words from is a checklist sheet: tick / untick one row ("flashcards" or
  // a table id), or set the whole pick (["id", ...] or "flashcards") and Done.
  const xwPanel = () => document.querySelector("#flashcardsPage .fc-tabpanel:not([hidden])");
  const xwTick = (key, on) => {
    const cb = xwPanel().querySelector(key === "flashcards" ? '#fcXwTablePicker input[data-source="flashcards"]' : '#fcXwTablePicker input[data-table-id="' + key + '"]');
    cb.checked = on;
    cb.dispatchEvent(new window.Event("change", { bubbles: true }));
  };
  const xwSource = pick => {
    xwPanel().querySelector("#fcXwSource").click();
    if (pick === "flashcards") xwTick("flashcards", true);
    else {
      pick.forEach(id => xwTick(String(id), true));
      xw.state.tables.map(String).filter(id => !pick.map(String).includes(id)).forEach(id => xwTick(id, false));
    }
    xwPanel().querySelector("#fcXwTablesDone").click();
  };
  check("the tab reads \"Puzzles\", not the internal \"crosswords\" key", document.querySelector('.fc-tab[data-tab="crosswords"]').textContent.trim() === "Puzzles");
  check("hiragana <-> katakana conversion is offset-based and round-trips (the long vowel mark ー is untouched)",
    xw.toKatakana("さくら") === "サクラ" && xw.toHiragana("サクラ") === "さくら"
    && xw.toHiragana("コーヒー") === "こーひー" && xw.scriptedAnswer("さくら", "katakana") === "サクラ"
    && xw.scriptedAnswer("さくら", "native") === "さくら");
  check("romaji folding takes the first alternative, drops a counter's ~, folds macrons, and strips everything but a-z",
    xw.foldRomajiForGrid("kōhī") === "kohi" && xw.foldRomajiForGrid("kaeru / kaerimasu") === "kaeru"
    && xw.foldRomajiForGrid("~hon") === "hon" && xw.foldRomajiForGrid("O-namae wa?") === "onamaewa");
  check("given a whole pool and a size, the builder swaps in words that cross until it reaches that size -- not a pre-picked handful that mostly doesn't", (() => {
    const biggest = window.RaumeStudy.data.vocabularyTables.slice().sort((a, b) => b.rows.length - a.rows.length)[0];
    const pool = xw.tableWordPool([biggest.id]).filter(w => w.romaji).map(w => ({ id: w.id, clue: w.clue, answer: w.romaji }));
    if (pool.length < 30) return false; // the largest table should comfortably clear this
    return [0, 1, 2].every(() => xw.buildGrid(pool, false, 12).placements.length === 12);
  })());
  check("a clue that gives its answer away is dropped: the answer written in the clue, or a loanword whose English is the word",
    xw.isGiveaway("さけ", "sake", "Japanese sake") && xw.isGiveaway("コーラ", "kora", "cola")
    && xw.isGiveaway("コーヒー", "kohi", "coffee") && xw.isGiveaway("ジュース", "jusu", "juice")
    && xw.isGiveaway("ビール", "biru", "beer") && xw.isGiveaway("フォーク", "foku", "fork") && xw.isGiveaway("ソース", "sosu", "sauce")
    && xw.isGiveaway("トイレットペーパー", "toirettopepa", "toilet paper") && !xw.isGiveaway("キャベツ", "kyabetsu", "cabbage")
    && !xw.isGiveaway("こうちゃ", "kocha", "black tea") && !xw.isGiveaway("みず", "mizu", "water")
    && !xw.isGiveaway("ナイフ", "naifu", "fork"));
  check("the word pool only ever offers pure kana, 2-10 characters, deduplicated by reading", (() => {
    const biggest = window.RaumeStudy.data.vocabularyTables.slice().sort((a, b) => b.rows.length - a.rows.length)[0];
    const pool = xw.tableWordPool([biggest.id]);
    const seen = new Set();
    return pool.length > 0 && pool.every(w => {
      if (seen.has(w.answer)) return false;
      seen.add(w.answer);
      return /^[ぁ-ゖァ-ー]+$/.test(w.answer) && w.answer.length >= 2 && w.answer.length <= 10;
    });
  })());

  check("Flashcards-sourced games lean toward words you're still learning: new words come up clearly more often, mastered ones still do", (() => {
    const cards = window.RaumeStudy.flashcards.store.getCache().cards;
    const saved = Object.assign({}, cards);
    Object.keys(cards).forEach(k => { delete cards[k]; });
    const biggest = window.RaumeStudy.data.vocabularyTables.slice().sort((a, b) => b.rows.length - a.rows.length)[0];
    const ids = xw.tableWordPool([biggest.id]).slice(0, 20).map(w => w.id);
    ids.forEach((id, i) => {
      cards[id + ":jp-en"] = { id: id + ":jp-en", vocabId: id, direction: "jp-en", active: true,
        state: i < 10 ? 0 : 2, stability: i < 10 ? 0 : 60 };
    });
    const pool = xw.flashcardsWordPool();
    const weightsOk = pool.length === 20 && pool.every(w => w.weight === (ids.indexOf(w.id) < 10 ? 3 : 1));
    let fresh = 0, mastered = 0;
    for (let n = 0; n < 400; n++) xw.weightedOrder(pool).slice(0, 5).forEach(w => { if (w.weight === 3) fresh++; else mastered++; });
    // ...and the weights survive into what the game builders are given.
    const st = xw.state, was = { source: st.source, mode: st.mode, script: st.script, size: st.size, puzzle: st.puzzle, poolCount: st.poolCount, notes: st.notes };
    Object.assign(st, { source: "flashcards", mode: "match", script: "native", size: 20 });
    xw.generate();
    const carried = st.puzzle.placements.length > 0 && st.puzzle.placements.every(w => w.weight === 3 || w.weight === 1);
    Object.assign(st, was);
    Object.keys(cards).forEach(k => { delete cards[k]; });
    Object.assign(cards, saved);
    const tableUnweighted = xw.tableWordPool([biggest.id]).every(w => w.weight === undefined);
    return weightsOk && carried && fresh > mastered * 2 && mastered > 100 && tableUnweighted;
  })());

  // Three short words, each sharing a letter directly with the longest (so
  // every one connects to the backbone regardless of placement order) --
  // enough to check the grid builder never corrupts a letter at a crossing.
  const xwWords = [
    { id: "w1", answer: "さくら", clue: "cherry blossom" },
    { id: "w2", answer: "くも", clue: "cloud" },
    { id: "w3", answer: "そら", clue: "sky" }
  ];
  function readPlacement(built, p) {
    const dr = p.dir === "down" ? 1 : 0, dc = p.dir === "across" ? 1 : 0;
    let out = "";
    for (let i = 0; i < p.answer.length; i++) out += built.grid[(p.row + dr * i) + "," + (p.col + dc * i)];
    return out;
  }
  const xwGrid = xw.buildGrid(xwWords, false);
  check("all three words connect into one grid (each shares a letter with the longest)", xwGrid.placements.length === 3);
  check("every placed word reads back off the grid exactly as its own answer -- a crossing never corrupts a letter",
    xwGrid.placements.every(p => readPlacement(xwGrid, p) === p.answer));
  check("crossword mode numbers every word's own start cell", xwGrid.placements.every(p => typeof p.number === "number" && p.number >= 1));
  // さん is the start of さんびゃく: it may only cross it, never lie along it
  // (that gave two Down clues one start square).
  const xwPrefix = [
    { id: "p1", clue: "300", answer: "SANBYAKU" }, { id: "p2", clue: "3", answer: "SAN" },
    { id: "p3", clue: "hundred", answer: "HYAKU" }, { id: "p4", clue: "new", answer: "ATARASHII" }
  ];
  check("a word never shares squares with another word running the same way (no word inside another)", [0, 1, 2, 3, 4, 5, 6, 7].every(() => {
    return [false, true].every(arro => {
      const seen = {};
      return xw.buildGrid(xwPrefix, arro).placements.every(p => {
        const dr = p.dir === "down" ? 1 : 0, dc = p.dir === "across" ? 1 : 0;
        for (let i = 0; i < p.answer.length; i++) {
          const k = p.dir + ":" + (p.row + dr * i) + "," + (p.col + dc * i);
          if (seen[k]) return false;
          seen[k] = true;
        }
        return true;
      });
    });
  }));
  const xwArro = xw.buildGrid(xwWords, true);
  check("arroword mode reserves a clue cell right before every word -- never a letter, never shared", (() => {
    return xwArro.placements.every(p => {
      const dr = p.dir === "down" ? 1 : 0, dc = p.dir === "across" ? 1 : 0;
      const k = (p.row - dr) + "," + (p.col - dc);
      return xwArro.clueCells[k] && xwArro.clueCells[k].clue === p.clue && xwArro.grid[k] === undefined;
    });
  })());

  // Too few words: no grid, a line saying why. ビール/コーヒー/コーラ/ジュース
  // are all loanwords whose English is the answer, so they don't count.
  const xwCache = window.RaumeStudy.flashcards.store.getCache();
  const xwCardsBefore = Object.keys(xwCache.cards);
  const xwActiveBefore = Object.keys(xwCache.cards).filter(id => xwCache.cards[id].active);
  xwActiveBefore.forEach(id => { xwCache.cards[id].active = false; });
  await window.RaumeStudy.flashcards.dataOps.addVocabs(["v0007", "v0009", "v0010", "v0012"]);
  xw.state.puzzle = null;
  window.RaumeStudy.flashcards.render();
  document.querySelector('.fc-tab[data-tab="crosswords"]').click();
  check("with fewer than 6 usable words the tab explains itself instead of showing a tiny grid",
    !document.querySelector("#fcPanelCrosswords .fc-xw-grid")
    && /at least 6 usable words/.test(document.querySelector("#fcPanelCrosswords .fc-xw-footnote").textContent));
  xwActiveBefore.forEach(id => { xwCache.cards[id].active = true; });

  // Guaranteed pool for the UI checks below, independent of whatever earlier
  // sections left active -- every word of the Vegetables table (plenty of
  // kana-only readings that cross in romaji).
  // Snapshot first and restore after: a later section (guest-mode's
  // in-memory fallback) asserts an exact "Total cards" count from the
  // earlier fixture, so these extra cards can't be left in the deck.
  const xwVeg = window.RaumeStudy.data.vocabularyTables.find(t => t.title === "Vegetables");
  await window.RaumeStudy.flashcards.dataOps.addVocabs(xw.tableWordPool([xwVeg.id]).map(w => w.id));
  xw.state.puzzle = null;
  window.RaumeStudy.flashcards.render();
  document.querySelector('.fc-tab[data-tab="crosswords"]').click();
  check("the Puzzles tab renders a puzzle once there are enough flashcard words -- never fewer than 6 of them",
    !!document.querySelector("#fcPanelCrosswords .fc-xw-grid") && xw.state.puzzle.placements.length >= 6);
  check("no element relies on an inline style=\"\" attribute here either (blocked by CSP style-src)", document.querySelectorAll("#fcPanelCrosswords [style]").length === 0);
  check("a fresh puzzle's cells are live, empty text inputs -- a fill-in grid, not a picture of one",
    [...document.querySelectorAll("#fcPanelCrosswords .fc-xw-cell-input")].every(i => i.tagName === "INPUT" && i.value === ""));
  check("one toolbar row: the puzzle as a title menu (a native select), then Hint, Check (filled) and ⋯ -- no row of setting pills", (() => {
    const bar = document.querySelector("#fcPanelCrosswords .fc-xw-actions");
    const title = bar.querySelector(".fc-xw-title");
    const hint = document.getElementById("fcXwHint");
    return !!title && /^(Crossword|Arroword)$/.test(title.querySelector(".fc-xw-title-text").textContent)
      && title.querySelector('select[data-pick="mode"]').getAttribute("aria-label") === "Puzzle"
      && !document.querySelector("#fcPanelCrosswords .fc-xw-picks, #fcPanelCrosswords .fc-xw-chip")
      && hint && !hint.closest(".section-menu") && hint.textContent.trim() === "Hint" && hint.title === "Reveal a letter"
      && hint.nextElementSibling === document.getElementById("fcXwCheck")
      && document.getElementById("fcXwCheck").classList.contains("fc-btn-primary")
      && document.getElementById("fcXwNew").classList.contains("fc-btn") && !document.getElementById("fcXwNew").classList.contains("fc-btn-primary")
      && !document.getElementById("fcXwTip");
  })());
  check("⋯ holds New puzzle (a phone's way to it), the settings as a group of value rows -- Words from (opening a sheet) / Word count / Script (native pickers) -- then How to play, Reveal puzzle, Clear answers, Save as PDF, Stats", (() => {
    const menu = document.querySelector("#fcPanelCrosswords .fc-xw-menu");
    const items = [...menu.querySelectorAll(".fc-xw-menu-item")].map(b => b.textContent.trim());
    const picks = [...menu.querySelectorAll(".fc-xw-menu-group .fc-xw-menu-pick")];
    return items.join("|") === "New puzzle|How to play|Reveal puzzle|Clear answers|Save as PDF|Stats"
      && picks.map(p => p.querySelector(".menu-item-tx").textContent).join("|") === "Words from|Word count|Script"
      && picks[0].id === "fcXwSource" && picks[0].tagName === "BUTTON" && picks[0].querySelector(".fc-xw-menu-val").textContent === "Flashcards"
      && /\d+ words/.test(picks[1].textContent) && !!picks[1].querySelector("select") && !!picks[2].querySelector("select")
      && menu.querySelector(".section-menu-list").hidden && document.getElementById("fcXwSheet").hidden;
  })());
  check("the clue bar stays hidden until a square is picked -- ⋯ › How to play opens a short note, Escape closes it", (() => {
    const bar = document.querySelector("#fcPanelCrosswords .fc-xw-current");
    const pop = document.getElementById("fcXwTipPop");
    if (!bar.hidden || bar.textContent || !pop.hidden) return false;
    document.getElementById("fcXwHowto").click();
    const opened = !pop.hidden && /Tap a square/.test(pop.textContent);
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    return opened && pop.hidden;
  })());
  check("Romaji is the default script -- a beginner without kana memorized yet still gets a working puzzle -- and its cells skip the Japanese IME hint",
    document.querySelector('#fcPanelCrosswords [data-pick="script"]').value === "romaji"
    && !document.querySelector('#fcPanelCrosswords .fc-xw-cell-input[lang="ja"]'));
  document.getElementById("fcXwReveal").click();
  check("...and its cells actually hold romaji letters, not kana, until you switch scripts",
    [...document.querySelectorAll("#fcPanelCrosswords .fc-xw-cell-input")].every(i => /^[a-z]$/.test(i.value)));

  document.getElementById("fcXwReset").click();
  const firstInput = document.querySelector("#fcPanelCrosswords .fc-xw-cell-input");
  firstInput.value = "x";
  firstInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  document.getElementById("fcXwCheck").click();
  check("Check marks a wrong letter without touching cells that are still empty", (() => {
    const cells = [...document.querySelectorAll("#fcPanelCrosswords .fc-xw-cell-letter")];
    return firstInput.closest(".fc-xw-cell").classList.contains("fc-xw-cell-wrong")
      && cells.filter(c => c.classList.contains("fc-xw-cell-correct") || c.classList.contains("fc-xw-cell-wrong")).length === 1;
  })());
  document.getElementById("fcXwReveal").click();
  check("Reveal fills every cell with its correct letter and marks it right",
    [...document.querySelectorAll("#fcPanelCrosswords .fc-xw-cell-input")].every(i => i.value.length === 1 && i.closest(".fc-xw-cell").classList.contains("fc-xw-cell-correct")));
  const xwAnswers = {};
  document.querySelectorAll("#fcPanelCrosswords .fc-xw-cell-input").forEach(i => { xwAnswers[i.dataset.r + "," + i.dataset.c] = i.value; });

  document.getElementById("fcXwReset").click();
  check("Reset clears every typed letter and verdict but keeps the same grid to try again", (() => {
    const cells = [...document.querySelectorAll("#fcPanelCrosswords .fc-xw-cell-letter")];
    return cells.every(c => c.querySelector(".fc-xw-cell-input").value === ""
      && !c.classList.contains("fc-xw-cell-correct") && !c.classList.contains("fc-xw-cell-wrong"));
  })());
  document.getElementById("fcXwHint").click();
  check("Hint reveals exactly one cell -- a nudge, not the full solution Reveal gives", (() => {
    const cells = [...document.querySelectorAll("#fcPanelCrosswords .fc-xw-cell-letter")];
    const filled = cells.filter(c => c.querySelector(".fc-xw-cell-input").value !== "");
    return filled.length === 1 && filled[0].classList.contains("fc-xw-cell-correct");
  })());
  check("Save as PDF packs its pages into a real PDF (one A4 page per image, landscape when wider)", (() => {
    const pdf = window.RaumeStudy.flashcards.puzzlePdf;
    const blob = pdf.pdfFromJpegs([{ bytes: new Uint8Array([255, 216, 255, 217]), width: 1680, height: 2376 }, { bytes: new Uint8Array([255, 216, 255, 217]), width: 2376, height: 1680 }]);
    return blob.type === "application/pdf" && blob.size > 400;
  })());
  check("a crossword solved by hand goes to the Dashboard's log once; a revealed one never does", (() => {
    const runs = window.RaumeStudy.flashcards.puzzleRuns;
    const before = runs.all().filter(r => r.mode === "crossword").length;
    window.RaumeStudy.flashcards.render(); // same grid, a fresh attempt
    const fill = () => document.querySelectorAll("#fcPanelCrosswords .fc-xw-cell-input").forEach(i => { i.value = xwAnswers[i.dataset.r + "," + i.dataset.c]; });
    fill();
    document.getElementById("fcXwCheck").click();
    document.getElementById("fcXwCheck").click();
    const after = runs.all().filter(r => r.mode === "crossword");
    window.RaumeStudy.flashcards.render();
    document.getElementById("fcXwReveal").click();
    document.getElementById("fcXwCheck").click();
    const last = after[after.length - 1];
    return after.length === before + 1 && last.help === 0 && last.n > 0
      && runs.all().filter(r => r.mode === "crossword").length === before + 1;
  })());

  check("tapping a clue in the list tints it, spells it out in the clue bar, and typing then runs along that word's own direction", (() => {
    const li = document.querySelector('#fcPanelCrosswords .fc-xw-cluerows li[data-dir="down"]')
      || document.querySelector("#fcPanelCrosswords .fc-xw-cluerows li");
    const [r, c] = li.dataset.start.split(",").map(Number);
    li.click();
    const start = document.activeElement;
    const bar = document.querySelector("#fcPanelCrosswords .fc-xw-current");
    const ok = start.dataset.r === String(r) && start.dataset.c === String(c)
      && li.classList.contains("fc-xw-clue-active") && !bar.classList.contains("fc-xw-current-idle") && !bar.hidden
      && bar.textContent.includes(li.textContent.replace(/^\d+\s*/, "").trim());
    start.value = "a";
    start.dispatchEvent(new window.Event("input", { bubbles: true }));
    const next = document.activeElement;
    const down = li.dataset.dir === "down";
    return ok && next.dataset.r === String(down ? r + 1 : r) && next.dataset.c === String(down ? c : c + 1);
  })());
  document.getElementById("fcXwReset").click();

  xwPick("mode", "arroword");
  check("switching to Arroword drops the separate clue list for clue cells inside the grid", !document.querySelector("#fcPanelCrosswords .fc-xw-clues") && !!document.querySelector("#fcPanelCrosswords .fc-xw-cell-clue"));
  check("a fresh Arroword puzzle's cells are empty again -- switching style starts a new grid", [...document.querySelectorAll("#fcPanelCrosswords .fc-xw-cell-input")].every(i => i.value === ""));
  check("an arroword clue cell is keyboard-reachable and knows which cell its word starts at", (() => {
    const cc = document.querySelector("#fcPanelCrosswords .fc-xw-cell-clue");
    return cc.getAttribute("tabindex") === "0" && /^\d+,\d+$/.test(cc.dataset.start);
  })());
  check("tapping a clue focuses that word's first cell", (() => {
    const cc = document.querySelector("#fcPanelCrosswords .fc-xw-cell-clue");
    const [r, c] = cc.dataset.start.split(",");
    cc.click();
    const target = document.querySelector('#fcPanelCrosswords .fc-xw-cell-input[data-r="' + r + '"][data-c="' + c + '"]');
    return document.activeElement === target;
  })());

  check("a vocabulary table's own word pool works independent of flashcards status, given several table ids", (() => {
    const counters = window.RaumeStudy.data.vocabularyTables.find(t => t.title === "Counters");
    const drinks = window.RaumeStudy.data.vocabularyTables.find(t => t.title === "Drinks");
    const pool = xw.tableWordPool([counters.id, drinks.id]);
    return pool.length > 0 && pool.every(w => /^[ぁ-ゖァ-ー]+$/.test(w.answer) && w.answer.length >= 2 && w.answer.length <= 10);
  })());

  const xwDefaultTable = window.RaumeStudy.data.vocabularyTables.find(t => t.tableClass !== "vocab-kanji" && xw.tableWordPool([t.id]).length >= 10);
  document.querySelector("#fcPanelCrosswords #fcXwSource").click();
  check("⋯ › Words from opens one checklist sheet -- Flashcards ticked on top, then a checkmark row per table grouped by category -- with the ⋯ menu closed", (() => {
    const sheet = document.getElementById("fcXwSheet"), picker = document.getElementById("fcXwTablePicker");
    const fc = picker.querySelector('input[data-source="flashcards"]');
    return !sheet.hidden && document.querySelector("#fcPanelCrosswords .fc-xw-menu .section-menu-list").hidden
      && !!fc && fc.checked && picker.querySelectorAll("input[data-table-id]").length === window.RaumeStudy.data.vocabularyTables.filter(t => t.tableClass !== "vocab-kanji").length
      && picker.querySelectorAll(".fc-xw-table-cat").length > 1 && fc.closest("label").classList.contains("fc-direction-check");
  })());
  xwTick(xwDefaultTable.id, true);
  check("ticking a table switches from Flashcards to that table and builds from it; the sheet stays open and the row names it", (() => {
    const fc = document.querySelector('#fcXwTablePicker input[data-source="flashcards"]');
    return xw.state.source === "table" && xw.state.tables.map(String).join() === String(xwDefaultTable.id) && !fc.checked
      && !document.getElementById("fcXwSheet").hidden && !!document.querySelector("#fcPanelCrosswords .fc-xw-grid")
      && document.querySelector("#fcPanelCrosswords #fcXwSource .fc-xw-menu-val").textContent === xwDefaultTable.title;
  })());
  check("the printed sheet is headed by the puzzle style, with its source, word count and script on a quiet line under it",
    /^(Crossword|Arroword)$/.test(document.querySelector("#fcPanelCrosswords .fc-xw-print-title").textContent)
    && /^.+ · \d+ words · (Romaji|Japanese|Hiragana|Katakana)$/.test(document.querySelector("#fcPanelCrosswords .fc-xw-print-meta").textContent));

  const xwOtherTable = window.RaumeStudy.data.vocabularyTables.find(t => t !== xwDefaultTable && t.tableClass !== "vocab-kanji" && xw.tableWordPool([t.id]).filter(w => w.romaji).length >= 20);
  xwTick(xwOtherTable.id, true);
  check("ticking a second table adds it alongside the first -- several tables feed one puzzle", (() => {
    return xw.state.tables.length === 2 && !document.getElementById("fcXwSheet").hidden
      && document.querySelector("#fcPanelCrosswords .fc-xw-print-meta").textContent.includes(xwOtherTable.title);
  })());
  xwTick(xwDefaultTable.id, false);
  check("unticking a table drops it, leaving the other one active", (() => {
    return xw.state.tables.length === 1 && String(xw.state.tables[0]) === String(xwOtherTable.id)
      && !document.querySelector("#fcPanelCrosswords .fc-xw-print-meta").textContent.includes(xwDefaultTable.title);
  })());
  document.getElementById("fcXwTablesDone").click();
  check("Done closes the sheet", document.getElementById("fcXwSheet").hidden && !xw.state.tablesOpen);
  check("unticking the last table goes back to Flashcards; ticking Flashcards clears the tables", (() => {
    xwSource([xwDefaultTable.id]);
    document.querySelector("#fcPanelCrosswords #fcXwSource").click();
    xwTick(xwDefaultTable.id, false);
    const back = xw.state.source === "flashcards" && !xw.state.tables.length;
    xwTick(xwOtherTable.id, true);
    xwTick("flashcards", true);
    const cleared = xw.state.source === "flashcards" && !xw.state.tables.length;
    document.getElementById("fcXwTablesDone").click();
    xwSource([xwOtherTable.id]);
    return back && cleared && xw.state.source === "table" && xw.state.tables.map(String).join() === String(xwOtherTable.id);
  })());
  check("Katakana and Hiragana puzzles only use words really written that way -- never a word forced into the other script", (() => {
    xwPick("script", "katakana");
    const k = xw.state.puzzle.placements.every(p => /^[ァ-ヶー]+$/.test(p.answer));
    xwPick("script", "hiragana");
    const h = xw.state.puzzle.placements.every(p => /^[ぁ-ゖー]+$/.test(p.answer));
    xwPick("script", "romaji");
    return k && h;
  })());
  check("a word search hides every answer in a square of letters, filled only with the answers' own letters, in all directions", (() => {
    const pool = xw.tableWordPool([xwOtherTable.id]).filter(w => w.romaji && w.romaji.length >= 3).map(w => ({ id: w.id, clue: w.clue, answer: w.romaji }));
    let slanted = 0, backwards = 0;
    for (let n = 0; n < 5; n++) {
      const p = xw.buildWordSearch(pool, 15);
      if (p.rows !== p.cols || p.letters.length !== p.rows || p.placements.length < 6) return false;
      const own = new Set(p.placements.flatMap(pl => [...pl.answer]));
      if (!p.letters.every(row => row.length === p.cols && row.every(ch => own.has(ch)))) return false;
      const spelled = p.placements.every(pl => [...pl.answer].every((ch, i) => p.letters[pl.row + pl.dr * i][pl.col + pl.dc * i] === ch));
      if (!spelled) return false;
      slanted += p.placements.filter(pl => pl.dr && pl.dc).length;
      backwards += p.placements.filter(pl => pl.dr < 0 || pl.dc < 0).length;
    }
    return slanted > 0 && backwards > 0;
  })());
  xwPick("mode", "wordsearch");
  const wsCell = (r, c) => document.querySelector('#fcPanelCrosswords .fc-ws-cell[data-r="' + r + '"][data-c="' + c + '"]');
  const wsKey = (el, key) => el.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }));
  const wsCount = () => document.getElementById("fcWsCount").textContent;
  check("Word search shows plain letters and a clue-only list, a found count where Check was, and word-sized ⋯ actions", (() => {
    const p = xw.state.puzzle;
    const items = [...document.querySelectorAll("#fcPanelCrosswords .fc-ws-list li")];
    return !!document.querySelector("#fcPanelCrosswords .fc-ws-grid") && !document.querySelector("#fcPanelCrosswords .fc-xw-cell-input")
      && !document.getElementById("fcXwCheck") && wsCount() === "0 / " + p.placements.length
      && items.length === p.placements.length && items.every(li => li.querySelector(".fc-ws-answer").hidden)
      && document.getElementById("fcXwHint").title === "Reveal a word"
      && document.querySelector("#fcPanelCrosswords .fc-xw-print-title").textContent === "Word search"
      && document.querySelectorAll("#fcPanelCrosswords [style]").length === 0;
  })());
  check("a notes pad sits beside the word list, keeps its text across a re-render of the same puzzle, and starts blank with a new one", (() => {
    const pad = document.querySelector("#fcPanelCrosswords .fc-xw-side > .fc-xw-notes #fcXwNotes");
    if (!pad || pad.tagName !== "TEXTAREA") return false;
    pad.value = "みず = water";
    pad.dispatchEvent(new window.Event("input"));
    window.RaumeStudy.flashcards.crosswords.renderCrosswords(document.getElementById("fcPanelCrosswords"));
    const kept = document.getElementById("fcXwNotes").value === "みず = water";
    const puzzle = xw.state.puzzle;
    document.getElementById("fcXwNew").click();
    const blank = document.getElementById("fcXwNotes").value === "";
    xw.state.puzzle = puzzle;
    window.RaumeStudy.flashcards.crosswords.renderCrosswords(document.getElementById("fcPanelCrosswords"));
    return kept && blank;
  })());
  check("picking a word's last letter then its first (Enter on each) marks it found -- either way round", (() => {
    const pl = xw.state.puzzle.placements[0];
    const end = wsCell(pl.row + pl.dr * (pl.length - 1), pl.col + pl.dc * (pl.length - 1));
    end.focus(); wsKey(end, "Enter"); wsKey(wsCell(pl.row, pl.col), "Enter");
    const li = document.querySelector('#fcPanelCrosswords .fc-ws-list li[data-i="0"]');
    return wsCount().startsWith("1 /") && li.classList.contains("fc-ws-done") && !li.querySelector(".fc-ws-answer").hidden
      && document.querySelectorAll("#fcPanelCrosswords .fc-ws-found").length === 1;
  })());
  check("a line that spells no answer marks nothing", (() => {
    const pl = xw.state.puzzle.placements[1];
    wsKey(wsCell(pl.row, pl.col), "Enter");
    wsKey(wsCell(pl.row + pl.dr * (pl.length - 2), pl.col + pl.dc * (pl.length - 2)), "Enter");
    return wsCount().startsWith("1 /") || xw.state.puzzle.placements.some((q, i) => i > 0 && q.length === pl.length - 1);
  })());
  document.getElementById("fcXwHint").click();
  check("Reveal a word marks the next unfound word", wsCount().startsWith("2 /"));
  document.getElementById("fcXwReset").click();
  check("Clear found words starts the same grid over", wsCount().startsWith("0 /") && !document.querySelector("#fcPanelCrosswords .fc-ws-found"));
  document.getElementById("fcXwReveal").click();
  check("Reveal puzzle marks every word", wsCount() === xw.state.puzzle.placements.length + " / " + xw.state.puzzle.placements.length
    && document.getElementById("fcWsCount").classList.contains("fc-ws-count-done") && document.querySelectorAll("#fcPanelCrosswords .fc-ws-found").length === xw.state.puzzle.placements.length);

  check("Match splits its words into even rounds of at most 6 pairs", (() => {
    const same = (a, b) => a.join() === b.join();
    const forty = xw.matchRounds(40);
    return same(xw.matchRounds(10), [5, 5]) && same(xw.matchRounds(15), [5, 5, 5]) && same(xw.matchRounds(6), [6])
      && forty.reduce((a, b) => a + b, 0) === 40 && forty.every(n => n <= 6 && n >= 5);
  })());
  check("Puzzles offers only the grid styles; Match and Listening live in their own Games tab", (() => {
    const opts = sel => [...document.querySelectorAll(sel + ' [data-pick="mode"] option')].map(o => o.value).join("|");
    const puzzles = opts("#fcPanelCrosswords");
    document.querySelector('.fc-tab[data-tab="games"]').click();
    return puzzles === "crossword|arroword|wordsearch" && opts("#fcPanelGames") === "match|listening|kanatiles|oddone|speedsort|wordchain"
      && xw.state === xw.states.games && xw.state.mode === "match";
  })());
  const mtTile = (side, i) => document.querySelector('#fcPanelGames .fc-mt-tile[data-side="' + side + '"][data-i="' + i + '"]');
  const mtClock = () => document.getElementById("fcMtClock").textContent;
  check("Match lays a round out as two columns of tiles, a clock where Check was, and only New game / How to play / Restart / Stats in the ⋯ menu", (() => {
    const p = xw.state.puzzle;
    const clues = p.placements.map(w => w.clue.toLowerCase());
    return document.querySelectorAll("#fcPanelGames .fc-mt-tile").length === p.rounds[0].length * 2
      && !document.getElementById("fcXwCheck") && !document.getElementById("fcXwHint") && mtClock() === "0:00.0"
      && [...document.querySelectorAll("#fcPanelGames .fc-xw-menu-item")].map(b => b.textContent).join("|") === "New game|How to play|Restart|Stats"
      && new Set(clues).size === clues.length
      && document.querySelectorAll("#fcPanelGames [style]").length === 0;
  })());
  check("a wrong pair adds a second and clears nothing", (() => {
    mtTile("l", 0).click(); mtTile("r", 1).click();
    return mtClock() >= "0:01.0" && !mtTile("l", 0).disabled && mtTile("l", 0).classList.contains("fc-mt-wrong");
  })());
  check("a right pair -- either side first -- clears both tiles in place", (() => {
    mtTile("r", 0).click(); mtTile("l", 0).click();
    return mtTile("l", 0).disabled && mtTile("r", 0).disabled && mtTile("r", 0).classList.contains("fc-mt-right");
  })());
  let mtBreakSeen = null;
  for (let round = 0; round < xw.state.puzzle.rounds.length; round++) {
    for (let i = 0; i < xw.state.puzzle.rounds[round].length; i++) {
      if (!mtTile("l", i).disabled) { mtTile("l", i).click(); mtTile("r", i).click(); }
    }
    // Wait for the round break (or the finish card), not a fixed time --
    // under CPU load the 350ms round change can run late.
    for (let waited = 0; waited < 5000; waited += 25) {
      if (document.querySelector("#fcPanelGames .fc-mt-done")) break;
      await new Promise(r => setTimeout(r, 25));
    }
    const brk = document.querySelector("#fcPanelGames .fc-mt-break");
    if (brk) {
      const c1 = mtClock();
      await new Promise(r => setTimeout(r, 250));
      if (!mtBreakSeen) mtBreakSeen = { text: brk.textContent, still: mtClock() === c1, pauseOff: document.getElementById("fcMtPause").disabled };
      document.getElementById("fcMtNextRound").click();
    }
  }
  if (xw.state.puzzle.rounds.length > 1) {
    check("between rounds a break card says how the round went, the clock stopped and ⏸ dimmed, until Next round",
      !!mtBreakSeen && /Round 1 of \d+ done/.test(mtBreakSeen.text) && /1 miss/.test(mtBreakSeen.text) && mtBreakSeen.still && mtBreakSeen.pauseOff);
  }
  check("clearing every round ends on the time, New best and the miss count, and the best time is read back from the log", (() => {
    const done = document.querySelector("#fcPanelGames .fc-mt-done");
    const last = window.RaumeStudy.flashcards.puzzleRuns.live("match").pop();
    return !!done && /New best/.test(done.querySelector(".fc-mt-badge").textContent)
      && /^\d+ pairs · 1 miss$/.test(done.querySelector(".fc-mt-delta").textContent)
      && xw.bestTime(last.setup) === last.ms;
  })());
  check("the finish card rings your pace per pair in its medal's colour and names the next tier", (() => {
    const done = document.querySelector("#fcPanelGames .fc-mt-done");
    const pace = done.querySelector(".fc-mt-pace");
    const run = window.RaumeStudy.flashcards.puzzleRuns.live("match").pop();
    const per = run.ms / run.n / 1000;
    const tier = per < 2 ? "gold" : per < 3 ? "silver" : per < 4 ? "bronze" : "none";
    return !!pace && pace.classList.contains("fc-mt-tier-" + tier) && !!pace.querySelector(".fc-mt-ring-arc[pathLength]")
      && pace.querySelector(".fc-mt-ring-num").textContent === per.toFixed(1) + "s"
      && /under \d\.\ds a pair|The fastest tier/.test(pace.querySelector(".fc-mt-tier-next").textContent);
  })());
  check("the finished Match is logged with its setup and both words of the wrong pair as missed, and its card offers Stats beside Play again", (() => {
    const last = window.RaumeStudy.flashcards.puzzleRuns.live("match").pop();
    const r0 = xw.state.puzzle.rounds[0];
    return last.setup === "flashcards|romaji|" + xw.state.puzzle.placements.length
      && last.missed.length === 2 && last.missed.includes(r0[0].id) && last.missed.includes(r0[1].id)
      && !!document.querySelector("#fcPanelGames .fc-mt-done-actions #fcDoneStats");
  })());
  document.getElementById("fcXwReset").click();
  check("Restart plays the same words again from zero", mtClock() === "0:00.0" && !document.querySelector("#fcPanelGames .fc-mt-done")
    && document.querySelectorAll("#fcPanelGames .fc-mt-tile:not([disabled])").length === xw.state.puzzle.rounds[0].length * 2);
  await (async () => {
    const rounds = xw.state.puzzle.rounds;
    const split = document.getElementById("fcMtSplit");
    const hiddenAtStart = !!split && split.hidden;
    for (let i = 0; i < rounds[0].length; i++) { mtTile("l", i).click(); mtTile("r", i).click(); }
    check("after a round, a split chip beside the clock says how far ahead of or behind your best you are",
      hiddenAtStart && (rounds.length < 2 || (!split.hidden && /^[−+]\d+\.\ds$/.test(split.textContent)
        && /fc-mt-split-(ahead|behind)/.test(split.className))));
    document.getElementById("fcXwReset").click();
  })();

  check("Match stats keep the fastest round -- its time and how many pairs it had", (() => {
    const best = window.RaumeStudy.flashcards.puzzleRuns.bestRound();
    return !!best && best.ms > 0 && best.pairs >= 5 && best.pairs <= 6;
  })());
  await (async () => {
    mtTile("l", 0).click(); mtTile("r", 0).click();
    await new Promise(r => setTimeout(r, 120));
    document.getElementById("fcMtPause").click();
    const board = document.querySelector("#fcPanelGames .fc-mt");
    const c1 = mtClock();
    await new Promise(r => setTimeout(r, 250));
    check("⏸ stops the clock and covers the tiles with a Paused card: Resume, Restart, End game",
      mtClock() === c1 && board.classList.contains("fc-mt-paused") && !!board.querySelector(".fc-mt-pause")
      && window.getComputedStyle(board.querySelector(".fc-mt-cols")).display === "none"
      && !!document.getElementById("fcPauseResume") && !!document.getElementById("fcPauseRestart") && !!document.getElementById("fcPauseEnd"));
    document.getElementById("fcPauseResume").click();
    check("Resume brings the same board back, the pair already cleared still cleared",
      !board.classList.contains("fc-mt-paused") && !board.querySelector(".fc-mt-pause") && mtTile("l", 0).disabled);
    const before = window.RaumeStudy.flashcards.puzzleRuns.live("match").length;
    document.getElementById("fcMtPause").click();
    document.getElementById("fcPauseEnd").click();
    const done = document.querySelector("#fcPanelGames .fc-mt-done");
    check("End game before any round is finished shows what you played and logs nothing",
      !!done && /Ended after 0 of \d+ round/.test(done.textContent) && /nothing is counted/.test(done.textContent)
      && window.RaumeStudy.flashcards.puzzleRuns.live("match").length === before && !!document.getElementById("fcDoneStats"));
    document.getElementById("fcXwReset").click();
    if (xw.state.puzzle.rounds.length > 1) {
      const pr = window.RaumeStudy.flashcards.puzzleRuns, r0 = xw.state.puzzle.rounds[0];
      const bestsBefore = JSON.stringify(pr.styleStats("match").bests.map(b => [b.setup, b.best.id]));
      for (let i = 0; i < r0.length; i++) { mtTile("l", i).click(); mtTile("r", i).click(); }
      for (let waited = 0; waited < 5000 && !document.querySelector("#fcPanelGames .fc-mt-break"); waited += 25) await new Promise(r => setTimeout(r, 25));
      // End from the round break: ⏸ is dimmed there, so end straight from a fresh pause of round 2.
      document.getElementById("fcMtNextRound").click();
      document.getElementById("fcMtPause").click();
      document.getElementById("fcPauseEnd").click();
      const last = pr.live("match").pop();
      const card = document.querySelector("#fcPanelGames .fc-mt-done").textContent;
      check("End game after finished rounds counts those rounds (pairs, time, fastest round) as an ended game -- never a best",
        last.ended === true && last.n === r0.length && last.splits.length === 1 && last.sizes.join() === String(r0.length)
        && /Ended after 1 of/.test(card) && new RegExp("The " + r0.length + " pairs you finished count").test(card)
        && JSON.stringify(pr.styleStats("match").bests.map(b => [b.setup, b.best.id])) === bestsBefore);
      document.getElementById("fcXwReset").click();
    }
  })();

  const xwIndex = window.RaumeStudy.flashcards.vocabIndex.getVocabIndex();
  const writtenOf = id => String(xwIndex[id].jpPlain || xwIndex[id].jpReading).replace(/^〜/, "");
  xwPick("script", "native");
  check("Japanese in Match is the word as written -- kanji and all, not its reading", (() => {
    const ps = xw.state.puzzle.placements;
    return ps.length >= 6 && ps.every(w => w.answer === writtenOf(w.id))
      && document.querySelector('#fcPanelGames .fc-mt-tile[data-side="l"]').getAttribute("lang") === "ja";
  })());
  document.querySelector('.fc-tab[data-tab="crosswords"]').click();
  xwPick("script", "native");
  xwPick("mode", "wordsearch");
  check("...and in a word search, leaving out one-kanji words, with a found word's reading shown beside its kanji", (() => {
    const ps = xw.state.puzzle.placements;
    const kanjiItem = ps.findIndex(w => /[一-龯]/.test(w.answer));
    const shown = kanjiItem === -1 ? "" : document.querySelector('#fcPanelCrosswords .fc-ws-list li[data-i="' + kanjiItem + '"] .fc-ws-answer').textContent;
    return ps.every(w => w.answer === writtenOf(w.id) && w.answer.length >= 2)
      && (kanjiItem === -1 || shown.includes("（"));
  })());
  xwPick("mode", "crossword");
  check("a crossword doesn't offer Japanese (a square can't take a whole kanji) -- it falls back to Hiragana", (() => {
    const opts = [...document.querySelectorAll('#fcPanelCrosswords [data-pick="script"] option')].map(o => o.value);
    return xw.state.script === "hiragana" && opts.indexOf("native") === -1 && opts.indexOf("hiragana") !== -1;
  })());
  xwPick("script", "romaji");

  // Listening: speech can't run in jsdom, so speak() is stubbed to record
  // what it was asked to say; the choice logic is what's tested.
  const speech = window.RaumeStudy.shared.speech, realSpeak = speech.speak, spoken = [];
  speech.speak = t => spoken.push(t);
  check("Listening questions: the right word plus 3 wrong choices, never two with the same English, from the same table first", (() => {
    const pool = xw.tableWordPool(xw.state.tables.length ? xw.state.tables : [1]);
    const p = xw.buildListening(pool, 10);
    return p.questions.length === Math.min(10, pool.length) && p.questions.every(q => {
      const en = q.choices.map(c => c.clue.toLowerCase());
      return q.choices.length === 4 && q.choices.indexOf(q.word) !== -1 && new Set(en).size === 4
        && q.choices.filter(c => c.tableId === q.word.tableId).length === Math.min(4, pool.filter(w => w.tableId === q.word.tableId).length);
    });
  })());
  document.body.classList.remove("ja-voice-ready");
  document.querySelector('.fc-tab[data-tab="games"]').click();
  xwPick("mode", "listening");
  check("with no Japanese voice or recorded audio, Listening says so instead of a silent game", /no Japanese voice/.test(document.querySelector("#fcPanelGames .fc-ls").textContent)
    && !document.querySelector("#fcPanelGames .fc-ls-choice"));
  document.body.classList.add("ja-voice-ready");
  document.getElementById("fcLsRetry").click();
  const lsQ = () => xw.state.puzzle.questions;
  const lsChoices = () => [...document.querySelectorAll("#fcPanelGames .fc-ls-choice")];
  const lsCount = () => document.getElementById("fcLsCount").textContent;
  check("Listening: a big ▶, four English choices, no Script row, a question counter and only New game / How to play / Restart / Stats in the ⋯ menu", (() => {
    return !!document.querySelector("#fcPanelGames .fc-ls-play") && lsChoices().length === 4
      && !document.querySelector('#fcPanelGames [data-pick="script"]') && lsCount() === "1 / " + lsQ().length
      && !/Romaji/.test(document.querySelector("#fcPanelGames .fc-xw-menu-group").textContent)
      && [...document.querySelectorAll("#fcPanelGames .fc-xw-menu-item")].map(b => b.textContent).join("|") === "New game|How to play|Restart|Stats"
      && document.querySelector("#fcPanelGames .fc-ls-word").hidden
      && document.querySelectorAll("#fcPanelGames [style]").length === 0;
  })());
  check("▶ says the word -- the exact reading the speaker buttons play", (() => {
    document.querySelector("#fcPanelGames .fc-ls-play").click();
    return spoken[spoken.length - 1] === lsQ()[0].word.speak && !!lsQ()[0].word.speak;
  })());
  check("a wrong pick: ✕ on it, ✓ on the right one, the word shown as written, and it waits for Next", (() => {
    const q = lsQ()[0];
    const wrong = lsChoices()[q.choices.findIndex(c => c !== q.word)];
    wrong.click();
    const right = lsChoices()[q.choices.indexOf(q.word)];
    const word = document.querySelector("#fcPanelGames .fc-ls-word");
    return wrong.classList.contains("fc-ls-chosen-wrong") && right.classList.contains("fc-mt-right") && lsChoices().every(b => b.disabled)
      && !word.hidden && word.textContent.includes(String(xwIndex[q.word.id].jpPlain || q.word.answer).replace(/^〜/, ""))
      && !document.querySelector("#fcPanelGames .fc-ls-next").hidden;
  })());
  check("answer feel: a drawn ✕ on the wrong pick, a ✓ and a ring on the right one, the in-a-row dots empty", (() => {
    const q = lsQ()[0];
    const right = lsChoices()[q.choices.indexOf(q.word)];
    const wrong = document.querySelector("#fcPanelGames .fc-ls-chosen-wrong");
    return right.classList.contains("fc-fb") && right.classList.contains("fc-fb-ring") && !!right.querySelector(".fc-fb-mark")
      && wrong.classList.contains("fc-fb") && !!wrong.querySelector(".fc-fb-mark") && right.textContent === q.word.clue
      && document.querySelectorAll("#fcStreak .fc-fb-dot").length === 5 && !document.querySelector("#fcStreak .fc-fb-on");
  })());
  document.querySelector("#fcPanelGames .fc-ls-next").click();
  check("Next moves on and says the next word, the counter's number rolling up", lsCount() === "2 / " + lsQ().length && spoken[spoken.length - 1] === lsQ()[1].word.speak
    && !!document.querySelector("#fcLsCount .fc-fb-roll"));
  for (let i = 1; i < lsQ().length; i++) {
    const q = lsQ()[i];
    lsChoices()[q.choices.indexOf(q.word)].click();
    if (i === 1) {
      const pick = lsChoices()[q.choices.indexOf(q.word)];
      check("a right pick springs, gets its ✓, and fills the first in-a-row dot",
        pick.classList.contains("fc-fb-press") && !!pick.querySelector(".fc-fb-mark")
        && document.querySelectorAll("#fcStreak .fc-fb-on").length === 1 && document.getElementById("fcStreak").getAttribute("aria-label") === "1 right in a row");
    }
    if (i === 5) {
      check("five right in a row: the capsule says so", document.getElementById("fcStreak").classList.contains("fc-fb-hot")
        && /5 in a row/.test(document.getElementById("fcStreak").textContent));
    }
    for (let waited = 0; waited < 5000; waited += 25) {
      if (document.querySelector("#fcPanelGames .fc-mt-done") || lsCount().startsWith((i + 2) + " /")) break;
      await new Promise(r => setTimeout(r, 25));
    }
  }
  check("a finished Listening game keeps the word you got wrong as missed", (() => {
    const last = window.RaumeStudy.flashcards.puzzleRuns.live("listening").pop();
    return !!last && last.missed.join() === String(lsQ()[0].word.id) && /\|\d+$/.test(last.setup);
  })());
  check("a right pick moves on by itself; the end card scores it and lists the missed word with a speaker to hear it again", (() => {
    const done = document.querySelector("#fcPanelGames .fc-mt-done");
    const missed = done ? [...done.querySelectorAll(".fc-ls-missed li")] : [];
    if (!done || missed.length !== 1) return false;
    const n = lsQ().length;
    missed[0].querySelector(".fc-ls-say").click();
    return done.querySelector(".fc-mt-done-time").textContent === (n - 1) + " / " + n
      && missed[0].textContent.includes(lsQ()[0].word.clue) && spoken[spoken.length - 1] === lsQ()[0].word.speak;
  })());
  document.getElementById("fcXwReset").click();
  check("Restart asks the same questions again from the first", lsCount() === "1 / " + lsQ().length && lsChoices().length === 4 && !document.querySelector("#fcPanelGames .fc-mt-done"));
  check("Listening pauses too: the choices hidden behind the Paused card, End game shows the score so far and logs nothing", (() => {
    const before = window.RaumeStudy.flashcards.puzzleRuns.live("listening").length;
    document.getElementById("fcMtPause").click();
    const board = document.querySelector("#fcPanelGames .fc-ls");
    const paused = board.classList.contains("fc-mt-paused") && !!board.querySelector(".fc-mt-pause");
    document.getElementById("fcPauseEnd").click();
    const done = document.querySelector("#fcPanelGames .fc-mt-done");
    const ok = paused && !!done && /Ended after 0 of \d+ words/.test(done.textContent) && /nothing is counted/.test(done.textContent)
      && window.RaumeStudy.flashcards.puzzleRuns.live("listening").length === before;
    document.getElementById("fcXwReset").click();
    return ok;
  })());
  speech.speak = realSpeak;

  console.log("Flashcards: Kana tiles");
  check("Kana tiles' bank is the word's own kana (small ゃゅょっ and ー as tiles of their own) plus 3 decoys the word doesn't use", (() => {
    const p = xw.buildKanaTiles([{ id: "a", clue: "tea", answer: "おちゃ" }, { id: "b", clue: "coffee", answer: "コーヒー" }], 10, "hiragana");
    const q = p.questions.find(x => x.word.id === "a");
    const decoys = q.tiles.filter(c => !q.chars.includes(c));
    const kd = xw.kanaDecoys(Array.from("コーヒー"), "katakana");
    return q.chars.join("|") === "お|ち|ゃ" && q.tiles.length === 6 && decoys.length === 3
      && [...q.chars].sort().join() === q.tiles.filter(c => q.chars.includes(c)).sort().join()
      && kd.length === 3 && kd.every(c => /^[ァ-ヶ]$/.test(c) && !"コーヒ".includes(c));
  })());
  xwPick("mode", "kanatiles");
  check("Kana tiles offers only Hiragana / Katakana (it spells in kana), falling back to Hiragana, and only words really written that way", (() => {
    const opts = [...document.querySelectorAll('#fcPanelGames [data-pick="script"] option')].map(o => o.value).join("|");
    return opts === "hiragana|katakana" && xw.state.script === "hiragana"
      && xw.state.puzzle.questions.every(q => /^[ぁ-ゖー]+$/.test(q.word.answer));
  })());
  const ktQ = () => document.querySelector("#fcPanelGames .fc-kt-clue").textContent;
  const ktCur = () => xw.state.puzzle.questions.find(q => q.word.clue === ktQ());
  const ktTap = c => [...document.querySelectorAll("#fcPanelGames .fc-kt-tile:not(:disabled)")].find(t => t.textContent === c).click();
  check("a Kana tiles question: the English, one empty slot per kana, the bank, a question counter", (() => {
    const q = ktCur();
    return !!q && document.querySelectorAll("#fcPanelGames .fc-kt-slot").length === q.chars.length
      && document.querySelectorAll("#fcPanelGames .fc-kt-tile").length === q.tiles.length
      && document.getElementById("fcLsCount").textContent === "1 / " + xw.state.puzzle.questions.length
      && document.querySelectorAll("#fcPanelGames [style]").length === 0;
  })());
  const ktFirst = ktCur();
  check("tapping a placed tile takes it (and any after it) back to the bank", (() => {
    ktTap(ktFirst.chars[0]);
    const placed = document.querySelector("#fcPanelGames .fc-kt-slot.fc-kt-filled");
    placed.click();
    return !document.querySelector("#fcPanelGames .fc-kt-slot.fc-kt-filled")
      && [...document.querySelectorAll("#fcPanelGames .fc-kt-tile")].every(t => !t.disabled);
  })());
  check("a wrong spelling: the slots wash coral, the right spelling shows, Next waits -- and the word comes back at the end", (() => {
    const wrongLast = ktFirst.tiles.find(c => c !== ktFirst.chars[ktFirst.chars.length - 1] && !ktFirst.chars.slice(0, -1).includes(c)) || ktFirst.tiles.find(c => !ktFirst.chars.includes(c));
    ktFirst.chars.slice(0, -1).forEach(ktTap);
    ktTap(wrongLast);
    const ok = document.querySelector("#fcPanelGames .fc-kt-slots").classList.contains("fc-kt-wrong")
      && !document.querySelector("#fcPanelGames .fc-kt-answer").hidden && !document.querySelector("#fcPanelGames .fc-ls-next").hidden;
    document.querySelector("#fcPanelGames .fc-ls-next").click();
    return ok && ktQ() !== ktFirst.word.clue;
  })());
  for (let k = 0; k < 60 && !document.querySelector("#fcPanelGames .fc-mt-done"); k++) {
    ktCur().chars.forEach(ktTap);
    for (let waited = 0; waited < 3000; waited += 25) {
      if (document.querySelector("#fcPanelGames .fc-mt-done") || !document.querySelector("#fcPanelGames .fc-kt-right")) break;
      await new Promise(r => setTimeout(r, 25));
    }
  }
  check("a right spelling moves on by itself; the end scores first-time words, lists the one to spell again, and logs a kanatiles game", (() => {
    const done = document.querySelector("#fcPanelGames .fc-mt-done");
    const n = xw.state.puzzle.questions.length;
    const last = window.RaumeStudy.flashcards.puzzleRuns.live("kanatiles").pop();
    return !!done && done.querySelector(".fc-mt-done-time").textContent === (n - 1) + " / " + n
      && done.textContent.includes(ktFirst.word.clue) && !!last && last.right === n - 1 && last.n === n
      && last.missed.join() === String(ktFirst.word.id) && last.setup === "flashcards|hiragana|" + n;
  })());
  xwPick("mode", "listening");

  console.log("Flashcards: Odd one out");
  check("Odd one out sets are three words from one table and one from another -- and a word in two tables (or sharing its English with one) never plays", (() => {
    const w = (id, clue, answer, tableId) => ({ id, clue, answer, tableId });
    const words = [w("a1", "apple", "ringo", "A"), w("a2", "peach", "momo", "A"), w("a3", "grapes", "budo", "A"), w("a4", "tea", "cha", "A"),
      w("b1", "shoe", "kutsu", "B"), w("b2", "hat", "boshi", "B"), w("b3", "tea", "ocha", "B")];
    const p = xw.buildOddOne(words, 20);
    const single = xw.buildOddOne(words.filter(x => x.tableId === "A"), 5);
    return p.questions.length === 20 && p.questions.every(q => {
      const odd = q.words[q.odd], rest = q.words.filter((x, i) => i !== q.odd);
      return q.words.length === 4 && rest.every(x => x.tableId === q.baseTable) && odd.tableId === q.oddTable && q.oddTable !== q.baseTable
        && q.words.every(x => x.clue !== "tea");
    }) && single.questions.length === 0;
  })());
  xwPick("mode", "oddone");
  const ooTables = ["Fruits", "Vegetables", "Drinks", "Family"].map(n => window.RaumeStudy.data.vocabularyTables.find(t => t.title === n).id);
  xw.state.source = "table"; xw.state.tables = ooTables.slice(); xw.state.puzzle = null;
  window.RaumeStudy.flashcards.render();
  const ooQ = () => xw.state.puzzle.questions[xw.state.puzzle.questions.findIndex((q, i) => i === Number(document.getElementById("fcLsCount").textContent.split(" / ")[0]) - 1)];
  check("an Odd one out set: the question, four word tiles with their English hidden, a counter", (() => {
    const tiles = [...document.querySelectorAll("#fcPanelGames .fc-oo-word")];
    return tiles.length === 4 && tiles.every(t => t.querySelector(".fc-oo-en").hidden)
      && /doesn’t belong/.test(document.querySelector("#fcPanelGames .fc-oo-ask").textContent)
      && document.getElementById("fcLsCount").textContent === "1 / " + xw.state.puzzle.questions.length
      && document.querySelectorAll("#fcPanelGames [style]").length === 0;
  })());
  const ooFirst = ooQ();
  check("a wrong pick: ✕ on it, ✓ on the odd one, every English shown, the tables named, and Next waits", (() => {
    document.querySelector('#fcPanelGames .fc-oo-word[data-i="' + ((ooFirst.odd + 1) % 4) + '"]').click();
    const tiles = [...document.querySelectorAll("#fcPanelGames .fc-oo-word")];
    const reveal = document.querySelector("#fcPanelGames .fc-oo-reveal").textContent;
    return tiles[ooFirst.odd].classList.contains("fc-mt-right") && tiles[(ooFirst.odd + 1) % 4].classList.contains("fc-ls-chosen-wrong")
      && tiles.every(t => !t.querySelector(".fc-oo-en").hidden && t.disabled)
      && / is .+ — the rest are .+\./.test(reveal) && !document.querySelector("#fcPanelGames .fc-ls-next").hidden;
  })());
  document.querySelector("#fcPanelGames .fc-ls-next").click();
  for (let k = 0; k < 40 && !document.querySelector("#fcPanelGames .fc-mt-done"); k++) {
    const before = document.getElementById("fcLsCount").textContent;
    document.querySelector('#fcPanelGames .fc-oo-word[data-i="' + ooQ().odd + '"]').click();
    for (let waited = 0; waited < 4000; waited += 25) {
      if (document.querySelector("#fcPanelGames .fc-mt-done") || document.getElementById("fcLsCount").textContent !== before) break;
      await new Promise(r => setTimeout(r, 25));
    }
  }
  check("a right pick moves on by itself; the end scores it, lists the odd one you missed, and logs an oddone game", (() => {
    const done = document.querySelector("#fcPanelGames .fc-mt-done");
    const n = xw.state.puzzle.questions.length;
    const last = window.RaumeStudy.flashcards.puzzleRuns.live("oddone").pop();
    return !!done && done.querySelector(".fc-mt-done-time").textContent === (n - 1) + " / " + n
      && !!last && last.right === n - 1 && last.missed.join() === String(ooFirst.words[ooFirst.odd].id);
  })());
  xwSource([ooTables[0]]);
  check("from a single table it says what a set needs instead of a game", /at least two tables/.test(document.querySelector("#fcPanelGames .fc-xw-footnote").textContent)
    && !document.querySelector("#fcPanelGames .fc-oo-word"));
  xwSource("flashcards");
  xwPick("mode", "listening");

  console.log("Flashcards: Speed sort");
  check("Speed sort offers only the sorts the words can fill -- tables from two or three tables, い / な, u / ru (+ irregular) -- in English names", (() => {
    const w = (id, tableId) => ({ id, clue: id, answer: id, tableId });
    const tables = xw.sortBuckets([w("a1", "A"), w("a2", "A"), w("a3", "A"), w("b1", "B"), w("b2", "B"), w("b3", "B")], "tables");
    const oneTable = xw.sortBuckets([w("a1", "A"), w("a2", "A"), w("a3", "A")], "tables");
    const T = window.RaumeStudy.data.vocabularyTables;
    const adjPool = xw.tableWordPool([T.find(t => t.title === "Adjectives").id]);
    const verbPool = xw.tableWordPool([T.find(t => t.title === "Verbs").id]);
    const adj = xw.sortBuckets(adjPool, "adj"), verb = xw.sortBuckets(verbPool, "verb");
    const T2 = window.RaumeStudy.data.vocabularyTables;
    const famFruit = xw.tableWordPool([T2.find(t => t.title === "Family").id, T2.find(t => t.title === "Fruits").id]);
    const built = xw.buildSpeedSort(famFruit, 200, "tables");
    const noGiveaway = built.items.every(it => !/^(family|fruits?)$/i.test(it.word.clue));
    return noGiveaway && !!tables && tables.length === 2 && oneTable === null
      && !!adj && adj.map(b => b.label).join("|") === "い-adjective|な-adjective"
      && !!verb && verb.map(b => b.label).slice(0, 2).join("|") === "u-verb|ru-verb" && xw.sortBuckets(adjPool, "verb") === null;
  })());
  xwPick("mode", "speedsort");
  const ssT = window.RaumeStudy.data.vocabularyTables;
  xwSource([ssT.find(t => t.title === "Fruits").id, ssT.find(t => t.title === "Family").id]);
  check("a Speed sort round: the word, \"1 of N\", a bucket per kind, the clock running and a Sort by row in ⋯", (() => {
    const buckets = [...document.querySelectorAll("#fcPanelGames .fc-ss-bucket")];
    return buckets.length === xw.state.puzzle.buckets.length && buckets.length >= 2
      && /^1 of \d+$/.test(document.querySelector("#fcPanelGames .fc-ss-count").textContent)
      && !!document.querySelector('#fcPanelGames [data-pick="sortBy"]') && xw.state.sortBy === "tables"
      && document.querySelectorAll("#fcPanelGames [style]").length === 0;
  })());
  const ssItem = () => xw.state.puzzle.items[Number(document.querySelector("#fcPanelGames .fc-ss-count").textContent.split(" of ")[0]) - 1];
  const ssFirst = ssItem();
  check("a wrong bucket: it washes coral, the right one takes a ring, and a second goes on the clock", (() => {
    const wrong = [...document.querySelectorAll("#fcPanelGames .fc-ss-bucket")].find(b => +b.dataset.b !== ssFirst.bucket);
    wrong.click();
    return wrong.classList.contains("fc-mt-wrong") && document.querySelector('#fcPanelGames .fc-ss-bucket[data-b="' + ssFirst.bucket + '"]').classList.contains("fc-ss-was")
      && document.getElementById("fcMtClock").textContent >= "0:01.0";
  })());
  for (let k = 0; k < 120 && !document.querySelector("#fcPanelGames .fc-mt-done"); k++) {
    const before = document.querySelector("#fcPanelGames .fc-ss-count") && document.querySelector("#fcPanelGames .fc-ss-count").textContent;
    for (let waited = 0; waited < 3000; waited += 25) {
      const b = document.querySelector("#fcPanelGames .fc-ss-bucket:not(.fc-mt-wrong):not(.fc-mt-right)");
      if (document.querySelector("#fcPanelGames .fc-mt-done") || (b && !document.querySelector("#fcPanelGames .fc-ss-was, #fcPanelGames .fc-ss-bucket.fc-mt-right"))) break;
      await new Promise(r => setTimeout(r, 25));
    }
    if (document.querySelector("#fcPanelGames .fc-mt-done")) break;
    document.querySelector('#fcPanelGames .fc-ss-bucket[data-b="' + ssItem().bucket + '"]').click();
  }
  check("the end: the time, N-1 right with the one mistake listed as \"Right, not Wrong\", and a logged speedsort game", (() => {
    const done = document.querySelector("#fcPanelGames .fc-mt-done");
    const n = xw.state.puzzle.items.length;
    const last = window.RaumeStudy.flashcards.puzzleRuns.live("speedsort").pop();
    return !!done && new RegExp((n - 1) + " / " + n + " right · 1 mistake").test(done.textContent)
      && /, not /.test(done.textContent) && !!last && last.right === n - 1 && last.missed.join() === String(ssFirst.word.id)
      && /\|tables$/.test(last.setup);
  })());
  xwSource("flashcards");
  xwPick("mode", "listening");

  console.log("Flashcards: Word chain");
  check("Word chain reads the end of a word by the usual rules: ー doesn't count, a small ゃ counts as や, katakana reads as hiragana",
    xw.chainTail("コーヒー") === "ひ" && xw.chainTail("でんしゃ") === "や" && xw.chainTail("りんご") === "ご"
    && xw.chainTail("ほん") === "ん" && xw.chainHead("ビール") === "び" && xw.chainHead("ーあ") === null);
  check("romaji turns into kana like a Japanese keyboard: shi/chi/tsu/fu/ji, the kya row, っ, ん by n' / nn / n before a consonant",
    (() => {
      const k = window.RaumeStudy.kanaRomaji.toKana;
      const cases = [["shinbun", "しんぶん"], ["shimbun", "しんぶん"], ["onna", "おんな"], ["kin'en", "きんえん"], ["honn", "ほん"],
        ["matcha", "まっちゃ"], ["kitte", "きって"], ["kyou", "きょう"], ["densha", "でんしゃ"], ["tsukue", "つくえ"], ["tukue", "つくえ"],
        ["fuji", "ふじ"], ["huzi", "ふじ"], ["chichi", "ちち"], ["ko-hi-", "こーひー"], ["jagaimo", "じゃがいも"], ["zyagaimo", "じゃがいも"],
        ["SUSHI", "すし"], ["やさい", "やさい"], ["山", "山"]];
      return cases.every(([a, b]) => k(a, true) === b)
        && k("ky", false) === "ky" && k("hon", false) === "ほn" && k("konn", false) === "こnn" && k("konni", false) === "こんに";
    })());
  xwPick("mode", "wordchain");
  const wcTables = window.RaumeStudy.data.vocabularyTables.filter(t => t.tableClass !== "vocab-kanji").map(t => t.id);
  xw.state.source = "table"; xw.state.tables = wcTables.slice(); xw.state.puzzle = null;
  window.RaumeStudy.flashcards.render();
  const wcDict = xw.chainDictionary();
  const wcEl = sel => document.querySelector("#fcPanelGames " + sel);
  const wcType = text => {
    const f = wcEl(".fc-wc-field");
    f.value = text;
    f.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  const wcSubmit = () => wcEl(".fc-wc-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  const wcMsg = () => wcEl(".fc-wc-msg").textContent;
  check("Word chain: the first word in the trail, \"Starts with\" its last kana, a field to type in, Hint, and Skip in ⋯ -- nothing to tap instead", (() => {
    const p = xw.state.puzzle;
    const menu = [...document.querySelectorAll("#fcPanelGames .fc-xw-menu-item")].map(b => b.textContent).join("|");
    return !!p.start && wcEl(".fc-wc-kana").textContent === p.start.tail && !document.querySelector("#fcPanelGames .fc-oo-word")
      && document.querySelectorAll("#fcPanelGames .fc-wc-chip").length === 1 && !!wcEl(".fc-wc-field") && !!document.getElementById("fcXwHint")
      && !document.querySelector('#fcPanelGames [data-pick="script"]') && /^New game\|Skip this link\|How to play/.test(menu)
      && document.querySelectorAll("#fcPanelGames [style]").length === 0;
  })());
  // A small game we can steer: a first word whose last kana starts both a
  // word ending in ん and one that carries on.
  const wcCarries = (w, used) => w.tail !== "ん" && (wcDict.byHead[w.tail] || []).some(o => o.key !== w.key && !used[o.key] && o.tail !== "ん");
  const wcStart = wcDict.all.find(s => wcCarries(s, {}) && (wcDict.byHead[s.tail] || []).some(o => o.tail === "ん")
    && (wcDict.byHead[s.tail] || []).some(o => o.key !== s.key && o.written !== o.answer && !/[んン][あいうえおやゆよアイウエオヤユヨ]/.test(o.answer)
      && wcCarries(o, { [s.key]: true })));
  xw.state.puzzle = { start: wcStart, links: 3, poolIds: {}, placements: [] };
  window.RaumeStudy.flashcards.render();
  check("typing romaji shows it as kana as you go", (() => {
    wcType("yasa");
    const ok = wcEl(".fc-wc-field").value === "やさ";
    wcType("");
    return ok;
  })());
  check("a word with the wrong first kana: \"Needs to start with …\", the field shakes", (() => {
    const wrong = wcDict.all.find(w => w.head !== wcStart.tail && /^[ぁ-ゖ]+$/.test(w.answer));
    wcType(window.RaumeStudy.kanaRomaji.toRomaji(wrong.answer));
    wcSubmit();
    return wcMsg() === "Needs to start with " + wcStart.tail && wcEl(".fc-wc-form").classList.contains("fc-wc-shake")
      && document.querySelectorAll("#fcPanelGames .fc-wc-chip").length === 1;
  })());
  check("a word that isn't in the vocabulary: \"Not one of your words\"", (() => {
    wcType(wcStart.tail + "ぬぬぬぬ");
    wcSubmit();
    return wcMsg() === "Not one of your words";
  })());
  check("a word ending in ん: it can't carry the chain", (() => {
    const n = wcDict.byHead[wcStart.tail].find(o => o.tail === "ん");
    wcType(n.answer);
    wcSubmit();
    return wcMsg() === n.written + " ends on ん — the chain can’t go on";
  })());
  // (Not one with ん before a vowel -- toRomaji writes きんえん as "kinen".)
  const wcNext = wcDict.byHead[wcStart.tail].find(o => o.key !== wcStart.key && o.written !== o.answer && !/[んン][あいうえおやゆよアイウエオヤユヨ]/.test(o.answer)
    && wcCarries(o, { [wcStart.key]: true }));
  check("a good word typed in romaji joins the trail as it's written (kanji and all), its English under the field", (() => {
    wcType(window.RaumeStudy.kanaRomaji.toRomaji(wcNext.answer).replace(/[āīūēō]/g, v => ({ ā: "a-", ī: "i-", ū: "u-", ē: "e-", ō: "o-" })[v]));
    wcSubmit();
    const chips = document.querySelectorAll("#fcPanelGames .fc-wc-chip");
    return chips.length === 2 && chips[1].querySelector(".fc-wc-chip-w").textContent === wcNext.written
      && wcEl(".fc-wc-en").textContent === wcNext.written + " · " + wcNext.clue && wcMsg() === "" && wcEl(".fc-wc-kana").textContent === wcNext.tail
      && document.getElementById("fcLsCount").textContent === "2 / 3" && wcEl(".fc-wc-field").value === "";
  })());
  check("Hint shows the English of a word that would work", (() => {
    document.getElementById("fcXwHint").click();
    return /^Hint: .+/.test(wcMsg());
  })());
  check("⋯ › Skip this link moves on with a word that works", (() => {
    document.getElementById("fcXwSkip").click();
    return document.querySelectorAll("#fcPanelGames .fc-wc-chip").length === 3 && wcMsg() === "Skipped";
  })());
  await (async () => {
    const need = wcEl(".fc-wc-kana").textContent;
    const trailText = [...document.querySelectorAll("#fcPanelGames .fc-wc-chip-w")].map(c => c.textContent);
    const good = wcDict.byHead[need].find(o => o.tail !== "ん" && !trailText.includes(o.written));
    wcType(good.answer);
    wcSubmit();
    for (let waited = 0; waited < 3000 && !wcEl(".fc-mt-done"); waited += 25) await new Promise(r => setTimeout(r, 25));
    const last = window.RaumeStudy.flashcards.puzzleRuns.live("wordchain").pop();
    check("the typed game ends after its links: the one clean link scored, the hinted and skipped ones missed, help logged, its own setup",
      !!wcEl(".fc-mt-done") && wcEl(".fc-mt-done-time").textContent === "1 / 3" && wcEl(".fc-wc-chain").textContent.split(" → ").length === 4
      && !!last && last.right === 1 && last.n === 3 && last.help === 1 && last.missed.length === 2 && /\|kana\|type\|3$/.test(last.setup));
  })();
  xwSource("flashcards");
  xwPick("mode", "listening");

  console.log("Flashcards: Puzzle and game stats");
  const pr = window.RaumeStudy.flashcards.puzzleRuns;
  check("stats count each style on its own: played, a day streak, and a best measured per pair / word or as accuracy", (() => {
    const mt = pr.styleStats("match"), ls = pr.styleStats("listening");
    return mt.played === pr.live("match").length && mt.played >= 1 && mt.streak.current === 1 && mt.best > 0
      && ls.played >= 1 && ls.best > 0 && ls.best <= 1 && mt.bests.length >= 1 && mt.trend.length === Math.min(30, mt.played);
  })());
  check("trimming the log past its cap keeps old games that still hold a record and drops the rest", (() => {
    const t0 = Date.parse("2020-01-01T00:00:00Z"), at = i => new Date(t0 + i * 60000).toISOString();
    const runs = [
      { id: "pb", at: at(0), mode: "match", n: 6, ms: 5000, miss: 0, setup: "cap|romaji|6" },
      { id: "plain", at: at(1), mode: "match", n: 6, ms: 99000, miss: 0, setup: "cap|romaji|6" }
    ];
    for (let i = 0; i < pr.MAX; i++) runs.push({ id: "n" + i, at: at(2 + i), mode: "match", n: 6, ms: 20000, miss: 0, setup: "cap|romaji|6" });
    const ids = pr.sanitize(runs).map(r => r.id);
    return ids.includes("pb") && !ids.includes("plain") && ids.length === pr.MAX + 1;
  })());
  check("Tricky words are the words missed in two or more games, most-missed first", (() => {
    // The Match above missed two words once each; one more game missing
    // the first makes it tricky, the second stays out.
    const once = pr.live("match").filter(r => r.missed).pop().missed;
    const before = pr.trickyWords(50).map(w => w.id);
    pr.record({ mode: "match", n: 6, ms: 9000, miss: 1, missed: [once[0]] });
    const t = pr.trickyWords(50);
    const at = id => t.findIndex(w => w.id === id);
    return at(once[0]) !== -1 && t[at(once[0])].count >= 2
      && (at(once[1]) === -1) === !before.includes(once[1]) && t.every((w, i) => i === 0 || t[i - 1].count >= w.count);
  })());
  document.getElementById("fcXwStats").click();
  check("⋯ › Stats opens Game stats as a pushed screen: the game as a title menu (every game), the one you were on, Overview rows and a Reset row", (() => {
    const panel = document.getElementById("fcPanelStats");
    const sel = document.getElementById("fcStMode");
    const segs = [...sel.options].map(o => o.textContent);
    return !panel.hidden && document.querySelector("#flashcardsPage .fc-titlebar h1").textContent === "Game stats"
      && !!document.getElementById("fcBack") && segs.join("|") === "Match|Listening|Kana tiles|Odd one out|Speed sort|Word chain"
      && sel.value === "listening" && panel.querySelector(".fc-st-modes .fc-xw-title-text").textContent === "Listening"
      && /accuracy/.test(panel.querySelector(".fc-st-hero").textContent) && /Reset Listening stats/.test(panel.textContent);
  })());
  (sel => { sel.value = "match"; sel.dispatchEvent(new window.Event("change")); })(document.getElementById("fcStMode"));
  check("Match stats: best pace, a trend line once there are two games, a personal best per setup that opens its history, and Tricky words with Practise these", (() => {
    const panel = document.getElementById("fcPanelStats");
    const best = panel.querySelector(".fc-st-best");
    if (!best) return false;
    best.click();
    const hist = document.querySelectorAll("#fcPanelStats .fc-st-history li").length;
    return /best per pair/.test(panel.querySelector(".fc-st-hero").textContent) && panel.querySelectorAll(".fc-st-fig").length === 3
      && !!panel.querySelector(".fc-st-chart polyline") && !!panel.querySelector(".fc-st-best .fc-st-chev")
      && panel.querySelector(".fc-st-best-title").textContent === "Flashcards"
      && /^Romaji · \d+ words · \d+ games?$/.test(panel.querySelector(".fc-st-best .fc-st-count").textContent)
      && hist >= 1 && document.querySelector("#fcPanelStats .fc-st-best").getAttribute("aria-expanded") === "true"
      && panel.querySelectorAll(".fc-st-word").length >= 1
      && document.querySelectorAll("#fcPanelStats [style]").length === 0;
  })());
  const practiseBtn = document.getElementById("fcStPractise");
  if (practiseBtn) {
    practiseBtn.click();
    check("Practise these starts the style from just the missed words, on its own tab, the Source reading Tricky words", (() => {
      const ids = pr.trickyWords(20, 1).map(t => t.id);
      return !document.getElementById("fcPanelGames").hidden && xw.state.source === "tricky" && xw.state.mode === "match"
        && (!xw.state.puzzle.placements || xw.state.puzzle.placements.every(w => ids.includes(w.id)))
        && document.querySelector("#fcPanelGames #fcXwSource .fc-xw-menu-val").textContent === "Tricky words";
    })());
    xwSource("flashcards");
  } else {
    check("Practise these appears once six words have been missed", pr.trickyWords(20, 1).length < 6);
    document.getElementById("fcBack").click();
  }
  document.getElementById("fcXwStats").click();
  (sel => { sel.value = "match"; sel.dispatchEvent(new window.Event("change")); })(document.getElementById("fcStMode"));
  const mtBefore = pr.live("match").length;
  document.getElementById("fcStReset").click();
  check("Reset asks first, iOS-style: an action sheet with the message, a red Reset Stats and Cancel -- Cancel changes nothing", (() => {
    const sheet = document.querySelector(".ios-confirm");
    const ok = !!sheet && sheet.querySelector('[role="alertdialog"]') && /can’t be undone/.test(sheet.textContent)
      && document.getElementById("iosConfirmGo").textContent === "Reset Stats" && /Every Match game/.test(sheet.textContent) && document.activeElement === document.getElementById("iosConfirmCancel");
    document.getElementById("iosConfirmCancel").click();
    return ok && !document.querySelector(".ios-confirm") && pr.live("match").length === mtBefore && mtBefore > 0;
  })());
  document.getElementById("fcStReset").click();
  document.getElementById("iosConfirmGo").click();
  check("Reset Match stats (after a confirm) clears Match's numbers and bests but leaves Listening's -- a marker in the log keeps them cleared across a sync merge", (() => {
    const markers = pr.all().filter(r => r.reset && r.mode === "match");
    pr.applyRemote(pr.all().concat([{ id: "old-remote", at: "2020-01-01T00:00:00Z", mode: "match", n: 6, ms: 9000, miss: 0 }]));
    return pr.live("match").length === 0 && pr.live("listening").length >= 1 && markers.length === 1
      && /No Match games yet/.test(document.getElementById("fcPanelStats").textContent)
      && pr.all().filter(r => r.mode === "match" && r.setup).every(r => xw.bestTime(r.setup) === null);
  })());
  document.getElementById("fcBack").click();
  check("Back returns to Games", !document.getElementById("fcPanelGames").hidden);
  document.querySelector('.fc-tab[data-tab="dashboard"]').click();
  check("the Dashboard has a Puzzles card and a Games card, each with a way in and See stats", (() => {
    const p = document.querySelector("#fcPanelDashboard .fc-puzzles-card"), g = document.querySelector("#fcPanelDashboard .fc-games-card");
    return !!p && !!g && !!p.querySelector('[data-dash-go="puzzles"]') && !!p.querySelector('[data-dash-go="stats-puzzles"]')
      && !!g.querySelector('[data-dash-go="games"]') && !!g.querySelector('[data-dash-go="stats-games"]')
      && /Games played/.test(g.textContent) && !/Games played/.test(p.textContent);
  })());
  check("the cards show two figures that hold for every game (count, day streak) and recent rows that say each fact once -- the game's name, the date under it, the result trailing", (() => {
    const g = document.querySelector("#fcPanelDashboard .fc-games-card");
    const labels = [...g.querySelectorAll(".fc-stat-label")].map(l => l.textContent);
    const row = g.querySelector(".fc-pz-row");
    const name = row.querySelector(".fc-pz-what").firstChild.textContent;
    return labels.join("|") === "Games played|Day streak" && /^(Match|Listening|Kana tiles|Odd one out|Speed sort|Word chain)$/.test(name)
      && /^(\d+ \/ \d+|\d+:\d\d\.\d)$/.test(row.querySelector(".fc-pz-how").textContent)
      && !/ words?$/.test(row.querySelector(".fc-pz-when").textContent.split(" · ").pop() || "") ;
  })());
  document.querySelector('#fcPanelDashboard [data-dash-go="stats-puzzles"]').click();
  check("See stats on the Puzzles card opens Puzzle stats with the three grid styles", document.querySelector("#flashcardsPage .fc-titlebar h1").textContent === "Puzzle stats"
    && [...document.getElementById("fcStMode").options].map(o => o.textContent).join("|") === "Crossword|Arroword|Word search");
  document.getElementById("fcBack").click();
  document.querySelector('.fc-tab[data-tab="crosswords"]').click();

  xwSource("flashcards");
  check("switching back to Flashcards empties the table pick", xw.state.tables.length === 0
    && document.querySelector("#fcPanelCrosswords #fcXwSource .fc-xw-menu-val").textContent === "Flashcards");

  // Undo the cards added above -- this section's only job was guaranteeing
  // a pool for the UI checks, not permanently growing the deck.
  Object.keys(xwCache.cards).forEach(function (id) { if (xwCardsBefore.indexOf(id) === -1) delete xwCache.cards[id]; });
  window.RaumeStudy.flashcards.store.saveCache();
  window.RaumeStudy.flashcards.render();

  console.log("Flashcards: Settings tab");
  fcOpenPushed("settings");
  check("Settings card titles are sentence case, like the Help tab's", (() => {
    const titles = [...document.querySelectorAll("#fcPanelSettings .help-head")].map(h => h.textContent.trim());
    // no title has a Title-Cased second word (acronyms like FSRS are fine)
    return titles.length >= 3 && titles.every(t => !/ [A-Z][a-z]/.test(t));
  })());
  check("Help and Settings hold a readable measure, not the full sheet", (() => {
    const rule = allCssRules.find(r => r.selectorText
      && /#fcPanelHelp/.test(r.selectorText) && /#fcPanelSettings/.test(r.selectorText));
    return !!rule && parseInt(rule.style.maxWidth, 10) > 0 && parseInt(rule.style.maxWidth, 10) <= 720;
  })());
  check("Settings is iOS rows: label left, value right, each card's explainer behind an ⓘ on its header -- hidden until tapped", (() => {
    const row = document.getElementById("fcRetention").closest(".set-row");
    const info = document.querySelector("#fcPanelSettings .set-info");
    const foot = info && document.getElementById(info.getAttribute("aria-controls"));
    if (!row || !foot || !foot.hidden) return false;
    info.click();
    const shown = !foot.hidden;
    info.click();
    return window.getComputedStyle(row).justifyContent === "space-between"
      && !document.querySelector("#fcPanelSettings .fc-settings-help")
      && document.querySelectorAll("#fcPanelSettings .set-info").length >= 3 && shown && foot.hidden;
  })());
  const dirChecks = [...document.querySelectorAll(".fc-dir-checkbox")];
  check("all 4 directions are offered as a setting", dirChecks.length === 4);
  check("all 4 are enabled by default", dirChecks.every(cb => cb.checked));
  const fcChange = el => el.dispatchEvent(new window.Event("change", { bubbles: true }));
  check("there's no Save button -- changes save as you make them, as in iOS Settings", !document.getElementById("fcSaveSettings"));
  for (const cb of dirChecks) { cb.checked = false; fcChange(cb); await flush(); }
  check("the last direction can't be turned off: its tick comes back with a note",
    document.getElementById("fcDirError").hidden === false
    && [...document.querySelectorAll(".fc-dir-checkbox")].filter(cb => cb.checked).length === 1);
  for (const cb of [...document.querySelectorAll(".fc-dir-checkbox")]) { if (!cb.checked) { cb.checked = true; fcChange(cb); await flush(); } }
  document.querySelector('.fc-dir-checkbox[data-direction="ro-en"]').checked = false;
  fcChange(document.querySelector('.fc-dir-checkbox[data-direction="ro-en"]'));
  await flush();
  check("a saved change is announced to a screen reader", document.getElementById("fcSettingsSaved").textContent === "Saved");
  fcOpenPushed("settings");
  const roEnBox = document.querySelector('.fc-dir-checkbox[data-direction="ro-en"]');
  check("turning off just one direction is remembered", !roEnBox.checked && document.querySelector('.fc-dir-checkbox[data-direction="jp-en"]').checked);
  roEnBox.checked = true;
  fcChange(roEnBox); // leave every direction enabled again for later checks
  await flush();

  // The Kana trainer's own FSRS knobs, in the same tab.
  fcOpenPushed("settings");
  check("Settings also exposes the Kana trainer's own FSRS knobs, defaulting to 90%", (() => {
    return ["fcKanaRetention", "fcKanaMaxInterval", "fcKanaFuzz", "fcKanaNewPerDay"].every(id => !!document.getElementById(id))
      && document.getElementById("fcKanaRetention").value === "90"
      && document.getElementById("fcKanaNewPerDay").value === "15";
  })());
  document.getElementById("fcKanaRetention").value = "85";
  document.getElementById("fcKanaNewPerDay").value = "3";
  document.getElementById("fcKanaMaxInterval").value = "9999999"; // above the ceiling -> clamps to 36500
  fcChange(document.getElementById("fcKanaMaxInterval"));
  await flush();
  if (storageUsable) check("the kana knobs persist to the kana cache, independent of the vocab knobs and clamped", (() => {
    const f = (JSON.parse(readLocalStorage("raume-kana-v1") || "{}").fsrs) || {};
    return f.fsrs_request_retention === 0.85 && f.new_per_day === 3 && f.fsrs_maximum_interval === 36500;
  })());
  fcOpenPushed("settings");
  check("the clamped kana values are reflected back into the fields", document.getElementById("fcKanaMaxInterval").value === "36500");
  check("the Kana queue honours the new per-day cap", (() => {
    kh.setGroup("hira-gojuon", true);
    const q = kh.buildQueue(new Date());
    return q.length > 0 && q.length <= 6; // 3 new + any leftover due/learning, vs 90+ uncapped
  })());
  document.getElementById("fcKanaRetention").value = "90";
  document.getElementById("fcKanaNewPerDay").value = "15";
  fcChange(document.getElementById("fcKanaNewPerDay")); // restore defaults for later checks
  await flush();

  console.log("Flashcards: Help tab");
  fcOpenPushed("help");
  check("the Manage status legend documents all four states, including Paused", (() => {
    const items = [...document.querySelectorAll("#fcPanelHelp .fc-help-status li")].map(li => li.textContent.trim());
    return items.length === 4 && items.some(t => t.includes("Not added")) && items.some(t => t.includes("In flashcards"))
      && items.some(t => t.includes("Due for review")) && items.some(t => t.includes("Paused"));
  })());
  check("Words to Review renders no icon-choosing UI -- it's a synthetic table, nothing to persist an icon against", (() => {
    const host = document.getElementById("fcWordsToReview");
    return !host || (!host.querySelector(".section-icon") && !host.querySelector(".section-icon-btn"));
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
    const cols = [...wrap.querySelectorAll(".section-menu-list .col-menu-item[role=menuitemcheckbox]")].map(b => b.dataset.col);
    return typeof window.RaumeStudy.vocab.applyColVisibility === "function"
      && !/col-menu-item/.test(without)
      && ["japanese", "furigana", "english"].every(k => cols.includes(k));
  })());
  check("Words to Review's column items are ⋯ menu checkmarks, never a multi-select segmented control", (() => {
    const host = document.getElementById("fcWordsToReview");
    return !document.querySelector(".view-mode")
      && (!host || !host.querySelector(".col-menu-item") || [...host.querySelectorAll(".col-menu-item")].every(b => b.hasAttribute("aria-checked")));
  })());

  check("the Practice screen carries no \"Signed in as\" status line -- the account menu says it", !document.querySelector(".fc-signed-in-as"));
  document.getElementById("accountToggle").click();
  const goAccountBtn = document.querySelector('#accountMenu [data-menu-go="account"]');
  check("the account button opens its menu at any width, and a guest's Account row reads Sign in", !document.getElementById("accountMenu").hidden
    && !!goAccountBtn && /^Sign in/.test(goAccountBtn.textContent));
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
    if (document.getElementById("fcBack")) document.getElementById("fcBack").click(); // last screen left open was Help
    document.querySelector('.fc-tab[data-tab="dashboard"]').click();
    const totalTileAgain = document.querySelector(".fc-stat-tile:nth-child(1) .fc-stat-value").textContent;
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
  check("normalizeAnswer drops sentence punctuation so a phrase answer is typeable", (() => {
    return fc.normalizeAnswer("Onamae wa?", true) === fc.normalizeAnswer("onamae wa", true)
      && fc.normalizeAnswer("What is your name?", false) === fc.normalizeAnswer("what is your name", false);
  })());
  const vocabIndex = fc.getVocabIndex();
  const beerEntry = Object.values(vocabIndex).find(e => e.englishDisplay === "beer");
  check("vocab index resolves a known entry by content", !!beerEntry);
  check("checkAnswer accepts an exact (normalized) match", fc.checkAnswer(beerEntry, "jp-en", "  BEER "));
  check("checkAnswer rejects a clearly wrong answer", !fc.checkAnswer(beerEntry, "jp-en", "wine"));
  check("the right answer in the other language gets a hint, not a grade", (() => {
    const kaeru = Object.values(vocabIndex).find(e => e.romajiDisplay === "kaeru / kaerimasu");
    return !!kaeru
      && /reading/.test(fc.otherLanguageHint(kaeru, "jp-en", "kaeru / kaerimasu"))
      && /reading/.test(fc.otherLanguageHint(kaeru, "jp-en", "Kaeru"))
      && /meaning/.test(fc.otherLanguageHint(kaeru, "jp-ro", "go home"))
      && fc.otherLanguageHint(kaeru, "jp-en", "leave") === ""
      && fc.otherLanguageHint(kaeru, "jp-ro", "kaeri") === "";
  })());
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
  const particleEntry = Object.values(vocabIndex).find(e => e.englishDisplay === "topic / contrast");
  check("a particle entry's flashcard prompt carries the blue/bold .particle span", () =>
    !!particleEntry && /<span class="particle">は<\/span>/.test(fc.promptFor(particleEntry, "jp-en").html));
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
