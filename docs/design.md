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
  and Flashcards sides.
- On the review card the prompt is the anchor — 30px, the largest text on the
  card by a wide margin, with the direction label (`.fc-prompt-label`) faint
  and tucked right above it. Once checked, the prompt recedes to a small,
  muted `.fc-prompt-small` reminder — still legible, no longer the focus — and
  the verdict ("Correct" / "Almost correct") is a small tone-coloured tag, not
  a sized-up word: the comparison underneath it is the thing to read. On a
  phone the chrome (meta line, padding, rating row, the "stage" panel) tightens
  but the prompt keeps its full size and air. Past 700px the whole card steps up
  a size — prompt to 34px, and the reading text you rate from (the stage panel,
  rating labels) off the shared `--fs-*` scale and onto a larger set, since that
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
| `#5A6675` / `#5C6A79` | `--romaji` / `--furigana` | the romaji column / the reading over each kanji — both WCAG AA on `--paper`; furigana also has an 11px floor |
| `#F6F7F9` | `--page-bg` | the near-white ground — white cards lift off it on `--shadow-card`, not tonal contrast |
| `#FFFFFF` | `--paper` | the sheet, cards, table surface |
| `#E2E5EA` / `#C8CFD8` | `--line` / `--line-strong` | hairline row rules / header and table-head rules |
| `#DBDFE6` | `--card-line` | card outlines — visible, paired with `--shadow-card` |
| `#82799B` / `#574D73` / `#EBE9F2` | `--accent` / `-strong` / `-soft` | **primary accent** — dusty lavender: active tabs, progress fills, focus, key interactive edges. Primary buttons fill with `-strong` so white text clears AA |
| `#5F8175` / `#456056` / `#E4ECE8` | `--accent-2` / `-strong` / `-soft` | **secondary accent** — muted sage: legend terms, grammar particles, supporting highlights (same hue as `--right`) |

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

Four muted hues, spread wide enough to read as genuinely different places: a
slate-blue, a mauve, the sage, the lavender. Used **only** on structural and
interactive elements (nav underline + active block, category headings + rules,
active tabs/filters, focus, sort accents) — never a row or a large surface.
`-strong` variants are the ones used at body-text size and all clear AA on
`--paper`. `--section` is switched by `body[data-active-*]`:

- `--sec-vocabulary` — slate-blue (`#4F7389`)
- `--sec-grammar` — mauve (`#875A78`)
- `--sec-travel` — sage (`#5F8175`)
- `--sec-flashcards` — lavender (`#82799B`), the same as the primary accent

The four hues sit well over 20° apart (the smoke test enforces it), light and
dark, so moving between sections reads as a change of place.

## Labels and measure

One label, one style: a category name reads the same Title-Case-in-the-section-
tone wherever it appears (a vocab heading, the *Jump to a table* list, Flashcards
› Manage, the Customize page). Card titles are sentence case throughout Settings
and Help.

- **The adjective pill** (on every い/な adjective, wherever it sits) is a 10px
  rounded tag before the meaning: `--accent-soft` / `--accent-strong` for **い-adj**,
  `--accent-2-soft` / `--accent-2-strong` for **な-adj** — the same lavender /
  sage split used for primary vs supporting elsewhere, so the two classes
  separate without a loud colour. It's the one tag on the quiet reference side;
  it earns its place by carrying grammar the columns don't.
- **Help and Settings** are prose, held to a readable measure (680px).
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
  without turning neon — the four section tones, the lavender/sage accents,
  coral and ochre all re-pitched in the `:root[data-theme="dark"]` block;
- `--furigana` drops a clear step below `--romaji` again (it collapses to one
  tone otherwise), still clearing AA over `--paper`.

Theme state: an explicit **Light** or **Dark** choice is stored; absent means
**System**. `js/theme-init.js` applies it in `<head>` before first paint, so
there's no flash.
