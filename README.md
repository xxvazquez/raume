# raume

A fast, static reference for Japanese food, kitchen and N5 vocabulary, with an
FSRS-scheduled flashcards trainer built on top. Made for quick lookups while
cooking or studying, and for printing clean A4 study sheets.

**Live at [xxvazquez.github.io/raume](https://xxvazquez.github.io/raume/)**

|                 |                                                                  |
| --------------- | ---------------------------------------------------------------- |
| **Reference**   | Vocabulary, Grammar, Phrases and Travel tables — furigana, search, audio, print |
| **Flashcards**  | FSRS-6 spaced repetition, four directions per word, daily streak |
| **Kana**        | A separate hiragana / katakana drill                             |
| **Puzzles**     | Crosswords, arrowords and word searches built from your words    |
| **Storage**     | Guest (this browser only) or a Supabase account that syncs       |
| **Stack**       | Plain HTML, CSS and `<script>` tags — no framework, no build step |

**Contents** — [Quick start](#quick-start) · [The reference](#the-reference) ·
[Flashcards](#flashcards) · [Accounts and storage](#accounts-and-storage) ·
[Development](#development) · [License](#license)

---

## Quick start

```bash
open index.html            # runs straight from file:// — nothing to install
python3 -m http.server     # only needed to test the service worker / offline
```

---

## The reference

| Section        | What's in it |
| -------------- | ------------ |
| **Vocabulary** | The landing page: Food & Ingredients, Kitchen & Dining, Numbers & Counting, Time & Calendar |
| **Grammar**    | Adjectives, Verbs (plain and polite forms), Particles |
| **Phrases**    | Self-introduction Q&A — name, job, country, age, family, home — in question/answer order |
| **Travel**     | Signs, shopping, transport, toilets, laundry, hotels, labels, garbage, restaurants |
| **Flashcards** | Review, manage and track progress — see [Flashcards](#flashcards) |

On a phone the nav is a tab bar at the bottom; on a wider screen it's the top
row. Grammatical **particles are blue and bold** everywhere.

### Finding things

- **Search** covers every section. Results are ranked exact → starts with →
  ends with → contains, with the match highlighted. It searches whichever of
  Japanese / furigana / English are visible, plus romaji. Each result has a
  **+ / ✓** toggle to add the word to flashcards or pause it.
- **Jump to a table** — the list button in the pinned search bar (named after
  the table you're reading, on desktop) lists every table in the section with
  its entry count.
- Opening or closing a table keeps the row you tapped exactly where it was.
- **The URL** follows the view (`#grammar`, `#table-15`, `#flashcards`), so
  any view can be bookmarked.
- The search field and **Options** button stay pinned as you scroll.

### Reading the tables

- Every table has two columns, **Japanese** (with furigana) and **English**.
  Tap a word to show its **romaji** underneath. Romaji is always searchable.
- **Options** holds the display settings. A dot on the button means one is
  off its default. It opens as a popover on desktop and a bottom sheet on a
  phone:
  - **Japanese / Furigana / English** switches hide a column without
    reflowing the table. You can't hide both text columns at once.
  - **Cover answers** blanks the English. Tap a row to reveal it.
  - **Show polite** switches verbs to 〜ます. It only appears while the
    Verbs table is open.
  - **Expand all**, **Print** and a legend for any badges on screen.
  - **Row icons** — what the small speaker, hide, + and ⋯ glyphs on each row do.
- **Furigana** is always shown, with an 11px minimum size. Each reading starts
  where its kanji start; consecutive kanji share one reading (三十三歳 →
  さんじゅうさんさい), and a long reading runs on over the following kana instead
  of pushing a gap into the word (料理する).
- **Sentence tables** (Phrases) stack each row: the Japanese on its own line,
  the English under it, romaji on tap. Questions and answers read as pairs —
  the answer set in under its question — and search shows the whole pair when
  either line matches.
- **Katakana reading** — hover or tap any katakana to see its romaji above it.
- **Pronunciation** — the speaker icon plays a native-voice clip.
  Custom words use the browser's speech engine.
- **Sorting** — the English column sorts A–Z / Z–A. Japanese has no single
  natural order, so it doesn't sort.
- **Hide a row** (eye icon) marks a word as known for now. **Show all**
  brings them back.

### Grammar notes (ⓘ)

A row with grammar to explain carries an **ⓘ** beside the hide eye instead of
a strip of badges: tap it for one popover listing each note, led by its tinted
badge. It's hidden while the English is hidden or covered, so it can't give
the answer away. The notes:

| Badge | Meaning | Outlined when… |
| ----- | ------- | -------------- |
| **い** / **な** | Adjective type | The word breaks the pattern: a な-adjective ending in い (きれい, 有名), or irregular いい / かっこいい |
| **五段** / **一段** / **変格** | Verb group: u-verb, ru-verb, irregular | The group is easy to mistake from the ending (切る, 帰る), or the verb is 来る |
| **を** **に** **が** … (blue) | The particles a verb or adjective takes, e.g. 聞く: を *what you listen to*, に *who you ask* | — |

Mimetic words (*mochimochi*, *sakusaku*) are 擬態語, not adjectives, and get no
badge.

### Customising

On the **Customize** page (masthead sliders icon; on a phone, the account button's menu):

- **Icon and colour** — every table has an icon tile. A table you create
  picks an icon from its name ("Animals" → paw). You can choose from about 165
  icons, upload your own, and pick one of nine muted colours. The picker also
  opens from **Choose icon…** in a table's **⋯** menu.
- **Hide a table** — **Hide table** in its **⋯** menu (or **Hide** on
  Customize) takes it off the reference pages, the Tables list and search.
  **Show** on Customize brings it back. Flashcards isn't affected — that's what
  Pause table is for.
- **Name and order** — rename any table. Move tables and categories by
  dragging the grip handle, or focus it and press ↑ / ↓.
- **Your vocabulary** — add words the built-in set doesn't have:
  - **Add a word** to any table, built-in or your own.
  - **Import a list** from pasted text or a `.csv` / `.txt` file, one word per
    line: `japanese(furigana),romaji,english`, e.g. `帰(かえ)る,kaeru,to return`.
    Rows that don't parse are skipped and listed with the reason.
  - **New table** needs an account. Guests can still add words to existing
    tables.
  - **Words you've added** — edit or delete your words. It's searchable and
    sorts by date added or A–Z.

Custom words work everywhere — furigana, search, print, audio, all four
flashcard directions. Changes save immediately and sync when signed in.

### Printing, theme and status

- **Print** — A4 at three scopes: one table (printer icon), this section, or
  the whole reference (both in Options). Collapsed tables still print.
- **Theme** — cycles **System → Light → Dark**, applied before first paint
  (on a phone: **Appearance** in the account button's menu).
- **Help** — the masthead **?**: four topics (Finding words, Reading,
  Options, Making it yours), each a short list of one-line rows. Flashcards
  has its own Help screen (top right of the Flashcards page) in the same style.
- **On a phone** there's no wordmark row: each screen starts with its large
  title and one round **account button** beside it, which opens a menu —
  who you're signed in as and whether you're synced, **Account** (**Sign in**
  for a guest — straight to the sign-in screen), **Customize tables**, **Help**,
  and **Appearance** (System / Light / Dark). On a tablet
  the masthead icons carry captions (Account, Help, Customize, the current
  theme). The search bar's buttons read **Tables** and **Options**, and
  Manage's buttons keep a one-word label — nothing relies on hover.
- **Sign-in dot** on the person icon: **green** means everything is synced.
  **Amber** means you're offline or a change hasn't reached your account yet.
  Hover it for details.

---

## Flashcards

Flashcards sit on top of the vocabulary without copying it — each card
references a row's permanent id (`v0001`…). Add a whole table with **Add to
flashcards**, or single words from **Manage** or a search result.

### How cards work

- Real **FSRS-6** scheduling via
  [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs).
- Each word becomes up to four cards: **JP → EN · JP → Romaji · Romaji → EN ·
  EN → Romaji**. You never type Japanese. **Study directions** in Settings
  picks which ones you get.
- A session mixes everything due (plus learning steps due within 20 minutes)
  with the day's new cards, in a fresh random order every time. Each word's
  directions are dealt one per round, each round reshuffled, so the same word
  never appears twice in a row and no stretch of words repeats.

### Reviewing

```
card  →  type answer, Enter  →  verdict + answer (audio plays)  →  rate 1–4  →  next
```

- Every rating saves at once, so **End session** never loses progress.
- The answer field stays focused from card to card, so a phone keyboard stays
  open.
- A wrong romaji answer highlights exactly which letters were off
  (`kaeramasu → kaerimasu`). Long vowels are ignored — `kōhī`, `koohii` and
  `kouhii` all match, and likewise ā/aa, ū/uu, ē/ee, ō/oo/ou; the marked
  letters treat them as the same sound too. A noun + suru verb also takes its optional を —
  `ryouri o shimasu` counts for `ryōri shimasu`.
- Typing the right answer in the wrong language — the romaji on a card that
  asks for the English, or the English on a romaji card — isn't graded: the
  card says which one it wants and the field stays open for another go.
- Japanese → English shows the word's reading under it once checked — not for
  kana-only words like レモン, where it would just repeat the word.
- Romaji and English prompts reveal the Japanese under the answer once
  checked, with its furigana — Japanese never appears without it.
- After a wrong answer, **Again / Hard** read first and Good / Easy are
  dimmed, but still one tap away if it was just a typo.
- Results are announced to screen readers without moving focus.
- During a session the navigation hides and the card gets the whole screen.

### Tabs

Four segments — Dashboard, Manage, Kana, Puzzles. **Settings** and **Help**
sit at the top right, beside the title, and open as their own screen with a
**‹ Flashcards** back button.

| Screen | What it does |
| --- | ------------ |
| **Dashboard** | Today, next review, streak / total / reviews / estimated retention, card progress, this week's reviews, a 7-day due forecast, missed today, **Leeches** (words forgotten 8+ times after being learned — *Pause* or *Keep* them), and **Words to review** (its ⋯ menu ticks Japanese / Furigana / English on or off) |
| **Manage** | Every table by category, filtered All / My flashcards / Archived. Add or **Pause** a table, or open it to add or pause single words |
| **Kana** | A hiragana / katakana drill, separate from the word cards (below) |
| **Puzzles** | Crossword / arroword / word search from your words (below) |
| **Settings** | Study directions and FSRS settings (retention, max interval, fuzz, new cards per day), set separately for words and kana. Changes save as you make them — no Save button. Guests also get **Back up & restore** (a JSON file) |
| **Help** | Pausing, the Manage icons, keyboard shortcuts |

**Pausing** keeps everything. A paused word moves to *Archived*; a paused
table just stops appearing in reviews until you resume it. FSRS state and
history are always kept.

### Kana trainer

Choose groups (**gojūon, dakuten, handakuten, yōon, sokuon**, for each script)
and directions:

- **Kana → romaji** — type the reading. A few alternates like `si` / `shi`
  are accepted. Vowel length counts here.
- **Romaji → kana** — type the kana itself.

It uses the same review card as the word flashcards, with its own FSRS
settings.

### Puzzles

A fill-in crossword or arroword, or a word search, generated fresh each time — at least 6
words, or it tells you why not. Clues that give the answer away are left
out: the word written in its own clue ("Japanese sake" → *sake*), or a
loanword that just echoes its English (*cola* → コーラ).

- The puzzle comes first. Its settings sit behind one summary button
  ("Crossword · Flashcards · 15 words · Romaji") that opens them as a popover
  (a bottom sheet on a phone); changing one makes a new puzzle. On a wide
  window the clue you're on and the Across / Down lists sit beside the grid.
- **Source** — *Flashcards* (added, unpaused words) or *Tables*: one or more
  vocabulary tables, whether or not they're in flashcards.
- **Style** — *Crossword* (numbered clue list), *Arroword* (each clue
  in a square before its answer) or *Word search* (below). **Script** — *Romaji* (default), *Japanese*,
  *Hiragana* (native words, read in hiragana) or *Katakana* (loanwords only) —
  a word is never forced into a script it isn't written in. **Words** — 10, 15, 20, 30 or 40. Answers are always readings — kanji is
  never shown or typed.
- **Solving** — tap a square or a clue and type. Typing follows the word's
  direction; tap a crossing square again to switch. The bar above the grid
  shows the clue you're on (it appears once you pick a square; the ⓘ beside
  Check has the how-to). Backspace steps back, arrow keys move.
- **Check** marks filled squares right or wrong. The **⋯** menu has *Reveal a
  letter*, *Reveal puzzle*, *Clear answers* and *Print* (a clean A4 worksheet:
  the title, one line like "Drinks · 20 words · Romaji", the grid, then Across
  and Down side by side).
- Grids are built compact — each word goes where it crosses the most and
  grows the grid the least — so even 40 words stay a dense block.
- **Word search** — the answers hidden in a square of letters, built to be
  hard: the list gives only the English clue, words run in all eight
  directions (backwards and diagonally too), each word sits where it shares
  the most letters with the others, and the spare squares are filled with
  the answers' own letters. In romaji, words shorter than three letters are
  left out (they turn up by chance). Drag across a word, or tap its first
  and last letter; a found word gets a capsule, a tick and its reading in
  the list, and the toolbar counts how many are found. The **⋯** menu has
  *Reveal a word*, *Reveal puzzle*, *Clear found words* and *Print*.
- Nothing is saved or scheduled.

---

## Accounts and storage

The Flashcards page starts by asking you to pick one of two modes. The two
never mix.

|  | **Guest** | **Signed in** |
| --- | --- | --- |
| Where data lives | This browser's `localStorage` | Your own [Supabase](SUPABASE_SETUP.md) project, per account via Row Level Security |
| Network | None | Syncs; works offline and catches up on reconnect |
| First visit | Starts with the Fruits table added, so the Dashboard, study and Puzzles have something to show | Your own deck |
| Backup | Settings › Back up & restore | The account is the backup |
| Custom tables | — | Yes |
| New accounts | — | Off by default: the project's sign-ups are closed and `allowSignups: false` hides "Sign up" ([setup](SUPABASE_SETUP.md)) |

- **Local-first** — reviews, customisations and custom words apply
  immediately. Anything that couldn't sync is queued, survives a reload and
  retries on its own.
- **Sync status** — a chip under your name shows *Synced*, *Syncing N…*, or an
  amber *Offline* / *couldn't sync* with **Sync now**. **What's pending?**
  lists exactly what hasn't reached your account yet.
- **Nothing is hard-deleted**, except custom words and tables you delete
  yourself.
- The anon key in `js/config.js` is safe to commit, because Row Level
  Security protects the data. Never commit the service-role key.

Full storage model and schema: [`docs/architecture.md`](docs/architecture.md).

---

## Development

```bash
npm run validate            # every JS file parses + vocab data is well-formed (no deps)
npm install && npm test     # jsdom smoke test of the page + service-worker test
npm run generate:vocab-ids  # assign ids to new vocab rows
```

Run `validate` before data changes and `test` before touching `js/`. The smoke
test can't reach Supabase, so check the signed-in path by hand.

| Doc | Covers |
| --- | ------ |
| [`docs/architecture.md`](docs/architecture.md) | Vanilla-JS constraints, add-a-file checklist, layout, storage, PWA/offline, deploying |
| [`docs/design.md`](docs/design.md) | Type, palette, per-section tone, controls, dark mode |
| [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) | Setting up the optional account backend |

---

## License

Code and original content (the curated vocabulary and explanations) are under
the [PolyForm Noncommercial License 1.0.0](LICENSE). You may use, study,
self-host, modify and share them for any noncommercial purpose. The `raume`
name, wordmark and logo are reserved — see [`NOTICE`](NOTICE).

Third-party parts keep their own licenses:

- `ts-fsrs` and `supabase-js` — MIT. The Lucide-derived icons — ISC.
  License files are in `vendor/*.LICENSE.txt`.
- Inter and Space Grotesk — SIL Open Font License (`fonts/*.LICENSE.txt`).
- Pronunciation audio (`audio/*.mp3`) — generated with
  [VOICEVOX](https://voicevox.hiroshiba.jp/), voice VOICEVOX:四国めたん.
