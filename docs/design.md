# Design

The look is one iOS-style system across the whole app: a grey grouped ground,
white borderless 12px cards sitting directly on it, inset hairlines between
rows, segmented controls and switches, and a small set of muted tones that carry
hierarchy — dusty lavender for what you act on, soft sage for progress, muted
coral for attention, deep ink for anything you read. Calm, not washed out. This
note records the rules so they stay consistent; it is the single source for the
system, and the sections below cover each part of it.

## Type

- **Space Grotesk** is used in exactly one place — the `raume` wordmark in the
  header, opposite a small `JAPANESE REFERENCE`.
- **Inter** is everything else. Both are self-hosted (SIL OFL); there is no
  external font runtime.
- Hierarchy comes from size, spacing, position, and colour — **not** bold weight
  or high contrast. Default weight is 400; 500 marks a genuinely active or
  labelled state. One type scale (`--fs-*` tokens: `--fs-micro` 11.5 · `--fs-small`
  13 · `--fs-english` 13.5 · `--fs-nav` 14 · `--fs-subhead` 15 · `--fs-section-title`
  19 · `--fs-page-title` 22, plus `--fs-jp` / `--fs-romaji` for the Japanese text
  itself) is shared by the reference and Flashcards sides — a size that
  duplicates a token is written as the token. Labels are **sentence case**;
  the one ALL-CAPS label left is the masthead's `JAPANESE REFERENCE` kicker
  (tracked wide, a brand mark rather than a label). Deliberate literal sizes
  remain only where a token would be wrong: the prompt and kana glyphs on the
  review card, the verdict tag (a test reads its declared size) and tiny
  chips. The sole exception is a **particle** (`.particle`,
  700 + `--particle` blue): a grammar signal that needs to jump out of a
  sentence at a glance, and colour alone wasn't enough against Japanese text.
