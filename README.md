# raume

A fast, static reference for Japanese food, kitchen and N5 vocabulary, with an
FSRS-scheduled flashcards trainer built on top. Made for quick lookups while
cooking or studying, and for printing clean A4 study sheets.

**Live at [xxvazquez.github.io/raume](https://xxvazquez.github.io/raume/)**

[![Support raume on Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20raume-574d73?logo=ko-fi&logoColor=white)](https://ko-fi.com/raume)

|                 |                                                                  |
| --------------- | ---------------------------------------------------------------- |
| **Reference**   | Vocabulary, Grammar, Kanji and Travel tables — furigana, search, audio, print |
| **Practice**    | Flashcards: FSRS-6 spaced repetition, four directions per word, daily streak |
| **Kana**        | A separate hiragana / katakana drill                             |
| **Puzzles**     | Crosswords, arrowords and word searches from your words |
| **Games**       | A timed Match game, Listening, Kana tiles, Odd one out, Speed sort and Word chain from your words |
| **Storage**     | Guest (this browser only) or a Supabase account that syncs       |
| **Stack**       | Plain HTML, CSS and `<script>` tags — no framework, no build step |

## Contents

- [Quick start](#quick-start)
- [The reference](#the-reference)
  - [Sections](#sections) · [Kanji](#kanji) · [Finding things](#finding-things) ·
    [Reading the tables](#reading-the-tables) · [Options](#options) ·
    [Grammar notes](#grammar-notes) · [Customising](#customising) ·
    [Around the app](#around-the-app)
- [Practice](#practice)
  - [How cards work](#how-cards-work) · [Reviewing](#reviewing) ·
    [Screens](#screens) · [Dashboard](#dashboard) · [Kana trainer](#kana-trainer) ·
    [Puzzles](#puzzles) · [Games](#games) · [Stats](#stats)
- [Accounts and storage](#accounts-and-storage)
- [Development](#development)
- [License](#license)

---

## Quick start

Open `index.html` in a browser — it runs straight from `file://`, nothing to
install. A local server is only needed to test the service worker (offline):

```bash
python3 -m http.server
```

---

## The reference

### Sections

| Section        | What's in it |
| -------------- | ------------ |
| **Vocabulary** | The landing page: Food & Ingredients, Kitchen & Dining, Numbers & Counting, People & Daily Life (family, body & health, weather & seasons), Time & Calendar |
| **Grammar**    | Adjectives, Verbs (plain and polite forms), Particles, Question Words, This / That / Over There (こそあど) |
| **Kanji**      | The 102 N5 kanji in seven themes (numbers & money, days & time, people & body, places & directions, nature & things, verbs, adjectives) — see [Kanji](#kanji) |
| **Travel**     | Signs, places, shopping, transport, toilets, laundry, hotels, labels, garbage, restaurants |
| **Practice**   | Flashcards, the Kana drill, Puzzles and Games — see [Practice](#practice) |

Grammatical **particles are blue and bold** everywhere.

### Kanji

| | |
| --- | --- |
| **Grid** | Each theme is a grid of tiles: the kanji large, its on readings (katakana) under it, its kun readings (hiragana) under those. The readings hide with furigana, and *Cover answers* covers them until tapped. Themes run in teaching order (numbers first), kanji in their natural order (一 二 三…). |
| **Kanji sheet** | Tap a tile for its readings — one row each, its romaji beside it and a speaker (tap the row to hear it) — stroke count and radical, an example word, **Words with** it (every word in the other tables that uses it, shortest first, folded until tapped) and **Add to flashcards**. |
| **Known** | **Mark as known** under the sheet's title turns that kanji's tile sage green with a check, so what's left to learn stays grey; tap **Known** to undo. The Dashboard's Kanji card counts them. Kept on the device and, signed in, synced to your account. |
| **Write it** | Under the stroke-order drawing: a writing pad for that kanji. Draw each stroke in order with a finger or the mouse — a right stroke snaps to its clean line in its stroke-order colour, a wrong one (misplaced, backwards or out of order) shakes the pad and counts a miss, and after three misses on one stroke it's shown as a hint. **Outline** (on by default, remembered) shows the faint kanji to trace; off, it's the real test. Undo, Clear, then "6 / 6 strokes · 1 miss" (or a clean run) with **Again** and **Next kanji** (the next one in the theme). Practice only. |
| **Stroke order** | The sheet draws the kanji stroke by stroke over a faint outline, each stroke numbered as it starts; **Replay** draws it again (finished drawing, no animation, with reduced motion on). Drawings from [KanjiVG](http://kanjivg.tagaini.net), CC BY-SA 3.0. |
| **ⓘ** | One beside **Readings** and one beside **Writing**: a short popover explaining that card for an N5 learner — what on / kun readings are, strokes and stroke order, what a radical is. Every kanji in them has furigana. A radical that's only there for dictionary sorting says so under its own row. |
| **Flashcards** | A kanji gets two cards: meaning (山 → mountain) and reading (山 → any one of its readings in romaji, yama or san). Never English → kanji — that's writing, which typing can't check. Kanji stay out of Puzzles. |

### Finding things

| | |
| --- | --- |
| **Search** | Covers every section. Ranked exact → starts with → ends with → contains, match highlighted (a romaji query tints the kana or furigana it spells — the romaji itself stays a tap away); a single letter only finds words that start with it (one kana or kanji still matches anywhere). Kana finds a kanji word by its reading (たべ → 食べる, 食べ物); romaji works with or without long vowels and in a Japanese keyboard's spellings (*shoyu*, *kohi*, *mittu*), and finds a verb's polite form too (*tabemasu*); English matches where a word starts (*eat* finds *eat*, not *heat*). Clearing it puts back the tables you had open. Searches whichever of Japanese / furigana / English are visible, plus romaji. Each result has a **+ / ✓** toggle to add the word to flashcards or pause it. |
| **Tables** | The list button in the pinned search bar lists every table in the section, full names and entry counts, the one you're reading marked. |
| **Opening a table** | Keeps the row you tapped exactly where it was. While it's open, its title stays pinned under the search bar as you scroll, and closing it from there keeps it in place. |
| **URL** | Follows the view (`#grammar`, `#kanji`, `#table-15`, `#practice` — an old `#flashcards` link still opens Practice), so any view can be bookmarked. |
| **Pinned bar** | The search field and **Options** stay pinned as you scroll. |

### Reading the tables

| | |
| --- | --- |
| **Columns** | **Japanese** (with furigana) and **English**. Tap a word to show its **romaji** underneath; romaji is always searchable. Context for a meaning ("before a noun", "polite") follows the English in grey on the same line, dropping under it only when it doesn't fit. |
| **Furigana** | Always shown, 11px minimum. Each reading starts where its kanji start; consecutive kanji share one reading (三十三歳 → さんじゅうさんさい), and a long reading runs on over the following kana instead of pushing a gap into the word (料理する). |
| **Sentence tables** | (A table of your own sentences) Japanese on its own line, English under it, romaji on tap. |
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
| **Legends** | The badges on screen, and **Row icons** — each glyph (speaker, hide, ⓘ, +, ⋯) named, with one short line on what it does. |

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
| **Words you've added** | Edit or delete your words (an action sheet asks before a delete). Searchable; sorts by date added or A–Z. |

Custom words work everywhere — furigana, search, print, audio, all four
flashcard directions. Changes save immediately and sync when signed in.

### Around the app

| | |
| --- | --- |
| **Print** | A4 at three scopes: one table (its printer icon), this section, or the whole reference (both in Options). Collapsed tables still print. |
| **Theme** | **System → Light → Dark**, applied before the first paint. |
| **Help** | The **?** at the top: four topics (Finding words, Reading, Options, Making it yours) as short one-line rows, then **Support raume** ([Ko-fi](https://ko-fi.com/raume)). Practice has its own Help screen; on a phone, the account menu's **Help** opens whichever fits the screen you're on. |
| **Version** | A quiet line at the foot of every page: the deployed commit and its date (**Local build** in a checkout). |
| **Sync dot** | On the person icon: **green** = everything synced, **amber** = offline or something hasn't reached your account yet. |

The **account button** (the person icon) opens one menu:

| Row | Shows |
| --- | --- |
| *(header)* | Who you're signed in as, and whether you're synced |
| **Account** | Practice — or **Sign in** for a guest, straight to the sign-in screen |
| **Customize tables** · **Help** | Phone only; wider windows have their own icons |
| **Support raume** | Ko-fi, in a new tab |
| **Appearance** | System / Light / Dark — phone only, likewise |
| **Sign out** | Signed in only — its one place, at every screen size. If something hasn't synced yet, it asks first |

**Screen sizes.** On a phone the sections are a tab bar at the bottom, each
screen starts with a large title, and the account button sits round beside it.
On a tablet the top icons carry captions. On desktop the sections sit in a
floating bar at the top. Nothing relies on hover.

<sub>[↑ Contents](#contents)</sub>

---

## Practice

The Practice tab holds your flashcards, the Kana drill, Puzzles and Games.
Flashcards sit on top of the vocabulary without copying it — each card
references a row's permanent id (`v0001`…). Add a whole table with **Add to
flashcards**, or single words from **Library** or a search result.

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
- A new word is met **JP → EN** first (or the first direction you study, if
  that one's off); its other directions join once you've seen it.

### Reviewing

```
card  →  type answer, Enter or ↑  →  verdict + answer (audio plays)  →  rate 1–4  →  next
```

- Every rating saves at once, so **End session** never loses progress.
- The wrap-up shows today's rings and says what happened — *Review ring
  closed*, *All rings closed*, or *Session complete* — with cards · % right ·
  minutes, then only real news: a day added to your streak, words newly
  mastered (every card of the word stable for three weeks), an award earned.
  **Keep going**
  when more cards came ready, **Play a game** while the Play ring is open,
  and **Done**.
- The **↑** arrow at the end of the answer line checks too (like Messages'
  send); tapping it keeps the field focused.
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
- Apostrophes, hyphens and spaces in romaji don't matter — `kin'en` /
  `kinen`, `shabu-shabu` / `shabu shabu` — and a phone's curly `’` counts as
  `'` in answers and search alike.
- A Japanese keyboard's spellings count too — `tu`, `si`, `hu`, `zi`, `sya`,
  `tya`, a doubled `nn`, and `m` before b / p (`mittu`, `tempura`) — and the
  particles は / へ / を also take `ha` / `he` / `wo`.
- You only type the meaning, never its note: どの is *which* with the note
  *before a noun* shown under it, and brackets in your own words are optional
  too.
- Several right answers typed together count — `grandfather, old man`,
  `yon / shi` — and a word with two readings (四: *yon / shi*) accepts either
  one alone.
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

Five segments — Dashboard, Kana, Puzzles, Games, Library. **Settings** and **Help**
sit at the top right, beside the title, and open as their own screen with a
**‹ Practice** back button.

| Screen | What it does |
| --- | ------------ |
| **Dashboard** | Today's progress, streak, level, awards and the details behind them ([below](#dashboard)) |
| **Kana** | A hiragana / katakana drill, separate from the word cards ([below](#kana-trainer)) |
| **Puzzles** | Crossword / arroword / word search from your words ([below](#puzzles)) |
| **Games** | Match / Listening / Kana tiles / Odd one out / Speed sort / Word chain from your words ([below](#games)) |
| **Awards** | Every award, grouped Streaks / Reviews / Words / Kana / Kanji / Puzzles / Games — opened from the Dashboard's **Show all** |
| **Stats** | Per puzzle or game style — opened from the setup screen's *Stats*, ⋯ › *Stats*, a finished game's **Stats** button, or a Dashboard card's **See stats** ([below](#stats)) |
| **Library** | Every table by category, filtered All / My flashcards / Archived. Add or **Pause** a table, or open it to add or pause single words |
| **Settings** | Study directions and FSRS settings (retention, max interval, fuzz, new cards per day), separately for words and kana. Changes save as you make them. Guests also get **Back up & restore** — one JSON file with cards, kana, table customisations, your own words, Known kanji and finished games |
| **Help** | Adding & pausing, Library icons, reviewing, each tab, syncing, backup |

**Pausing** keeps everything. A paused word moves to *Archived*; a paused
table just stops appearing in reviews until you resume it. FSRS state and
history are always kept.

### Dashboard

From the top:

| Card | Shows |
| --- | --- |
| **Today's rings** | Apple Fitness-style: **Review** (cards due today that you've done), **Learn** (new cards met, of your daily number) and **Play** (one finished puzzle or game; more laps the ring), beside how many cards **Study now** holds |
| **Streak** | Days in a row, this week as seven dots (studied / missed / today half-filled until Review closes) and your best to beat |
| **Level** | One per 25 words ever mastered (forgetting a word never takes one back), with Kana started, Kanji known, Words mastered, total cards, reviews and estimated retention |
| **Awards** | Medals for streaks, reviews, words mastered, all the hiragana / katakana, kanji known, puzzles and games, a Match under 2s a pair, a perfect Listening game. The newest six earned and the nearest to go; **Show all** for every one, tap one for what it's for and when you earned it |
| **Highlights** | One line, only when there's news — reviews up on last week, a new best Match pace |

Then, under **Details**:

- **Card progress**, **Reviews this week** and **Due next 7 days**
- **Kana** — how many of your chosen kana you've started, how many are ready, and a button straight to it
- **Puzzles** and **Games** — solved / played, your day streak, the last three (each with its result), and **See stats**. A puzzle revealed in full doesn't count
- **Kanji** — how many of the N5 kanji you've marked Known
- **Missed today** — only when you missed something
- **Leeches** — words forgotten 8+ times after being learned; *Pause* or *Keep* them
- **Words to review** — its ⋯ menu ticks Japanese / Furigana / English on or off

Awards, puzzles and games follow your account when signed in.

### Kana trainer

The tab opens on the same card as the Dashboard: how many kana a session holds
now (started / not started under it) and **Study now**. Below it, choose groups
(**gojūon, dakuten, handakuten, yōon, sokuon**, for each script). Each card
shows a kana and you type its reading in romaji; a few alternates like `si` /
`shi` are accepted, and vowel length counts.

It uses the same review card as the word flashcards, with its own FSRS
settings.

### Puzzles

A fill-in crossword or arroword, or a word search, generated fresh each
time — at least 6 words, or it tells you why not. Nothing is scheduled.
Clues that give the answer away are left out: the word written in its own
clue ("Japanese sake" → *sake*), or a loanword that just echoes its English
(*cola* → コーラ).

The tab opens on a **setup screen**: the puzzle (Crossword, Arroword or
Word search, each with a line on how it plays), then *Words from* (a
checklist: Flashcards, or as many tables as you like, with a search field
to find a table), *Script* and *Word count* — three alike rows, each
opening the same menu of checkmark rows (a bottom sheet on a phone) — then **Start** — off, with
the reason under it, until there are enough words — and [*Stats*](#stats).
Your choices are remembered on this device for next time. In play, one
toolbar row: **‹** and the puzzle's name (back to the setup screen), then
**Hint**, **Check** (a word search shows "3 / 15" found instead) and **⋯** —
**New puzzle** (same settings, fresh words; its own button on a wide
window), *How to play*, *Reveal puzzle*, *Clear*, *Save as PDF* and *Stats*. On a wide window the clue you're on and the Across / Down lists sit beside the grid —
or below it, when the grid is too wide to share the row. Beside the lists
there's a **Notes** pad for readings, guesses or kana while you solve; it
stays with the puzzle while you move between tabs and starts blank with the
next one (not on a phone, not saved or synced). The page itself never
scrolls sideways.

| Setting | Choices |
| --- | --- |
| **Words from** | *Flashcards* (added, unpaused words — leans toward words you're still learning, so new and shaky words come up more often than mastered ones) or any number of vocabulary tables, whether or not they're in flashcards — one checklist: tick Flashcards, or tick as many tables as you like to mix them into one puzzle or game |
| **Puzzle** / **Game** | Puzzles: *Crossword* (numbered clue list), *Arroword* (each clue in a square before its answer) or *Word search*. Games: *Match* or *Listening* |
| **Script** | Not for Listening (you hear the word). *Romaji* (default; long vowels spelled out as typed — *budou*, *koohii* — since a square can't hold ō), *Japanese* (the word as written, kanji and all — Match and Word search only), *Hiragana* (native words, read in hiragana) or *Katakana* (loanwords only) — a word is never forced into a script it isn't written in. Crosswords and arrowords always use readings (a square can't take a whole kanji); a word search that uses kanji shows each found word's reading beside it, and leaves out one-kanji words |
| **Words** | 10, 15, 20, 30 or 40; Match and Listening also 60, 80, 100 or *All*. The button shows the real count when the pool holds fewer |

<details>
<summary><b>Solving a crossword / arroword</b></summary>

- Tap a square or a clue and type. Typing follows the word's direction; tap a
  crossing square again to switch. The bar above the grid shows the clue
  you're on (it appears once you pick a square; the ⓘ beside Check has the
  how-to). In a kana grid a hardware keyboard types romaji, as a Japanese
  keyboard does — "ka" fills か, "kya" きゃ across two squares, "nn" ん. A
  square turns green the moment it's right, and the last right square
  solves the puzzle. Keys: arrows move (across the way you're typing, the
  first press turns), Tab / Shift-Tab the next / previous word, Space
  switches direction, Backspace steps back, Delete clears.
- **Hint** fills one square (the one you're on unless it's already right —
  empty or wrong — else the next one in your word that isn't). **Check**
  marks filled squares right or wrong. The
  **⋯** menu has *Reveal puzzle*, *Clear answers* and *Save as PDF* — an A4
  worksheet the app draws itself, so it looks the same from any browser: the
  title, one line like "Drinks · 20 words · Romaji", the grid, Across and Down
  side by side, and an **Answers** page last. A wide grid turns the page to
  landscape; arroword squares grow to 13mm so their clues stay readable. On a
  phone it opens the share sheet — Save to Files, Print, Books.
- Grids are built compact — each word goes where it crosses the most and
  grows the grid the least — so even 40 words stay a dense block.
- When **Check** finds every square right, the solve goes to the Dashboard's
  **Puzzles** card (time and letters revealed). *Reveal puzzle* doesn't count.

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
- **Hint** reveals one word. The **⋯** menu has *Reveal puzzle*, *Clear found words* and
  *Save as PDF* (the letter block, the clues in two columns, and an Answers page
  with every word ringed).
- Finding them all goes to the Dashboard's **Puzzles** card (time and words
  revealed) — unless every word was revealed.

</details>

### Games

Timed and scored rounds: **Match**, **Listening**, **Kana tiles**, **Odd one out**, **Speed sort** and **Word chain**. Same setup screen
and toolbar as Puzzles — pick the game, Words from / Script (none for
Listening or Word chain) / Word count / Sort by (Speed sort), then **Start**;
in play ‹ and the game's name, the clock (or "3 / 10"), and ⋯ with New
game, Skip (Word chain), How to play, *Restart* and *Stats*. On a keyboard
the arrow keys move between tiles and choices, Enter or Space picks, 1–4
picks a choice by number, and Enter goes on to the next question. Each tab keeps its own settings and its
game in progress while you switch between them: going to another Practice
tab or page pauses the game, and coming back finds it exactly where you left
it, paused (a part-typed puzzle grid too). Practice only — nothing is
scheduled; every finished game goes to the Dashboard.

Answering feels like a tap on something real, quietly: a tile squeezes under
your finger; the right answer washes green from its middle out and a ✓ draws
itself in its corner (a ring around it if you picked another), a wrong pick
washes red with a short shake and a ✕, and the English rises into place. In
Listening, Kana tiles, Odd one out and Word chain, five small dots beside the
counter fill with each right answer in a row — the fifth glows once and says
"5 in a row" — and a miss empties them. No sounds, points or confetti;
with reduced motion on, it's all a plain change of state.

<details>
<summary><b>Match</b></summary>

- Two columns: the words (in the chosen script) on the left, their English on
  the right, each shuffled. Tap a word, then its meaning — either side first.
- A right pair clears in place (nothing moves); a wrong pair shakes and adds
  a second to your time.
- The words come in even rounds of at most 6 pairs (15 words → three rounds
  of 5), so a round fits a phone. The clock starts on your first tap.
- Between rounds there's a break: how that round went (its time, misses, how
  far ahead of or behind your best you are, and "Your fastest round yet"
  when it is), with the clock stopped until you tap **Next round**.
- **⏸** beside the clock pauses: the clock stops and the tiles are hidden
  behind a card with **Resume**, **Restart** and **End game**. Leaving the
  app mid-game pauses it too. **End game** shows what you played; the rounds
  you finished count in your stats (pairs, time, misses, fastest round) —
  only a best time needs the whole game.
- Once you have a best on the same words, a small chip beside the clock after
  each round says how far ahead (sage, "−1.4s") or behind (coral, "+0.9s") of
  that best you are at that point.
- At the end: your time counts up, a *New best* badge pops in when it is one,
  then how much faster (or how far off your best) you were, the pairs and your
  misses. A ring draws closed around your pace per pair, in its medal's
  colour — **gold** under 2s a pair, **silver** under 3s, **bronze** under 4s —
  with what the next tier needs. Under it your last ten games on the same
  words draw themselves as a line (this one the dot), and where this run ranks.
  Best times come from your game log, one per source, script and word count,
  so they follow your account when signed in.
  Two words with the same English never appear together.
- **New game** picks new words; the **⋯** menu's *Restart* plays the same
  words again. Practice only — it never changes your flashcard schedule.
- Every finished game is saved to the Dashboard's **Games** card and [Stats](#stats) (time,
  pairs, misses).

</details>

<details>
<summary><b>Listening</b></summary>

- Tap **▶** to hear a word — the same recorded clip (or the device's Japanese
  voice) as the speaker buttons — and pick its English from four. Nothing
  written shows until you answer.
- The wrong choices come from the same table where there are enough, and two
  choices never share an English meaning.
- Right: a ✓, the word appears as written with its kana and romaji, and the
  next word plays by itself. Wrong: a ✕ on your pick, a ✓ on the right one,
  the word shown, and **Next** when you're ready.
- At the end: your score ("12 / 15"), this game's accuracy beside your
  average over all Listening games, and the words you missed, each with a
  speaker to hear it again. **Play again** for new words; the **⋯** menu's
  *Restart* asks the same ones again. **⏸** pauses (the choices hidden);
  *End game* shows the score so far; the words you answered count toward
  your accuracy (never a best).
- No Japanese voice and no recorded clips loaded (a first visit offline)? It
  says so instead of playing silently. Practice only, like Match.
- Every finished game is saved to the Dashboard's **Games** card and [Stats](#stats) (score and
  time).

</details>

<details>
<summary><b>Kana tiles</b></summary>

- Spell the word: the English (with ▶ to hear it) on top, one slot per kana,
  and a bank of tiles under it — the word's own kana shuffled with 3 decoys
  that look or sound close (ぬ/め, シ/ツ, か/が). Small ゃゅょっ and ー are
  tiles of their own. The bank sits in balanced rows, never one tile alone.
- Tap tiles in order; tap a placed tile to take it (and those after it)
  back. Filling the last slot checks it: right moves on by itself; wrong
  shows the spelling, waits for **Next**, and the word comes back once at
  the end of the game.
- *Script* is *Hiragana* or *Katakana* only — words really written that way.
  The score counts words right first time; the end card lists the ones to
  spell again. ⏸ and End game work as in Listening.

</details>

<details>
<summary><b>Odd one out</b></summary>

- Four words in your chosen script, three from one table and one from
  another — tap the one that doesn't belong. The odd word comes from a
  different category where there is one (Clothes among Fruits, not
  Vegetables).
- Answering shows every word's English, ✓ on the odd one (✕ on a wrong
  pick), and one line naming the tables: "*imoto* is Family — the rest are
  Drinks". Right moves on by itself; wrong waits for **Next**.
- A word that sits in two tables, or shares its English with another
  table's word, never plays — every set has one right answer. It needs
  words from at least two tables, three or more from one of them; with one
  table it says so.
- The score is sets right; the end card lists the odd ones you missed. ⏸
  and End game work as in Listening.

</details>

<details>
<summary><b>Speed sort</b></summary>

- Words one at a time, large, against the clock: tap the bucket each one
  belongs in. **Sort by** (in ⋯) picks the buckets — *Tables* (two or three
  of your tables, from different categories where possible), *Adjectives*
  (い / な) or *Verbs* (u-verb / ru-verb, plus irregular when there are
  some). Only the sorts your words can fill are offered.
- A right tap washes green; a wrong one adds a second (as in Match), shakes,
  and rings the right bucket. Either way the word's English then shows
  under it with the clock stopped — about 3 seconds (4½ after a mistake) to
  read it — and **Next** (or Enter) goes on at once. A word whose English
  is its table's own name (かぞく *family* into Family) sits out.
- At the end: your time, the score, and the words sorted the wrong way
  ("Fruits, not Family"). ⏸ and End game work as in the other games.

</details>

<details>
<summary><b>Word chain</b></summary>

- しりとり: each word starts with the kana the one before it ends on, and
  you **type** it — nothing to pick from, so you have to recall a word.
  The chain so far runs along the top (each word as it's written, its
  reading under kanji, the kana it links on underlined); under it, "Starts
  with や" in large kana, with the last word and its English.
- Type in romaji and it turns into kana as you go, like a Japanese
  keyboard: `ya` → や, `shi` / `si` → し, a doubled consonant → っ
  (`kitte`), `n'` or `nn` → ん (`onna` → おんな), `-` → ー. Kana or kanji
  typed with a real Japanese keyboard work too. Return or ↑ answers.
- Any word in the whole vocabulary counts, not just *Words from* — a few
  tables rarely have a word for every kana. *Words from* picks the first
  word and the hints. Readings are compared in hiragana, and ー as the vowel
  it stretches, so `koohii` is コーヒー. A good word joins the chain as it's
  written (ごま油, not ごまあぶら).
- The rules are the usual children's-game ones (also behind the ⓘ on the
  card): a final ー doesn't count (コーヒー ends on ひ), a final small ゃゅょ
  counts as its big kana (でんしゃ ends on や), and か and が are different
  kana. A word ending in ん would end the chain, so it isn't accepted.
- A miss gets one line under the field and a shake: "Needs to start with
  や", "Not one of your words", "Already in the chain", "本 ends on ん — the
  chain can't go on", or that no word starts where it ends.
- **Hint** (beside ⏸) shows the English of one word that would work; ⋯ ›
  *Skip this link* plays one for you. *Words* is the number of links; a link
  counts as right only with no miss, hint or skip. At the end: the score,
  the whole chain on one line, and the links you missed. Hints show in its
  Stats.

</details>

### Stats

One screen per tab — **Puzzle stats** (Crossword / Arroword / Word search)
and **Game stats** (Match / Listening / Kana tiles / Odd one out / Speed sort / Word chain) — with a title menu for the
style, opening on the one you were playing:

- **Overview** — played / solved, time played, your day streak and longest,
  and the style's own measure: best pace per pair and fastest round (Match), accuracy
  (Listening, Kana tiles, Odd one out, Speed sort, Word chain), best time per word and hints used (puzzles).
- **Last 30 games** — one line, better always up, and "18% faster than your
  first 10 games" once there are 20 and it's true.
- **Personal bests** — one per setup (source · script · word count); tap one
  for its last ten games.
- **Tricky words** — the words you've missed in two or more games, across
  every puzzle and game (a wrong pair, a wrong answer, a letter or word
  revealed, a square Check marked wrong). **Practise these** starts the style
  you're looking at from just those words (Source reads *Tricky words*).
- **Reset** clears that style's stats and bests, on every device — an iOS
  action sheet asks first (**Reset Stats** or **Cancel**).

Practice only — nothing here touches your flashcard schedule.

<sub>[↑ Contents](#contents)</sub>

---

## Accounts and storage

The Practice page starts by asking you to pick one of two modes. The two
never mix.

|  | **Guest** | **Signed in** |
| --- | --- | --- |
| Where data lives | This browser's `localStorage` | Your own [Supabase](SUPABASE_SETUP.md) project, per account via Row Level Security |
| Network | None | Syncs; works offline and catches up on reconnect |
| First visit | Starts with the Fruits table added, so the Dashboard, study and Puzzles have something to show | Your own deck |
| Backup | Settings › Back up & restore (on iPhone the share sheet: Save to Files, AirDrop, Mail) | The account is the backup |
| Custom tables | — | Yes |
| New accounts | — | Off by default: the project's sign-ups are closed and `allowSignups: false` hides "Sign up" ([setup](SUPABASE_SETUP.md)) |

- **Local-first** — reviews, customisations and custom words apply
  immediately. Anything that couldn't sync is queued, survives a reload and
  retries on its own.
- **Sync status** — when everything is synced, the account button's dot is
  green and nothing else shows. Otherwise a chip at the top of Practice shows
  *Syncing N…*, or an amber *Offline* / *couldn't sync* with **Sync now**;
  **What's pending?** lists exactly what hasn't reached your account yet.
- **Nothing is hard-deleted**, except custom words and tables you delete
  yourself.
- The anon key in `js/config.js` is safe to commit, because Row Level
  Security protects the data. Never commit the service-role key.

Full storage model and schema: [`docs/architecture.md`](docs/architecture.md).

<sub>[↑ Contents](#contents)</sub>

---

## Development

Plain HTML, CSS and classic `<script>` tags — no framework, no bundler, no
build step. Everything hangs off one global, `window.RaumeStudy`.

```bash
npm run validate                    # every JS file parses + the vocab data is well-formed (no deps)
npm install && npm test             # jsdom smoke test of the whole page + service-worker test
node scripts/smoke-test.js games    # one area only: reference | flashcards | games
npm run generate:vocab-ids          # give new vocab rows their permanent ids
```

The smoke test can't reach Supabase, so check the signed-in path by hand.

**Deploying.** Pushing `main` publishes to GitHub Pages
(`.github/workflows/pages.yml`). Each asset's URL is stamped with a hash of its
own contents, so after a deploy a returning visitor downloads only the files
that changed; the service worker keeps the rest offline.

| Doc | Covers |
| --- | ------ |
| [`docs/architecture.md`](docs/architecture.md) | Vanilla-JS constraints, add-a-file checklist, layout, storage, PWA/offline, deploying |
| [`docs/design.md`](docs/design.md) | Type, palette, per-section tone, controls, dark mode |
| [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) | Setting up the optional account backend |

---

## License

The **code** is under the [PolyForm Noncommercial License 1.0.0](LICENSE); the
original **content** — the curated vocabulary and kanji tables and the
explanations (Help, ⓘ notes, these docs) — is under
[CC BY-NC-SA 4.0](LICENSE-CONTENT.md). Either way you may use, study, share and
adapt it for any noncommercial purpose; shared content needs credit and the same
licence. The `raume` name, wordmark and logo are reserved — see
[`NOTICE`](NOTICE). The Help page ends with a short Licences list.

Third-party parts keep their own licenses:

| Part | License |
| --- | --- |
| `ts-fsrs`, `supabase-js` | MIT (`vendor/*.LICENSE.txt`) |
| Lucide-derived icons | ISC (`vendor/*.LICENSE.txt`) |
| Inter, Space Grotesk | SIL Open Font License (`fonts/*.LICENSE.txt`) |
| Kanji stroke order (`data/kanji-strokes.js`) | Adapted from [KanjiVG](http://kanjivg.tagaini.net), © Ulrich Apel — [CC BY-SA 3.0](http://creativecommons.org/licenses/by-sa/3.0/) (`data/kanji-strokes.LICENSE.txt`); that file stays under CC BY-SA |
| Pronunciation audio (`audio/*.mp3`) | Generated with [VOICEVOX](https://voicevox.hiroshiba.jp/), voice VOICEVOX:四国めたん |
