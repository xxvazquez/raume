# Supabase setup (for the Flashcards feature)

The Flashcards section stores your learning data (which vocab entries you've added, their FSRS scheduling state, review history, and settings) in a free Supabase project. Vocabulary content itself always stays in this repo (`data/vocabulary.js`) — Supabase never gets a copy of it, only a reference to each entry's permanent id.

## 1. Create a project

1. Go to [supabase.com](https://supabase.com), sign up / log in, and create a new project (the Free plan is enough).
2. Wait for it to finish provisioning (a couple of minutes).

## 2. Create the tables

1. In your project, open **SQL Editor** → **New query**.
2. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. This creates `flashcards`, `review_logs`, `flashcard_settings`, the Kana trainer's `kana_cards` / `kana_review_logs`, and `custom_tables` / `custom_rows` (words and tables you add yourself), all with Row Level Security enabled so each signed-in user only ever sees their own rows.

`schema.sql` is written so the **whole file is safe to paste and re-run any time it changes** (new tables use `create table if not exists`, new columns `add column if not exists`, nothing is dropped) — so if you set up Supabase before a feature that needs a schema change (e.g. the vocabulary-page table icons, which sync through `flashcard_settings.table_custom`, or custom vocabulary in `custom_tables` / `custom_rows`), just re-run the file.

## 3. Enable email/password sign-in

1. Go to **Authentication** → **Providers** and confirm **Email** is enabled (it is by default).
2. Under **Authentication** → **Settings**, you can turn off "Confirm email" if you'd rather sign in immediately without clicking an email link — reasonable for a personal single-user site, but optional.

## 4. Enable "Forgot password?"

The app's own "Forgot password?" link calls Supabase's `resetPasswordForEmail`,
which emails a link back to wherever the app is running (`redirectTo`, set to
the page's own URL at the moment someone requests the reset). For that
redirect to actually be honoured (rather than silently falling back to the
project's default Site URL):

1. Go to **Authentication** → **URL Configuration** → **Redirect URLs**.
2. Add the deployed site's URL — `https://YOUR-GH-USERNAME.github.io/raume/`
   for GitHub Pages. Add `http://localhost:4173/` too if you want to test the
   request half of the flow (sending the email) from a local `npm run` dev
   server — the actual link-click landing needs a real inbox either way.
3. The default **Reset Password** email template already points at
   `redirectTo`; no template edit needed unless you want to customise the
   email's wording.

## 5. Connect the app to your project

1. In your project, go to **Settings** → **API**.
2. Copy the **Project URL** and the **`anon` `public`** key (not the `service_role` key — that one must never be used in this repo or any client-side code).
3. Open [`js/config.js`](js/config.js) and fill them in:

   ```js
   window.RaumeStudy = window.RaumeStudy || {};
   window.RaumeStudy.config = window.RaumeStudy.config || {
     url: "https://YOUR-PROJECT-REF.supabase.co",
     anonKey: "YOUR-ANON-PUBLIC-KEY",
   };
   ```

4. Commit and deploy. The anon/public key is designed by Supabase to be embedded in client-side code like this — it's meaningless without a signed-in user, since Row Level Security (from `schema.sql`) is what actually protects the data.

## What happens if you skip this

The rest of the site (vocabulary browsing, search, sort, print) works exactly as before with no setup. The Flashcards section itself will show a message asking you to finish this setup instead of a sign-in form.

## Verifying a schema change against a live project

The smoke tests can't reach a real Supabase project, so anything sync-related is checked by hand. After re-running `schema.sql` for a new feature, sign in and confirm:

- **Kana trainer sync:** open the **Kana** tab, do a few reviews (both directions), then reload — progress is still there. In your project's **Table Editor**, `kana_cards` has a row per reviewed item×direction with advancing `reps`, and `kana_review_logs` has one row per review. Toggle a group or direction and check `flashcard_settings.kana_prefs` updates; change a Kana scheduling knob in **Settings** and check `flashcard_settings.kana_fsrs` updates (and that the vocabulary knobs in the same row are untouched). On a second device / browser, sign in and confirm the same progress, picker state and scheduling knobs load. Go offline, review, come back online — the queued reviews sync (the "Syncing… reviews" chip clears).
- **First sign-in seeding:** with kana progress built up as a guest, then signing in on an account that has no kana rows yet, copies that progress up once (it never overwrites an account that already has kana rows).
- **Custom vocabulary sync:** on the **Customize** page → **Your vocabulary**, create a table and add a word or two (and try an import). In the **Table Editor**, `custom_tables` / `custom_rows` get the rows; on a second device signed in, the custom table and its words load and are studiable. Delete a row on one device and confirm it's gone on the other after a sync. As a guest, adding a row then signing in migrates it into `custom_rows` under the account.
- **Password recovery:** on the sign-in form, click **Forgot password?**, enter your email, and confirm the "check your email" note appears. Open the email, click the reset link — it lands back on the site showing **Set a new password**, not the ordinary sign-in screen. Set one and confirm you land signed in (Flashcards shows "Signed in as…"). **Cancel** on that screen should sign the recovery session back out instead of leaving it live.
