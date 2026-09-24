# Design

The target is iOS 26 (Liquid Glass): content first, chrome that recedes. One
system across the whole app — a grey grouped ground, white borderless cards
(20px, `--radius-card`) sitting directly on it, inset hairlines between rows,
capsule controls, and floating chrome (the sticky search band, sheets, ⋯ menus)
in translucent glass. A small set of muted tones carries hierarchy — dusty
lavender for what you act on, soft sage for progress, muted coral for attention,
deep ink for anything you read. Calm, not washed out. This note records the
rules so they stay consistent; it is the single source for the system, and the
sections below cover each part of it.

## Type

- **Space Grotesk** is used in exactly one place — the `raume` wordmark in the
  desktop top bar (the phone has no wordmark row).
- **Inter** is everything else. Both are self-hosted (SIL OFL); there is no
  external font runtime.
- Hierarchy comes from size, spacing, position, and colour — **not** bold weight
  or high contrast. Default weight is 400; 500 marks a genuinely active or
  labelled state. One type scale (`--fs-*` tokens: `--fs-micro` 11.5 · `--fs-small`
  13 · `--fs-english` 13.5 · `--fs-nav` 14 · `--fs-subhead` 15 · `--fs-card-heading`
  17 (a card/section heading sitting directly above a text input, kept a
  step above the field; `--fs-subhead` alone also sizes non-heading content like
  the flashcard review card's answer text, so it can't just move) ·
  `--fs-section-title` 19 · `--fs-page-title` 22, plus `--fs-jp` / `--fs-romaji`
  for the Japanese text itself) is shared by the reference and Flashcards
  sides — a size that
  duplicates a token is written as the token. Labels are **sentence case**,
  everywhere — no ALL-CAPS labels at all (the masthead is the wordmark alone).
  Deliberate literal sizes
  remain only where a token would be wrong: the prompt and kana glyphs on the
  review card, the verdict badge (a test reads its declared size) and tiny
  chips. The sole exception is a **particle** (`.particle`,
  700 + `--particle` blue): a grammar signal that needs to jump out of a
  sentence at a glance, and colour alone wasn't enough against Japanese text.
- On the review card the prompt is the anchor — 26px, the largest text on the
  card, with no direction label above it at all: the answer field's own
  placeholder (English…/Romaji…) already says what to type, so a second label
  saying the same thing was redundant. A kanji prompt always carries
  furigana; Japanese → English cards also reveal the reading in small type
  right under the word once checked (the other three directions already show
  the reading elsewhere, so repeating it there would just echo the answer).
  The prompt itself never moves once checked — nothing echoes it again below
  — so it reads as the anchor from contrast, not sheer size. The verdict is
  an icon alone (a check, a caution triangle for a one-letter near-miss, or
  an ✕) in a small tinted circle — never text, never a pill or a filled
  block — so the answer beneath it (24px 500, `--ink` — size, not bold) is the one thing to
  read, prominent by position and contrast, not sheer size — big enough to
  anchor the card, not so big it shouts on a short word or crowds a long one
  ("topic / contrast").
  A miss is never red-washed: the card flash is a 5% tint and the icon alone
  carries the coral/ochre. The answer field collapses out of the way once
  checked (opacity + height, never display/visibility, so it stays focused
  and a phone's on-screen keyboard doesn't close) and what you typed becomes
  one quiet secondary line below the answer — never struck through, which
  was hard to read (a one-letter romaji slip gets the same letter-level
  marks as the answer above it). Japanese → English shows the reading under
  the word once checked, except for a kana-only word (レモン), which is its
  own reading. The ratings are a plain text action row — no pills, no
  track, no key chip — a hairline above marking them off from the card, each
  label (15px 500, its interval 12px under it) coloured only in its own tone;
  the usual choice (Good after a right answer, Again after a miss) reads
  full-strength, the other three at reduced (not faint) opacity — same weight.
  The speaker glyph beside the prompt stays small but takes a 44pt tap area. The card is top-anchored (no re-centring
  when the answer drops in), and a `<progress>` bar under the meta line shows
  the session. On a phone the chrome (meta line, padding, rating row, the
  "stage" panel) tightens but the prompt keeps its full size and air. Past
  700px the reading text you rate from (the stage panel, rating labels) steps
  up a size off the shared `--fs-*` scale — but not the prompt, which stays
  26px at every width; a roomier window doesn't need a bigger word, and it
  read as oversized when it scaled up too. That scale is tuned for the
  reference tables and read too small to study from on a desktop window.

## Colour

A small set of **muted, desaturated tones** — nothing bright, nothing neon: a
dusty lavender (`#82799B`), a soft sage (`#78968B`) and a muted coral (`#C77C72`)
on a grey grouped ground. Deeper ink and colour that signals hierarchy rather
than decorating. No true red except the one destructive-delete `--danger`.
Gradients are out. Shadows are kept to three jobs: the soft float shadow under
glass menus and sheets (`--glass-shadow`), the very soft lift under white
controls on the ground (`--control-lift`, with a 0.5px hairline) and the switch
thumb — content cards lift off the ground by fill alone (white on grey; in dark
the ground is *darker* than the card). All CSS custom properties in
`css/site.css`.

