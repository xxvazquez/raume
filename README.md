# raume

A fast, static reference for Japanese food, kitchen and N5 vocabulary, with an
FSRS-scheduled flashcards trainer built on top. Made for quick lookups while
cooking or studying, and for printing clean A4 study sheets.

**Live at [xxvazquez.github.io/raume](https://xxvazquez.github.io/raume/)**

[![Support raume on Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20raume-574d73?logo=ko-fi&logoColor=white)](https://ko-fi.com/raume)

|                 |                                                                  |
| --------------- | ---------------------------------------------------------------- |
| **Reference**   | Vocabulary, Grammar, Phrases and Travel tables — furigana, search, audio, print |
| **Flashcards**  | FSRS-6 spaced repetition, four directions per word, daily streak |
| **Kana**        | A separate hiragana / katakana drill                             |
| **Puzzles**     | Crosswords, arrowords and word searches built from your words    |
| **Storage**     | Guest (this browser only) or a Supabase account that syncs       |
| **Stack**       | Plain HTML, CSS and `<script>` tags — no framework, no build step |

## Contents

- [Quick start](#quick-start)
- [The reference](#the-reference)
  - [Sections](#sections) · [Finding things](#finding-things) ·
    [Reading the tables](#reading-the-tables) · [Options](#options) ·
    [Grammar notes](#grammar-notes) · [Customising](#customising) ·
    [Print, theme and navigation](#print-theme-and-navigation)
- [Flashcards](#flashcards)
  - [How cards work](#how-cards-work) · [Reviewing](#reviewing) ·
    [Screens](#screens) · [Kana trainer](#kana-trainer) · [Puzzles](#puzzles)
- [Accounts and storage](#accounts-and-storage)
- [Development](#development)
- [License](#license)

---

## Quick start

```bash
open index.html            # runs straight from file:// — nothing to install
python3 -m http.server     # only needed to test the service worker / offline
```

---

## The reference

### Sections

| Section        | What's in it |
| -------------- | ------------ |
| **Vocabulary** | The landing page: Food & Ingredients, Kitchen & Dining, Numbers & Counting, People & Daily Life (family, body & health, weather & seasons), Time & Calendar |
| **Grammar**    | Adjectives, Verbs (plain and polite forms), Particles, Question Words, This / That / Over There (こそあど) |
| **Phrases**    | Self-introduction Q&A — name, job, country, age, family, home — in question/answer order |
| **Travel**     | Signs, places, shopping, transport, toilets, laundry, hotels, labels, garbage, restaurants |
| **Flashcards** | Review, manage and track progress — see [Flashcards](#flashcards) |

On a phone the nav is a tab bar at the bottom; on a wider screen it's the top
row. Grammatical **particles are blue and bold** everywhere.

### Finding things

| | |
| --- | --- |
| **Search** | Covers every section. Ranked exact → starts with → ends with → contains, match highlighted; a single letter only finds words that start with it (one kana or kanji still matches anywhere). Clearing it puts back the tables you had open. Searches whichever of Japanese / furigana / English are visible, plus romaji. Each result has a **+ / ✓** toggle to add the word to flashcards or pause it. |
| **Tables** | The list button in the pinned search bar (named after the table you're reading, on desktop) lists every table in the section with its entry count. |
| **Opening a table** | Keeps the row you tapped exactly where it was. While it's open, its title stays pinned under the search bar as you scroll, and closing it from there keeps it in place. |
| **URL** | Follows the view (`#grammar`, `#table-15`, `#flashcards`), so any view can be bookmarked. |
| **Pinned bar** | The search field and **Options** stay pinned as you scroll. |

### Reading the tables

| | |
| --- | --- |
| **Columns** | **Japanese** (with furigana) and **English**. Tap a word to show its **romaji** underneath; romaji is always searchable. |
| **Furigana** | Always shown, 11px minimum. Each reading starts where its kanji start; consecutive kanji share one reading (三十三歳 → さんじゅうさんさい), and a long reading runs on over the following kana instead of pushing a gap into the word (料理する). |
| **Sentence tables** | (Phrases) Japanese on its own line, English under it, romaji on tap. Answers are set in under their question, and search shows the whole pair when either line matches. |
| **Katakana** | Hover or tap any katakana to see its romaji above it. |
| **Pronunciation** | The speaker icon plays a native-voice clip. Custom words use the browser's speech engine. |
| **Sorting** | The English column sorts A–Z / Z–A. Japanese has no single natural order, so it doesn't sort. |
| **Hide a row** | The eye icon marks a word as known for now. **Show all** brings them back. |

### Options

The **Options** button holds the display settings — a popover on desktop, a
bottom sheet on a phone. A dot on it means something is off its default.

| Option | Does |
| --- | --- |
| **Japanese / Furigana / English** | Hide a column without reflowing the table. You can't hide both text columns at once. |
| **Cover answers** | Blanks the English. Tap a row to reveal it. |
| **Show polite** | Switches verbs to 〜ます. Only appears while the Verbs table is open. |
| **Expand all · Print** | Open every table; print the section or everything. |
| **Legends** | The badges on screen, and **Row icons** — what the speaker, hide, + and ⋯ glyphs do. |

### Grammar notes

A row with grammar to explain carries an **ⓘ** beside the hide eye instead of
a strip of badges: tap it for one popover listing each note, led by its tinted
badge. It's hidden while the English is hidden or covered, so it can't give
the answer away.

| Badge | Meaning | Outlined when… |
| ----- | ------- | -------------- |
| **い** / **な** | Adjective type | The word breaks the pattern: a な-adjective ending in い (きれい, 有名), or irregular いい / かっこいい |
| **五段** / **一段** / **変格** | Verb group: u-verb, ru-verb, irregular | The group is easy to mistake from the ending (切る, 帰る), or the verb is 来る |
| **を** **に** **が** … (blue) | The particles a verb or adjective takes, e.g. 聞く: を *what you listen to*, に *who you ask* | — |

- **Usage traps** get a plain badge on their own line — 多い doesn't go right
  before a noun (多くの人 or 人が多い, not 多い人); 遊ぶ isn't for sports or
  instruments.
- **Mimetic words** (*mochimochi*, *sakusaku*) are 擬態語, not adjectives, and
  get no badge.

### Customising

The **Customize** page — masthead sliders icon; on a phone, the account
button's menu.

| | |
| --- | --- |
| **Icon and colour** | Every table has an icon tile. A table you create picks an icon from its name ("Animals" → paw). Choose from about 165 icons, upload your own, and pick one of nine muted colours. Also opens from **Choose icon…** in a table's **⋯** menu. |
| **Hide a table** | **Hide table** in its **⋯** menu (or **Hide** on Customize) takes it off the reference pages, the Tables list and search. **Show** on Customize brings it back. Flashcards isn't affected — that's what Pause table is for. |
| **Name and order** | Rename any table. Move tables and categories by dragging the grip, or focus it and press ↑ / ↓. |

**Your vocabulary** — words the built-in set doesn't have:

| | |
| --- | --- |
| **Add a word** | To any table, built-in or your own. |
| **Import a list** | Pasted text or a `.csv` / `.txt` file, one word per line: `japanese(furigana),romaji,english`, e.g. `帰(かえ)る,kaeru,to return`. Rows that don't parse are skipped and listed with the reason. |
| **New table** | Needs an account. Guests can still add words to existing tables. |
| **Words you've added** | Edit or delete your words. Searchable; sorts by date added or A–Z. |

Custom words work everywhere — furigana, search, print, audio, all four
flashcard directions. Changes save immediately and sync when signed in.

### Print, theme and navigation

| | |
| --- | --- |
| **Print** | A4 at three scopes: one table (printer icon), this section, or the whole reference (both in Options). Collapsed tables still print. |
| **Theme** | Cycles **System → Light → Dark**, applied before first paint (on a phone: **Appearance** in the account button's menu). |
| **Help** | The masthead **?**: four topics (Finding words, Reading, Options, Making it yours), each a short list of one-line rows, then a **Support raume** link to the Ko-fi page (`ko-fi.com/raume`). Flashcards has its own Help screen in the same style. |
| **Sign-in dot** | On the person icon: **green** = everything synced; **amber** = offline or a change hasn't reached your account yet. Hover it for details. |

**On a phone** there's no wordmark row: each screen starts with its large
title and one round **account button** beside it, which opens a menu —

- who you're signed in as and whether you're synced
- **Account** (**Sign in** for a guest — straight to the sign-in screen)
- **Customize tables** · **Help** · **Support raume** (Ko-fi, new tab)
- **Appearance** (System / Light / Dark)

On a tablet the masthead icons carry captions (Account, Help, Customize, the
current theme). The search bar's buttons read **Tables** and **Options**, and
Manage's buttons keep a one-word label — nothing relies on hover.

<sub>[↑ Contents](#contents)</sub>

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
- After a wrong answer, **Again / Hard** read first and Good / Easy are
  dimmed, but still one tap away if it was just a typo.
- During a session the navigation hides and the card gets the whole screen.
- Results are announced to screen readers without moving focus.

<details>
<summary><b>How answers are checked</b></summary>

- A wrong romaji answer highlights exactly which letters were off
  (`kaeramasu → kaerimasu`).
- Long vowels are ignored — `kōhī`, `koohii` and `kouhii` all match, and
  likewise ā/aa, ū/uu, ē/ee, ō/oo/ou; the marked letters treat them as the
  same sound too.
- An English answer's notes are optional — for *which … (before a noun)*
  plain `which` counts, and for *hot (weather)* plain `hot`.
- A noun + suru verb also takes its optional を — `ryouri o shimasu` counts
  for `ryōri shimasu`.
- The right answer in the wrong language — the romaji on a card that asks for
  the English, or the English on a romaji card — isn't graded: the card says
  which one it wants and the field stays open for another go.
- Romaji → English can't tell words spelled alike apart (*atsui*: 暑い / 熱い /
  厚い), so any of their meanings counts, and the reveal lists the others
  under **Same sound**.

</details>

<details>
<summary><b>What the answer reveals</b></summary>

- Japanese → English shows the word's reading under it once checked — not for
  kana-only words like レモン, where it would just repeat the word.
- Romaji and English prompts reveal the Japanese under the answer once
  checked, with its furigana — Japanese never appears without it.

</details>

### Screens

Four segments — Dashboard, Manage, Kana, Puzzles. **Settings** and **Help**
sit at the top right, beside the title, and open as their own screen with a
**‹ Flashcards** back button.

| Screen | What it does |
| --- | ------------ |
| **Dashboard** | Today, next review, streak / total / reviews / estimated retention, card progress, this week's reviews, a 7-day due forecast, missed today, **Leeches** (words forgotten 8+ times after being learned — *Pause* or *Keep* them), and **Words to review** (its ⋯ menu ticks Japanese / Furigana / English on or off) |
| **Manage** | Every table by category, filtered All / My flashcards / Archived. Add or **Pause** a table, or open it to add or pause single words |
| **Kana** | A hiragana / katakana drill, separate from the word cards ([below](#kana-trainer)) |
| **Puzzles** | Crossword / arroword / word search from your words ([below](#puzzles)) |
| **Settings** | Study directions and FSRS settings (retention, max interval, fuzz, new cards per day), set separately for words and kana. Changes save as you make them — no Save button. Guests also get **Back up & restore** (a JSON file) |
| **Help** | Pausing, the Manage icons, keyboard shortcuts |

**Pausing** keeps everything. A paused word moves to *Archived*; a paused
table just stops appearing in reviews until you resume it. FSRS state and
history are always kept.

### Kana trainer

Choose groups (**gojūon, dakuten, handakuten, yōon, sokuon**, for each script)
and directions:

| Direction | You type |
| --- | --- |
| **Kana → romaji** | The reading. A few alternates like `si` / `shi` are accepted. Vowel length counts here. |
| **Romaji → kana** | The kana itself. |

It uses the same review card as the word flashcards, with its own FSRS
settings.

### Puzzles

A fill-in crossword or arroword, or a word search, generated fresh each time —
at least 6 words, or it tells you why not. Nothing is saved or scheduled.
Clues that give the answer away are left out: the word written in its own
clue ("Japanese sake" → *sake*), or a loanword that just echoes its English
(*cola* → コーラ).

The puzzle comes first. Its settings sit behind one summary button
("Crossword · Flashcards · 15 words · Romaji") that opens them as a popover
(a bottom sheet on a phone); changing one makes a new puzzle. On a wide
window the clue you're on and the Across / Down lists sit beside the grid.

| Setting | Choices |
| --- | --- |
| **Source** | *Flashcards* (added, unpaused words) or *Tables*: one or more vocabulary tables, whether or not they're in flashcards |
| **Style** | *Crossword* (numbered clue list), *Arroword* (each clue in a square before its answer) or *Word search* |
| **Script** | *Romaji* (default), *Japanese*, *Hiragana* (native words, read in hiragana) or *Katakana* (loanwords only) — a word is never forced into a script it isn't written in. Answers are always readings; kanji is never shown or typed |
| **Words** | 10, 15, 20, 30 or 40 |

<details>
<summary><b>Solving a crossword / arroword</b></summary>

- Tap a square or a clue and type. Typing follows the word's direction; tap a
  crossing square again to switch. The bar above the grid shows the clue
  you're on (it appears once you pick a square; the ⓘ beside Check has the
  how-to). Backspace steps back, arrow keys move.
- **Check** marks filled squares right or wrong. The **⋯** menu has *Reveal a
  letter*, *Reveal puzzle*, *Clear answers* and *Print* (a clean A4 worksheet:
  the title, one line like "Drinks · 20 words · Romaji", the grid, then Across
  and Down side by side).
- Grids are built compact — each word goes where it crosses the most and
  grows the grid the least — so even 40 words stay a dense block.

</details>

<details>
<summary><b>Word search</b></summary>

- Built to be hard: the list gives only the English clue, words run in all
  eight directions (backwards and diagonally too), each word sits where it
  shares the most letters with the others, and the spare squares are filled
  with the answers' own letters.
- In romaji, words shorter than three letters are left out (they turn up by
  chance).
- Drag across a word, or tap its first and last letter; a found word gets a
  capsule, a tick and its reading in the list, and the toolbar counts how
  many are found.
- The **⋯** menu has *Reveal a word*, *Reveal puzzle*, *Clear found words* and
  *Print*.

</details>

<sub>[↑ Contents](#contents)</sub>

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

<sub>[↑ Contents](#contents)</sub>

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

| Part | License |
| --- | --- |
| `ts-fsrs`, `supabase-js` | MIT (`vendor/*.LICENSE.txt`) |
| Lucide-derived icons | ISC (`vendor/*.LICENSE.txt`) |
| Inter, Space Grotesk | SIL Open Font License (`fonts/*.LICENSE.txt`) |
| Pronunciation audio (`audio/*.mp3`) | Generated with [VOICEVOX](https://voicevox.hiroshiba.jp/), voice VOICEVOX:四国めたん |
