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
| `#5A6675` / `#5C6A79` | `--romaji` / `--furigana` | the romaji reveal popover / the reading over each kanji — both WCAG AA on `--paper`; furigana also has an 11px floor |
| `#F6F7F9` | `--page-bg` | the near-white ground — white cards lift off it on `--shadow-card`, not tonal contrast |
| `#FFFFFF` | `--paper` | the sheet, cards, table surface |
| `#E2E5EA` / `#C8CFD8` | `--line` / `--line-strong` | hairline row rules / header and table-head rules |
| `#DBDFE6` | `--card-line` | card outlines — visible, paired with `--shadow-card` |
| `#82799B` / `#574D73` / `#EBE9F2` | `--accent` / `-strong` / `-soft` | **primary accent** — dusty lavender: active tabs, progress fills, focus, key interactive edges. Primary buttons fill with `-strong` so white text clears AA |
| `#5F8175` / `#456056` / `#E4ECE8` | `--accent-2` / `-strong` / `-soft` | **secondary accent** — muted sage: legend terms, supporting highlights (same hue as `--right`) |
| `#2F6FB0` | `--particle` | **grammatical particles** (は, を, から, …) — a saturated blue, more vivid than any section accent, so a marked particle reads as a grammar cue. Rendered **bold** — the one deliberate use of weight for hierarchy (see below). Hover/tap shows its reading (は → "wa") in a `.particle[data-r]::after` layer, same idea as the katakana `.kr` layer. `#7DB4E6` in dark; flattens to bold-black in print |
| `#6B4FA0` / `#2E7D52` | `--adj-i-ink` / `--adj-na-ink` | **い/な-adjective text** — purple / green, saturated like `--particle` rather than muted like `--accent-strong` (needs to read as coloured, not black, at table-row size). `#B39DDB` / `#7FC79A` in dark |

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

- **い/な-adjective rows** tint the Japanese text itself instead of carrying a
  tag: `--adj-i-ink` (purple) for **い-adj**, `--adj-na-ink` (green) for
  **な-adj** — dedicated tokens, deliberately as saturated as `--particle`
  rather than as muted as `--accent-strong`/`--accent-2-strong` (those are
  tuned for buttons; against dense body-text `--ink`, that muted a pair
  reads as plain black at table-row size). A small legend (`.adj-legend`,
  two colour swatches) next to the toolbar
  explains the two colours once, `aria-hidden` since a visually-hidden note
  on the cell itself carries the real distinction to screen readers. No
  separate tag riding along in the Meaning cell — it costs no row height or
  column width, unlike the pill this replaced.
- **Every vocab table is two columns, Japanese and English** — romaji isn't a
  column anywhere, including Phrases. Instead, a small control next to the
  speaker button (`.jp-romaji-btn`, a small "Aa" monogram drawn from vector
  strokes — not the *languages*/translate glyph, since romaji is a
  transliteration, not a translation) opens a
  `--shadow-menu` popover with the reading, on hover (desktop) or tap
  (`.jp-romaji-on`, same pattern as the katakana `.kr` reading layer). It
  stays in the DOM for search and screen readers, and prints inline next to
  the word (there's no hover on paper).
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
    them at once. A section with more than one category (Vocabulary's three)
    is itself collapsible — closing it hides all three at once — with its
    eyebrow above them; a section that's just one category sharing the
    section's own name (Grammar, Phrases, Travel) skips the redundant
    eyebrow-then-identical-row and renders as a single merged heading instead
    (`.cz-group-title-solo`), sized and weighted identically to the eyebrow
    (`--fs-subhead`/600) since both are playing the same "top of a section"
    role and need to read as one consistent level, not two different sizes.
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
offset (the search box included). The flashcard checkboxes are drawn to match
the rest — `appearance: none` plus a CSS tick, not the raw OS control.

## The Flashcards dashboard

The dashboard has to be scannable at a glance — hierarchy comes through in
colour here more than anywhere else:

- **cards lift off the page** — every tile, viz card, the Today card, the
  next-review card and the review card carry `--card-line` plus a committed
  two-layer `--shadow-card`; on the near-white ground the shadow is what
  separates figure from ground;
- **"N to study"** (`.fc-next-review-due`) is the one card in the top row that
  jumps: the coral attention tone, a warm tint and a 5px left bar. A cleared
  queue (`-clear`) goes quiet sage instead;
- **Study now** (`.fc-btn-primary`) fills with the deep `--section-strong`
  lavender and a tinted shadow, so it clearly outranks the ghost buttons;
- **stat tiles** — the 5px left rule carries meaning: lavender for **Day streak**
  (an achievement), sage for **Reviews completed** (cumulative progress), coral
  for **Estimated retention** only once it drops under the Settings target
  (`.fc-stat-attention`). **Total cards** stays neutral — it's context;
- **Card progress** uses three distinct hues, not one hue at three lightnesses —
  neutral slate `--fc-state-new`, ochre `--fc-state-learning`, sage
  `--fc-state-review` (New → Learning → graduated-to-review). The legend labels
  each, so colour never carries identity alone;
- **Reviews this week** bars are a mid lavender tint; today's bar is the full
  deep `--accent-strong` with its count and label the same colour and weight;
- **Missed today** rows get a 3px coral left rule and a coral badge — the
  attention tone used across the dashboard.

The review card's rating row needs a fourth hue: Again / Good / Easy reuse
`--wrong` (coral) / `--right` (sage) / `--accent` (lavender); Hard gets the
ochre `--fc-hard`.

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
