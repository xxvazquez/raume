# Design

The look is a calm paper reference with a clear colour system: a white sheet on
a near-white ground, cards that lift off it with a hairline edge and a soft
shadow, and a small set of muted tones that carry hierarchy — dusty lavender for
what you act on, soft sage for progress, muted coral for attention, deep ink for
anything you read. Calm, not washed out. This note records the rules so they
stay consistent.

## Type

- **Space Grotesk** is used in exactly one place — the `raume` wordmark in the
  header, opposite a small `JAPANESE REFERENCE`.
- **Inter** is everything else. Both are self-hosted (SIL OFL); there is no
  external font runtime.
- Hierarchy comes from size, spacing, position, and colour — **not** bold weight
  or high contrast. Default weight is 400; 500 marks a genuinely active or
  labelled state. One type scale (`--fs-*` tokens) is shared by the reference
  and Flashcards sides. The sole exception is a **particle** (`.particle`,
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
on a near-white ground (`~#F7F8F9`). What changed from the old near-monochrome
version is contrast and role — deeper ink, a real card shadow so white cards
lift off the near-white page, and colour that now signals hierarchy. No true red
except the one destructive-delete `--danger`. Gradients are out; shadow is in,
but only the card lift (`--shadow-card`) and the menu shadow. All CSS custom
properties in `css/site.css`.

| Hex (light) | Variable | Used for |
|---|---|---|
| `#1F2836` | `--ink` | primary text — dark cool ink for headings, numbers, Japanese (~12:1, clears AAA) |
| `#55606F` / `#78838F` | `--muted` / `--faint` | secondary text (labels) / tertiary (counts, chevrons) — both AA |
| `#5A6675` / `#5C6A79` | `--romaji` / `--furigana` | the romaji reveal caption / the reading over each kanji — both WCAG AA on `--paper`; furigana also has an 11px floor |
| `#F6F7F9` | `--page-bg` | the near-white ground — white cards lift off it on `--shadow-card`, not tonal contrast |
| `#FFFFFF` | `--paper` | the sheet, cards, table surface |
| `#E2E5EA` / `#C8CFD8` | `--line` / `--line-strong` | hairline row rules / header and table-head rules |
| `#DBDFE6` | `--card-line` | card outlines — visible, paired with `--shadow-card` |
| `#82799B` / `#574D73` / `#EBE9F2` | `--accent` / `-strong` / `-soft` | **primary accent** — dusty lavender: active tabs, progress fills, focus, key interactive edges. Primary buttons fill with `-strong` so white text clears AA |
| `#5F8175` / `#456056` / `#E4ECE8` | `--accent-2` / `-strong` / `-soft` | **secondary accent** — muted sage: legend terms, supporting highlights (same hue as `--right`) |
| `#2F6FB0` | `--particle` | **grammatical particles** (は, を, から, …) — a saturated blue, more vivid than any section accent, so a marked particle reads as a grammar cue. Rendered **bold** — the one deliberate use of weight for hierarchy (see below). Hover/tap shows its reading (は → "wa") in a `.particle[data-r]::after` layer, same idea as the katakana `.kr` layer. `#7DB4E6` in dark; flattens to bold-black in print |
| `#6B4FA0` / `#2E7D52` | `--adj-i-ink` / `--adj-na-ink` | **い/な-adjective marker bar** — purple / green, saturated like `--particle` rather than muted like `--accent-strong` (needs to read as coloured at a glance, a 2px edge). `#B39DDB` / `#7FC79A` in dark |

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
structural and interactive elements (nav underline + active block, category
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
- **い/な-adjective rows** get a coloured bar down the Japanese cell's left
  inner edge instead of a tag or tinted text: `--adj-i-ink` (purple) for
  **い-adj**, `--adj-na-ink` (green) for **な-adj** — dedicated tokens,
  deliberately as saturated as `--particle` rather than as muted as
  `--accent-strong`/`--accent-2-strong` (those are tuned for buttons; that
  muted a pair wouldn't read as coloured at a glance). It's `box-shadow:
  inset 2px 0 0 <token>` on the cell itself — the same idiom `.irregular-row`
  already uses for its own left marker — rather than a centred dot, since a
  dot has to pick *some* vertical centre and a two-line furigana+kanji cell
  doesn't have one that looks right; the inset shadow spans the cell's full
  height automatically, no centring to get wrong. The word itself stays
  plain `--ink`, not tinted (an earlier version tinted the text; a marker
  reads faster and doesn't fight the furigana/particle colours already
  living in that cell). A small legend (`.adj-legend`, two colour swatches)
  in the toolbar explains the two colours once, `aria-hidden` since a
  visually-hidden note on the cell itself carries the real distinction to
  screen readers. `js/vocab/interactions.js` (`updateAdjLegend`) shows it
  only while the table currently under the sticky toolbar (or, while
  searching, any still-visible match) actually has a tinted row, so it isn't
  sitting there explaining a colour code on tables with nothing to explain.
  No separate tag riding along in the Meaning cell — it costs no row height
  or column width, unlike the pill this replaced.
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
  - **The table list** reads Section → category → table, drawn with the exact
    chapter/subsection language the vocabulary page itself uses rather than a
    new invented treatment: a section-level heading (`.cz-section-label`)
    styled like `.cat-heading` (name in the section colour over a hairline
    tinted the same), a category heading (`.cz-group-title`) styled like
    `.section-head` (a short coloured marker bar beside the name via
    `::before`). Both are tinted via `data-section` reading the actual
    per-section token (`--sec-vocabulary` etc.) rather than the page-global
    `--section` var, which can't tell sections apart when a page shows all of
    them at once. A section with more than one category (Vocabulary's four)
    is itself collapsible — closing it hides all four at once — with its
    eyebrow above them; a section that's just one category sharing the
    section's own name (Grammar, Phrases, Travel) skips the redundant
    eyebrow-then-identical-row and renders as a single merged heading instead
    (`.cz-group-title-solo`), sized and weighted identically to the eyebrow
    (`--fs-subhead`/600) since both are playing the same "top of a section"
    role and need to read as one consistent level, not two different sizes.
    The 4 top-level rows (Vocabulary/Grammar/Phrases/Travel) sit inside one
    shared card (`.cz-groups`), iOS Settings grouped-list style — each row's
    own bottom hairline is the only separator between rows (no per-row margin,
    no divider after the last row), instead of each row carrying its own big
    top margin and reading as a separate floating panel.
  - **Your vocabulary**'s three action cards (`.cv-card` as `<details>`, an
    uppercase-micro `<summary>`) all start closed. Forms are label-over-field;
    the parsed-ruby preview and the import result sit on `--surface`, an
    error on `--wrong-soft`. No new tokens.
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
    the import format) lives in an `.info-panel` toggled by an adjacent
    `.info-btn` — a small circular "i", the only new icon shape this page
    introduces — instead of sitting on the page unconditionally.
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
`:checked`. The lone standalone Fuzz toggle keeps the older restyled-square
look instead (`appearance: none` plus a CSS tick) since it isn't part of a
picker list.

## The Flashcards dashboard

The dashboard has to be scannable at a glance — hierarchy comes through in
colour here more than anywhere else:

- **3 cards, not ~9** — next review, today's progress, Study now, the 4 stat
  tiles and the 3 charts used to each carry their own `--card-line` +
  `--shadow-card` border, reading as a stack of independent widgets rather
  than one screen. They're grouped into `.fc-dash-now` ("right now": next
  review + today + Study now), `.fc-dash-stats` (the 4 tiles) and
  `.fc-dash-progress` (the 3 charts) instead — each card lifts off the page
  with `--card-line` + `--shadow-card`, but the items inside share that one
  boundary and keep only their own colour/accent, not an individual box;
- **"N to study"** (`.fc-next-review-due`) is still the one thing in the top
  row that jumps, now via a left bar + warm tint alone (no border/shadow of
  its own, sitting inside `.fc-dash-now`): the coral attention tone. A cleared
  queue (`-clear`) goes quiet sage instead;
- **Study now** (`.fc-btn-primary`) fills with the deep `--section-strong`
  lavender and a tinted shadow, so it clearly outranks the ghost buttons;
- **stat tiles** — the 3px left rule carries meaning: lavender for **Day streak**
  (an achievement), sage for **Reviews completed** (cumulative progress), coral
  for **Estimated retention** only once it drops under the Settings target
  (`.fc-stat-attention`). **Total cards** stays neutral — it's context;
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
- **Missed today** rows get a 3px coral left rule and a coral badge — the
  attention tone used across the dashboard.

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

The active sub-tabs (`.fc-tab.active`) and nav links (`.site-nav-link.active`)
carry a solid 3px underline in the section tone plus, for the nav, a soft
tinted block — clearly the live one against the muted rest.

## Dark mode

Not just an inverted palette — a few weights are tuned separately where the
light logic doesn't carry over:

- text fields get their own fill (`--field-fill`) and border (`--field-line`) —
  a well *below* the page ground, so an input reads as something you type into
  rather than a raised panel;
- `--card-line` stays a visible step above `--paper` so cards still read as
  raised on the dark ground (with `--shadow-card`), while table row rules gain a
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