| Hex (light) | Variable | Used for |
|---|---|---|
| `#1F2836` | `--ink` | primary text — dark cool ink for headings, numbers, Japanese (~12:1, clears AAA) |
| `#55606F` / `#78838F` | `--muted` / `--faint` | secondary text (labels) / tertiary (counts, chevrons) — both AA |
| `#5A6675` / `#5C6A79` | `--romaji` / `--furigana` | the romaji reveal caption / the reading over each kanji — both WCAG AA on `--paper`; furigana also has an 11px floor |
| `#F2F3F7` | `--group-ground` | the grouped ground (`--page-bg` in dark) — white cards sit directly on it, no border or shadow |
| `#FFFFFF` | `--paper` | the sheet, cards, table surface |
| `#E2E5EA` / `#C8CFD8` | `--line` / `--line-strong` | hairline row rules / masthead and nav rules (table headers use the row hairline too) |
| `#DBDFE6` | `--card-line` | only the hairline under the pull-to-refresh bar — cards themselves have no outline |
| `#82799B` / `#574D73` / `#EBE9F2` | `--accent` / `-strong` / `-soft` | **primary accent** — dusty lavender: active tabs, progress fills, focus, key interactive edges. Primary buttons fill with `-strong` so white text clears AA |
| `#5F8175` / `#456056` / `#E4ECE8` | `--accent-2` / `-strong` / `-soft` | **secondary accent** — muted sage: legend terms, supporting highlights (same hue as `--right`) |
| `#2F6FB0` | `--particle` | **grammatical particles** (は, を, から, …) — a saturated blue, more vivid than any section accent, so a marked particle reads as a grammar cue. Rendered **bold** — the one deliberate use of weight for hierarchy (see below). Hover/tap shows its reading (は → "wa") in a `.particle[data-r]::after` layer, same idea as the katakana `.kr` layer. `#7DB4E6` in dark; flattens to bold-black in print |
| `#6B4FA0` / `#2E7D52` | `--adj-i-ink` / `--adj-na-ink` | **い/な-adjective badge** — purple / green, saturated like `--particle` rather than muted like `--accent-strong` (needs to read as coloured at a glance on a small capsule). `#B39DDB` / `#7FC79A` in dark |

Functional roles, each one job — all muted:

- **sage green** (`--right` / `-soft` / `-strong`) — right answer, and everywhere
  "done / on schedule / progressing": the Manage "in your deck" glyph, the
  in-flashcards row toggle, the Reviews-completed stat rule, a cleared queue;
- **coral** (`--warn` / `-soft` / `-strong`, the same values as `--wrong`) — one
  warm attention family: cards due, words missed, retention slipping, the sync
  chip, **and** a wrong answer in review. Warm enough to pull the eye,
  desaturated enough it never reads as an alarm;
- **ochre** (`--fc-hard` / `-soft` / `-strong`) — one job only: the rating row's
  Hard button, which needs a fourth hue distinct from Again (coral), Good (sage)
  and Easy (lavender). Also the Learning segment of the Card-progress bar;
- a slate wash (`--irregular-bg` / `--irregular-ink`) marks irregular-verb rows;
- the search-match highlight is a soft coral tint (`--hl` / `--hl-ink`).

### Per-section tone

Five hues, spread wide enough to read as genuinely different places: a
slate-blue, a mauve, an ochre, the sage, the lavender. Used **only** on
structural and interactive elements (the active nav capsule, category
headings + rules, active tabs/filters, focus, sort accents) — never a row or a
large surface. `-strong` variants are the ones used at body-text size and all
clear AA on `--paper`. `--section` is switched by `body[data-active-*]`:

- `--sec-vocabulary` — slate-blue (`#4F7389`)
- `--sec-grammar` — mauve (`#875A78`)
- `--sec-phrases` — ochre (`#A5843F`) — the one warm hue; it's the only spot
  left in the wheel ≥20° from the other four
- `--sec-travel` — sage (`#5F8175`)
- `--sec-flashcards` — lavender (`#82799B`), the same as the primary accent

The five hues sit well over 20° apart (the smoke test enforces it), light and
dark, so moving between sections reads as a change of place.

## Labels and measure

One label, one style: a category name reads the same Title-Case-in-the-section-
tone wherever it appears (a vocab heading, the *Jump to a table* list, Flashcards
› Manage, the Customize page). Card titles are sentence case throughout Settings
and Help.

- **The reference pages are an iOS inset-grouped list.** One grey ground
  (`--group-ground`) behind the page and white `--radius-card` cards sitting
  directly on it — no borders, no coloured
  bars, no rules under headings, no box inside a box. A run of collapsed tables
  is ONE card of list cells (inset hairline between them, disclosure chevron on
  the right, the per-table ⋯ menu / print kept on the cell as bare glyphs; the
  hairline is inset to start under the title, and cells only group with
  neighbours that are on screen); every table has a 28px **icon tile** — an 8px-radius
  square with a white glyph, filled in a soft, muted hue **per content category**
  (`--tile`, set on `.table-section[data-category]`: Food `#74a087` green, Kitchen
  `#c8905a` orange, Numbers `#7093be` blue, Time `#8487c0` indigo, Grammar `#9c7fb6`
  purple, Travel `#5fa0a2` teal, Phrases `#bd9a52` amber). The tile key is
  `data-tile` on the `.table-section` (and the Customize row), resolved in
  `render.js` `tableTile()`: the reader's pick, else the category's, else — a
  table of your own — the hue of its icon's group (Food & drink green, Travel
  teal, Home & objects orange, Nature & weather blue, the rest slate). The
  picker's nine swatches add clay `#bb7f74` and slate `#8493a3`; the hues are
  `--tile-<key>` tokens, dark mode dims the fill to 80%, print drops the tile).
  These dusty mid-tones are the only colour in a row and say which group a
  table is in; the rest of the row stays neutral. **List type scale** (phone and
  desktop): a category header is 12px / 500 in secondary grey (`--muted`), inset
  16px to line up with the row content; a collapsed row title is 14px / 400 in
  `--ink` — the same size once the table is open; the phone's large screen title 28px.
