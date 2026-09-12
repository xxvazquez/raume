# raume

A fast, static reference site for Japanese food, kitchen, and N5 vocabulary,
with an FSRS-scheduled flashcards trainer built on top. Made for quick lookups
while cooking or studying, and for printing clean A4 study sheets.

**Live at [xxvazquez.github.io/raume](https://xxvazquez.github.io/raume/).**

No framework, no build step — plain HTML, CSS, and classic `<script>` tags.
Open `index.html` and it runs, even straight from `file://`.

```bash
# nothing to install to just use it:
open index.html

# a local server is only needed to test the service worker / offline:
python3 -m http.server
```

---

## The reference

Five sections in the nav: **Vocabulary** (the landing page), **Grammar**,
**Phrases**, **Travel**, and **Flashcards**. Vocabulary tables are grouped by
category — Food & Ingredients, Kitchen & Dining, Numbers & Counting. **Phrases**
is a conversational Q&A set (Self-introduction: name, job, country, age, family,
where you live), laid out as question/answer pairs rather than sorted A–Z.
Grammatical **particles are highlighted in blue and bold** throughout the app
so they're easy to spot in a sentence.

**Finding things**

- **Jump to a table** (`#tableIndex`) — collapsed, it names the table you're on;
  expanded, it lays out every category and table in the section with entry
  counts. Keyboard-navigable, hidden during search, never printed.
- **Search** ranks by match quality (exact → starts-with → ends-with →
  contains), highlights the match, and pulls from every section — from
  whichever of Japanese/Furigana/English are currently visible, plus romaji
  always (it has no visibility toggle of its own).
- **URL hash** reflects the current view (`#grammar`, `#table-15`,
  `#flashcards`), so any view can be bookmarked and survives a reload.
- The search field and column filters stay pinned below the nav as you scroll.

**Reading the tables**

- Every table is two columns — **Japanese** (with furigana) and **English** —
  in every section, Phrases included. **Romaji** isn't a column: a small
  control next to the speaker icon reveals it on hover or tap, for any word or
  sentence. It's still fully searchable even though it's not shown by default.
- **Column toggles** — hide **Japanese / Furigana / English** from the
  toolbar (Furigana hides just the readings). You can't hide both text
  columns at once. A hidden column keeps its width; the text just goes
  transparent, so nothing reflows.
- **Furigana** sits over the exact kanji it belongs to, always shown, with an
  11px floor so it stays legible when the Japanese shrinks.
- **Reading layer** — hover (or tap, then tap away) any kana to see its romaji
  above it. `js/vocab/kana-romaji.js` handles yōon, foreign-sound combos, the
  長音 mark ー, and the sokuon っ/ッ. Drawn with CSS, so it never enters the DOM
  and search/sort stay clean. (This is the per-character hover on individual
  katakana/hiragana units, separate from the whole-word romaji reveal above.)
- **Show polite** switches the verb tables between plain form and polite 〜ます.
  Only visible while the Verbs table is expanded.
- **Adjective type** — every い- / な-adjective in the dataset has its Japanese
  text tinted lavender / sage, so the two classes read apart at a glance
  without a label taking up room on the row: the Adjectives table, the Taste
  & Texture adjectives, and the stray adjective in an otherwise-noun table
  (危険). A small legend next to the toolbar explains the two colours once.
  Mimetic words (*mochimochi*, *sakusaku*) are 擬態語, not い/な adjectives, so
  they stay untinted. Driven by an `adj` field on the row; a visually-hidden
  note on the cell carries the distinction to screen readers, and it stays
  out of search.
- **Pronunciation** — a small speaker icon next to the Japanese plays the
  reading aloud. Every built-in word/phrase has a prerendered native-voice
  clip (generated offline via VOICEVOX, see `docs/architecture.md`); anything
  without one — custom/imported vocab — falls back to the browser's Web
  Speech API. The icon appears once either source is confirmed available.
- **Sorting** — every column sorts; tables start A–Z by English.

**Study aids**

- **Cover answers** blanks the English column; tap a row to reveal that one
  answer. A cover-and-check aid, not a quiz — no score, resets on reload.
- **Star** any row for a lightweight watch list — the **Starred** toolbar button
  then swaps the list for a synthetic table of just those words.
- **Hide a row** (the eye icon) is a quiet per-table "I know this", with a
  one-click "Show all".

**Customising**

- Give any table header an **icon** (a picker with ~165 curated line icons, or
  upload your own) and a custom **name / order** on the **Customize** page
  (masthead sliders icon). Customisations show everywhere the table appears,
  including Flashcards › Manage.
- They save to `localStorage` immediately; signed in, they also sync.

**Your own vocabulary** — the Customize page also has a **Your vocabulary**
block for words the built-in dataset doesn't have:

- **Add a word** to any table — built-in or one of your own.
- **Import a list** — paste or pick a `.csv` / `.txt` file, one word per line,
  three columns: `japanese(furigana),romaji,english`. Write each kanji run's
  reading in parentheses right after it — `帰(かえ)る`, `お茶(ちゃ)` →
  `お` + `茶(ちゃ)`, `醤油(しょうゆ)`; kana-only words need none. The English
  column may contain commas. A first line of `japanese,romaji,english` is
  treated as a header. Rows that don't parse are **skipped and listed** with a
  reason — fix them and re-import just those.
- **New table** — signed in only. Guests can add rows (stored in this browser);
  building a table of your own needs an account.
- Under **Words you've added**, edit a word's Japanese / romaji / English in
  place (same `japanese(furigana),romaji,english` line you'd type to add it),
  or delete it. A table you created can be deleted entirely, dropping every
  word in it — the dropdowns above (Add a word / Import a list) pick up a
  rename immediately.
- A custom word behaves like any other everywhere: furigana, search, print,
  pronunciation, and all four flashcard directions. Signed in, Supabase is the
  authoritative store (`custom_tables` / `custom_rows`); guest rows migrate up
  the first time you sign in.

**Printing** — A4-friendly at three scopes: the printer icon on a table prints
that table; **Print…** prints the whole section or the whole reference.
Collapsed tables still print their rows.

**Theme** — a header control cycles **System → Light → Dark**, applied before
first paint. **Help** is the masthead **?** (Flashcards has its own Help tab).

---

## Flashcards

Flashcards sit on top of the vocabulary without changing or copying it. Add a
whole table with **Add to flashcards** (skips hidden rows), or add/remove
individual words from Flashcards' own **Manage** tab — there's no per-row
toggle on the reference tables themselves, to keep them focused on browsing.
The **Flashcards** nav page is where you review, browse, and track a daily
streak.

**How cards work**

- Real **FSRS-6** scheduling via
  [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs), vendored as a
  static file.
- Each vocab entry becomes up to four cards — **JP→EN, JP→Romaji, Romaji→EN,
  EN→Romaji**. Never Japanese-to-type. Rows whose romaji is still kana get JP→EN
  only. **Study directions** (Settings) picks which of the four a session draws
  from.
- A session is one shuffled pool: everything due (plus learning steps coming due
  within 20 minutes) and the day's new-card allowance, spaced so a word's other
  directions don't land back to back.
- Cards reference a row's permanent id (`v0001`…), never its content.

**Reviewing**

- The loop is card → check → rate. Every rating saves immediately, so **End
  session** never loses anything.
- The card is a **persistent shell** — the answer field is the same element from
  the first card to the last and stays focused through check → rate → next, so a
  phone's on-screen keyboard doesn't close between cards.
- Answering is deliberately quiet: just the Japanese prompt and a plain
  underline field, no visible Check button — **Enter** (or a mobile keyboard's
  own Go/submit action) checks, **1–4** rates. Once checked, the prompt recedes
  to a small reminder and the card washes once in the matching tone.
- The result is a compact tag (Correct / Almost correct), not a full-width
  banner, and everything you actually study from — the comparison, the field
  of context you *weren't* tested on — sits together in one quiet panel instead
  of stacked sections.
- A wrong romaji answer (Japanese→Romaji, English→Romaji) shows exactly which
  letters were off — `kaeramasu → kaerimasu`, only the mismatched letters
  marked — compared against whichever accepted spelling is the closest match.
  Other directions just show what you typed against the correct answer, plain.
- The rating row is one compact strip — Again / Hard / Good / Easy, each a
  tone-coloured digit chip rather than four separate tiles — and after a wrong
  answer Good/Easy dim so the honest rating reads first.
- The word's pronunciation plays automatically the moment the answer reveals
  (every direction gets one eventually, including the two where the Japanese
  only appears in that reveal, not the prompt) — same pronunciation source as
  the reference pages, just triggered for you rather than waiting on a click.
- Screen-reader friendly: the field is named with its prompt, and the result is
  announced from an `aria-live` region without moving focus off the field.
- Romaji checking ignores long vowels — `kōhī`, `koohii`, `kouhii` all match.
- The **Kana** trainer's own review card shares this exact design.

**The tabs**

- **Dashboard** — today's progress, a next-review status line, four stat tiles
  (streak, total, reviews done, estimated retention), a New → Learning → Review
  bar, a reviews-this-week chart, "Missed today", and a **Words to review**
  table (words missed more than once) that carries the same column toggles as
  the reference pages.
- **Manage** — every table by category, filterable to All / My flashcards /
  Archived. **Add table**, then **Pause table** to make it dormant (an overlay —
  the cards keep their own state; a paused table drops out of review and shows
  only under *All vocabulary*, as *Paused* with a **Resume table** button, so it
  never clutters *Archived*). Expand a table to act on individual words;
  individually paused words are what *Archived* collects.
- **Settings** — Study directions and the FSRS knobs (retention, max interval,
  fuzz, new-cards-per-day) for the vocabulary cards, then the same set for the
  Kana trainer, independently. New-cards-per-day is a real daily allowance —
  it holds across every session you run that day.
- **Help** — pausing, the Manage status icons, the keyboard shortcuts.
- **Kana** — see below.

**Kana trainer** — a separate hiragana/katakana drill, not built on the
vocabulary. Pick groups (**gojūon, dakuten, handakuten, yōon, sokuon**, per
script) and directions. **Kana → romaji** types the reading (a few alternates
like `si`/`shi` accepted; vowel length *is* checked here); **Romaji → kana**
types the glyph. Its own FSRS knobs, separate from the word cards.

---

## Accounts and storage

Two modes that never mix; the Flashcards page opens on a plain choice between
them.

- **Guest** — everything stays in this browser's `localStorage`. No account, no
  network.
- **Signed in** — a **Supabase** project you create yourself (see
  [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md)) is the authoritative store, scoped
  per account by Row Level Security. `localStorage` becomes a read-through cache
  and an offline outbox: reviews made offline sync on reconnect. A status chip
  under your identity always shows where things stand — a quiet *Synced* once
  everything's caught up, a calm *Syncing N reviews…* while it works, an amber
  *Offline…* or *N reviews couldn't sync* (with a **Sync now** button) when it
  needs you. Pending reviews still count on the dashboard right away.

Pausing a card **archives** it; pausing a whole table just marks the table
dormant. Either way the FSRS state and full history are kept and resuming
restores everything as it was. Nothing is ever hard-deleted — the one
exception is **custom vocabulary** (words and tables you authored yourself),
where deleting a row or table really removes it, since there's no learning
history on the content itself to keep.

The anon key in `js/config.js` is safe to commit (RLS protects the data, not the
key). The service-role key must never go in the repo.

For the full storage model, schema, and migration notes, see
[`docs/architecture.md`](docs/architecture.md).

---

## Development

```bash
npm run validate         # every JS file parses + vocab data is well-formed (no deps)
npm install && npm test  # render the page in jsdom and exercise it; runs the SW test too
```

Run `validate` before committing data changes, `test` before touching
`js/vocab/` or `js/flashcards/`. The smoke test can't reach Supabase, so the
signed-in path needs a manual check.

More detail — the vanilla-JS constraints, the add-a-file checklist, the project
layout, PWA/offline, deploying — is in
[`docs/architecture.md`](docs/architecture.md). The visual system (type,
palette, per-section tone, dark mode) is in [`docs/design.md`](docs/design.md).

---

## License

The code is under the [PolyForm Noncommercial License 1.0.0](LICENSE) — free to
use, study, self-host, modify, and share for any noncommercial purpose;
commercial use is not granted. The same terms cover the original written content
(the curated vocabulary in `data/vocabulary.js` and the explanations). The
`raume` name, wordmark, and logo are not covered — see [`NOTICE`](NOTICE).

Vendored libraries and fonts keep their own permissive licenses: `ts-fsrs` and
`supabase-js` are MIT, the Lucide-derived icon paths are ISC
(`vendor/*.LICENSE.txt`); Inter and Space Grotesk are under the SIL Open Font
License (`fonts/*.LICENSE.txt`).

Pronunciation audio (`audio/*.mp3`) is generated offline with
[VOICEVOX](https://voicevox.hiroshiba.jp/), whose character voice libraries
require a credit line naming the voice used — see `docs/architecture.md` for
the exact credit once a voice is chosen (`scripts/generate-audio.js`).
