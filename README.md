# raume

A fast, static reference for Japanese food, kitchen and N5 vocabulary, with an
FSRS-scheduled flashcards trainer built on top. Made for quick lookups while
cooking or studying, and for printing clean A4 study sheets.

**Live at [xxvazquez.github.io/raume](https://xxvazquez.github.io/raume/)**

[![Support raume on Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20raume-574d73?logo=ko-fi&logoColor=white)](https://ko-fi.com/raume)

|                 |                                                                  |
| --------------- | ---------------------------------------------------------------- |
| **Reference**   | Vocabulary, Grammar and Kanji tables — furigana, search, audio, print |
| **Practice**    | FSRS-6 flashcards (up to six directions per word, plus verb forms), a kana drill, puzzles and games |
| **Notes**       | My own class notes, private to my account                    |
| **Storage**     | Guest (this browser only) or a Supabase account that syncs       |
| **Stack**       | Plain HTML, CSS and `<script>` tags — no framework, no build step |

## Contents

- [Quick start](#quick-start)
- [The reference](#the-reference)
  - [Sections](#sections) · [Finding words](#finding-words) ·
    [Reading the tables](#reading-the-tables) · [Kanji](#kanji) ·
    [Options](#options) · [Making it mine](#making-it-mine) ·
    [Class notes](#class-notes) · [Around the app](#around-the-app)
- [Practice](#practice)
  - [How cards work](#how-cards-work) · [Reviewing](#reviewing) ·
    [Writing cards](#writing-cards) · [Screens](#screens) ·
    [Dashboard](#dashboard) · [Kana trainer](#kana-trainer) ·
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
| **Vocabulary** | The landing page: words grouped by topic — Around Town, Food & Ingredients, Kitchen & Dining, Numbers & Counting, People & Daily Life, Time & Calendar. People & Daily Life ends with **Everyday Sentences**: 211 N5 sentences, polite and casual (casual ones marked in grey) |
| **Grammar**    | How words change and join: Adjectives (い / な), Verbs (plain and polite), Particles, Question Words and This / That / Over There (こそあど) |
| **Kanji**      | The 102 N5 kanji in seven themes — see [Kanji](#kanji) |
| **Notes**      | My own class notes — see [Class notes](#class-notes) |
| **Practice**   | Flashcards, the Kana drill, Puzzles and Games — see [Practice](#practice) |

In sentence tables (Everyday Sentences) each row's ⓘ names
the grammar it shows.

### Finding words

| | |
| --- | --- |
| **Search** | One field for every section — Japanese, kana, romaji or English; <kbd>/</kbd> jumps to it. Results rank exact → starts with → ends with → contains, words before sentences, with the match highlighted. A single letter only finds words that start with it. A word that's also in a table of my own (a class table) shows once, in raume's table, with "Also in: Sakura" under its meaning. The search bar stays as it is while I type (**Tables** dims), and the results read as one list under one set of column headers. Clearing the search puts back the tables I had open. |
| **JLPT level** | Type **n5** … **n1** as a word of its own for that level's words: **n4** lists them all, **n4 eat** only those matching *eat*. **n0** finds the words not on the JLPT lists. |
| **What it understands** | Kana finds a kanji word by its reading (たべ → 食べる). Romaji works with or without long vowels and in a Japanese keyboard's spellings (*kohi*, *mittu*, *honnya*), and finds a verb's polite form (*tabemasu*). English matches where a word starts (*eat* finds *to eat*, not *heat*), a verb's *to* is never needed, and any one meaning typed whole is an exact match (*see* finds *to see, to watch* first). Only visible columns are searched, plus romaji. |
| **+ on a result** | Adds the word to flashcards; it turns into Practice's cards icon (tap again to pause). |
| **Recent searches** | Tap the empty field for my last eight — tap one to rerun it, **×** removes one, **Clear** all. Only searches I used (Return or a tap on a result) that found something are kept, on this device. |
| **Tables** | The list button in the pinned search bar: every table in the section, with entry counts, the one I'm in marked. |
| **Topic headers** | In Vocabulary, tap one to fold its tables away until I tap it again. Search still looks inside, and jumping to one of its tables opens it. |
| **Opening a table** | The row I tapped stays put. While it's open, its title pins under the search bar; closing it from there keeps my place. |
| **Back to top** | Tap the section I'm on to scroll to the top; tap again to go to its start. |
| **URL** | Follows the view (`#grammar`, `#kanji`, `#table-15`, `#practice`), so any view can be bookmarked. |

### Reading the tables

| | |
| --- | --- |
| **Columns** | **Japanese** (with furigana) and **English**. Tap a word for its **romaji**, or turn on Options › Show › **Romaji** for every row. Context for a meaning ("before a noun") follows the English in grey. |
| **Furigana** | Always shown. Consecutive kanji share one reading (三十三歳 → さんじゅうさんさい), and each reading starts where its kanji start. |
| **Katakana** | Hover or tap any katakana to see its romaji. |
| **Particles** | Blue and bold everywhere; tap one for how it’s read (は is “wa”). |
| **Speaker** | Plays a recorded native-voice clip; my own words use the device's voice. A particle on its own is said as a particle: は “wa”, へ “e” (歯, tooth, stays “ha”). |
| **Sorting** | The English header sorts A–Z / Z–A. Tables taught as a sequence (counting, days, こそあど, particles, family…) open in that order. |
| **Sentence tables** | A table of my own that's mostly sentences shows the Japanese on its own line, English under it. |
| **ⓘ on a row** | The row's grammar and its JLPT level in one popover — hidden while the English is covered, so it can't give the answer away. |
| **JLPT levels** | Each word carries its level, N5 to N1, from the widely used Tanos / Waller lists; what an N5 class teaches first (greetings, counters, numbers, dates, times, country names with their 〜人 and 〜語) counts as N5. A sentence takes the level of its grammar or of its hardest word, whichever is harder (〜てる, 〜にします, 〜ことがすき are N4). City and sight names, and foods the lists leave out, say plainly that they're **not on the JLPT lists** — topic words, as textbooks treat them, never given a guessed level. My own words — class tables included — take the level of the same word in raume's tables. |

The ⓘ lists:

| Badge | Meaning | Outlined when… |
| ----- | ------- | -------------- |
| **い** / **な** | Adjective type | It breaks the pattern: a な-adjective ending in い (きれい), or irregular いい |
| **五段** / **一段** / **変格** | u-verb, ru-verb, irregular verb | The group is easy to mistake (切る, 帰る), or the verb is 来る |
| **を** **に** **が** … | The particles a word takes, e.g. 聞く: を *what you listen to*, に *who you ask* | — |
| **Forms** | A verb's polite 〜ません, 〜ました, 〜ませんでした, its plain 〜ない, 〜た, 〜なかった (書かない, 行った, 来(こ)ない, ある → ない) and its て-form (行って, 来(き)て) | — |

Usage traps get a plain line of their own (多い doesn't go right before a
noun; 遊ぶ isn't for sports). Mimetic words (*mochimochi*) are 擬態語, not
adjectives, and get no badge.

### Kanji

| | |
| --- | --- |
| **Grid** | Each theme is a grid of tiles: the kanji, its on readings (katakana), kun readings (hiragana) and its first meaning (山 *mountain*); every meaning is in its sheet. Themes run in teaching order, kanji in natural order (一 二 三…). |
| **Kanji sheet** | Tap a tile: each reading with its romaji and a speaker, stroke count, radical, an example word, **Words with** it (every word that uses it) and **Add to flashcards**. The ⓘ beside **Readings** and **Writing** explains that card for a beginner. |
| **Stroke order** | The sheet draws the kanji stroke by stroke, each stroke numbered; **Replay** draws it again. |
| **Write it** | A pad under the drawing: draw each stroke in order. A right stroke snaps clean; a wrong one shakes and counts a miss; three misses shows it as a hint. **Outline** shows the kanji to trace (off for a real test). Then **Again** or **Next kanji**. Practice only. |
| **Known** | **Mark as known** turns the tile green with a check; the Dashboard counts them. Synced when signed in. |
| **Flashcards** | Two cards per kanji: meaning (山 → mountain) and one reading in romaji (*yama* or *san*). Kanji stay out of Puzzles. |

### Options

The **Options** button — a popover on desktop, a bottom sheet on a phone. A
dot on it means something is off its default.

| Option | Does |
| --- | --- |
| **Japanese / Furigana / English** | Hide a column (never both text columns). |
| **Romaji** | Every word's romaji under it, in every table. Off by default; a tap on a word still shows one. |
| **JLPT level** | **All levels**, or tick one level or several (N5 + N4) to show only their words — **Not on the lists** among them. Tables and topics without any of them step aside, and search keeps to them too. |
| **Cover answers** | Blanks the English (and the kanji readings); tap a row to reveal it. |
| **Show polite** | Switches verbs to 〜ます. Only while the Verbs table is open. |
| **Highlight progress** | The Known green and Tricky amber washes, on or off together. |
| **Expand all · Print** | Open every table; print the section or everything as A4. |
| **Legends** | **Row icons** (each glyph named) and **Row colours** (Known green, Tricky amber, Irregular red). |

### Making it mine

| | |
| --- | --- |
| **Hold a word** | Hold a row (or right-click it): **Play**, **Copy**, **Add to flashcards** / **Pause**, **Mark as known**, **Edit**, **Hide row**. |
| **Edit a word** | Change a built-in word's Japanese (readings in brackets: お茶(ちゃ)), romaji, English and grey note. It changes everywhere — tables, search, print, flashcards (history kept). **Restore original** undoes it. Synced when signed in. |
| **Known words** | A soft green wash. Mark them myself, or a word turns green once I've known its meaning in flashcards for three weeks. **Mark as not known** always wins. |
| **Tricky words** | A soft amber wash for a word I keep forgetting in flashcards. Known wins over it. |
| **Irregular words** | Exceptions (irregular verbs, 4 / 7 / 9) are written in red. |
| **Hide a row** | The eye icon takes a row out of view; **Show all** brings them back. |
| **Hide a table** | ⋯ › **Hide table** removes it from the pages, Tables list and search; **Show** on Customize brings it back. Flashcards aren't affected (that's Pause table). |
| **Undo** | Hiding, pausing or deleting shows **Undo** at the bottom for a few seconds. |
| **Icon names** | Point at an icon-only button, or touch and hold it, to see its name. |

**Customize** (the sliders icon; on a phone, the account menu):

| | |
| --- | --- |
| **Icon and colour** | About 165 icons or my own upload, and nine muted colours. Also from ⋯ › **Choose icon…** on a table. |
| **Name and order** | Rename any table; drag the grip (or ↑ / ↓) to reorder tables and categories. |
| **Add a word** | To any table. The **Table** picker searches by name or category, with recent picks on top. |
| **Import a list** | Paste text or a `.csv` / `.txt`, one word per line: `帰(かえ)る,kaeru,to return`. A verb can bring its polite form: `帰(かえ)る / 帰(かえ)ります,kaeru / kaerimasu,to go home`. Three columns pasted from a spreadsheet work too. Rows that don't parse are listed with the reason. |
| **New table** | Needs an account. Its **Category** is a Vocabulary category, Grammar, or a new one I name. |
| **Words you've added** | Search, sort, edit or delete my words (on a phone, swipe left). Deleting a word has **Undo**; deleting a table asks first. |

My own words work everywhere — furigana, search, print, audio, every
flashcard direction — and sync when signed in.

### Class notes

The **Notes** tab: my class notes as HTML files, **private to my
account** (Supabase behind Row Level Security — never in Git or on the public
site). Needs an account.

| | |
| --- | --- |
| **Add** | Pick where they're from (Sakura, WSJJ, Mine or none), then one or more `.html` files, up to 5 MB each. |
| **List** | Newest lesson first, by month. A note's date is its lesson date, else the file's; ⋯ › **Lesson date** changes it. **All · Sakura · WSJJ · Mine** filters once any note is marked. |
| **Lesson notes** | Notes built with `scripts/note_kit.py` are drawn as raume screens: one card per section — Grammar, Conversation, Vocabulary, Practice, Watch out, Reference — always in that order and colour. Word lists and practice pages fold; patterns, rules and tips always show. Tap the Japanese for romaji; the speaker reads a line. |
| **Reading bar** | **Quiz** covers the Japanese I should produce; the search glyph searches the note; **⋯** › **English** / **Furigana** cover or hide those lines. |
| **Edit** | Every line becomes editable, with ⊖ to delete a row. **Done** saves, **Cancel** puts it back. |
| **Search all notes** | The field over the list searches every note (offline too) and carries the search into the note I open. |
| **⋯ on a note** | **Add words to Practice** (the note's words raume has; sentences skipped), **Mark as**, **Rename**, **Lesson date**, **Replace**, **Delete** (asks first). |
| **Other HTML** | Older lesson-kit pages are drawn the same way. Anything else shows as written, in a sealed frame where nothing runs. |
| **Offline** | Every note is also kept on the device; signing out removes that copy. |

**Writing a lesson note.** A lesson file builds its sections from the kit's
components and calls `render()` with the lesson's date, which names the note
("Sat 21 Nov 2026"): `python3 private-notes/2026-11-21.py`. The kit checks
furigana and romaji and lists each word once. A class note (Sakura or WSJJ)
has no word lists — the kit writes the lesson's words to a `.csv` beside it
for **Import a list** into that class's table (Sakura or WSJJ): every word
of the lesson, even ones raume's own tables have, so the table is the list
of what that class taught. Lesson files stay in gitignored `private-notes/`.

### Around the app

| | |
| --- | --- |
| **Print** | A4: one table (its printer icon; ⋯ › Print on a phone), the section or everything (Options). Folded tables still print. |
| **Theme** | System, Light or Dark, applied before the first paint. |
| **Help** | The **?** at the top: four topics, then **Support raume** ([Ko-fi](https://ko-fi.com/raume)) and the licences. Practice has its own Help; on a phone, the account menu's **Help** opens the one for the screen I'm on. |
| **Text size** | Follows the iPhone / iPad text size, up to about a third larger; print keeps its own size. |
| **Screen sizes** | Phone: a tab bar at the bottom and a large title per screen. Tablet: captioned top icons. Desktop: a floating section bar at the top. |
| **Version** | The deployed commit and its date, at the foot of every page. |

The **account button** (the person icon; its dot is **green** when synced,
**amber** when something is waiting) opens one menu: who I'm signed in as,
**Account** (or **Sign in**), **Support raume** and **Sign out** — plus, on a
phone only, **Customize tables**, **Help** and **Appearance**. Sign out asks
first if something hasn't synced.

<sub>[↑ Contents](#contents)</sub>

---

## Practice

Flashcards, the Kana drill, Puzzles and Games. Cards reference a row's
permanent id (`v0001`…) rather than copying it. Add a whole table with **Add
to flashcards**, or single words from **Library** or a search result.

### How cards work

- Real **FSRS-6** scheduling via
  [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs).
- Up to six cards per word: **JP → EN · JP → Romaji · Romaji → EN ·
  EN → Romaji**, and two handwritten, **EN → Japanese (kana)** and
  **EN → Japanese (kanji)**. A verb can add two more, each asking a
  different form every time, typed in romaji: **Verb → polite form** (〜ません,
  〜ました, 〜ませんでした, the て-form) and **Verb → plain form** (〜ない, 〜た,
  〜なかった). Typed answers are romaji, unless I turn on **Answer in
  kana**.
- **Study directions** in Settings picks which I get; the handwritten two
  and verb forms are off until I turn them on.
- **Answer in kana** (Settings, per device) has EN → Romaji cards take the
  reading in kana instead: romaji I type turns into kana as I go, as a
  Japanese keyboard does, or type with a Japanese keyboard. It counts when it
  spells the reading or sounds like it (こうひい for コーヒー); the reveal
  shows the reading in kana.
- A session mixes everything due today (plus learning steps due within 20
  minutes) with the day's new cards, freshly shuffled, never the same word
  twice in a row. A review is ready all day on its due date, whatever hour it
  was set at.
- A new word starts **JP → EN**; its other directions join once I've seen
  it.

### Reviewing

```
card  →  type answer (or leave it blank), Return or ↑  →  verdict + answer (audio plays)  →  rate 1–4  →  next
```

- Every rating saves at once, so **End session** never loses progress.
- The field stays focused from card to card, so a phone keyboard stays open.
- After a wrong answer, **Again / Hard** come first; Good / Easy are dimmed
  but still one tap away for a typo.
- **Again** brings the card back a few cards later in the same session (Kana
  too).
- The navigation hides during a session; results are announced to screen
  readers.
- The wrap-up shows today's rings, cards · % right · minutes, and only real
  news (a streak day, words newly mastered, an award), with **Keep going**,
  **Play a game** and **Done**.

<details>
<summary><b>How answers are checked</b></summary>

- A wrong romaji answer highlights the letters that were off
  (`kaeramasu → kaerimasu`).
- Long vowels can be typed any way (`kōhī`, `koohii`, `kouhii`) but not left
  out: `obasan` (aunt) isn't `obāsan` (grandmother).
- Apostrophes, hyphens, spaces and curly quotes don't matter (`kin'en` /
  `kinen`, `deep fry` / `deep-fry`).
- A Japanese keyboard's spellings count — `tu`, `si`, `sya`, `cch`, `nn`,
  `m` before b / p — and the particles は / へ / を take `ha` / `he` / `wo`.
- Type only the meaning, never its grey note; brackets are optional, and so
  is a verb's "to" and a meaning's `~` (*that ~* takes `that`).
- A word's meanings are a comma list (*job, work*): any one counts, or
  several together. A word with two readings (四: *yon / shi*) takes either.
- A noun + suru verb takes its optional を (`ryouri o shimasu`).
- Not graded, just asked again: the right answer in the wrong language, or
  on English → Romaji another word with the same meaning (*easy*: やさしい /
  かんたん).
- Romaji → English accepts the meaning of any word spelled the same
  (*atsui*: 暑い / 熱い / 厚い) and lists the others under **Same sound**.

</details>

<details>
<summary><b>What the answer reveals</b></summary>

- Japanese → English shows the English under the word (a miss shows the
  right meaning first, then what I typed), with the romaji underneath — or
  a bare kanji's kana reading.
- Romaji and English prompts reveal the Japanese, always with its furigana.

</details>

### Writing cards

**English → Japanese** cards are written on a pad — best with a pen, but a
finger or mouse works. Under the English, one square per character; write
each character stroke by stroke, in order.

- **(kana)** writes the reading: 水 → みず, loanwords in katakana.
- **(kanji)** writes the word as spelled: 水, 食べる. Only for words with
  kanji.
- Strokes are checked as in Kanji's **Write it**, but with no outline. A
  finished character drops into its square; **Undo** takes back a stroke.
- The last stroke checks the card (*Written cleanly*, *Written · 2 misses*)
  and shows the other spelling. A hint or **Show answer** counts as a miss.
- With an Apple Pencil, touches are ignored once the pen has drawn, so a
  resting palm doesn't count.
- Not for counters (〜) or words with two readings.

### Screens

Five segments — **Dashboard**, **Kana**, **Puzzles**, **Games**, **Library** —
with **Settings** and **Help** beside the title (on a phone, in the account
menu). Settings, Help, Awards and Stats slide in as pushed screens with a
**‹** back button.

| Screen | What it does |
| --- | ------------ |
| **Library** | Every table by category, filtered All / My flashcards / Archived. Add a table (**Pause** it under My flashcards), **Add all** a category, or open a table for single words — on a phone, swipe a word left for Pause / Add / Restore |
| **Settings** | Study directions, **Answer in kana** (per device), and FSRS settings (retention, max interval, fuzz — on by default — new cards per day), separately for words and kana. **App icon › Badge** shows the cards to study on the app's icon (off by default, per device). **Back up & restore** saves one JSON file (on iPhone, Save to Files / iCloud Drive), its row saying when this device last made one: a guest's copy of this browser, or everything in the account, notes included. Changes save as I make them |
| **Help** | Adding & pausing, Library icons, reviewing, Dashboard, each tab, syncing |
| **Awards** | Every award by kind — from the Dashboard's **Show all** |
| **Stats** | Per puzzle or game style — see [Stats](#stats) |

**Pausing** keeps everything: a paused word moves to *Archived*, a paused
table drops out of reviews until I resume it, and FSRS history is always
kept. **Undo** takes a pause back.

### Dashboard

| Card | Shows |
| --- | --- |
| **Today's rings** | **Review** (today's due cards done), **Learn** (new cards, of my daily number) and **Play** (a finished puzzle or game), beside how many cards **Study now** holds |
| **Study from** | Once my cards span two tables or two JLPT levels: **All flashcards**, one JLPT level's words (**N5 words**…), the easiest levels together (**N5 + N4 words**, **N5 + N4 + N3 words**…), **Words not on the JLPT lists**, or one table. Study now follows it; everything else still counts all cards |
| **Streak** | One streak for all study — a day counts for a flashcard review, a kana review or a finished puzzle or game (one ended early doesn't). Days in a row, this week as seven dots, and my best |
| **Progress** | Kana started, Kanji known, Words mastered, cards, reviews and retention (FSRS's forecast; coral with ↓ under my target) |
| **Awards** | The newest six and the nearest to go; **Show all** for the rest |
| **Highlights** | One line, only when there's news |

Under **Details**: card progress, reviews this week, due next 7 days,
**Trends** (last 90 days against my year — reviews a day, recall, study
days a week — after 120 days of history), Kana (every basic kana started —
the same count as Kana started — and how many to study now), Puzzles and
Games (results, how many this week, the last three, **See stats**), Kanji, **JLPT
levels** (each level's words in the reference — and the words not on the
lists — and how many are Known, once one is; each word counts once however
many tables hold it, and sentences stay out),
**Missed today**, **Leeches**
(forgotten 8+ times; *Pause* or *Keep*) and **Words to review**.

### Kana trainer

The tab opens on its own **Study now** card, then the groups to drill —
**gojūon, dakuten, handakuten, yōon, sokuon** — for each script, plus
katakana's **chōon** (long-vowel ー words) and **foreign sounds** (ファ, ティ, ヴァ …). See a kana,
type its reading in romaji (common alternates like `si` count; vowel length
counts too). Same review card as words, with its own FSRS settings.

### Puzzles

**Crossword**, **Arroword** or **Word search**, built fresh each time from at
least 6 words. Clues that give the answer away are left out. Nothing is
scheduled.

The tab opens on a **setup screen**: the puzzle, then these rows, **Start**
(off, with the reason, until there are enough words) and [Stats](#stats).
Choices are remembered on this device.

| Setting | Choices |
| --- | --- |
| **Words from** | *Flashcards* (leaning toward words I'm still learning) or any number of tables, in or out of flashcards |
| **JLPT level** | *All*, or tick one level or several (N5 + N4, or *Not on the lists*) to play only their words. Puzzles and every game, Sentences included (its sentences' levels) |
| **Script** | *Romaji* (long vowels spelled out: *koohii*), *Japanese* (as written — Match and Word search only), *Hiragana* or *Katakana*. A word is never forced into a script it isn't written in |
| **Word count** | 10–40; Match and Listening up to 100 or *All* |

In play, one toolbar row: **‹** and the name (back to setup), **Hint**,
**Check** and **⋯** (*New puzzle*, *How to play*, *Reveal*, *Clear*, *Save as
PDF*, *Stats*). On a wide window the clue lists and a scratch **Notes** pad
sit beside the grid.

<details>
<summary><b>Crossword / arroword</b></summary>

- Tap a square or clue and type; tap a crossing square again to switch
  direction. On a hardware keyboard, romaji turns into kana in a kana grid.
- A right square turns green; the last right square solves it.
- Keys: arrows move, Tab / Shift-Tab next / previous word, Space switches
  direction, Backspace steps back, Delete clears.
- **Hint** fills the square I'm on (or the next wrong one); **Check**
  marks filled squares.
- **Save as PDF**: an A4 worksheet with an Answers page (on a phone, the
  share sheet).
- A solve goes to the Dashboard and Stats; *Reveal* doesn't count.

</details>

<details>
<summary><b>Word search</b></summary>

- Only the English is given; words run in all eight directions, and spare
  squares use the answers' own letters.
- Drag across a word, or tap its first and last letter. **Hint** reveals one.
- Finding them all counts — unless every word was revealed.

</details>

### Games

**Match**, **Listening**, **Kana tiles**, **Odd one out**, **Speed sort**,
**Word chain** and **Sentences** — same setup screen and toolbar as Puzzles. On a keyboard,
arrows move, Enter or Space picks and 1–4 picks a choice. Switching tab
pauses a game; coming back finds it where I left it. Nothing is scheduled;
every finished game goes to the Dashboard and [Stats](#stats).

A right answer washes green with a ✓, a wrong one red with a ✕. Five dots by
the counter fill with each right answer in a row. No sounds, points or
confetti; reduced motion is honoured.

<details>
<summary><b>Match</b></summary>

- Tap a word, then its meaning. A wrong pair shakes and adds a second.
- Rounds of up to 6 pairs, with a break between them; **⏸** pauses.
- A chip by the clock says how far ahead or behind my best I am.
- The end card: my time, pairs, misses, and a pace medal — **gold** under
  2s a pair, **silver** under 3s, **bronze** under 4s — with my last ten
  games on the same words.

</details>

<details>
<summary><b>Listening</b></summary>

- Tap **▶** to hear a word and pick its English from four; nothing written
  shows until I answer.
- The end card: score, accuracy against my average, and the missed words
  to hear again.

</details>

<details>
<summary><b>Kana tiles</b></summary>

- Spell the word from a bank of its kana plus 3 look-alike decoys.
- Tap a placed tile to take it back. A miss (or **Show answer**) shows the
  spelling and the word comes back at the end. Hiragana or katakana only.

</details>

<details>
<summary><b>Odd one out</b></summary>

- Four words, three from one table: tap the odd one. Answering names the
  tables ("*imoto* is Family — the rest are Drinks").
- Needs two or more themed tables.

</details>

<details>
<summary><b>Speed sort</b></summary>

- Tap the bucket each word belongs in, against the clock. **Sort by** picks
  the buckets: *Tables*, *Adjectives* (い / な) or *Verbs* (u / ru /
  irregular).
- A wrong tap adds a second. Each answer shows the English with the clock
  stopped; **Next** or Enter goes on.

</details>

<details>
<summary><b>Word chain</b></summary>

- しりとり: type a word that starts with the kana the last one ended on.
  Romaji turns into kana as I type; **あ | ア** picks the script.
- Any word in the whole vocabulary counts; *Words from* picks the first word
  and the hints.
- Rules (also behind the ⓘ): a final ー doesn't count, a final small ゃゅょ
  counts as its big kana, and a word ending in ん isn't accepted.
- **Hint** shows one fitting word's English, then the word; ⋯ › *Skip* plays
  a link for me. Only a link with no miss, hint or skip scores.

</details>

<details>
<summary><b>Sentences</b></summary>

- **Exercise** picks how I practise the Everyday Sentences table:
  - *Build*: see the English, tap the Japanese pieces into order. The pieces
    carry their furigana; particles are blue. Tap a placed piece to send it
    back. Sentences of three pieces or more.
  - *Particles*: the sentence with each particle a circle to fill, from six
    particle buttons. The circles fill left to right; tap one to clear it.
    Only grammar particles and a question's closing か are blanks — never
    よ / ね / な, which are tone, not rules.
  - *Verb form*: the sentence's verb is a blank; pick its form from four of
    the same verb, always in the same places — present on top, past below,
    the negative on the right (ます / ません / ました / ませんでした, the
    plain る / ない / た / なかった, or たい / たくない / たかった /
    たくなかった). Only the English tells them apart. 71 sentences, each
    with its verb marked by hand.
  - *Meaning*: read the Japanese (▶ plays it) and pick its English from
    three. The wrong two are the sentences that look most like it — the
    same words or pattern, a question among questions, from either
    register — never one that means the same. The romaji shows once I
    answer.
- **Register** picks *Polite*, *Casual* or both; no *Words from*.
- Each answer shows the romaji and ▶ (and, after a miss, the sentence as it
  should be). A miss (or **Show answer**) comes back at the end; missed
  sentences join Tricky words. A sentence whose Japanese I edited sits out
  of Build and Verb form, whose pieces no longer match it.

</details>

### Stats

**Puzzle stats** and **Game stats**, with a title menu for the style:

- **Overview** — played / solved, time, day streak, and the style's own
  measure (best pace, accuracy, or best time per word).
- **Last 30 games** — one trend line.
- **Personal bests** — one per setup; tap one for its last ten games.
- **Tricky words** — words missed in two or more games; **Practise these**
  plays just them.
- **Reset** — clears that style's stats on every device, after asking.

Nothing here touches my flashcard schedule.

<sub>[↑ Contents](#contents)</sub>

---

## Accounts and storage

Practice starts by asking me to pick one of two modes. The two never mix.

|  | **Guest** | **Signed in** |
| --- | --- | --- |
| Where data lives | This browser's `localStorage` | My own [Supabase](SUPABASE_SETUP.md) project, per account via Row Level Security |
| Network | None | Syncs; works offline and catches up on reconnect |
| First visit | Starts with the Fruits table added | My own deck |
| Backup | Settings › Back up & restore — restoring replaces this browser's data | Settings › Back up & restore — one file with every note, card, review and setting; restoring merges (adds what's missing, never deletes) |
| Custom tables, class notes | — | Yes |
| New accounts | — | Off by default: `allowSignups: false` hides "Sign up" ([setup](SUPABASE_SETUP.md)) |

- **Local-first** — every change applies immediately; anything that couldn't
  sync is queued, survives a reload and retries on its own.
- **Nothing unsynced is lost** — signing out (or the session ending offline)
  keeps queued changes on this device, hidden from anyone else, until I
  sign in here again.
- **Sync status** — the account dot is green when synced. Otherwise a chip on
  Practice shows *Syncing N…*, *Offline* or *couldn't sync* with **Sync
  now**; **What's pending?** lists what hasn't reached my account.
- **Nothing is hard-deleted**, except my own words and tables I delete.
- The browser is asked to keep raume's storage when space runs low.
- The anon key in `js/config.js` is safe to commit (RLS protects the data).
  Never commit the service-role key.

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
(`.github/workflows/pages.yml`). Each asset's URL carries a hash of its
contents, so a returning visitor downloads only what changed.

| Doc | Covers |
| --- | ------ |
| [`docs/architecture.md`](docs/architecture.md) | Vanilla-JS constraints, add-a-file checklist, layout, storage, PWA/offline, deploying |
| [`docs/design.md`](docs/design.md) | Type, palette, per-section tone, controls, dark mode |
| [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) | Setting up the optional account backend |

---

## License

The **code** is under the [PolyForm Noncommercial License 1.0.0](LICENSE.md); the
original **content** — the curated vocabulary and kanji tables and the
explanations (Help, ⓘ notes, these docs) — is under
[CC BY-NC-SA 4.0](LICENSE-CONTENT.md). Either way you may use, study, share and
adapt it for any noncommercial purpose; shared content needs credit and the same
licence. The `raume` name, wordmark and logo are reserved — see
[`NOTICE`](NOTICE).

Third-party parts keep their own licenses:

| Part | License |
| --- | --- |
| `ts-fsrs`, `supabase-js` | MIT (`vendor/*.LICENSE.txt`) |
| Lucide-derived icons | ISC (`vendor/*.LICENSE.txt`) |
| Inter, Space Grotesk | SIL Open Font License (`fonts/*.LICENSE.txt`) |
| Kanji and kana stroke order (`data/kanji-strokes.js`, `data/kana-strokes.js`) | Adapted from [KanjiVG](http://kanjivg.tagaini.net), © Ulrich Apel — [CC BY-SA 3.0](http://creativecommons.org/licenses/by-sa/3.0/) (`data/kanji-strokes.LICENSE.txt`); those files stay under CC BY-SA |
| Pronunciation audio (`audio/*.mp3`) | Generated with [VOICEVOX](https://voicevox.hiroshiba.jp/), voice VOICEVOX:四国めたん |