- **On a wide desktop window the list is a `--reading-w: 700px` centred column**
  (`.page-vocab`), not the full 1180px sheet — an inset list stays an inset
  list, closer to Apple's own measure than the 900px an earlier pass tried.
  900px still read as stranded on the left rather than centred: the sheet's
  own white edge is nearly invisible against the page past the masthead, so
  the gap either side of a too-wide column doesn't register as "centred," just
  as dead space. Everything in the reading flow — the toolbar, the category rules, the tables, Expand-all — shares the cap on
  one centred axis. Only kicks in above ~700px (a phone or a split-screen
  window never reaches the cap); the top bar stays full width.
  A header is always one step below the rows it labels, as in iOS / macOS lists.
  The same voice runs through the rest of the app: Flashcards › Manage (a table
  row is the 28px tile + a 14px title + its progress, its category header the
  12px grey label), the Customize page (category titles 12px grey, name fields
  14px, the tile on each row) and the Kana picker (each script's name is the grey
  header above one white card of rows). Card titles that carry a description
  beneath them — the Settings and Dashboard cards, and the dashboard's Words to
  review (a synthetic table with no table id, so no tile) — stay 15px / 500 in
  `--ink`, since they title a card rather than label a list. The masthead Help
  page is a short menu: four topic rows (`details.help-group`) in one inset-grouped
  card — a 15px title, a one-line grey gist under it, a chevron — each closed
  until tapped and opening to a few 14px bullets. On a phone the grey ground
  (`--group-ground`) is also `html` / `body` / `.app-frame`, so a short page has no
  lighter band beneath it — at every width now, not just the phone.
  **Platform hygiene** (checked against Apple's guidance): text fields keep
  their designed size (13–14.5px, never larger than the text around them) on
  every screen, and are borderless `--field-fill` fills with a focus ring —
  never a bordered rectangle (the sign-in fields are 44pt tall). iOS Safari's zoom-on-focus is switched off by
  `js/theme-init.js` adding `maximum-scale=1` to the viewport **on iOS only** —
  iOS ignores it for the reader's own pinch-zoom, so zooming stays available,
  and other platforms (where it could block pinch-zoom) never auto-zoom
  anyway. Never `user-scalable=no`, and never force fields up to 16px; hit
  areas are ≥44pt — small controls (the ⋯ button, the reorder arrows) get an
  invisible `::after` and a collapsed table's whole row is its toggle; the
  masthead icons are 44px; `--faint` is AA on both `--paper` and the grey ground
  and the tile hues clear 3:1 against their white glyph; sheets use `dvh` so the
  iOS toolbar doesn't clip them; `theme-color` has light and dark variants tinted
  to the masthead.
  The table-index dropdown uses the same tile (22px, `.tindex-icon`, tinted from
  the link's `data-tile`), with the entry count trailing the row as a secondary
  value and its category labels in the same 12px grey header voice.
  The search field is a 36px solid white capsule with a 0.5px hairline and a
  very soft lift (`--control-lift`), styled exactly like the Tables | Options
  capsule beside it — never grey, never translucent glass (glass read grey
  over the grey ground). Segmented controls: a faint track (`--seg-track`,
  ink 6%) with the selected segment raised in white on the same lift. Its text is 13.5px everywhere, just under the 14px
  rows it searches; the placeholder ends in "…" when the field is narrow. The glyph comes from a default per shipped table, or — for a table of your own —
  `icons.suggest(name)` (keyword aliases over the icon set, `js/vocab/icons.js`),
  (`DEFAULT_TABLE_ICONS` in `js/vocab/render.js`) unless the reader picked one.
  The category name is a quiet label above its card. Scoped to `#vocabulary` /
  `.page-vocab` (Flashcards' *Words to review* already sits in a card) and
  flattened for print. In dark the ground is *darker* than the card
  (`--page-bg` under `--paper`), as on iOS.
- **Sentence tables** (`tableClass: "vocab-sentences"` — Phrases' Self-introduction,
  and any future sentence table wherever it lives): stacked rows, not two columns —
  the Japanese full width at 18px / line-height 1.9 (at 16 a reading like わたし
  outran 私は and the readings rule pushed gaps into the sentence), the English under it at 14px
  secondary grey, romaji on tap between them, speaker and hide glyphs at the
  trailing edge of each line; no column headers (authored order, nothing to sort).
  **Question / answer pairs** (`tr.qa-q` / `tr.qa-a`): no rule between a
  question and its answer, which sits ~10px under it, indented 20px — the
  indent alone marks the reply, as in Mail; no bar, no box. The one hairline
  after each pair is the same full-width rule as every other row. Search keeps
  a pair together.
  Kinsoku via `line-break: strict` plus `text-wrap: pretty` against a lone か。.
- **Furigana in every reference table** (word, verb and sentence rows) is
  start-aligned — a reading begins exactly where its kanji begin and never
  extends left of them. Consecutive kanji share one reading; the reading floats
  above without widening its kanji and may run over the plain kana up to the
  next reading (less 3px); only what's left becomes space after the kanji, so no
  gap is pushed into a word (料理する, 弟と). `js/vocab/render.js`
  `jpGroupedSegments` tags each ruby with class-set custom properties (`rt-N`
  reading length, `kb-N` kanji count, `rm-N` room after it) and the CSS does the
  arithmetic in em, so it holds at every table's size. Readings never touch.
- **Opening a table is an inline disclosure** (iOS): every table, open or
  closed, is a row of its category's one white card. The tapped row keeps its
  exact size and position (14px title, same padding), its chevron turns, and
  the table unfolds flat inside the same card beneath it — nothing above moves,
  only what's below is pushed down. The row after an open table gets a
  full-width hairline. (Previously an open table broke out into its own card
  with a 20px title and a 16–24px gap above, so every tap made the page jump.)
- **Help screens** (masthead Help, Flashcards › Help) are iOS lists, not
  prose: each topic / group is a white card of two-line rows — the term on its
  own line (15px ink), one short plain line under it (13px muted) — hairlines
  between. Masthead topics are disclosure rows led by an iOS Settings-style
  icon tile; Flashcards Help puts a 13px grey header over each card. Keep a
  row to one idea and one line of explanation; keys are `kbd` chips.
- **Settings** (Flashcards › Settings) follows iOS Settings: a 13px grey header
  over each white card of 44px rows (label left, value or control right), a
  short grey footnote under the card. Numbers are plain right-aligned values
  you tap to edit (no grey box), on/off is a 51×31 iOS switch (`.set-switch`),
  study directions are checkmark rows, Back up & restore is two tint-text action
  rows. Changes save as you make them — a number when you leave its field, a
  tick or switch at once — with no Save button; the last direction can't be
  unticked.
- **Grammar notes** — a row's badges (い / な, 五段 / 一段 / 変格, particle
  chips) are not painted on the row: they stay in the DOM (`.row-badges`,
  hidden) as data and for screen readers, and one **ⓘ** (`.row-info-btn`)
  beside the hide eye opens a popover (`.role-pop-list`) with a line per note,
  each led by its own tinted glyph. The English keeps the row's full width.
- **Controls library** — one set of components everywhere, tokens `--seg-track`,
  `--seg-thumb`, `--switch-off`, `--switch-thumb`, `--switch-on`, `--radius-button`:
  - **Segmented control** (`.view-mode` column toggles in the dashboard's Words to
    review, `.fc-manage-filters`): a grey track with 2px padding, the selected
    segments raised on a thumb. The dashboard's column toggles are multi-select —
    a column that is showing is raised, one that is hidden lies flat, faint and
    struck through (`.col-hidden`); Manage's filter raises one at a time. The
    reference toolbar no longer uses one: an iOS segmented control is
    single-select, so its multi-select column toggles are switches in the Options
    sheet.
  - **Switch** (the Options sheet's `.opt-switch` rows — Japanese / Furigana /
    English, Cover answers, Show polite — plus Settings › Fuzz): a 34–38px grey track whose thumb slides right when on, the
    track filling with the section tone (`--switch-on` — the deep tone in light, the
    mid tone in dark, where the deep one is a pale tint that would wash out the
    thumb). The Options switches are `<button aria-pressed>` rows (pressed = on; a
    column switch is on while the column shows); the track and thumb are
    `::before` / `::after`.
  - **Buttons** (all capsules): *filled* (`.fc-btn-primary`, deep section tone,
    no shadow), *white* secondary (`.fc-btn`, accent text on `--control-lift`,
    no border — never a grey tint) and *plain* (per-row actions `.fc-btn-vocabaction`, the Options sheet's **Expand
    all** / **Print…** rows and its trigger: tint text, no box, dim on hover/press
    instead of an underline).
  - **Options sheet** (`.options-sheet`, opened by the sticky bar's `.options-btn`):
    an inset-grouped list on `--group-ground` — 13px sentence-case group headers
    (Show / Study), white `--radius-card` cards of 44px rows with inset hairlines, switches
    at the trailing edge, plain tint-text action rows, and the badge legends as
    footnote text. A 320px popover under the button on a wide screen; on a phone a
    bottom sheet with a grab bar and scrim (same shape as the table index) that
    lifts the toolbar above the tab bar while open (`.options-open`). The sticky
    bar is one row — the search capsule, then one shared glass capsule
    (`.bar-capsule`, iOS 26's grouped bar buttons) holding **Tables** and
    **Options** with a hairline between them — the **Jump to a table** button (`.tindex-trigger`: a
    list glyph, plus the current table's name on a wide screen; its menu lifts the
    bar the same way, `.tindex-open`), then Options. Both buttons are permanent —
    nothing in the bar appears or disappears as tables open and close, and
    opening a table scroll-compensates so the tapped row stays put. A dot
    (`.options-dot`) on Options flags a non-default state. Rows that don't apply hide (Show polite
    outside a verb table; the Expand / Print group while searching).
  - **Menus** (the table ⋯ menu): a glass popover (`--radius-menu`), items
    15px in 12px×14px rows separated by hairlines, label first and its glyph
    trailing. The ⋯ trigger itself is a bare glyph.
  - **Checkmark rows** (kana groups, study directions) are unchanged: the row is the
    tap target and a tick appears at the trailing edge.
- **iOS 26 materials** (the "iOS 26 materials" block at the end of
  `css/site.css`): the sticky search bar, the Options / Tables sheets, popovers
  and ⋯ menus are translucent glass — `backdrop-filter` blur with the
  `-webkit-` prefix for iPhone (WebKit), a thin bright top rim and one soft
  float shadow, and a near-opaque `@supports` fallback. Content surfaces (list
  cards, tables, the review card) stay solid. The search bar's blur sits on a
  `::before` layer: backdrop-filter on the bar itself would become the
  containing block for its `position: fixed` bottom sheets. Radii: cards 20px
  (`--radius-card`), menus 22px, sheet tops 30px, buttons / segmented controls
  / the search field are capsules.
- **No sheet.** Past phone width there is no bordered white page any more:
  the `--group-ground` runs edge to edge like the phone, and the content keeps
  a centred 1180px column (`.app-frame > .app`). **≥900px the masthead is one
  sticky glass bar** (64px; blur on a `::before` layer): the wordmark leading,
  the five sections as a white floating capsule (`--control-lift`) laid over
  its centre (both share the frame's first grid row, so the markup is the
  phone's), the utility glyphs trailing; the sticky search bar stops under it
  (`--nav-h: 64px`). **641–899px** the tabs keep their own row under the
  masthead, a sticky glass band (`--nav-h: 45px`). The phone keeps its bottom
  tab bar. The four masthead controls — account, help,
  customize, theme — are **bare 20px glyphs** in secondary grey inside 40px tap
  targets: no box, no outline. On a tablet (`hover: none`) each glyph gets a 10px
  caption under it — Account / Help / Customize / the current theme — since a
  tooltip can't explain it there. **On a phone (≤640px) the masthead is App
  Store style**: no wordmark row, the large screen title is the top of every
  screen, and one 34px round white account button (`--control-lift`, the sync
  dot on its corner) sits at the title row's trailing edge (the masthead is
  pinned over it; titles leave 48px for it). It opens `#accountMenu`, a glass
  menu of words: who you are + sync state, Account (reads "Sign in" for a guest
  and opens the sign-in screen, as the desktop glyph does) / Customize tables / Help,
  and Appearance as a System / Light / Dark segmented control that applies at
  once. The button scrolls away with the title, as on iOS. **The rule app-wide: no
  unexplained icon-only control on touch.** The sticky bar's Tables / Options
  become text bar buttons on a phone; Manage's buttons keep a one-word label
  (Add / Pause / Resume / Restore); the per-row glyphs (speaker, hide, +, ⋯) are
  spelled out in the Options sheet's **Row icons** group. Standard iOS glyphs
  (⋯, ×, chevrons) may stay bare. The page a glyph opens (Customize, Help) shows
  as the tinted one (`--accent-strong`), the way a selected bar item does on iOS;
  the sync dot stays, sitting on the account glyph's corner (green when signed in,
  amber when offline or something's queued, the glyph tinting to match). The
  nav is still top tabs, but the selected one is a **capsule** — `--section-soft`
  fill, `--section-strong` text, weight 500 — instead of a tinted block over a
  3px underline; the rest are plain secondary text. The capsule is the one place
  a section tone is spent on the chrome. That is the layout from 641px up.
- **On a phone (≤640px) the same `#siteNav` becomes an iOS tab bar**, pinned to the
  bottom edge (`position: fixed`, one hairline above it): five equal tabs, an
  icon over an 11.5px label, unselected in `--faint`, the selected one in its
  section tone at weight 500 on a square, full-height cell of neutral fill — no
  capsule, no rounded bubble. It deliberately stays this traditional, solid bar
  under iOS 26 (a floating glass capsule was tried and didn't sit well over
  scrolling content). Nothing is added or removed (same
  five links, same taps); the icons are CSS masks on `.site-nav-link::before`
  (inline `data:` SVGs, allowed by the CSP's `img-src`), so the JS-built markup
  is untouched. All five are drawn from the same family as `js/vocab/icons.js`'s
  own picker (24x24 grid, 1.7 stroke, round caps/joins) — a book, a bullet
  list, a speech bubble, a map pin, two stacked cards — so the row reads as
  one matched set rather than five icons with their own stroke weight and
  visual density. `--nav-h` drops to ~0 so the sticky reference toolbar sits at
  the very top with nothing above it, `body` gets bottom padding for the bar plus
  `env(safe-area-inset-*)` (the meta viewport carries `viewport-fit=cover`), and a
  running study session hides the bar and gives the space back like the rest of the
  chrome. The table-index sheet (`z-index` 60) and its scrim (59) cover the bar.
- **Large screen titles, and every screen's `<h1>`** — every screen names itself
  with a real `<h1>` now (Flashcards, Customize tables, How this works, and the
  reference pages' `<h2 class="screen-title" id="screenTitle">` promoted to
  `<h1>`) — one entry point per screen for a screen reader, matched by the
  `hidden` attribute keeping the other screens' `<h1>`s out of the tree so only
  one is ever exposed at once. On a phone the screens that already had a title
  (Flashcards, Customize, the masthead Help) set it at `--fs-large-title` (28px,
  weight 600) instead of `--fs-page-title`; the reference pages' own `<h1>`,
  `showSection()` keeps in step with the active section (Vocabulary / Grammar /
  Phrases / Travel), as an iOS large title names each tab's screen. On screen at
  phone width only — the desktop top nav already names the section visually —
  but *visually-hidden*, not `display: none`, above 641px: `display: none`
  would drop it from the accessibility tree too, leaving desktop with no
  heading at all for the active section. Hidden outright (the `display: none`
  case) while a search is running, since results span every section. It
  scrolls away with the page (the masthead isn't sticky), leaving the sticky
  toolbar at the top.
- **Table column headers** (`.vocab th`) are the list's header row in the iOS
  voice: 13px sentence-case medium-weight secondary text ("Japanese",
  "English" — never a tracked ALL-CAPS micro-label) in a ~44px-tall row, closed by
  the same hairline as the body rows (everywhere, Flashcards' Words to review included). The sort control is one up/down chevron pair (`SORT_ICON` in
  `js/vocab/render.js`) rather than a text arrow glyph: the chevron matching the
  current direction is full strength in the section tone, the other a ghost,
  and both ghosted on an unsorted column, as in iOS Files. Its tap area is
  padded out with negative margins so it stays generous without growing the row.
- **Grammar badges** are one capsule vocabulary, shown only inside the ⓘ
  popover (see *Grammar notes* above) and in the Options sheet's footnote
  legends — never painted on the row. **い / な** (`.adj-badge`) are purple /
  green (`--adj-i-ink` / `--adj-na-ink`, as saturated as `--particle` so a small
  capsule reads as coloured); a verb's group (`.verb-badge`) is **五段** teal,
  **一段** terracotta or **変格** (`--irregular-ink`), its reading in parentheses
  and its English name (u-verb / ru-verb / irregular verb) beside it; a particle
  the word takes (`.particle-chip`) is the particle blue, bold. An exception — a
  な-adjective ending in い, いい / かっこいい, 切る / 帰る, 来る — gets the
  **outlined** capsule (`-irr`, a 1.5px ring, no fill) and its reason on the
  line (`adjNote` / `verbNote`, else `VERB_CLASS_META.irregular.genericNote`).
  The popover (`.role-pop`, `openPop()` in `js/vocab/interactions.js`) is a
  small white rounded surface with the menu shadow and an arrow at its
  trigger; it closes on an outside tap, Escape, scroll, resize or hash change
  and is suppressed while the English is hidden or covered (a role like "what
  you eat" would give the answer away). The legends show only while the table
  under the sticky bar has that kind of badge (`updateAdjLegend()`); a screen
  reader gets each row's type from its visually-hidden note instead.
- **Every vocab table is two columns, Japanese and English** — romaji isn't a
  column anywhere, including Phrases. Instead, the word/sentence itself
  (`.jpword[data-romaji]`) reveals its romaji as a caption line underneath on
  click/tap (`.jp-romaji-on`), set in italic a step down in size from the
  English column so the two don't compete — deliberately no hover trigger, unlike the
  katakana `.kr` reading layer it otherwise mirrors, since a whole word is a
  much bigger, more deliberate target than one kana and a stray hover
  opening it reads as noisy rather than helpful. No dedicated icon either:
  every word has a reading, so there's nothing for an icon to distinguish.
  In flow, not a floating popover, so it grows the row instead of sitting
  over the one below. It stays in the DOM for search (the reading lives in
  the `data-romaji` attribute, read by `content: attr(...)`, so it never
  touches textContent), and prints in place for a pinned-open row. The
  hover-triggered `.kr-on` / `.particle-on` "pinned" rules are declared
  after their `(hover: none)` suppression and repeat enough of the base
  selector to tie its specificity — otherwise a stuck `:hover` state (iOS
  can leave a just-tapped element hovered) could re-hide a reveal the tap
  just pinned open; the old whole-word icon+popover design had this same
  tie (before it dropped hover entirely), and it's the likely explanation
  for reports of the reveal never opening on an iOS PWA. The katakana `.kr`
  layer itself renders as a dark, rounded callout with a small caret pointing
  at the kana — the iOS system-tooltip idiom, fixed dark fill in both themes
  — instead of a bordered box sitting on the page. The English column is
  top-anchored to the row (not centred) for exactly this reason: a table
  row's top edge never moves when a sibling cell grows, only its bottom
  does, so top-anchoring is what keeps English from shifting when a reveal
  grows the Japanese cell underneath it. Its padding-top is tuned per
  furigana/no-furigana case to land where the old centred layout put it.
- **Phrases tables** (`.vocab-sentences`) hold whole sentences, so the
  Japanese cell wraps (`line-height: 2` for the furigana) and eases down a
  size; they keep their authored question/answer order instead of sorting
  A-Z. Otherwise they're the same Japanese+English shape as every other
  table now — Phrases used to show romaji plainly and hide English behind a
  translate icon; that's inverted, for consistency.
- **The Customize page** stacks the table list, then a *Your vocabulary* block.
  Each table row ends in plain tint-text actions — **Hide** / **Show** always,
  **Reset** only when there's something to reset (a disabled Reset took width
  from the name field on a phone). A hidden table's tile and name dim, with a
  "Hidden from the reference" note.
  Everything collapsible on it shares one disclosure mechanic — a native
  `<details>`/`<summary>` with a shared `.disclosure-caret` mixin (hidden
  native marker, one iOS chevron that turns from right to down on `[open]`),
  the same disclosure language as Flashcards › Manage and the masthead Help. Every open/close is persisted
  (`localStorage`, `raume-customize-open-v1`, keyed per item) via a `toggle`
  listener attached to each `<details>` in `applyDetailsState()`, not just
  held in memory — so what a reader leaves open survives an actual reload,
  and everything starts collapsed for anyone who hasn't touched it yet:
  - **The page is on the grey ground** (`.page-customize`, like every other
    page); content keeps its 720px reading width via `.page-customize > *`, so the
    ground spans the sheet. Everything below is a borderless white `--radius-card` card.
  - **The table list** reads Section → category → table as list rows: a
    section-level heading (`.cz-section-label`) and a category heading
    (`.cz-group-title`, the 12px grey header voice), each closed by an inset
    hairline. As in iOS Settings a row is plain ink with its table count as a
    trailing secondary value and a chevron that points right while closed and
    turns down when open (`.disclosure-caret`, shared by every collapsible row
    on the page) — no coloured marker bars. A section with more than one category (Vocabulary's four)
    is itself collapsible — closing it hides all four at once — with its
    eyebrow above them; a section that's just one category sharing the
    section's own name (Grammar, Phrases, Travel) skips the redundant
    eyebrow-then-identical-row and renders as a single merged heading instead
    (`.cz-group-title-solo`), sized and weighted identically to the eyebrow
    (`--fs-subhead`/500) since both are playing the same "top of a section"
    role and need to read as one consistent level, not two different sizes.
    The 4 top-level rows (Vocabulary/Grammar/Phrases/Travel) sit inside one
    shared card (`.cz-groups`), iOS Settings grouped-list style — each row's
    own bottom hairline is the only separator between rows (no divider after
    the last row). A name reads as the row's plain ink title (the shipped name
    is the placeholder, also in ink) and becomes a `--field-fill` well with an
    inset focus ring only while being edited — no grey box per row; a
    plain-text **Reset**.
  - **Reordering a table or a category** has one control, as in iOS's edit
    mode: the `.cz-drag-handle` grip (6 dots) at the trailing edge. Drag it,
    or focus it and press ↑ / ↓ to move one step — a real button in the tab
    order (focus ring, 44pt hit area), labelled with its place ("Reorder
    Drinks, 2 of 7") so a screen reader hears where the item landed; focus
    follows it through the re-render. Both paths go through
    `tc().setTableOrder` / `setCategoryOrder`. (Separate ▲▼ buttons beside
    each row were dropped, 2026-09-23: two controls for one job.)
    `.cz-drag-handle`'s `margin-left: auto` pushes it flush to the trailing
    edge. On a category
    row the chevron (`.disclosure-caret::after`) takes that slack instead and
    the grip follows it (`order`), so every grip, category or table, sits in
    one column at the trailing edge — two auto margins would split the space
    and strand the grip mid-row. Dragging is
    Pointer Events (mouse, touch and pen in one code path — no separate
    touch-event handling to duplicate), reordering nothing in the DOM while
    the gesture is live: only a CSS `transform` on the dragged item and
    whichever siblings it's currently passed over, both computed from each
    element's *original* `getBoundingClientRect()` captured once at
    `pointerdown` (comparing two numbers taken the same way stays correct
    even mid-auto-scroll, since the scroll offset cancels out of the
    comparison). The real reorder — and the one re-render that reflects it —
    happens once, on drop. Picking up an open category collapses it first;
    dragging near a viewport edge auto-scrolls. The new handle crowded an
    already-tight phone row, so `.cz-row`'s `gap` and the handle itself both
    shrink under 640px, clawing back most of what it took from the name
    field rather than letting names truncate more than before.
  - **Your vocabulary**'s action rows (Add a word / New table / Import a list,
    each a `.cv-card` `<details>` with a sentence-case `<summary>` at
    `--fs-card-heading`) sit back to back as one inset-grouped card — an inset
    hairline between them, corners only on the ends — and all start closed. Forms are label-over-field with filled, unbordered fields; the
    parsed-ruby preview and the import result sit on `--surface`, an error on
    `--wrong-soft`; the buttons are tinted (`.cv-btn`) or plain (`.cv-file-btn`).
  - **Words you've added** is one non-collapsible card (same `--fs-card-heading`
    heading as above) holding a search field + a Recently added/A–Z sort
    (`.cv-owned-controls`, filters and reorders via a plain DOM swap in
    `updateOwnedList()` — no full re-render, so the search input never loses
    focus mid-keystroke; the sort is an iOS pop-up button, tint text with the
    native chevron, no fill), then one `<details>` per
    table (`.cv-owned-group`) — collapsed by default with a word count in its
    summary, so a reader with words spread across many tables gets a list of
    tables to open, not one long scroll; each keeps its hairline even
    closed, so consecutive tables still read as separate entries. No "your
    table" tag on each row — the section is already titled "Words you've
    added", so it said nothing a reader didn't already know. Searching swaps
    to a flat always-open layout (`.cv-owned-group-flat`) instead, since
    collapsing what you just searched for would defeat the point. Editing a
    word swaps its row for a single text field (same line format as adding
    one) with Save/Cancel, reusing the trash icon's stroke style for a
    matching pencil icon. Deleting a word asks for confirmation first, same
    as deleting a table. A word's row is a list row, as in Flashcards › Manage:
    the Japanese plain (no furigana) in ink with its romaji small and grey
    beside it, the English under, the pencil / trash centred on the row
    (44pt-ish targets). Sentences wrap only at the spaces between phrases
    (`word-break: keep-all`, anywhere as a fallback), never leaving か。 alone.
  - A heading's explanatory text (the page intro, the Your vocabulary intro,
    the import format) lives in an `.info-panel` (an unboxed footnote) toggled
    by an adjacent `.info-btn` — a bare "i" glyph that takes the accent tint
    while open — instead of sitting on the page unconditionally.
- **The masthead Help page** (`.page-help`) is a short menu of four disclosure
  rows in one white card (see the type-scale note above) — no rules between
  bullets, no ALL-CAPS headings, nothing open until tapped.
- **Sheets** (the table-index popover / bottom sheet, the icon picker) are
  glass surfaces (`--radius-menu`, `--radius-sheet` for a phone bottom sheet's
  top corners) with the one float shadow; the current table in the index is a
  soft fill, not a bar; the picker's group labels are sentence-case
  `--fs-small`.
- **Flashcards header**: the four-segment control and Settings / Help share
  the title bar. On a phone: the large "Flashcards" title with Settings / Help,
  the segments full width under it. Wider: the title is visually hidden (the
  top bar names the page, as on the reference pages), segments leading and
  Settings / Help trailing on one row, the status line under it.
- **Flashcards is one centred 900px column** past phone width — title bar,
  status line, tabs and every panel on the same edges (padding on
  `#flashcardsPage`, so the inline-flex tabs line up too). Customize (720px)
  and Help (680px) centre on their own widths the same way, so no page hugs
  the left edge of a wide window. **Manage** fills
  that column — its rows are content-driven, not a proportional grid. A
  category's tables are one inset-grouped card (rows back to back, an inset
  hairline from the title, corners on the first and last row only), as on
  the reference pages — not a stack of separate cards. Its word rows show the plain kanji, not the furigana ruby
  the reference tables use: Manage is a deck-management checklist, and ruby made
  every row a different height so the status glyphs and action buttons never
  lined up. The reading stays one column over (romaji, hidden on a phone).
- **The Dashboard** gets its own wider cap (900px). Uncapped, its tiles and
  cards are sized as *fractions* of the sheet, so a 2-up row ballooned into two
  ~600px panels holding a couple of words each. Capped, the top row, the four
  stat tiles and the viz cards also share one 12-column grid past 620px, so a
  seam in one lines up with a seam in another.

## Motion

Light throughout — short opacity/transform transitions, chevron rotations, one
card wash on a checked answer. A single `@media (prefers-reduced-motion: reduce)`
block near-instants all of it.

Every control takes the same focus ring: a 2px `--section` outline at a 2px
offset (the search box included). The Kana group picker and the Settings
study-directions block render as iOS Settings-style checkmark rows — the
whole row is the tap target, the native checkbox is visually hidden (kept
for accessibility), and a CSS tick fades in at the trailing edge on
`:checked`. The lone standalone Fuzz setting is an on/off switch, not a
picker row: `appearance: none` plus a CSS track and thumb (see "Controls
library" below).

## The Flashcards dashboard

The whole Flashcards page follows the iOS rules the reference pages do: it sits
on the grey ground (`.page-flashcards` → `--group-ground`, the same as
`.page-vocab`), every group is a **white `--radius-card` card straight on the
ground — no border, no shadow, no coloured edge bar**, and rows inside a card are
separated by inset hairlines (`--row-line`). The four sub-tabs are the shared segmented
control (see "Controls library"), full width on a phone. The dashboard has to
be scannable at a glance:

- **One card per group** — `.fc-dash-now` ("right now": next review + today +
  Study now), `.fc-dash-stats` (the 4 tiles) and then one `.fc-viz-card` each for
  Card progress, Reviews this week, Due next 7 days, Missed today, Leeches
  (only when there are any) and Words to review. The two small charts still pair
  side by side on a wide window;
- **"Right now"** leads with the count: a large 44px ink figure with "cards to
  study" under it and one secondary line (what's in the queue, or when the
  next review lands) — a number to act on, never a coral warning line. Study
  now sits on the same row (`.fc-now-row`), trailing. Nothing due: a sage tick
  in a soft circle over a larger "All caught up", Study now disabled in place.
  Today is one quiet footer line under a hairline — "Today", a thin 4px sage
  bar, "N of M";
- **Study now** (`.fc-btn-primary`) fills with the deep `--section-strong`
  lavender — no shadow, it outranks the tinted buttons by fill alone;
- **stat tiles** — a plain figure over a caption, no edge rule; each caption
  leads with a 12px `--faint` glyph (flame, cards, check, target), as iOS
  Health marks its summary cards — never coloured. The empty dashboard ("No
  flashcards yet") carries the one large muted glyph (44px). Colour stays
  sparing: section tone only for what you can act on (tint, hover, current,
  focus); semantic green / red / amber only for state (a table's complete
  "N / N" count is `--right-strong`, not the section tone); titles are ink.
  Settings value rows carry no icon tiles — iOS puts tiles only on rows
  that open another screen. The one signal
  is **Estimated retention**'s figure turning coral once it drops under the
  Settings target (`.fc-stat-attention`);
- **Card progress** uses three distinct hues, not one hue at three lightnesses —
  neutral slate `--fc-state-new`, ochre `--fc-state-learning`, sage
  `--fc-state-review` (New → Learning → graduated-to-review). The legend labels
  each, so colour never carries identity alone;
- **Reviews this week** bars are a mid lavender tint; today's bar is the full
  deep `--accent-strong` with its count and label the same colour and weight;
- **Due next 7 days** reuses the Reviews-this-week bar language (same
  lavender tint, deep `--accent-strong` for the first column) with its own
  `.fc-due-*` classes, and pairs beside it; Card progress spans the full width
  above the pair. Nothing due → a single line instead of seven flat baselines;
- **Missed today** rows are hairline-separated with a coral "N× today" badge —
  the badge alone carries the attention tone.
- **Leeches** (`.fc-leech-card`, only when there is one) is a full-width card of
  hairline-separated rows — word, gloss and a muted "Forgotten N× · direction"
  line on the left, tinted **Pause** / **Keep** buttons on the right (under the
  word on a phone). Manage's matching *Leech* tag uses `--warn-strong`.
- **Words to review** is the standard vocabulary table in its own card
  (`#fcWordsToReview:has(> .table-section)`), with the segmented column toggle in
  its header.

**Manage**: the category name is a quiet label on the ground above its cards
(section tone, no rule beneath, disclosure caret at the end); each table is one
white card — a header row (chevron, icon tile, the name over a quiet "N / M"
subtitle, table actions; the name wraps rather than truncating) over its words
as hairline rows of two lines: the kanji with its romaji small and faint
beside it, the English under them. Secondary buttons everywhere (`.fc-btn`)
are white capsules with accent text on `--control-lift` — never a grey tint. **Kana**'s group pickers and **Settings**' / **Help**'s
sections are the same white cards; a picker's rows are checkmark rows with inset
hairlines (the `legend` is floated into flow so a browser doesn't paint the
card's background from the legend's midline). The sync chip is a tinted capsule
with no outline, and the sign-in / entry cards are borderless (the tinted "This
device only" card gives its button a white fill so it still reads as a button).

**Puzzles** puts the puzzle first. One toolbar: a white capsule **summary
button** ("Crossword · Flashcards · 15 words · Romaji ⌄") leading, then
**New puzzle** (white) and filled **Check** trailing with the reference
tables' ⋯ menu (Reveal a letter / Reveal puzzle / Clear answers / Print; on a
phone New puzzle moves into it). The summary opens the settings — Source,
Tables, Style, Script, Words as iOS pop-up rows (label left, value + ⌃⌄ right,
an invisible native `<select>` over the row; the table list is checkmark rows)
— in a glass popover under it (`.fc-xw-sheet`, the Options pattern), a bottom
sheet over a scrim on a phone; it stays open while you change things and
closes on an outside tap or Escape. The puzzle is one grid-areas layout:
≥760px the grid leads (40px squares) with the white clue bar ("1 Down ·
watermelon") and the Across / Down cards beside it, so the whole puzzle is in
view without scrolling; narrower, the clue bar sits above a full-width grid
and the lists below. The grid draws only the letter squares — white with a
hairline, blanks are the page ground — shrinking to a 24px floor before it
scrolls; the active word takes `--accent-soft`, the focused square a
`--section-strong` ring. Check's verdict is the green / red soft fill. Across
and Down are inset-grouped cards (side by side when there's room), compact rows
with the number as a quiet right-aligned tabular column, the active clue
tinted.

Printed, a puzzle is a worksheet: a 20pt bold title (the style), one grey
line under it (source · N words · script), the grid centred at 9mm squares
(smaller only when a big grid must fit the width), then Across and Down as
two plain columns — a rule under each heading, no cards, no row rules, a grey
tabular number column.

The review card's rating row needs a fourth hue: Again / Good / Easy reuse
`--wrong` (coral) / `--right` (sage) / `--accent` (lavender); Hard gets the
ochre `--fc-hard`.

A session is the one screen where the masthead, the main nav, and
Flashcards' own title/sync-status/tab row step aside: `body:has(#flashcardsPage
… .fc-review-card, .fc-session-done)` hides them (`css/site.css`, "Review
flow") for as long as either is on screen, and the tabpanel gets a
viewport-relative `min-height` so the card centres in what that frees up
instead of sitting pinned under a stack of chrome it doesn't need. One CSS
rule covers both the vocabulary and Kana review cards, since they share the
same markup — no session-state flag to keep in sync in JS.

The sub-tabs are four segments (Dashboard / Manage / Kana / Puzzles) — iOS
segmented controls stop reading at a glance past about five. Settings and Help
are plain tint-text buttons at the title's trailing edge (an iOS navigation
bar's right-hand items) and open as pushed screens: a "‹ Flashcards" back
button above their own large title, no segmented control. The active sub-tab
(`.fc-tab.active`) is the raised segment of a segmented control; the active nav link (`.site-nav-link.active`) is a soft capsule in the
section tone — clearly the live one against the muted rest.

The review card itself is a plain white card (no border or shadow); the answer
panel under it is unboxed — the large answer text does the work — and the
rating row is four plain text actions (no fill, no border) under one hairline
divider, each label coloured in its own tone rather than a separate chip.

## Dark mode

Not just an inverted palette — a few weights are tuned separately where the
light logic doesn't carry over:

- text fields get their own fill (`--field-fill`) and border (`--field-line`) —
  a well *below* the page ground, so an input reads as something you type into
  rather than a raised panel;
- the grouped ground is *darker* than the cards (`--page-bg` under `--paper`), so
  cards read as raised without borders or shadows, while table row rules gain a
  little (`--row-line`) so they don't vanish;
- every accent hue is lightened but kept muted so it carries against the dark
  without turning neon — the five section tones, the lavender/sage accents,
  the particle blue, coral and ochre all re-pitched in the
  `:root[data-theme="dark"]` block;
- `--furigana` drops a clear step below `--romaji` again (it collapses to one
  tone otherwise), still clearing AA over `--paper`.

Theme state: an explicit **Light** or **Dark** choice is stored; absent means
**System**. `js/theme-init.js` applies it in `<head>` before first paint, so
there's no flash.
