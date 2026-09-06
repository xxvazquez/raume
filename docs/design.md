# Design

The look is a quiet paper reference: a light sheet on a cool grey ground, one
slate-blue accent, hairline rules, no decoration that isn't doing a job. This
note records the rules so they stay consistent.

## Type

- **Space Grotesk** is used in exactly one place — the `raume` wordmark in the
  header, opposite a small `JAPANESE REFERENCE`.
- **Inter** is everything else. Both are self-hosted (SIL OFL); there is no
  external font runtime.
- Hierarchy comes from size, spacing, position, and colour — **not** bold weight
  or high contrast. Default weight is 400; 500 marks a genuinely active or
  labelled state. One type scale (`--fs-*` tokens) is shared by the reference
  and Flashcards sides.
- The one exception: the review card's pass/fail verdict ("Correct" / "Not
  quite") gets a beat of real weight, because it's the single most important
  word in the review loop.
- On the review card the prompt is the anchor — 26px, well clear of everything
  around it, with the direction label (`.fc-prompt-label`) faint and tucked
  right above it. On a phone the chrome (meta line, padding, rating row) tightens
  but the prompt keeps its full size and air.

## Colour

The palette is deliberately narrow — no pink, no warm tones, no gradients, no
shadows beyond the one under the table overflow menu. It's defined as CSS
custom properties in `css/site.css`.

| Hex | Variable | Used for |
|---|---|---|
| `#2F3944` | `--ink` | primary text — dark blue-grey, never black |
| `#5F6B79` / `#8996A3` | `--muted` / `--faint` | secondary text (labels) / tertiary (counts, chevrons) |
| `#616D7B` / `#64707E` | `--romaji` / `--furigana` | the romaji column / the reading over each kanji — both WCAG AA on `--paper`; furigana also has an 11px floor |
| `#EEF1F4` | `--page-bg` | the cool grey behind the sheet |
| `#FFFFFF` | `--paper` | the sheet and table surface |
| `#E3E8EC` / `#D3DBE2` | `--line` / `--line-strong` | hairline row rules / header and table-head rules |
| `#526D87` / `#405A73` | `--accent` / `--accent-strong` | the single accent — active nav/tabs/controls, focus, search-match wash |

A few colours do a purely functional job:

- a slate wash (`--irregular-bg` / `--irregular-ink`) marks irregular-verb rows;
- study feedback carries the only two saturated tones on the reference side — a
  muted brick red (`--wrong`) for a wrong or missed answer, a muted eucalyptus
  green (`--right`) for a correct one, each kept as quiet as the other.

### Per-section tone

Each section carries one muted cool tone, used **only** on structural and
interactive elements (nav underline, category rules, active tabs, focus, sort
accents) — never on rows or large surfaces. `--section` is switched by
`body[data-active-*]`:

- `--sec-vocabulary` — blue
- `--sec-grammar` — indigo
- `--sec-travel` — blue-green
- `--sec-flashcards` — slate

They sit roughly 30° apart around the cool half of the wheel, so the four read
as distinct identities when moving between sections rather than near-duplicates.

## Labels and measure

One label, one style: a category name reads the same Title-Case-in-the-section-
tone wherever it appears (a vocab heading, the *Jump to a table* list, Flashcards
› Manage, the Customize page). Card titles are sentence case throughout Settings
and Help.

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

The one place the quiet-everywhere rule is loosened — a data surface needs to be
scannable. Still no gradients or shadows, and the same cool character, but:

- the card-progress bar uses a three-step slate ramp (`--fc-state-new` /
  `-learning` / `-review`, an ordinal New → Learning → Review; steps validated
  for lightness separation and AA in both themes);
- reviews-this-week bars pick up the Flashcards section tone, with today's bar
  at full strength;
- the four stat tiles' left rule is quiet (`--line-strong`) by default — Total
  cards and Reviews completed are plain running counts. **Day streak** takes the
  section tone (it's an achievement); **Estimated retention** turns the same
  muted amber as the rating row's Hard (`.fc-stat-attention`, reusing
  `--fc-hard`) only once it drops meaningfully under the target set in Settings,
  so colour there means something;
- the "Missed today" list gets a thin `--wrong` left rule — the one warm note on
  an otherwise cool surface.

All of it is scoped to `.page-flashcards`; the reference side stays monochrome.

The review card's rating row is the other exception: it needs a fourth hue.
Again / Good / Easy reuse `--wrong` / `--right` / `--accent`; Hard gets its own
muted amber (`--fc-hard`).

## Dark mode

Not just an inverted palette — a few weights are tuned separately where the
light logic doesn't carry over:

- text fields get their own fill (`--field-fill`) and border (`--field-line`) —
  a well *below* the page ground, so an input reads as something you type into
  rather than a raised panel;
- stacked card outlines soften toward `--paper` (`--card-line`) so a column of
  them isn't boxy, while table row rules gain a little (`--row-line`) so they
  don't vanish;
- `--furigana` drops a clear step below `--romaji` again (it collapses to one
  tone otherwise), still clearing AA over `--paper`.

Theme state: an explicit **Light** or **Dark** choice is stored; absent means
**System**. `js/theme-init.js` applies it in `<head>` before first paint, so
there's no flash.
