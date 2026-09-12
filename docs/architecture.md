# Architecture

## Constraints

- **Vanilla JS, no build.** Classic `<script>` tags loaded in a fixed order (see
  the comment block in `index.html`). No bundler, no ES modules, no TypeScript.
  Everything works from `file://`.
- **One global.** Everything hangs off `window.RaumeStudy`, with a sub-namespace
  per area (`.data`, `.config`, `.shared`, `.vocab`, `.flashcards`, …). A file
  may only read namespaces populated by a file loaded *above* it in
  `index.html`. Vendored libraries keep their own globals (`window.FSRS`,
  `window.supabase`).
- **Strict CSP.** `style-src 'self'` with no `'unsafe-inline'` — inline
  `style="…"` attributes are blocked, and the smoke test asserts there are zero
  of them. All positioning and styling goes through CSS classes. `img-src` also
  allows `data:` so uploaded table icons can be data URLs.
- **Cache-busting.** Asset URLs carry `?v=__CACHEBUST__`; the Pages workflow
  replaces the literal token with the commit SHA on deploy. Leave the token in
  source.

## Adding a JS file

Update **all** of these or `npm test` fails:

1. `index.html` — the `<script>` tag *and* the load-order comment block
2. `sw.js` — the `VERSIONED` precache list
3. `scripts/sw-test.js` — `REFERENCE_SHELL` or `FLASHCARDS_SHELL`
4. `package.json` — add a `node --check` to the `validate` script

## Data and storage model

Built-in vocabulary content lives only in Git. Both storage modes hold nothing
but a reference to it (`vocab_id`) plus the user's own learning data — never a
copy of row content. The **one exception is custom vocabulary** (words and
tables the reader authors on the Customize page): that content has no home in
Git, so it is stored — in `localStorage` for a guest, in Supabase for a signed-in
account. See "Custom vocabulary" below.

```mermaid
flowchart LR
    subgraph git["Git — data/vocabulary.js"]
        V["Built-in vocabulary entries<br/>permanent id, e.g. v0001"]
    end
    subgraph guest["Guest mode"]
        LS[("localStorage<br/>raume-flashcards-guest-v1 / raume-kana-v1<br/>raume-custom-vocab-guest-v1")]
    end
    subgraph account["Signed-in mode"]
        SB[("Supabase Postgres<br/>flashcards / review_logs / flashcard_settings<br/>kana_cards / kana_review_logs<br/>custom_tables / custom_rows")]
        Cache[("localStorage<br/>read-through cache + offline outbox")]
    end

    V -. "referenced by vocab_id, never copied" .-> LS
    V -. "referenced by vocab_id, never copied" .-> SB
    SB -- "read-through" --> Cache
    Cache -. "queued reviews synced back when online" .-> SB
```

- **Guest mode** — `localStorage` only (`raume-flashcards-guest-v1`,
  `raume-kana-v1`), no network.
- **Signed in** — Supabase Postgres is the sole authoritative store, scoped per
  account by Row Level Security. `localStorage` is a read-through cache plus an
  offline outbox: reviews made offline are computed locally, queued, and synced
  on reconnect (`syncOutbox` / `syncKanaOutbox` in `data-ops.js`). Each queued
  review is synced under a 20s timeout so a half-open connection can't leave the
  flag stuck and block every future retry; a review whose card no longer exists
  on the server (FK violation) is dropped rather than wedging the queue. The two
  modes never mix.
- The schema is [`supabase/schema.sql`](../supabase/schema.sql) — seven tables
  (`flashcards`, `review_logs`, `flashcard_settings`, `kana_cards`,
  `kana_review_logs`, `custom_tables`, `custom_rows`), all under RLS.
  `flashcard_settings` also holds the FSRS knobs, the streak counters,
  `kana_prefs` (the Kana picker), `kana_fsrs` (the Kana trainer's separate FSRS
  knobs) and `paused_tables` (the tables paused as a unit — see below). Setup
  guide: [`SUPABASE_SETUP.md`](../SUPABASE_SETUP.md).
- On first sign-in, guest progress is seeded up **once** — unless the account
  already has cards, in which case the account wins and guest data is ignored.
- **Table customisations** (names / icons / order) follow the same pattern:
  `localStorage` is the immediate source of truth; signed in, they also sync via
  a `table_custom` column on `flashcard_settings`. Sign-in merges per table —
  account wins for tables it has; guest customisations for other tables are
  pushed up, not dropped.
