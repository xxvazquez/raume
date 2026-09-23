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
  check("renders 32 table sections", sections.length === 32);
  const totalRows = document.querySelectorAll(".vocab tbody tr").length;
  check("renders 660 vocabulary rows", totalRows === 660);
  check("adjective rows tint the Japanese text い-adj/な-adj, with a visually-hidden note, and only those rows do", (() => {
    const adjSection = [...document.querySelectorAll('.table-section[data-section="grammar"]')]
      .find(s => s.querySelector(".section-title-text").textContent === "Adjectives");
    const tagged = [...adjSection.querySelectorAll("tbody tr td.jp.adj-i, tbody tr td.jp.adj-na")];
    if (tagged.length < 30) return false;
    const labelsOk = tagged.every(td => {
      const note = td.querySelector(".visually-hidden");
      const i = td.classList.contains("adj-i") && note && note.textContent === "(い-adjective)";
      const na = td.classList.contains("adj-na") && note && note.textContent === "(な-adjective)";
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
  check("every Japanese cell has one speaker button per form, keyed to the kana reading (not the kanji)", [...document.querySelectorAll("td.jp")].every(td => {
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
      && irr.length === 5 && irr.every(r => r.cells[1].querySelector(".adj-badge-irr").tagName === "BUTTON" && /—/.test(r.cells[1].querySelector(".adj-badge-irr").dataset.role))
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
  check("every verb-pair row has one clickable verb-group badge in its English cell (not the Japanese cell), reading included; the three look-alike exceptions are outlined and carry their word-specific reason, every other 変格 row still explains why it's irregular (not just named), and godan/ichidan rows carry no reason at all", (() => {
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
    return badgeOk && rows.length === 38 && document.querySelectorAll(".vocab .adj-note").length === 0
      && irr.length === 3 && irr.every(r => /—/.test(r.cells[1].querySelector(".verb-badge-irr").dataset.role))
      && !!kiru && kiru.cells[1].querySelector(".verb-badge-godan.verb-badge-irr")
      && !!kuru && kuru.cells[1].querySelector(".verb-badge-irregular.verb-badge-irr")
      && kuru.cells[1].querySelector(".verb-badge").dataset.reading === "へんかく"
      // every 変格 row explains itself, outlined or not (verbNote or the class's own genericNote)
      && irregularClass.length > 0 && irregularClass.every(r => /—/.test(r.cells[1].querySelector(".verb-badge").dataset.role))
      // godan/ichidan rows with nothing worth a second look carry no reason at all
      && godanIchidan.filter(r => !r.cells[1].querySelector(".verb-badge-irr")).every(r => !/—/.test(r.cells[1].querySelector(".verb-badge").dataset.role));
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
    const sections = ["vocabulary", "grammar", "phrases", "travel", "flashcards"];
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
    return auto === "paw" && fallback === "bookmark" && renamed === "apple" && picked === "star";
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
  check("every other screen's own title is a real <h1> too (Flashcards, Customize tables, How this works)", (() => {
    const flashTitle = document.querySelector(".page-flashcards h1");
    return !!flashTitle && flashTitle.textContent === "Flashcards"
      && document.querySelector(".page-help h1").textContent === "How this works";
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
    return ["vocabulary", "grammar", "phrases", "travel"].every(sec => rules.some(t => t.includes('data-section="' + sec + '"') && t.includes("::before")))
      && rules.some(t => t.includes('data-page="flashcards"') && t.includes("::before"))
      && document.querySelectorAll("#siteNav .site-nav-link").length === 5;
  })());
  check("the Vocabulary nav link starts active", document.querySelector('#siteNav .site-nav-link[data-section="vocabulary"]').classList.contains("active"));
  check("only the Vocabulary section's tables are shown", [...document.querySelectorAll("#vocabulary .table-section")].every(s => s.classList.contains("page-hidden") === (s.dataset.section !== "vocabulary")));
  check("Grammar tables belong to the grammar section", [...document.querySelectorAll('.table-section[data-category="Grammar"]')].every(s => s.dataset.section === "grammar"));
  check("Travel tables belong to the travel section", [...document.querySelectorAll('.table-section[data-category="Travel"]')].every(s => s.dataset.section === "travel"));
  check("Phrases tables belong to the phrases section", [...document.querySelectorAll('.table-section[data-category="Phrases"]')].every(s => s.dataset.section === "phrases"));
  check("every other category belongs to the vocabulary section", [...document.querySelectorAll(".table-section")].filter(s => !["Grammar", "Phrases", "Travel"].includes(s.dataset.category)).every(s => s.dataset.section === "vocabulary"));

  console.log("Vocabulary section: content-category sub-headings + table-index dropdown");
  const catHeads = [...document.querySelectorAll('#vocabulary .cat-heading[data-section="vocabulary"]')];
  check("a sub-heading per Vocabulary category (Food & Ingredients / Kitchen & Dining / Numbers & Counting / Time & Calendar)", catHeads.length === 4);
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
  check("the Vocabulary panel groups links by category (4 groups, 4 labels)", vocPanel.querySelectorAll('.tindex-cat-group').length === 4 && vocPanel.querySelectorAll('.tindex-cat').length === 4);
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
  check("nav is Vocabulary / Grammar / Phrases / Travel / Flashcards", navLinks.map(l => l.textContent) .join(" ") === "Vocabulary Grammar Phrases Travel Flashcards");
  check("the four reference sections carry data-section", navLinks.slice(0, 4).map(l => l.dataset.section).join(",") === "vocabulary,grammar,phrases,travel");
  check("last nav item is Flashcards", navLinks[navLinks.length - 1].dataset.page === "flashcards");
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

  console.log("Phrases section (Self-introduction)");
  window.location.hash = "#phrases";
  window.dispatchEvent(new window.Event("popstate"));
  check("#phrases routes to its own section", document.body.dataset.activeSection === "phrases");
  check("its nav link is the active one", document.querySelector('#siteNav .site-nav-link[data-section="phrases"]').classList.contains("active")
    && !document.querySelector('#siteNav .site-nav-link[data-section="grammar"]').classList.contains("active"));
  check("only Phrases tables show", [...document.querySelectorAll("#vocabulary .table-section")].every(s => s.classList.contains("page-hidden") === (s.dataset.section !== "phrases")));
  check("the Phrases accent is its own well-spread hue", (() => {
    const light = allCssRules.find(r => r.selectorText === ":root");
    return /^#[0-9a-f]{6}$/i.test((light.style.getPropertyValue("--sec-phrases") || "").trim());
  })());
  const selfIntro = [...document.querySelectorAll('.table-section[data-section="phrases"]')]
    .find(s => s.querySelector('.section-title-text').textContent === "Self-introduction");
  check("Self-introduction renders its rows with furigana and blue/bold particles", (() => {
    if (!selfIntro) return false;
    const rows = [...selfIntro.querySelectorAll('tbody tr')];
    const nameRow = rows.find(r => /name/i.test(r.textContent));
    return rows.length >= 20
      && nameRow && nameRow.querySelector('ruby rt') && nameRow.querySelector('.particle')
      && [...selfIntro.querySelectorAll('.particle')].some(p => p.textContent === "は");
  })());
  check("a sentence table is two columns (Japanese + English), same as every other table", (() => {
    const heads = [...selfIntro.querySelectorAll('thead th')].map(th => th.textContent.replace(/[↕↓↑]/g, "").trim());
    const firstRow = selfIntro.querySelector('tbody tr');
    return heads.join(",") === "Japanese,English" && firstRow.cells.length === 2;
  })());
  check("English is plainly visible now (no translate icon -- that's inverted for consistency)", (() => {
    const row = selfIntro.querySelector('tbody tr');
    return !row.querySelector('.phrase-en-btn') && !!row.cells[1].querySelector('.meaning-text').textContent.trim();
  })());
  check("romaji instead sits behind the same word-tap reveal every table uses", (() => {
    const row = selfIntro.querySelector('tbody tr');
    const jpword = row.cells[0].querySelector('.jpword[data-romaji]');
    return !!jpword && jpword.dataset.romaji.trim().length > 0 && !jpword.classList.contains('jp-romaji-on');
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
    const jpword = selfIntro.querySelector('tbody tr td.jp .jpword[data-romaji]');
    jpword.click();
    const opened = jpword.classList.contains('jp-romaji-on');
    jpword.click();
    return opened && !jpword.classList.contains('jp-romaji-on');
  })());
  check("the authored question/answer order is kept (not re-sorted A-Z)", (() => {
    const firstEn = selfIntro.querySelector('tbody tr .meaning-text').textContent.trim();
    return firstEn === "What is your name?"; // v0530, first row of the table
  })());
  window.location.hash = "";
  check("search still finds a phrase by its romaji, though the column is gone", (() => {
    const input = document.getElementById("tableSearch");
    input.value = "sunde imasu";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    const hit = [...document.querySelectorAll('#vocabulary .table-section[data-section="phrases"] tbody tr:not(.search-hidden)')]
      .some(r => /sunde imasu/i.test(r.cells[0].querySelector('.jpword[data-romaji]')?.dataset.romaji || ''));
    input.value = "";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    return hit;
  })());
  check("a romaji-only match auto-reveals and highlights the reading (can't wrap content: attr(...) in <mark>, so the whole reading is flagged instead)", (() => {
    const input = document.getElementById("tableSearch");
    input.value = "sunde imasu";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    const jpword = [...document.querySelectorAll('#vocabulary .table-section[data-section="phrases"] tbody tr:not(.search-hidden)')]
      .map(r => r.cells[0].querySelector('.jpword[data-romaji]'))
      .find(w => w && /sunde imasu/i.test(w.dataset.romaji));
    const hit = !!jpword && jpword.classList.contains('jp-romaji-hit');
    input.value = "";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    return hit && !jpword.classList.contains('jp-romaji-hit'); // cleared once the query is gone
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
  check("print adds a vertical rule between columns (not on screen)", (() => {
    const printMedia = allCssRules.find(r => r.media && /^print$/.test(r.media.mediaText));
    const printRule = printMedia && [...printMedia.cssRules].find(r => r.selectorText === ".vocab :is(th, td):not(:first-child)");
    const screenRule = allCssRules.find(r => !((r.parentRule || {}).media) && r.selectorText === ".vocab :is(th, td):not(:first-child)");
    return !!printRule && printRule.style.borderLeft.includes("1px") && !screenRule;
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
  check("it lists every one of the 32 tables", czRows.length === 32);
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

  console.log("Customize page: drag-to-reorder (the ▲▼ buttons' pointer-only sibling)");
  // firstVocabGroup (above) is a snapshot from before the move-down + reset
  // clicks already re-rendered #customizePage -- a stale, now-detached node.
  // vocabCats[0] is just the name string, so it's still good as a lookup key
  // for querying the *current* live element fresh each time.
  const freshFirstVocabGroup = () => [...document.querySelectorAll("#customizePage .cz-group")].find(g => g.querySelector(".cz-group-name").textContent === vocabCats[0]);
  check("every row carries a drag handle, pointer-only -- out of the tab order and hidden from a screen reader (the ▲▼ buttons are that path)", (() => {
    const handles = [...foodGroup().querySelectorAll(".cz-row .cz-drag-handle")];
    return handles.length === 7 && handles.every(h => h.tagName === "BUTTON" && h.tabIndex === -1 && h.getAttribute("aria-hidden") === "true");
  })());
  check("a multi-category section's header carries one too", !!freshFirstVocabGroup().querySelector(".cz-group-title .cz-drag-handle"));
  check("Grammar (no category move controls) has no category drag handle either -- nothing to drag it against", (() => {
    const g = [...document.querySelectorAll("#customizePage .cz-group")].find(x => x.querySelector(".cz-group-name").textContent === "Grammar");
    return !g.querySelector(".cz-group-title .cz-drag-handle");
  })());
  check("clicking a category's handle (as a stray click after a drag might) doesn't also toggle its <details> -- same guard the ▲▼ buttons need", (() => {
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
  check("dragging the last row's handle to the top reorders it there, through the same tc().setTableOrder the ▲▼ buttons call", (() => {
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
  check("dragging a category's handle past a sibling reorders the section, through the same tc().setCategoryOrder the ▲▼ buttons call", (() => {
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
    check("...it renders on the vocabulary page with real furigana", (() => {
      const tr = document.querySelector('#vocabulary tr[data-vocab-id="' + made.id + '"]');
      return !!tr && !!tr.querySelector("ruby rt") && /eggplant/.test(tr.textContent);
    })());
    cvNs.deleteRow(made.id);
    check("deleteRow removes it again, restoring the dataset", vegTable.rows.length === before
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
  check("it's labeled as on-device, not signed in", document.getElementById("flashcardsPage").textContent.includes("This device only"));

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
  const totalTileAfter = document.querySelector(".fc-stat-tile:nth-child(2) .fc-stat-value").textContent;
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
  check("the Flashcards sub-tabs are four segments -- Settings and Help moved to the title bar",
    [...document.querySelectorAll("#flashcardsPage .fc-tab")].map(b => b.textContent).join("|") === "Dashboard|Manage|Kana|Puzzles"
    && [...document.querySelectorAll("#flashcardsPage .fc-titlebar-btn")].map(b => b.textContent).join("|") === "Settings|Help");
  document.querySelector('.fc-tab[data-tab="manage"]').click();
  fcOpenPushed("settings");
  check("Settings opens as a pushed screen: its own title, a Back button, no segmented control",
    document.querySelector("#flashcardsPage .fc-titlebar h1").textContent === "Settings"
    && !!document.getElementById("fcBack") && !document.querySelector("#flashcardsPage .fc-tabs"));
  check("Settings offers Download backup / Restore in guest mode", !!document.getElementById("fcBackupExport") && !!document.getElementById("fcBackupImport") && !!document.getElementById("fcBackupFile"));
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
      && /^(Correct|Almost|Not quite)\./.test(al) && /Answer: .+\.$/.test(al);
  })());
  check("the reveal doesn't repeat the prompt -- the original above is still there", (() => {
    return document.querySelectorAll(".fc-review-card .fc-prompt-small").length === 0
      && document.querySelectorAll(".fc-review-card .fc-prompt").length === 1;
  })());
  check("the reveal shows one field of context (meaning/reading), not just the answer -- the reading sits under the word for Japanese -> English, the meaning line under the answer for the other three directions", (() => {
    const direction = (document.querySelector(".fc-review-progress") || {}).textContent || "";
    if (direction.indexOf("Japanese → English") === 0) {
      const readingEl = document.querySelector(".fc-prompt-reading");
      return !!readingEl && !readingEl.hidden && readingEl.textContent.trim().length > 0;
    }
    const meaningEl = document.querySelector(".fc-stage-meaning");
    return !!meaningEl && meaningEl.textContent.trim().length > 0;
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
  check("what you typed shows as a quiet secondary line, struck through, below the big answer", (() => {
    const typedEl = document.querySelector(".fc-stage-typed");
    return !!typedEl && /you wrote/i.test(typedEl.textContent) && !!typedEl.querySelector("s, mark.fc-diff-you");
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

  console.log("Flashcards: Crosswords (Puzzles) tab");
  const xw = window.RaumeStudy.flashcards.crosswords.__testHooks;
  const xwPick = (name, value) => {
    const sel = document.querySelector('#fcPanelCrosswords [data-pick="' + name + '"]');
    sel.value = value;
    sel.dispatchEvent(new window.Event("change", { bubbles: true }));
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
  check("Source / Style / Script / Words are all in view as compact picker rows -- a native select behind each, no segmented controls, no \"More options\" disclosure", (() => {
    const labels = [...document.querySelectorAll("#fcPanelCrosswords .fc-xw-config .fc-xw-pick-label")].map(l => l.textContent);
    return labels.includes("Source") && labels.includes("Style") && labels.includes("Script") && labels.includes("Words")
      && document.querySelectorAll("#fcPanelCrosswords .fc-xw-pick-select").length === 4
      && !document.querySelector("#fcPanelCrosswords .fc-manage-filters") && !document.getElementById("fcXwMoreToggle");
  })());
  check("the toolbar is New puzzle (tinted) + Check (filled) + a ⋯ menu holding Reveal a letter / Reveal puzzle / Clear answers / Print -- no row of unlabeled icon buttons", (() => {
    const menu = document.querySelector("#fcPanelCrosswords .fc-xw-menu");
    const items = menu ? [...menu.querySelectorAll(".fc-xw-menu-item")].map(b => b.textContent.trim()) : [];
    return document.getElementById("fcXwNew").classList.contains("fc-btn") && !document.getElementById("fcXwNew").classList.contains("fc-btn-primary")
      && document.getElementById("fcXwCheck").classList.contains("fc-btn-primary")
      && items.join("|") === "Reveal a letter|Reveal puzzle|Clear answers|Print"
      && menu.querySelector(".section-menu-list").hidden
      && !document.querySelector("#fcPanelCrosswords .fc-xw-icon-btn");
  })());
  check("the clue bar starts with a prompt, before any square is picked",
    document.querySelector("#fcPanelCrosswords .fc-xw-current").classList.contains("fc-xw-current-idle"));
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

  check("tapping a clue in the list tints it, spells it out in the clue bar, and typing then runs along that word's own direction", (() => {
    const li = document.querySelector('#fcPanelCrosswords .fc-xw-cluerows li[data-dir="down"]')
      || document.querySelector("#fcPanelCrosswords .fc-xw-cluerows li");
    const [r, c] = li.dataset.start.split(",").map(Number);
    li.click();
    const start = document.activeElement;
    const bar = document.querySelector("#fcPanelCrosswords .fc-xw-current");
    const ok = start.dataset.r === String(r) && start.dataset.c === String(c)
      && li.classList.contains("fc-xw-clue-active") && !bar.classList.contains("fc-xw-current-idle")
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

  xwPick("source", "table");
  const xwDefaultTable = window.RaumeStudy.data.vocabularyTables.find(t => String(t.id) === String(xw.state.tables[0]));
  check("switching source to \"A table\" collapses behind a Table row, defaulted to the first table with enough words for a real grid, and builds a puzzle from it", (() => {
    const toggle = document.getElementById("fcXwTablesToggle");
    return !!xwDefaultTable && xw.tableWordPool([xwDefaultTable.id]).length >= 10 && toggle.textContent.includes(xwDefaultTable.title)
      && toggle.getAttribute("aria-expanded") === "false" && !!document.querySelector("#fcPanelCrosswords .fc-xw-grid");
  })());
  check("the print title names the puzzle style and its source, even though the intro line above it is hidden from print",
    /^(Crossword|Arroword) — /.test(document.querySelector("#fcPanelCrosswords .fc-xw-print-title").textContent));

  document.getElementById("fcXwTablesToggle").click();
  check("opening the Table row shows a checkmark row per table (the Settings tab's .fc-direction-check), grouped by category, the default table already checked", (() => {
    const picker = document.getElementById("fcXwTablePicker");
    const cb = picker && picker.querySelector('input[data-table-id="' + xwDefaultTable.id + '"]');
    return !!picker && picker.querySelectorAll(".fc-xw-table-cat").length > 1 && !!cb && cb.checked
      && cb.closest("label").classList.contains("fc-direction-check");
  })());

  const xwOtherTable = window.RaumeStudy.data.vocabularyTables.find(t => t !== xwDefaultTable && xw.tableWordPool([t.id]).filter(w => w.romaji).length >= 20);
  const otherCb = document.querySelector('#fcXwTablePicker input[data-table-id="' + xwOtherTable.id + '"]');
  otherCb.checked = true;
  otherCb.dispatchEvent(new window.Event("change", { bubbles: true }));
  check("checking a second table adds it alongside the first -- multiple tables feed one puzzle, not a replacement", (() => {
    return xw.state.tables.length === 2 && document.querySelector("#fcPanelCrosswords .fc-xw-print-title").textContent.includes(xwOtherTable.title);
  })());

  const defaultCb = document.querySelector('#fcXwTablePicker input[data-table-id="' + xwDefaultTable.id + '"]');
  defaultCb.checked = false;
  defaultCb.dispatchEvent(new window.Event("change", { bubbles: true }));
  check("unchecking a table drops it, leaving the other selected one active", (() => {
    return xw.state.tables.length === 1 && String(xw.state.tables[0]) === String(xwOtherTable.id)
      && !document.querySelector("#fcPanelCrosswords .fc-xw-print-title").textContent.includes(xwDefaultTable.title);
  })());

  check("Katakana and Hiragana puzzles only use words really written that way -- never a word forced into the other script", (() => {
    xwPick("script", "katakana");
    const k = xw.state.puzzle.placements.every(p => /^[ァ-ヶー]+$/.test(p.answer));
    xwPick("script", "hiragana");
    const h = xw.state.puzzle.placements.every(p => /^[ぁ-ゖー]+$/.test(p.answer));
    xwPick("script", "romaji");
    return k && h;
  })());
  xwPick("source", "flashcards");
  check("switching back to Flashcards drops the table row entirely", !document.getElementById("fcXwTablesToggle"));

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
  check("Settings is iOS rows: label left, value right, a short footnote under each card -- no paragraph per field", (() => {
    const row = document.getElementById("fcRetention").closest(".set-row");
    return !!row && window.getComputedStyle(row).justifyContent === "space-between"
      && !document.querySelector("#fcPanelSettings .fc-settings-help")
      && document.querySelectorAll("#fcPanelSettings .set-foot").length >= 3;
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
    const cols = [...wrap.querySelectorAll(".section-head .view-mode button")].map(b => b.dataset.col);
    return typeof window.RaumeStudy.vocab.applyColVisibility === "function"
      && !/view-mode/.test(without)
      && ["japanese", "furigana", "english"].every(k => cols.includes(k));
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
    if (document.getElementById("fcBack")) document.getElementById("fcBack").click(); // last screen left open was Help
    document.querySelector('.fc-tab[data-tab="dashboard"]').click();
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
  check("normalizeAnswer drops sentence punctuation so a phrase answer is typeable", (() => {
    return fc.normalizeAnswer("Onamae wa?", true) === fc.normalizeAnswer("onamae wa", true)
      && fc.normalizeAnswer("What is your name?", false) === fc.normalizeAnswer("what is your name", false);
  })());
  check("a Phrases card studies in all four directions and accepts the plain-typed answer", (() => {
    const entry = Object.values(fc.getVocabIndex()).find(e => e.englishDisplay === "I live in Warsaw.");
    if (!entry) return false;
    return fc.directionsForEntry(entry).length === 4
      && fc.checkAnswer(entry, "jp-en", "i live in warsaw")
      && fc.checkAnswer(entry, "jp-ro", "watashi wa warushawa ni sunde imasu");
  })());
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
