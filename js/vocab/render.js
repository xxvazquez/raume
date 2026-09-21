// Vocabulary page -- rendering half of RaumeStudy.vocab.
//
// Builds every vocabulary table (grouped section -> category -> table) and the
// top navigation from RaumeStudy.data, and owns per-table sorting.
// Runs its render
// synchronously at load (same lifecycle as the old js/app.js). The interaction
// half -- navigation, search, event wiring -- lives in js/vocab/interactions.js
// and augments the same RaumeStudy.vocab object. See the load-order comment in
// index.html.
window.RaumeStudy = window.RaumeStudy || {};
window.RaumeStudy.vocab = window.RaumeStudy.vocab || {};

/* Per-table sorting: numbers, weekdays, and months sort naturally; everything else falls back to locale order. */
(function(){
  var vocab = window.RaumeStudy.vocab;
  const DAYS = {
    monday:0,tuesday:1,wednesday:2,thursday:3,friday:4,saturday:5,sunday:6,
    mon:0,tue:1,wed:2,thu:3,fri:4,sat:5,sun:6,
    '月曜日':0,'火曜日':1,'水曜日':2,'木曜日':3,'金曜日':4,'土曜日':5,'日曜日':6
  };
  const MONTHS = {
    january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,
    jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,
    '一月':0,'二月':1,'三月':2,'四月':3,'五月':4,'六月':5,'七月':6,'八月':7,'九月':8,'十月':9,'十一月':10,'十二月':11
  };
  function val(cell){
    // Prefer the cell's own .meaning-text span so a sort key never picks up
    // an adjacent icon's label or the adj pill.
    var t = cell && cell.querySelector('.meaning-text');
    return ((t || cell)?.textContent || '').trim();
  }
  function key(v){
    v=v.toLowerCase().replace(/\s+/g,' ').trim();
    // Leading number, allowing thousands separators ("1,000", "300,000") so
    // the Numbers table sorts 0 → 1,000,000 rather than lexically by first digit.
    const n=v.match(/^[\d,]*\d(?:\.\d+)?/);
    if(n) return [0,Number(n[0].replace(/,/g,''))];
    if(v in DAYS) return [1,DAYS[v]];
    if(v in MONTHS) return [2,MONTHS[v]];
    return [3,v];
  }
  function cmp(a,b,dir){
    const x=key(a),y=key(b);
    let c;
    if(x[0]!==y[0]) c=x[0]-y[0];
    else if(typeof x[1]==='number' && typeof y[1]==='number') c=x[1]-y[1];
    else c=String(x[1]).localeCompare(String(y[1]),undefined,{numeric:true,sensitivity:'base'});
    return dir==='desc' ? -c : c;
  }
  // Shared with renderTable() (a separate IIFE below, run right after this one)
  // so the default a-z-by-English ordering the tables render in uses the exact
  // same comparison as the column sort buttons -- weekdays/months/numbers and
  // all -- rather than a second, subtly different sort.
  vocab.compareCellText = cmp;
  // The sort icon is one static up/down chevron pair (SORT_ICON, below); which
  // half lights up follows data-sort-dir in css/site.css: asc = lower chevron
  // (A-Z, numbers low-to-high), desc = upper (Z-A), neither = both dim.
  vocab.sortTableFromButton=function(button){
    const table=button.closest('table');
    const tbody=table?.querySelector('tbody');
    if(!tbody) return;
    const col=Number(button.dataset.sortCol);
    const dir=button.dataset.sortDir==='asc' ? 'desc' : 'asc';
    const rows=[...tbody.querySelectorAll('tr')];
    rows.sort((a,b)=>cmp(val(a.cells[col]),val(b.cells[col]),dir));
    rows.forEach(r=>tbody.appendChild(r));
    table.querySelectorAll('.sort-button').forEach(b=>{
      b.classList.remove('active');
      b.dataset.sortDir='';
    });
    button.classList.add('active');
    button.dataset.sortDir=dir;
  };
})();

/* Render the vocabulary tables from structured data (data/vocabulary.js) --
   the markup for a table/row is written once here instead of being baked,
   repeated, and hand-edited once per row in the data file. */