- On the review card the prompt is the anchor — 26px, the largest text on the
  card, with the direction label (`.fc-prompt-label`) faint and tucked right
  above it. It reads as the anchor from contrast, not sheer size: once
  checked, the prompt recedes to a small, muted `.fc-prompt-small` reminder —
  still legible, no longer the focus — and the verdict ("Correct" / "Almost
  correct") is a small tone-coloured tag, not a sized-up word: the comparison
  underneath it is the thing to read. On a phone the chrome (meta line,
  padding, rating row, the "stage" panel) tightens but the prompt keeps its
  full size and air. Past 700px the reading text you rate from (the stage
  panel, rating labels) steps up a size off the shared `--fs-*` scale — but
  not the prompt, which stays 26px at every width; a roomier window doesn't
  need a bigger word, and it read as oversized when it scaled up too. That
  scale is tuned for the reference tables and read too small to study from on a
  desktop window.

## Colour

A small set of **muted, desaturated tones** — nothing bright, nothing neon: a
dusty lavender (`#82799B`), a soft sage (`#78968B`) and a muted coral (`#C77C72`)
on a grey grouped ground. Deeper ink and colour that signals hierarchy rather
than decorating. No true red except the one destructive-delete `--danger`.
Gradients are out; **shadows are out too, except the one under a floating menu
or sheet** (`--shadow-menu`) and the switch thumb — cards lift off the ground by
fill alone (white on grey; in dark the ground is *darker* than the card). All CSS
custom properties in `css/site.css`.

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

- **The reference pages are an iOS inset-grouped list** (step 1 of the app-wide
  iOS system in PLAN). One grey ground (`--group-ground`) behind the page and
  white 12px-radius cards sitting directly on it — no borders, no coloured
  bars, no rules under headings, no box inside a box. A run of collapsed tables
  is ONE card of list cells (inset hairline between them, disclosure chevron on
  the right, the per-table ⋯ menu / print kept on the cell as bare glyphs); an
  open table is its own card with its title as a bold section title on the
  ground above it, so "where does the title end and the table start" is never
  in doubt (on flat white they blended, worst in search results where every
  table is open). The category name is a quiet label above its card; the search
  field is a slightly darker borderless fill. Scoped to `#vocabulary` /
  `.page-vocab` (Flashcards' *Words to review* already sits in a card) and
  flattened for print. In dark the ground is *darker* than the card
  (`--page-bg` under `--paper`), as on iOS.
- **Controls library** — one set of components everywhere, tokens `--seg-track`,
  `--seg-thumb`, `--switch-off`, `--switch-thumb`, `--switch-on`, `--radius-button`:
  - **Segmented control** (`.view-mode` column toggles, `.fc-manage-filters`): a
    grey track with 2px padding, the selected segments raised on a thumb. The
    column toggles are multi-select — a column that is showing is raised, one
    that is hidden lies flat, faint and struck through (`.col-hidden`); Manage's
    filter raises one at a time. Same component in the dashboard's Words to review.
  - **Switch** (Cover answers `.selftest-toggle`, Show polite `.polite-toggle`,
    Settings › Fuzz): a 34–38px grey track whose thumb slides right when on, the
    track filling with the section tone (`--switch-on` — the deep tone in light, the
    mid tone in dark, where the deep one is a pale tint that would wash out the
    thumb). The two toolbar switches are still `<button aria-pressed>` with their
    label; the track and thumb are `::before` / `::after`, so no markup changed.
  - **Buttons**: *filled* (`.fc-btn-primary`, deep section tone, no shadow),
    *tinted* (`.fc-btn`, soft accent fill, accent text, 10px radius, no border) and
    *plain* (per-row actions `.fc-btn-vocabaction`, toolbar **Print…** / **Expand
    all**: tint text, no box, dim on hover/press instead of an underline).
  - **Menus** (the table ⋯ menu, the Print… menu): a 14px popover, no border, one
    shadow, items 15px in 12px×14px rows separated by hairlines, label first and its
    glyph trailing. The ⋯ trigger itself is a bare glyph.
  - **Checkmark rows** (kana groups, study directions) are unchanged: the row is the
    tap target and a tick appears at the trailing edge.
- **Masthead and nav are one bar** on `--paper`, closed by a single row hairline
  (no rule above the nav). The four masthead controls — account, help,
  customize, theme — are **bare 20px glyphs** in secondary grey inside 40px tap
  targets: no box, no outline. The page a glyph opens (Customize, Help) shows
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
  section tone at weight 500 — no capsule. Nothing is added or removed (same
  five links, same taps); the icons are CSS masks on `.site-nav-link::before`
  (inline `data:` SVGs, allowed by the CSP's `img-src`), so the JS-built markup
  is untouched. `--nav-h` drops to ~0 so the sticky reference toolbar sits at
  the very top with nothing above it, `body` gets bottom padding for the bar plus
  `env(safe-area-inset-*)` (the meta viewport carries `viewport-fit=cover`), and a
  running study session hides the bar and gives the space back like the rest of the
  chrome. The table-index sheet (`z-index` 60) and its scrim (59) cover the bar.
- **Large screen titles** — on a phone the screens that already have a title
  (Flashcards, Customize, the masthead Help) set it at `--fs-large-title` (30px,
  weight 600) instead of `--fs-page-title`. The reference pages get one too: a
  real `<h2 class="screen-title" id="screenTitle">` that `showSection()` keeps in
  step with the active section (Vocabulary / Grammar / Phrases / Travel), as an
  iOS large title names each tab's screen. Phone only — `display: none` from 641px
  up, where the top nav already names the section — and hidden while a search is
  running, since results span every section. It scrolls away with the page (the
  masthead isn't sticky), leaving the sticky toolbar at the top.
- **Table column headers** (`.vocab th`) are the list's header row in the iOS
  voice: 13px sentence-case medium-weight secondary text ("Japanese",
  "English" — not the tracked ALL-CAPS micro-label the flashcard prompt label
  and Customize/Help section headers still use) in a ~44px-tall row, closed by
  the same hairline as the body rows (everywhere, Flashcards' Words to review included). The sort control is one up/down chevron pair (`SORT_ICON` in
  `js/vocab/render.js`) rather than a text arrow glyph: the chevron matching the
  current direction is full strength in the section tone, the other a ghost,
  and both ghosted on an unsorted column, as in iOS Files. Its tap area is
  padded out with negative margins so it stays generous without growing the row.
- **い/な-adjectives** carry a small **capsule badge** (`.adj-badge`) — 20px tall,
  a 14% tint of `--adj-i-ink` (purple) or `--adj-na-ink` (green) behind the glyph
  **い** / **な** in the full ink, 11.5px — placed *before the meaning* in the
  English cell, like a dictionary's part-of-speech tag. (An earlier version put
  a coloured bar down the Japanese cell's edge; iOS has no edge bars, and a
  badge beside the word stole width from the narrow Japanese column, wrapping
  words like つまらない.) The glyph is drawn by CSS from `data-badge`, so it never
  enters the cell's text, search or speech. The dedicated tokens are deliberately
  as saturated as `--particle`, not as muted as the accents, so a small badge reads
  as coloured at a glance. An **irregular** adjective — a な-adjective that ends in
  い (きれい, 嫌い, 有名), or いい / かっこいい, which conjugate as よくない — gets an
  **outlined** badge (`.adj-badge-irr`: no fill, a 1.5px ring) and a one-line
  footnote under its meaning (`.adj-note`, `--fs-micro`, secondary, from the row's
  `adjNote`) like an iOS cell subtitle, so the reason is readable on touch, not
  hidden in a tooltip. The toolbar legend (`.adj-legend`, `aria-hidden`) shows a
  sample of each — い, な, outlined "irregular" — and `updateAdjLegend()` in
  `js/vocab/interactions.js` shows it only while the table under the sticky toolbar
  (or, while searching, any still-visible match) has adjectives. A visually-hidden
  "(い-adjective)" note on the Japanese cell carries the real distinction to
  screen readers.
- **Particles a word takes** (`.particle-chip`) are the same capsule as the
  adjective badge, in the app's particle blue and bold (the one deliberate use of
  bold — `.particle`), before the meaning: `を`, `に/へ`, `が`. A word can have two
  (`を` `に`). To keep 38 rows from each growing a subtitle, the caption
  (`.particle-note`, under the meaning like an iOS cell subtitle) appears only when it
  adds something: a lone object を is the chip alone ("eat" already says what you
  eat); a lone other particle shows just its role ("where you live"); several list
  each particle with its role ("を what you listen to · に who you ask"). Captions
  inherit the cell's colour (dimmed by opacity) so Cover answers blanks them with the
  meaning instead of leaking it. The toolbar legend (`.particle-legend`) shows only
  while the table on screen has chips, independently of the adjective legend.
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
- **Help and Settings** are prose, held to a readable measure (680px).
- **The Customize page** stacks the table list, then a *Your vocabulary* block.
  Everything collapsible on it shares one disclosure mechanic — a native
  `<details>`/`<summary>` with a shared `.disclosure-caret` mixin (hidden
  native marker, one small triangle that flips on `[open]`), the same caret
  language Flashcards › Manage already uses. Every open/close is persisted
  (`localStorage`, `raume-customize-open-v1`, keyed per item) via a `toggle`
  listener attached to each `<details>` in `applyDetailsState()`, not just
  held in memory — so what a reader leaves open survives an actual reload,
  and everything starts collapsed for anyone who hasn't touched it yet:
  - **The page is on the grey ground** (`.page-customize`, like every other
    page); content keeps its 720px reading width via `.page-customize > *`, so the
    ground spans the sheet. Everything below is a borderless white 12px card.
  - **The table list** reads Section → category → table as list rows: a
    section-level heading (`.cz-section-label`) and a category heading
    (`.cz-group-title`), each closed by an inset hairline, no marker bars. The
    section's name takes its own tone via `data-section`, reading the actual
    per-section token (`--sec-vocabulary` etc.) rather than the page-global
    `--section` var, which can't tell sections apart when a page shows all of
    them at once. A section with more than one category (Vocabulary's four)
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
    the last row). Name fields are filled wells (`--field-fill`, no border) with
    a plain-text **Reset**.
  - **Your vocabulary**'s three action cards (`.cv-card` as `<details>`, a
    sentence-case `--fs-subhead` `<summary>`) all start closed. Forms are
    label-over-field with filled, unbordered fields; the parsed-ruby preview and
    the import result sit on `--surface`, an error on `--wrong-soft`; the
    buttons are tinted (`.cv-btn`) or plain (`.cv-file-btn`).
  - **Words you've added** is one non-collapsible card holding a search field
    + a Recently added/A–Z sort (`.cv-owned-controls`, filters and reorders
    via a plain DOM swap in `updateOwnedList()` — no full re-render, so the
    search input never loses focus mid-keystroke), then one `<details>` per
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
    as deleting a table.
  - A heading's explanatory text (the page intro, the Your vocabulary intro,
    the import format) lives in an `.info-panel` (an unboxed footnote) toggled
    by an adjacent `.info-btn` — a bare "i" glyph that takes the accent tint
    while open — instead of sitting on the page unconditionally.