- **Custom vocabulary** (`js/vocab/custom-vocab.js`, `RaumeStudy.customVocab`) —
  the reader's own rows and tables. Two `localStorage` keys, mirroring the
  flashcards cache split: `raume-custom-vocab-guest-v1` (guest = authoritative)
  and `raume-custom-vocab-cache-v1` (signed-in = read-through cache of the
  `custom_tables` / `custom_rows` tables). A custom row's permanent id is
  `cv-<uuid>` and is what `flashcards.vocab_id` references, exactly like a
  built-in `v0001`; a custom table's id is `ct-<uuid>`. ids are
  client-generated (offline-safe), so both Supabase tables key on `text`, not
  `uuid`. `custom_rows.target_table` is a built-in table id as text (`"3"`) or a
  `custom_tables.id`. `applyToDataset()` merges every custom table/row straight
  into `RaumeStudy.data.vocabularyTables` (marked `__custom`) before the
  reference page renders and again whenever custom vocab changes or syncs, so
  every downstream feature — search, print, furigana, speech, the flashcards
  index — treats a custom word as just another row. Guests can add rows only
  (no custom tables); guest rows migrate up on first sign-in, like guest
  flashcard progress. Deleting a custom row/table is a real delete (no learning
  history on the content itself to keep).
- Each vocab entry maps to up to four independently scheduled cards (jp-en,
  jp-ro, ro-en, en-ro), never Japanese-to-type. Rows whose romaji is still kana
  get jp-en only. Pausing a word ("archive") keeps the FSRS state and full
  history forever; there is no hard delete.
- **Pausing a whole table** ("Pause table" in Manage) is an *overlay*, not a
  state on the cards: a flat list of table ids in `getCache().pausedTables`
  (synced to the `paused_tables` column). `studyableCards()` (scheduling.js)
  filters out any card whose table is in that list, so the queue and every stat
  tile skip it; the Manage filters hide it from "My flashcards" / "Archived".
  Each card's own `active` flag is untouched, so **Resume table** is a clean
  revert — a word paused individually before the table pause is still paused
  individually after. Sign-in unions the two lists (a device's pauses aren't
  dropped).

### localStorage keys

All prefixed `raume-` (`raume-theme`, `raume-show-polite`,
`raume-table-custom`, `raume-custom-vocab-*`, `raume-flashcards-*`,
`raume-kana-*`, `raume-customize-open-v1` — which of the Customize page's
collapsible sections a reader has open, keyed per item, browser-local only
(not part of the account sync any of the others above get)). Installs from
before the `sakura` → `raume` rename are migrated once by
[`js/storage-migration.js`](../js/storage-migration.js), the first `<head>`
script — it moves each key across and drops the old name.

## Project layout

```
index.html             page shell; the <script> block documents load order
css/site.css            all styling + A4 print rules
js/
  storage-migration.js  moves old sakura- localStorage keys to raume- (<head>)
  theme-init.js         sets the theme in <head>, before first paint
  config.js             Supabase URL + anon key
  shared.js             cross-feature helpers (HTML escape, pronunciation playback)
  sw-register.js        service-worker registration
  vocab/                the reference page
    kana-romaji.js       kana → romaji converter (the reading layer)
    icons.js             curated line-icon set (a Lucide subset)
    icon-picker.js       the reusable icon picker
    table-custom.js      per-table names / icons / starred rows
    custom-vocab.js      the reader's own rows / tables, merged into the dataset
    customize.js         the Customize page
    render.js            tables, nav, sorting
    interactions.js      routing, search, view modes, print, theme
  flashcards/            the Flashcards feature
    store.js             state + local storage
    vocab-index.js       lookup + answer checking
    scheduling.js        FSRS-6 + the session queue
    data-ops.js          auth, Supabase sync, guest store, streak
    dashboard.js         the Dashboard tab + the review session
    views.js             the Manage / Settings / Help tabs
    kana-data.js         built-in kana tables + practice groups
    kana.js              the Kana tab
    bootstrap.js         app shell + init
data/vocabulary.js      the vocabulary as plain data; every row has a permanent id
                        (adjective rows also carry adj:"i" / adj:"na" for the type pill)
vendor/                 vendored ts-fsrs + supabase-js
fonts/                  self-hosted Inter + Space Grotesk (SIL OFL)
audio/                  prerendered pronunciation clips — see "Pronunciation audio" below
                        (not committed until generated; absent means Web Speech only)
supabase/schema.sql     Postgres tables + Row Level Security
sw.js                   service worker (offline app shell)
manifest.webmanifest    PWA manifest
favicon.png             48px favicon (index.html links this, not logo.png)
icons/                  PWA app icons — see scripts/generate-icons.py
logo.png                master mark; source art for the favicon + icons, not served
scripts/                vocab validator, id + icon + audio generators, smoke + SW tests
```

## Pronunciation audio

Every built-in word/phrase reading gets a prerendered clip so playback sounds
like a native speaker instead of the robotic-ish Web Speech API; anything not
in `data/vocabulary.js` (custom/imported vocab) has no clip and always uses
Web Speech.