(function () {
  var vocab = window.RaumeStudy.vocab;
  var esc = window.RaumeStudy.shared.escapeHtml;
  // Exposed so js/flashcards/vocab-index.js can render the exact same furigana markup
  // for a vocab entry's Japanese prompt instead of duplicating this logic.
  vocab.jpSegmentsHtml = jpSegments;
  // A kana-only reading, for feeding the Web Speech API -- reconstructed from
  // each segment's reading where there is one (a kanji segment), or its own
  // text otherwise (already kana/katakana). Kept separate from jpPlainOf
  // (js/flashcards/vocab-index.js), which keeps the kanji: speech synthesis
  // reads kanji unreliably (an ambiguous character can be mis-read), so the
  // spoken form always uses the reading instead.
  function jpReadingOf(segments) {
    return segments.map(function (seg) { return seg.reading || seg.kanji || seg.text || seg.p; }).join('');
  }
  vocab.jpReadingOf = jpReadingOf;
  // decorateKana: wrap katakana in hover/tap romaji targets (see
  // js/vocab/kana-romaji.js). On for the vocabulary tables; off for flashcard
  // prompts (passed straight through), where it would spoil a romaji answer.
  // How each grammatical particle is actually read -- は as "wa", へ as "e",
  // を as "o" -- which a plain kana->romaji pass gets wrong (it'd give "ha").
  // Shown on hover/tap via the .particle[data-r] layer (css/site.css).
  var PARTICLE_ROMAJI = {
    'は': 'wa', 'が': 'ga', 'を': 'o', 'に': 'ni', 'へ': 'e', 'で': 'de',
    'と': 'to', 'から': 'kara', 'まで': 'made', 'の': 'no', 'も': 'mo',
    'か': 'ka', 'ね': 'ne', 'よ': 'yo', 'や': 'ya', 'わ': 'wa', 'ぞ': 'zo', 'な': 'na'
  };
  // A { p: "は" } segment is a grammatical particle -- rendered as its own
  // highlighted span (css/site.css .particle), never kana-decorated: it's a
  // grammar cue, not a reading aid. Particles are marked explicitly in
  // data/vocabulary.js, so the highlight is always accurate.
  function jpSegments(segments, decorateKana) {
    var plain = decorateKana && window.RaumeStudy.kanaRomaji
      ? function (t) { return window.RaumeStudy.kanaRomaji.decorate(t); }
      : esc;
    return segments.map(function (seg) {
      if (seg.p) {
        var pr = seg.r || PARTICLE_ROMAJI[seg.p] || '';
        return '<span class="particle"' + (pr ? ' data-r="' + esc(pr) + '"' : '') + '>' + esc(seg.p) + '</span>';
      }
      return seg.kanji
        ? '<ruby><rb class="jpmain">' + esc(seg.kanji) + '</rb><rt class="furigana">' + esc(seg.reading) + '</rt></ruby>'
        : plain(seg.text);
    }).join('');
  }
  // Hidden by default (css/site.css) until js/shared.js confirms the browser
  // actually has a Japanese voice installed -- see RaumeStudy.shared.speech.
  var SPEAKER_ICON = '<svg viewBox="0 0 18 18" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 7v4h3l4 3V4L5 7H2Z"/><path d="M12 6.3a3 3 0 0 1 0 5.4"/><path d="M14.2 4.3a6 6 0 0 1 0 9.4"/></svg>';
  function speakButton(reading) {
    if (!reading) return '';
    return '<button type="button" class="jp-speak-btn" data-jp-speak="' + esc(reading) + '" aria-label="Play pronunciation">' + SPEAKER_ICON + '</button>';
  }
  vocab.speakButtonHtml = speakButton;
  // Romaji lives here now instead of its own column (see docs/architecture.md
  // -- the reference table is Japanese+English, two columns): hover the word
  // itself (desktop) or tap it (touch) to see its romaji as a caption line
  // underneath, the same reveal-on-demand idiom the per-kana reading layer
  // (js/vocab/kana-romaji.js, .kr) already uses -- no separate icon/button;
  // every word has a reading, so there's nothing for an icon to distinguish.
  // data-romaji feeds css/site.css's `content: attr(...)`, so the reading
  // never enters the DOM's textContent (search/sort read the cell expecting
  // kana/kanji only -- see js/vocab/interactions.js jpFields) while still
  // being readable straight off the attribute for search -- see
  // js/vocab/interactions.js fieldsForRow.
  function romajiAttr(romaji) {
    return romaji ? ' data-romaji="' + esc(romaji) + '"' : '';
  }
  // romaji is optional: sentence and word rows alike now pass their romaji
  // through here so the reveal lives on the word itself, in the same cell,
  // regardless of table type.
  // い/な-adjective rows carry a small capsule badge in the trailing cluster
  // beside the row icons -- like a dictionary's part-of-speech tag, and out of
  // the narrow Japanese column -- a tinted い or な (the glyph is drawn by CSS
  // from data-badge, so it never lands in the cell's text, search or speech).
  // The glyph alone already says "い-adjective" / "な-adjective" (plus the
  // legend near the toolbar, index.html .adj-legend), so a plain row's badge
  // is a static span -- a popover repeating that would say nothing new. Only
  // an irregular one (a な-adjective that ends in い, or いい's odd
  // conjugation) becomes a real button, opening the same small popover a
  // particle chip does (js/vocab/interactions.js openPop) to give the reason.
  function adjClass(adj) {
    return adj === 'i' ? ' adj-i' : adj === 'na' ? ' adj-na' : '';
  }
  function adjBadge(row) {
    if (row.adj !== 'i' && row.adj !== 'na') return '';
    var na = row.adj === 'na';
    var glyph = na ? 'な' : 'い';
    if (!row.adjNote) {
      return '<span class="adj-badge ' + (na ? 'adj-badge-na' : 'adj-badge-i') + '" data-badge="' + glyph + '" aria-hidden="true"></span>';
    }
    var role = glyph + '-adjective — ' + row.adjNote;
    return '<button type="button" class="adj-badge ' + (na ? 'adj-badge-na' : 'adj-badge-i') + ' adj-badge-irr' +
      '" data-badge="' + glyph + '" data-role="' + esc(role) + '" aria-label="' + esc(role) + '" aria-expanded="false"></button>';
  }
  function adjNote(adj) {
    if (adj !== 'i' && adj !== 'na') return '';
    return '<span class="visually-hidden">(' + (adj === 'na' ? 'な-adjective' : 'い-adjective') + ')</span>';
  }
  // Same idea as the adjective badge above, for a verb-pair's group: 五段
  // (godan/u-verb), 一段 (ichidan/ru-verb) or 変格 (irregular: する/来る).
  // Every verb-pair carries one; row.verbNote marks the handful worth a
  // second look -- 切る/帰る (五段 despite looking 一段) and 来る (its kanji
  // reading itself changes) -- with the outline treatment. 五段/一段/変格 are
  // kanji, unreadable at a glance to someone who doesn't read kanji, so the
  // popover (not the 20px tile) spells the reading out as "変格 (へんかく)"
  // (data-reading, read by js/vocab/interactions.js openPop) -- real ruby
  // furigana renders too small there to read.
  var VERB_CLASS_META = {
    godan: { badge: '五段', reading: 'ごだん', label: 'godan verb (u-verb)' },
    ichidan: { badge: '一段', reading: 'いちだん', label: 'ichidan verb (ru-verb)' },
    // genericNote fills in for the rows verbNote leaves unexplained (する and
    // its compounds) -- without it "irregular verb" alone says nothing about
    // what that means. 来る overrides it with its own, more specific note.
    irregular: { badge: '変格', reading: 'へんかく', label: 'irregular verb', genericNote: "doesn't conjugate by the godan/ichidan rules -- する becomes します, not a predictable change, so its forms are memorized" }
  };
  function verbBadge(row) {
    var meta = VERB_CLASS_META[row.verbClass];
    if (!meta) return '';
    var note = row.verbNote || meta.genericNote;
    var role = meta.label + (note ? ' — ' + note : '');
    return '<button type="button" class="verb-badge verb-badge-' + row.verbClass + (row.verbNote ? ' verb-badge-irr' : '') +
      '" data-badge="' + meta.badge + '" data-reading="' + meta.reading + '" data-role="' + esc(role) +
      '" aria-label="' + esc(meta.reading + ' — ' + role) + '" aria-expanded="false"></button>';
  }
  function verbNote(row) {
    var meta = VERB_CLASS_META[row.verbClass];
    if (!meta) return '';
    return '<span class="visually-hidden">(' + meta.label + ')</span>';
  }
  function jpCell(row, romaji) {
    // Particles carry their own { p: … } segment now (jpSegments emits the
    // .particle span), so a standalone-particle row needs no special case.
    var inner = '<span class="jpword"' + romajiAttr(romaji) + '>' + jpSegments(row.jp, true) + '</span>';
    // .jp-line pins the speaker button to the cell's right edge regardless of
    // word length -- see css/site.css for why (same fix as .meaning-cell's
    // row-actions cluster, mirrored to the other side).
    return '<td class="jp' + adjClass(row.adj) + '" lang="ja"><div class="jp-line">' + inner + speakButton(jpReadingOf(row.jp)) + '</div>' + adjNote(row.adj) + '</td>';
  }
  // A slashed eye -- the button's action is "hide this row," and a plain
  // open eye reads as "reveal" (the opposite) far more often than not.
  var EYE_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9c1.8-3.2 4.5-4.8 7-4.8s5.2 1.6 7 4.8c-1.8 3.2-4.5 4.8-7 4.8S3.8 12.2 2 9Z"/><circle cx="9" cy="9" r="2"/><path d="M3.5 3.5l11 11"/></svg>';
  // The main study areas. Grammar, Phrases and Travel are promoted out of the
  // general vocabulary list into their own top-level sections; everything
  // else lives under Vocabulary, still grouped by its content category.
  function sectionOf(category) {
    if (category === 'Grammar') return 'grammar';
    if (category === 'Phrases') return 'phrases';
    if (category === 'Travel') return 'travel';
    return 'vocabulary';
  }
  var SECTION_ORDER = ['vocabulary', 'grammar', 'phrases', 'travel'];
  vocab.sectionOf = sectionOf;
  function rowHideButton() {
    return '<button type="button" class="row-hide-btn" aria-label="Hide this row">' + EYE_ICON + '</button>';
  }
  // The add-to-flashcards toggle. Always in the DOM but hidden by CSS unless a
  // search is running (body.is-searching) -- the moment you want it is right
  // after finding a word, and a permanent third icon on every row was judged
  // clutter. Its state (plus / green check) and click are owned by
  // js/flashcards/views.js (refreshRowToggleButtons + the delegated handler).
  var FC_TOGGLE_ADD = '<svg class="fc-ic-add" viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v10M4 9h10"/></svg>';
  var FC_TOGGLE_ADDED = '<svg class="fc-ic-added" viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5l3.2 3.2L14 5.8"/></svg>';
  function flashcardToggle(vocabId) {
    if (!vocabId) return '';
    return '<button type="button" class="fc-toggle-btn" data-vocab-id="' + esc(vocabId) + '" aria-pressed="false" aria-label="Add to flashcards">' + FC_TOGGLE_ADD + FC_TOGGLE_ADDED + '</button>';
  }
  // Wrapped in its own cluster so it can sit as a fixed-width flex item
  // pinned to the Meaning cell's right edge (see css/site.css), instead of
  // flowing inline after the text at a position that drifts with its length.
  function rowActions(vocabId) {
    return '<span class="row-actions">' + flashcardToggle(vocabId) + rowHideButton() + '</span>';
  }
  // The flex row lives on a <div> wrapper, not the <td> itself -- table-layout:
  // fixed's column-width percentages stop being respected on a cell whose own
  // display is overridden to flex (the browser no longer sizes it as a table
  // cell), so the <td> stays a plain cell and only its content wrapper flexes.
  // badges: small capsules in a trailing cluster beside the row icons (an
  // adjective's い/な, a verb's 五段/一段/変格, the particles a word takes) --
  // trailing, not leading, so the meaning text shares one left edge on every
  // row. Built by the helpers below and sits outside .meaning-text, so it
  // stays out of sorting and search; anything a badge needs to explain opens
  // in a popover on click (js/vocab/interactions.js), not a permanent line
  // under the meaning.
  function meaningCell(english, vocabId, badges) {
    return '<td><div class="meaning-cell"><span class="meaning-text">' + esc(english) + '</span>' + (badges || '') + rowActions(vocabId) + '</div></td>';
  }
  // The particles a verb (or a な-adjective like 好き) takes -- row.particles is
  // [{ p: 'を', role: 'what you eat' }]. Each is a small blue chip (the app's
  // particle blue, bold) beside the row icons, drawn from data-badge like the
  // adjective badge. Each is a real button: tapping (or clicking, or hovering
  // with a mouse) opens a small popover with what the particle marks
  // (js/vocab/interactions.js), so the row stays one clean line; the role is
  // also the button's accessible name for screen readers.
  function tight(p) { return String(p).replace(/\s+/g, ''); }   // "に / へ" -> "に/へ" on the chip
  function particleChips(row) {
    return (row.particles || []).map(function (q) {
      return '<button type="button" class="particle-chip" data-badge="' + esc(tight(q.p)) + '" data-role="' + esc(q.role) + '" aria-label="' + esc('Particle ' + q.p + ': ' + q.role) + '" aria-expanded="false"></button>';
    }).join('');
  }
  // Word rows and Phrases sentence rows share this now -- both render as
  // Japanese (with a romaji reveal next to the speaker button) + English, two
  // columns, no separate Romaji column. row.irregular is simply absent on a
  // sentence row, so this needs no sentences-specific branch.
  function wordRow(row) {
    var openTag = '<tr data-vocab-id="' + esc(row.id || '') + '"' + (row.irregular ? ' class="irregular-row">' : '>');
    return openTag + jpCell(row, row.romaji) + meaningCell(row.english, row.id, adjBadge(row) + particleChips(row)) + '</tr>';
  }
  // forms[0] is the plain/dictionary form, forms[1] the polite (-masu) form --
  // tag each so CSS can tint the two consistently down the Japanese column
  // (each form carries its own speaker + romaji reveal).
  var VERB_FORM_CLASS = ['verb-form-plain', 'verb-form-polite'];
  function verbPairRow(row) {
    var jp = row.forms.map(function (f, fi) { return '<div class="verb-form ' + (VERB_FORM_CLASS[fi] || '') + '"><div class="jp-line"><span class="jpword"' + romajiAttr(f.romaji) + '>' + jpSegments(f.jp, true) + '</span>' + speakButton(jpReadingOf(f.jp)) + '</div></div>'; }).join('') + verbNote(row);
    return '<tr data-vocab-id="' + esc(row.id || '') + '"><td class="jp" lang="ja">' + jp + '</td>' + meaningCell(row.english, row.id, verbBadge(row) + particleChips(row)) + '</tr>';
  }
  // isDefault marks the column the table renders sorted by (English) -- it
  // starts active and sorted A-Z; the others start neutral.
  function sortHeader(label, col, isDefault) {
    return '<th>' + label + '<button type="button" class="sort-button' + (isDefault ? ' active' : '') +
      '" data-sort-col="' + col + '" data-sort-dir="' + (isDefault ? 'asc' : '') +
      '" aria-label="Sort ' + esc(label) + '">' + SORT_ICON + '</button></th>';
  }
  var SORT_ICON = '<svg viewBox="0 0 10 14" width="9" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="sc-up" d="M2 5.2 5 2.2l3 3"/><path class="sc-down" d="M2 8.8l3 3 3-3"/></svg>';
  var PRINT_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 6V2.5h8V6"/><rect x="2.5" y="6" width="13" height="7" rx="1.2"/><path d="M5 11.5h8V15.5H5Z"/></svg>';
  var MENU_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="9" cy="4" r="1.45"/><circle cx="9" cy="9" r="1.45"/><circle cx="9" cy="14" r="1.45"/></svg>';
  var CHOOSE_ICON_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="13" height="11" rx="1.5"/><circle cx="6.5" cy="7" r="1.2"/><path d="M15 11.5 11.5 8 5 14"/></svg>';
  var ADD_TO_FC_ICON = '<svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v10M4 9h10"/></svg>';
  function menuItemHtml(icon, label) {
    return '<span class="menu-item-ic" aria-hidden="true">' + icon + '</span><span class="menu-item-tx">' + label + '</span>';
  }
  function byEnglish(a, b) {
    return vocab.compareCellText(String(a.english || ''), String(b.english || ''), 'asc');
  }
  function rowsHtmlFor(rows) {
    return rows.map(function (row) {
      return row.type === 'verb-pair' ? verbPairRow(row) : wordRow(row);
    }).join('\n    ');
  }
  // Column-visibility toggles, identical to the reference toolbar's set
  // (index.html). The click handler is delegated on document (js/vocab/
  // interactions.js), so this works wherever the markup lands; it drives the
  // global `body.hide-*` state, so a column hidden here stays hidden on the
  // reference pages too. No Romaji button -- there's no Romaji column left to
  // hide (it's an on-demand reveal on the word itself instead, see jpCell).
  var VIEW_MODE_CONTROL =
    '<div class="view-mode" aria-label="Column visibility">' +
    '<button type="button" data-col="japanese" aria-pressed="false" title="Hide the Japanese column">Japanese</button>' +
    '<button type="button" data-col="furigana" aria-pressed="false" title="Hide the furigana readings">Furigana</button>' +
    '<button type="button" data-col="english" aria-pressed="false" title="Hide the English column">English</button>' +
    '</div>';
  // Shared table-section markup -- every vocabulary table on the page goes
  // through here so it's structurally identical: same columns, sort controls,
  // print button, furigana markup, and every feature that keys off
  // `.table-section` / `.vocab` (search, print, view-mode, row hiding).
  function sectionMarkup(o) {
    var controls = o.controls || {};
    var ctrlParts =['<span class="rows-hidden-status" hidden><span class="rows-hidden-count"></span> · <button type="button" class="show-all-rows">Show all</button></span>'];
    if (controls.viewMode) ctrlParts.push(VIEW_MODE_CONTROL);
    // Secondary actions collapse into a quiet overflow menu so only its icon
    // sits next to the title. Print is a standalone icon on desktop, but on
    // narrow screens the full title takes priority, so print folds into the
    // menu there too (the .print-menu-item copy, CSS-toggled by width) and the
    // standalone icon is hidden.
    var menuItems = [];
    // Choose icon lives in the menu, not as its own always-visible button on
    // the header, so normal browsing stays clean -- only a table you can
    // actually customise (controls.addTable, i.e. a real table, never a
    // synthetic one like Flashcards' Words to review) gets it. Reuses
    // .section-icon-btn so the existing delegated click handler
    // (interactions.js) needs no logic change to open the picker from here.
    if (controls.addTable) menuItems.push('<button type="button" class="section-icon-btn" role="menuitem" data-icon-for="' + o.id + '">' + menuItemHtml(CHOOSE_ICON_ICON, 'Choose icon…') + '</button>');
    if (controls.addTable) menuItems.push('<button type="button" class="fc-add-table-btn" role="menuitem" data-table="' + o.id + '" title="Add every row in this table to your flashcards">' + menuItemHtml(ADD_TO_FC_ICON, 'Add to flashcards') + '</button>');
    // Only fold print into the menu when the menu already exists for other
    // reasons -- a table whose only control is print keeps just the icon.
    if (controls.print && menuItems.length) menuItems.push('<button type="button" class="print-one print-menu-item" role="menuitem" aria-label="Print this table">' + menuItemHtml(PRINT_ICON, 'Print') + '</button>');
    if (menuItems.length) {
      ctrlParts.push('<div class="section-menu">' +
        '<button type="button" class="section-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="Table options">' + MENU_ICON + '</button>' +
        '<div class="section-menu-list" role="menu" hidden>' + menuItems.join('') + '</div></div>');
    }
    if (controls.print) ctrlParts.push('<button type="button" class="print-one print-icon-btn" aria-label="Print this table">' + PRINT_ICON + '</button>');
    var defaultSort = o.defaultSort !== false;
    var title = tableTitle(o.id, o.title);
    return '<section class="table-section ' + (o.sectionClass || '') + (o.collapsed ? ' collapsed' : '') +
      '" data-table="' + o.id + '" data-category="' + esc(o.category || '') + '"' +
      (controls.addTable && tableTile(o.id, o.category) ? ' data-tile="' + tableTile(o.id, o.category) + '"' : '') +
      (o.section ? ' data-section="' + esc(o.section) + '"' : '') +
      ' id="table-' + o.id + '">' +
      '<div class="section-head">' +
      // Decorative only -- not a control. Changing it lives in the table's
      // "Table options" menu (the Choose icon… item above) instead of an
      // always-visible button here, so it doesn't leak an editing action
      // into normal browsing. Only rendered for a real table (same
      // controls.addTable gate as the menu item) -- a synthetic table like
      // Flashcards' Words to review has nothing to persist an icon against.
      (controls.addTable ? tableIconSlot(o.id) : '') +
      '<h2 class="section-title"><button type="button" class="section-toggle" aria-expanded="' + (o.collapsed ? 'false' : 'true') + '" aria-controls="vocab-' + o.id + '">' +
      '<span class="section-toggle-icon">' + CHEVRON_ICON + '</span>' +
      '<span class="section-title-text" id="secttl-' + o.id + '">' + esc(title) + '</span>' +
      '</button></h2>' +
      '<div class="controls">' + ctrlParts.join('') + '</div></div>' +
      // aria-labelledby the visible title so a screen reader announces the table
      // by name ("Cooking Ingredients, table") instead of a bare "table".
      '<table class="vocab' + (o.tableClass ? ' ' + o.tableClass : '') + '" id="vocab-' + o.id + '" aria-labelledby="secttl-' + o.id + '"><thead><tr>' +
      '<th>Japanese</th>' + sortHeader('English', 1, defaultSort) +
      '</tr></thead><tbody>\n    ' +
      o.rowsHtml + '\n  </tbody></table></section>';
  }
  function renderTable(t) {
    // Sentence tables (Phrases) keep their authored order -- the rows are laid
    // out as question/answer pairs, which an A-Z-by-English sort would scatter.
    var sentences = t.tableClass === 'vocab-sentences';
    var rows = sentences ? t.rows.slice() : t.rows.slice().sort(byEnglish);
    return sectionMarkup({
      id: t.id, title: t.title, category: t.category, section: sectionOf(t.category), tableClass: t.tableClass,
      rowsHtml: rowsHtmlFor(rows),
      controls: { addTable: true, print: true },
      sectionClass: 'page-hidden', collapsed: true, defaultSort: !sentences
    });
  }
  // Build a standard vocabulary table section from an arbitrary set of rows
  // (raw data/vocabulary.js row objects). Flashcards' "Words to Review" uses it
  // so that list is a real, sortable, printable table rather than a bespoke
  // component. `presort:false` keeps the caller's order (e.g. most-missed
  // first) and starts every sort control neutral.
  vocab.buildVocabSection = function (config) {
    var rows = (config.rows || []).filter(Boolean);
    var ordered = config.presort === false ? rows : rows.slice().sort(byEnglish);
    return sectionMarkup({
      id: config.id, title: config.title, category: config.category || '', tableClass: config.tableClass,
      rowsHtml: rowsHtmlFor(ordered),
      controls: config.controls || { print: true },
      sectionClass: config.sectionClass || '',
      defaultSort: config.presort !== false
    });
  };

  var CHEVRON_ICON = '<svg viewBox="0 0 18 18" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7l4 4 4-4"/></svg>';
  // Empty icon slot -- a quiet "+", "click to choose". A dashed square here read
  // as an unchecked checkbox, worst as a column of them on the Customize page.
  // Filled slots render the chosen icon (js/vocab/icons.js) or an uploaded
  // image instead.
  var EMPTY_ICON = '<svg class="si" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>';
  // Every shipped table starts with an icon so a list of tables reads as a set
  // of distinct rows rather than a wall of titles; a reader's own pick (Choose
  // icon…) always wins, and a table of their own has none until they choose one.
  var DEFAULT_TABLE_ICONS = {
    0: 'list', 1: 'coffee', 2: 'egg', 3: 'apple', 4: 'microwave', 5: 'soup',
    6: 'sparkles', 7: 'zap', 8: 'hash', 9: 'quote', 10: 'beef', 11: 'cup',
    12: 'cookie', 13: 'carrot', 14: 'signpost', 15: 'shopping-bag', 16: 'train',
    17: 'toilet', 18: 'washer', 19: 'bed', 20: 'tag', 21: 'recycle',
    22: 'utensils', 23: 'hand', 24: 'calendar', 25: 'moon', 26: 'grid',
    27: 'sun', 28: 'hourglass', 29: 'alarm', 30: 'clock', 31: 'watch'
  };
  // The icon a table shows: the reader's pick, else the shipped default, else --
  // for a table of their own -- one suggested from its name (see icons.suggest),
  // falling back to a bookmark. A synthetic table with no name has none.
  function tableIconValue(id) {
    var tc = window.RaumeStudy.tableCustom;
    var chosen = tc ? tc.iconOf(id) : '';
    if (chosen) return chosen;
    if (DEFAULT_TABLE_ICONS[id]) return DEFAULT_TABLE_ICONS[id];
    var ic = window.RaumeStudy.icons;
    var name = tableTitle(id, dataTitleOf(id));
    return ic && name ? (ic.suggest(name) || 'bookmark') : '';
  }
  function dataTitleOf(id) {
    var all = window.RaumeStudy.data && window.RaumeStudy.data.vocabularyTables || [];
    for (var i = 0; i < all.length; i++) if (String(all[i].id) === String(id)) return all[i].title;
    return '';
  }
  vocab.tableIconValue = tableIconValue;
  // The tile colour key for a table (icons.colors): the reader's pick, else its
  // content category's hue, else the hue of its icon's group (an apple table is
  // green, a plane table teal). "" means the plain section tone.
  var CATEGORY_TILE = {
    'Food & Ingredients': 'green', 'Kitchen & Dining': 'orange', 'Numbers & Counting': 'blue',
    'Time & Calendar': 'indigo', 'Grammar': 'purple', 'Travel': 'teal', 'Phrases': 'amber'
  };
  function tableTile(id, category) {
    var tc = window.RaumeStudy.tableCustom, ic = window.RaumeStudy.icons;
    var chosen = tc ? tc.colorOf(id) : '';
    if (chosen && ic && ic.hasColor(chosen)) return chosen;
    if (CATEGORY_TILE[category]) return CATEGORY_TILE[category];
    return ic ? ic.groupColor(tableIconValue(id)) : '';
  }
  vocab.tableTile = tableTile;
  // The name to show for a table: the reader's custom name (Customize page) if
  // they've set one, otherwise the name shipped in the dataset. Used everywhere
  // a table is labelled -- section header, table directory, Flashcards Manage.
  function tableTitle(id, fallback) {
    var tc = window.RaumeStudy.tableCustom;
    var custom = tc ? tc.nameOf(id) : '';
    return custom || fallback || '';
  }
  vocab.tableTitle = tableTitle;
  // Just the inner glyph -- shared by the section header button and the
  // table-directory rows so a chosen icon shows everywhere the table does.
  function tableIconGlyph(id) {
    var v = tableIconValue(id);
    var svg = v && window.RaumeStudy.icons ? window.RaumeStudy.icons.render(v) : '';
    return svg || EMPTY_ICON;
  }
  function tableIconSlot(id) {
    var v = tableIconValue(id);
    return '<span class="section-icon' + (v ? '' : ' section-icon-empty') + '">' + tableIconGlyph(id) + '</span>';
  }
  vocab.tableIconGlyph = tableIconGlyph;
  // Category header -- just the name and its table count. No decorative
  // icon: the categories read fine as plain labels, and an icon per row
  // would be noise on what is meant to be a quiet reference index.
  function categoryHeaderHtml(name, count) {
    return '<span class="cat-name">' + esc(name) + '</span>' +
      '<span class="cat-count">' + count + '</span>';
  }
  // Exposed so js/flashcards/views.js's Manage tab renders the exact same
  // name/count category header as the vocabulary sections, instead of a plain
  // unstyled heading of its own.
  vocab.categoryHeaderHtml = categoryHeaderHtml;
  // Reorder `items` to honour a reader's custom sequence: anything named in
  // `customList` comes first, in that order; everything else keeps its prior
  // (A-Z) order after them. Array.sort is stable, so the untouched tail holds.
  function applyCustomOrder(items, customList, keyFn) {
    if (!customList || !customList.length) return items;
    var pos = Object.create(null);
    customList.forEach(function (k, i) { pos[k] = i; });
    var at = function (x) { var k = keyFn(x); return k in pos ? pos[k] : Infinity; };
    return items.slice().sort(function (a, b) {
      var pa = at(a), pb = at(b);
      // Two unlisted items (both Infinity) compare equal -- never `Infinity -
      // Infinity` (NaN), which is undefined behaviour in a sort comparator.
      return pa === pb ? 0 : pa - pb;
    });
  }
  // Category names for a section, A-Z then shuffled by the reader's custom
  // category order (Customize page). `section` may be omitted (no custom order).
  function orderedCategoryNames(names, section) {
    var sorted = names.slice().sort(function (a, b) { return a.localeCompare(b); });
    var tc = window.RaumeStudy.tableCustom;
    var custom = tc && section ? tc.categoryOrder(section) : null;
    return applyCustomOrder(sorted, custom, function (x) { return x; });
  }
  // Tables within a category, A-Z by (display) title then shuffled by the
  // reader's custom table order for that category.
  function orderTables(categoryName, tables) {
    var sorted = tables.slice().sort(function (a, b) {
      return tableTitle(a.id, a.title).localeCompare(tableTitle(b.id, b.title));
    });
    var tc = window.RaumeStudy.tableCustom;
    var custom = tc ? tc.tableOrder(categoryName) : null;
    return applyCustomOrder(sorted, custom, function (t) { return String(t.id); });
  }
  vocab.orderedCategoryNames = orderedCategoryNames;
  vocab.orderTables = orderTables;
  // Group tables by category, honouring the reader's custom category/table
  // order for `section` (falls back to A-Z). Used to lay out #vocabulary, the
  // table directory, and (via the exposed helpers) the Flashcards Manage tab.
  function groupByCategory(tables, section) {
    var byName = {};
    tables.forEach(function (t) {
      var name = t.category || 'Tables';
      if (!byName[name]) byName[name] = [];
      byName[name].push(t);
    });
    return orderedCategoryNames(Object.keys(byName), section).map(function (name) {
      return { name: name, tables: orderTables(name, byName[name]) };
    });
  }
  // The four-item top navigation: the three vocabulary sections plus
  // Flashcards. Fixed -- it never changes with the data.
  function renderNav() {
    return '<a class="site-nav-link" href="#vocabulary" data-section="vocabulary">Vocabulary</a>' +
      '<a class="site-nav-link" href="#grammar" data-section="grammar">Grammar</a>' +
      '<a class="site-nav-link" href="#phrases" data-section="phrases">Phrases</a>' +
      '<a class="site-nav-link" href="#travel" data-section="travel">Travel</a>' +
      '<a class="site-nav-link" href="#flashcards" data-page="flashcards">Flashcards</a>';
  }
  // The internal table index: a visual directory that stands in for a
  // redundant page heading. Closed, it's one small control (showing the
  // table you're currently on); open, it lays out the whole active section
  // at once -- every category, every table, nothing to expand -- linked to
  // #table-N. One panel per section; showSection reveals the active one.
  // Panels with more than a handful of tables are marked --wide so CSS flows
  // them into two columns.
  function renderTableIndex(tables) {
    var bySection = { vocabulary: [], grammar: [], phrases: [], travel: [] };
    tables.forEach(function (t) { bySection[sectionOf(t.category)].push(t); });
    var panels = SECTION_ORDER.map(function (sec) {
      var groups = groupByCategory(bySection[sec], sec);
      var multiCat = groups.length > 1;
      var wide = bySection[sec].length > 5;
      var body = groups.map(function (g) {
        var links = g.tables.map(function (t) {
          var tile = tableTile(t.id, t.category);
          return '<a href="#table-' + t.id + '" data-target="' + t.id + '"' + (tile ? ' data-tile="' + tile + '"' : '') + ' role="menuitem">' +
            '<span class="tindex-count" title="' + t.rows.length + ' entries">' + t.rows.length + '</span>' +
            (tableIconValue(t.id) ? '<span class="tindex-icon">' + tableIconGlyph(t.id) + '</span>' : '') +
            '<span class="tindex-tname">' + esc(tableTitle(t.id, t.title)) + '</span></a>';
        }).join('');
        // Multi-category sections (Vocabulary) get a quiet, non-interactive
        // category label above each group; a single-category section is a
        // plain list that flows freely across the columns.
        if (multiCat) {
          return '<div class="tindex-cat-group">' +
            '<p class="tindex-cat">' +
            '<span class="tindex-count" title="' + g.tables.length + ' tables">' + g.tables.length + '</span>' +
            '<span class="tindex-cat-name">' + esc(g.name) + '</span></p>' +
            '<div class="tindex-cat-items">' + links + '</div></div>';
        }
        return '<div class="tindex-list">' + links + '</div>';
      }).join('');
      return '<div class="tindex-panel' + (sec === 'vocabulary' ? '' : ' page-hidden') +
        (wide ? ' tindex-panel--wide' : '') +
        '" data-section="' + sec + '" role="menu">' + body + '</div>';
    }).join('');
    return '<button type="button" class="tindex-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="tindexMenu" title="Jump to a table">' +
      '<span class="tindex-trigger-label">Jump to a table</span>' + CHEVRON_ICON + '</button>' +
      '<div class="tindex-menu" id="tindexMenu" hidden>' +
      // Decorative only -- a native bottom-sheet grab handle, shown by CSS
      // only in the mobile bottom-sheet layout (desktop's dropdown has
      // nothing to grab).
      '<div class="tindex-grab" aria-hidden="true"></div>' + panels + '</div>' +
      '<div class="tindex-scrim"></div>';
  }
  // Assemble #vocabulary: every table, grouped section -> category -> table
  // (categories and tables alphabetical). The Vocabulary section carries a
  // quiet category sub-heading before each of its groups; Grammar and Travel
  // are a single category, so they get none. Headings and sections all start
  // page-hidden; routing (interactions.js -> showSection) reveals one section
  // at a time.
  function renderAll(tables) {
    var bySection = { vocabulary: [], grammar: [], phrases: [], travel: [] };
    tables.forEach(function (t) { bySection[sectionOf(t.category)].push(t); });
    var html = '';
    SECTION_ORDER.forEach(function (sec) {
      groupByCategory(bySection[sec], sec).forEach(function (g) {
        if (sec === 'vocabulary') {
          html += '<h2 class="cat-heading page-hidden" data-section="' + sec + '" data-category="' + esc(g.name) + '">' +
            esc(g.name) + '<span class="cat-heading-count" aria-label="' + g.tables.length + ' tables">' + g.tables.length + '</span></h2>';
        }
        g.tables.forEach(function (t) { html += renderTable(t) + '\n'; });
      });
    });
    return html;
  }

  var host = document.getElementById('vocabulary');
  var navHost = document.getElementById('siteNav');
  var indexHost = document.getElementById('tableIndex');
  var vocabularyTables = window.RaumeStudy.data.vocabularyTables;

  // Merge the reader's own rows/tables into the dataset before the first
  // render (js/vocab/custom-vocab.js, loaded just above this file). Guest
  // custom vocab is in localStorage and available synchronously; signed-in
  // custom vocab arrives later from Supabase and triggers renderAllTables()
  // below once it syncs.
  function mergeCustomVocab() {
    var cv = window.RaumeStudy.customVocab;
    if (cv && cv.applyToDataset) cv.applyToDataset();
  }
  function tagOriginalIndex() {
    document.querySelectorAll('.vocab tbody').forEach(function (tbody) {
      [...tbody.querySelectorAll('tr')].forEach(function (row, i) { row.dataset.originalIndex = i; });
    });
  }
  // A full re-paint of #vocabulary from the current dataset -- used when
  // signed-in custom vocab lands after the initial synchronous render. It
  // rebuilds every section, so expand/collapse and per-column sort reset to
  // their defaults; acceptable because it fires once, right after sign-in
  // sync, and tables start collapsed anyway.
  function renderAllTables() {
    if (!host || !vocabularyTables) return;
    mergeCustomVocab();
    host.innerHTML = renderAll(vocabularyTables);
    if (indexHost) indexHost.innerHTML = renderTableIndex(vocabularyTables);
    tagOriginalIndex();
    // Every freshly rendered section starts .page-hidden. If the reader is
    // currently on a vocabulary section, re-run routing to reveal it again;
    // if they're on Flashcards / Customize / Help, leave the rebuilt DOM
    // hidden -- normal routing reveals it when they navigate back.
    var active = document.body.dataset.activeSection;
    if (active && vocab.showSection) vocab.showSection(active, { fromRoute: true });
  }
  vocab.renderAllTables = renderAllTables;

  if (host && vocabularyTables) {
    mergeCustomVocab();
    host.innerHTML = renderAll(vocabularyTables);
    if (navHost) navHost.innerHTML = renderNav();
    if (indexHost) indexHost.innerHTML = renderTableIndex(vocabularyTables);
  }
  tagOriginalIndex();

  // Re-sequence the already-rendered #vocabulary headings/sections and rebuild
  // the table directory to match the current custom order (Customize page).
  // No re-render -- existing section nodes keep their expand/collapse state,
  // hidden rows, and sort. Called by interactions.js after an order change and
  // on section navigation.
  function reflowLayout() {
    if (!host || !vocabularyTables) return;
    var bySection = { vocabulary: [], grammar: [], phrases: [], travel: [] };
    vocabularyTables.forEach(function (t) { bySection[sectionOf(t.category)].push(t); });
    var ordered = [];
    SECTION_ORDER.forEach(function (sec) {
      groupByCategory(bySection[sec], sec).forEach(function (g) {
        if (sec === 'vocabulary') {
          var h = host.querySelector('.cat-heading[data-section="vocabulary"][data-category="' + cssAttr(g.name) + '"]');
          if (h) ordered.push(h);
        }
        g.tables.forEach(function (t) {
          var s = host.querySelector('.table-section[data-table="' + t.id + '"]');
          if (s) ordered.push(s);
        });
      });
    });
    ordered.forEach(function (el) { host.appendChild(el); });
    if (indexHost) indexHost.innerHTML = renderTableIndex(vocabularyTables);
  }
  // Escape a category name for use inside a [data-category="..."] selector.
  function cssAttr(v) { return String(v).replace(/["\\]/g, '\\$&'); }
  vocab.reflowLayout = reflowLayout;
})();