- **The masthead Help page** (`.page-help`) is a quiet section label
  (`--fs-small`, section tone, sentence case) over a white card holding that
  section's list — no rules, no ALL-CAPS headings.
- **Sheets** (the table-index popover / bottom sheet, the icon picker) are
  borderless 14px surfaces with the one menu shadow; the current table in the
  index is a soft fill, not a bar; the picker's group labels are sentence-case
  `--fs-small`. The flashcard study prompt label is the one deliberate
  ALL-CAPS micro-label left (`.fc-prompt-label`).
- **Manage** runs the full sheet — its rows are content-driven, not a
  proportional grid. Its word rows show the plain kanji, not the furigana ruby
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
`.page-vocab`), every group is a **white 12px card straight on the ground — no
border, no shadow, no coloured edge bar**, and rows inside a card are separated
by inset hairlines (`--row-line`). The five sub-tabs are the shared segmented
control (see "Controls library"), full width on a phone. The dashboard has to
be scannable at a glance:

- **One card per group** — `.fc-dash-now` ("right now": next review + today +
  Study now), `.fc-dash-stats` (the 4 tiles) and then one `.fc-viz-card` each for
  Card progress, Reviews this week, Due next 7 days, Missed today, Leeches
  (only when there are any) and Words to review. The two small charts still pair
  side by side on a wide window;