- **Engine**: [VOICEVOX](https://voicevox.hiroshiba.jp/) — free, no account,
  no API key, runs as a local HTTP server. Generation only ever happens in
  `.github/workflows/generate-audio.yml`, triggered manually from the Actions
  tab; it is never part of `pages.yml` or any push-triggered deploy, and
  never runs on a contributor's machine automatically.
- **Filenames are content-addressed**: `scripts/generate-audio.js` computes
  `audio/<hash>.mp3` from an FNV-1a hash of `AUDIO_GEN_VERSION + "|" +
  <reading text>`, plus `audio/manifest.json` (the sorted list of hashes that
  exist). `js/shared.js` computes the identical hash at runtime and plays the
  file when the manifest lists it — the two copies of the hash function and
  `AUDIO_GEN_VERSION` **must be bumped together** if the voice or synthesis
  params ever change, so old and new audio never collide under one hash.
  Readings come from the same segments `jpReadingOf` already builds for the
  Web Speech fallback (kanji read via its furigana, never guessed).
- **Regenerating** (from the GitHub Actions tab, "Generate pronunciation
  audio" workflow):
  1. Run with mode `preview` — asks the engine's own `GET /speakers` for its
     real character/style list (never hardcoded — the id-to-character
     mapping lives in the compiled voice library, not anywhere source code
     can see it), picks a handful of "ノーマル" (Normal) styles, and
     synthesizes the sample words in each. Download the `audio-preview`
     artifact: the clips plus a `PREVIEW_SPEAKERS.txt` naming which speaker
     id is which character, straight from the engine.
  2. Listen, then run again with mode `full` and the chosen `speaker_id`
     input — generates every vocabulary reading in that one voice, and
     prunes any clip whose reading no longer exists.
  3. Download the `audio-full` artifact and unzip it over `audio/` in the
     repo (replaces `manifest.json`, adds/removes `*.mp3`). The workflow does
     not commit anything itself — commit `audio/` normally afterward.
- **Licensing**: VOICEVOX's character voice libraries require a credit line
  naming the voice wherever the audio is used. **Once a voice is chosen,
  update the credit in `README.md`'s License section** to
  `VOICEVOX:<character name>` for that specific voice.
- **Caching**: `sw.js` keeps prerendered clips in their own `raume-audio-v1`
  cache, separate from the per-deploy `raume-<sha>` cache — content-addressed
  filenames never change, so this cache survives a normal deploy instead of
  being wiped and re-downloaded every time. Clips are cached lazily (on first
  play), not precached at install, keeping the initial install small.

## PWA and offline

Installable and offline-capable once visited.

- **Android / Chrome / Edge** show an install prompt automatically; `sw.js`
  precaches the app shell and caches versioned assets as you browse.
- **iOS / Safari** — Share → Add to Home Screen. The `apple-touch-icon` and
  `apple-mobile-web-app-*` tags in `index.html` handle the icon, name, and
  chrome-less launch.
- The service-worker cache is named `raume-<sha>` — one per deploy, previous one
  dropped on activate. Only the precache list in `sw.js` has to stay in sync
  with what `index.html` requests.
- App icons and the favicon are generated from `logo.png` (the master mark, a
  circular sun-over-water motif) by `scripts/generate-icons.py`: cropped to its
  bounding box, padded square, centred on an opaque `#f4f6f8` tile — 192/512
  plain, 192/512 maskable (inside the 80% safe zone), a 180 for iOS, and a 48px
  `favicon.png`. `logo.png` itself is not served. Rerun the script after editing
  `logo.png`; it needs Pillow + NumPy (dev-time only).

## Development

```bash
npm run validate            # check every JS file parses + the vocab data is well-formed (no deps)
npm install && npm test     # render the page in jsdom and exercise it; runs the SW test too
npm run generate:vocab-ids  # assign ids to any new vocab rows
npm run generate:icons      # rebuild the favicon + PWA icons from logo.png (Pillow + NumPy)
npm run vendor:libs         # re-copy the vendored libs after a version bump
```

- Run `validate` before committing data changes, and `test` before anything
  touching `js/vocab/` or `js/flashcards/`.
- The smoke test (`scripts/smoke-test.js`) is DOM-coupled — expect to update its
  assertions when the markup changes on purpose, and add coverage for new
  behaviour. It **cannot** reach Supabase, so the signed-in path needs a manual
  check.
- Testing the service worker needs a real server (`python3 -m http.server`) —
  browsers won't register one on `file://`. Everything else works from `file://`.

## Deploying

Pushing `main` triggers the GitHub Pages workflow
(`.github/workflows/pages.yml`), which swaps the cache-busting token for the
commit SHA and deploys. Set the repo's Pages source to "GitHub Actions" once.

`.github/workflows/generate-audio.yml` is separate and manual-only
(`workflow_dispatch`, not triggered by push) — see "Pronunciation audio"
above. It never runs as part of a deploy.
