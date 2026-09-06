-- raume study: Flashcards schema
--
-- Run this once in your Supabase project's SQL editor (Dashboard -> SQL Editor
-- -> New query -> paste -> Run). See SUPABASE_SETUP.md for the full setup walkthrough.
--
-- Supabase is the sole authoritative store for user learning data. It never
-- holds a copy of the vocabulary itself (that stays in data/vocabulary.js, in
-- Git) -- only a reference to each entry's permanent id ("v0001", ...) plus
-- the per-user FSRS scheduling state, review history, and settings.

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vocab_id text not null,
  direction text not null check (direction in ('jp-en', 'jp-ro', 'ro-en', 'en-ro')),
  -- Removing ("pausing") a vocab entry sets active = false; a row is never
  -- deleted. Re-adding the same entry flips this back to true and leaves
  -- every FSRS field and its review history below untouched.
  active boolean not null default true,
  -- FSRS-6 Card fields (see ts-fsrs's Card type) -- state: 0 New, 1 Learning,
  -- 2 Review, 3 Relearning.
  state smallint not null default 0,
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  scheduled_days integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  learning_steps integer not null default 0,
  last_review timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, vocab_id, direction)
);

create index if not exists flashcards_user_due_idx on public.flashcards (user_id, due) where active;
create index if not exists flashcards_user_vocab_idx on public.flashcards (user_id, vocab_id);

create table if not exists public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null references public.flashcards (id) on delete cascade,
  -- Client-generated UUID, one per review attempt. Lets an offline review
  -- that gets synced more than once (a retried sync after a dropped
  -- connection, for example) be inserted at most once.
  client_review_id text not null,
  -- Mirrors ts-fsrs's ReviewLog exactly (FSRS-6: no elapsed_days field --
  -- that's a v5-era field this version doesn't produce).
  rating smallint not null,
  state smallint not null,
  due timestamptz,
  stability double precision,
  difficulty double precision,
  scheduled_days integer,
  learning_steps integer,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, client_review_id)
);

create index if not exists review_logs_card_idx on public.review_logs (card_id, reviewed_at);

create table if not exists public.flashcard_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  schema_version integer not null default 1,
  -- FSRS scheduling settings -- the only user-tunable FSRS knobs. The
  -- trained weights ("w") are never stored or exposed here; they always
  -- come from ts-fsrs's own generatorParameters() defaults.
  fsrs_request_retention double precision not null default 0.9,
  fsrs_maximum_interval integer not null default 36500,
  fsrs_enable_fuzz boolean not null default false,
  -- Session/queue setting -- NOT part of FSRS itself, kept in its own
  -- clearly-named column so it's never confused with the FSRS settings above.
  queue_new_cards_per_day integer not null default 20,
  -- Daily study streak -- also not an FSRS concept, just a motivational
  -- counter of consecutive calendar days with at least one review.
  -- last_study_date is a plain date (no time/timezone) compared against the
  -- viewer's own local "today" client-side.
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_study_date date,
  updated_at timestamptz not null default now()
);

-- Schema changes after the initial release are appended here as
-- `alter table ... add column if not exists ...` (never edited into the
-- create table above) specifically so this whole file stays safe to paste
-- and re-run in full any time it changes, without dropping or recreating
-- anything -- including on a project that's already live with real data.
--
-- Study Directions (Settings): which of the 4 directions get studied.
-- Independent of FSRS itself and of which cards exist -- turning one off
-- only changes what the queue/stats pull in, never deletes or resets a
-- card's own state or history.
alter table public.flashcard_settings add column if not exists enabled_jp_en boolean not null default true;
alter table public.flashcard_settings add column if not exists enabled_jp_ro boolean not null default true;
alter table public.flashcard_settings add column if not exists enabled_ro_en boolean not null default true;
alter table public.flashcard_settings add column if not exists enabled_en_ro boolean not null default true;

-- Per-table personalisation for the vocabulary page (the icon you pick for a
-- table header, keyed by the table's permanent id). Not a flashcards concept
-- -- it just rides along in this per-user settings row so it syncs across
-- devices without a table of its own. Shape: { "<tableId>": { "icon": "..." } }.
alter table public.flashcard_settings add column if not exists table_custom jsonb not null default '{}'::jsonb;

-- Kana trainer (the Flashcards "Kana" tab) group + direction picker state, so
-- it follows you across devices like the other settings. Shape:
-- { "groups": ["hira-gojuon", ...], "dirs": { "k2r": true, "r2k": true } }.
alter table public.flashcard_settings add column if not exists kana_prefs jsonb not null default '{}'::jsonb;

-- Kana trainer FSRS knobs -- the same three the vocab cards expose plus a
-- daily new-card cap, kept in their own column so the two trainers can run
-- different retention targets. Empty {} means "use the defaults". Shape:
-- { "fsrs_request_retention": 0.9, "fsrs_maximum_interval": 36500,
--   "fsrs_enable_fuzz": false, "new_per_day": 15 }.
alter table public.flashcard_settings add column if not exists kana_fsrs jsonb not null default '{}'::jsonb;

-- Whole tables paused as a unit ("Pause table" in Manage). A flat list of
-- vocabulary table ids -- an overlay, not a state on the cards: the cards keep
-- their own active/archived flag, this just holds the table out of review and
-- the Manage filters until it's resumed. Shape: ["1", "15", ...].
alter table public.flashcard_settings add column if not exists paused_tables jsonb not null default '[]'::jsonb;

-- Kana trainer cards + review history -- the exact parallel of flashcards /
-- review_logs above, for the "Kana" tab's own hiragana/katakana drill.
-- kana_id is the trainer's stable item id ("hira-gojuon:あ", ...); direction
-- is 'k2r' (type the romaji) or 'r2k' (recall the glyph). Same no-hard-delete
-- rule -- a card is never deleted, only left out of review.
create table if not exists public.kana_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kana_id text not null,
  direction text not null check (direction in ('k2r', 'r2k')),
  active boolean not null default true,
  state smallint not null default 0,
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  scheduled_days integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  learning_steps integer not null default 0,
  last_review timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kana_id, direction)
);

create index if not exists kana_cards_user_due_idx on public.kana_cards (user_id, due) where active;

create table if not exists public.kana_review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null references public.kana_cards (id) on delete cascade,
  client_review_id text not null,
  rating smallint not null,
  state smallint not null,
  due timestamptz,
  stability double precision,
  difficulty double precision,
  scheduled_days integer,
  learning_steps integer,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, client_review_id)
);

create index if not exists kana_review_logs_card_idx on public.kana_review_logs (card_id, reviewed_at);

alter table public.flashcards enable row level security;
alter table public.review_logs enable row level security;
alter table public.flashcard_settings enable row level security;
alter table public.kana_cards enable row level security;
alter table public.kana_review_logs enable row level security;

-- drop-then-create (rather than a bare `create policy`) so this file can be
-- re-run after a change like the one above without erroring on policies
-- that already exist from a previous run.
drop policy if exists "flashcards: owner full access" on public.flashcards;
create policy "flashcards: owner full access" on public.flashcards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "review_logs: owner full access" on public.review_logs;
create policy "review_logs: owner full access" on public.review_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "flashcard_settings: owner full access" on public.flashcard_settings;
create policy "flashcard_settings: owner full access" on public.flashcard_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kana_cards: owner full access" on public.kana_cards;
create policy "kana_cards: owner full access" on public.kana_cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kana_review_logs: owner full access" on public.kana_review_logs;
create policy "kana_review_logs: owner full access" on public.kana_review_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