- **"N to study"** (`.fc-next-review`) is a plain title and sub-line inside the
  "right now" card — no bar, no tinted box; the signal is the title's colour
  alone: coral when cards are waiting (an attention state, not an error), quiet
  sage (`-clear`) when the queue is empty;
- **Study now** (`.fc-btn-primary`) fills with the deep `--section-strong`
  lavender — no shadow, it outranks the tinted buttons by fill alone;
- **stat tiles** — a plain figure over a caption, no edge rule. The one signal
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
white card — a header row (chevron, name, "N / M added", table actions) over its
words as hairline rows. **Kana**'s group pickers and **Settings**' / **Help**'s
sections are the same white cards; a picker's rows are checkmark rows with inset
hairlines (the `legend` is floated into flow so a browser doesn't paint the
card's background from the legend's midline). The sync chip is a tinted capsule
with no outline, and the sign-in / entry cards are borderless (the tinted "This
device only" card gives its button a white fill so it still reads as a button).

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

The active sub-tab (`.fc-tab.active`) is the raised segment of a segmented
control; the active nav link (`.site-nav-link.active`) is a soft capsule in the
section tone — clearly the live one against the muted rest.

The review card itself is a plain white card (no border or shadow); the answer
panel under it is unboxed — the large answer text does the work — and the
rating row stays four flat buttons with hairline dividers and coloured key
chips.

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
