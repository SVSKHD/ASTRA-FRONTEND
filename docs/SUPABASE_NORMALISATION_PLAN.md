# Supabase: from compatibility layer to normalised schema

Companion to `SUPABASE_MIGRATION.md`, which describes phase 1 (PR #62): every
Firestore document copied as-is into `public.astra_documents` behind a
Firestore-shaped adapter, with Firebase Auth kept via Supabase third-party
auth. This document plans what comes after it.

**End state:** normalised Postgres tables with Row-Level Security, Supabase
Auth, Supabase Storage, Edge Functions + `pg_cron`, and no Firebase at all.

## Phases

| Phase               | What moves                                                                     | Reversible by                                                           | Firebase still used for                                 |
| ------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| 1 — done (#62)      | App-owned documents → `astra_documents` (JSONB)                                | Unsetting `VITE_SUPABASE_*`                                             | Auth, Functions, Storage, news, GitHub mirror, sessions |
| 2 — normalise       | `astra_documents` → real tables, one domain at a time                          | Each domain behind its own switch; `astra_documents` kept until the end | same as phase 1                                         |
| 3 — auth            | Firebase Auth → Supabase Auth (Google + email)                                 | Keeping third-party auth enabled during the cut-over                    | Functions, Storage, mirrors                             |
| 4 — server          | Cloud Functions → Edge Functions + `pg_cron`; mirrors move into Postgres       | Firebase functions left deployed until parity                           | Storage                                                 |
| 5 — files + removal | Storage → Supabase Storage; delete compat layer, Firestore rules, Firebase SDK | —                                                                       | nothing                                                 |

Phase 2 goes before auth on purpose: it is a Postgres-to-Postgres move, done in
SQL inside one database, testable against a copy, and it does not also change
who the rows belong to. Changing identity (phase 3) is then a single `UPDATE`
of owner columns across tables that already exist, instead of a remap buried
inside a document-reshaping import.

## Phase 2 design decisions

### Keys: `(user_id, id)`, never `id` alone

Entity ids come from one in-memory counter (`let nid = 100; const id = () =>
++nid`, `src/stores/app.ts`) that is **not persisted** and is rebuilt on load
from the maximum id in _some_ lists — `bumpNid()` skips transactions, debts,
payments, finance tags, categories, AI chats/messages, bots, wallets and trip
places. `noteRefs.ts` says it outright: ids are "only unique within a list".
So:

- every entity table's primary key is `(user_id, id)`;
- foreign keys are composite, `(user_id, parent_id) references parent(user_id, id)`,
  which also makes a cross-user reference impossible by construction;
- the counter stays client-side for now; a `bigint` id column accepts it.

String ids stay strings: `repos.id` (`owner__name`), `gh_issues.id`
(`owner__name__number`), `attachments.id`, `shares.id`.

### Owner column and RLS

Every owned table has `user_id text not null` (text, because during phase 2 it
still holds the Firebase uid from the third-party JWT; phase 3 converts it to
`uuid references auth.users`). One policy shape everywhere:

```sql
using      (user_id = (auth.jwt() ->> 'sub'))
with check (user_id = (auth.jwt() ->> 'sub'))
```

Public reads keep their current meaning: shares with `is_public`, and the news
feed.

### Tables (from the phase-1 inventory)

Core lists, one row per item:

| Table                                                       | Notes                                                                                                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `todos`, `tasks`                                            | Hierarchy (`parent_id`, `order`), rollover, status, schedule fields, `local_rev`/`updated_by`. `depth`/`root_id` are derived — computed, not stored. |
| `task_status_log`                                           | Child of tasks (was `statusLog[]`, capped at 20).                                                                                                    |
| `deadlines`, `reminders`, `ideas`, `stocks`                 | Flat. `reminders.repeat` stays `jsonb` (a small value object, not queried).                                                                          |
| `notes`                                                     | `tags text[]`.                                                                                                                                       |
| `goals`                                                     | `recurrence`, `metric` as `jsonb` value objects.                                                                                                     |
| `goal_checklist`, `goal_occurrences`                        | Children of goals. `unique (user_id, goal_id, date)` on occurrences — today only enforced in app code.                                               |
| `trips`, `trip_places`                                      | Places ordered by `position`; `photos text[]` on both.                                                                                               |
| `boards`, `board_nodes`, `board_edges`                      | Edges reference nodes.                                                                                                                               |
| `transactions`, `debts`, `debt_payments`, `txn_attachments` | Money stays integer minor units (`amount_minor bigint`).                                                                                             |
| `finance_tags`, `txn_categories`                            | Referenced **by name** today — see below.                                                                                                            |
| `ai_chats`, `ai_messages`                                   | Messages were the largest unbounded array in the document.                                                                                           |
| `bots`, `bot_positions`                                     | `config`, `basket`, `equity_curve` stay `jsonb`: written whole by the bot, never queried.                                                            |
| `wallets`                                                   |                                                                                                                                                      |
| `repos`, `gh_issues`                                        | The per-user linked-repo list and issue mirror (not the webhook mirror — that is phase 4).                                                           |

Links that are arrays of ids today become join tables:

| Join table                                                           | Replaces                                                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `item_links (user_id, parent_kind, parent_id, child_kind, child_id)` | `linked[]` / `parents[]` on todos and tasks (both directions from one row)                                       |
| `item_goals (user_id, item_kind, item_id, goal_id)`                  | `goalIds[]`                                                                                                      |
| `item_reminders (user_id, item_kind, item_id, reminder_id)`          | `reminderIds[]`                                                                                                  |
| `note_attachments (user_id, note_id, item_kind, item_id)`            | `noteIds[]` **and** `attachedTo[]` — today two copies kept in step by `reconcileNoteRefs()`; one table ends that |

Per-user singletons (theme, security PIN hash, finance settings, filters,
calendar prefs, GitHub integration, drafts, tag vocabulary) become one
`user_settings` row. Merged with `Astra-users/{uid}` (trading settings), which
is already one row per user.

### Polymorphic references

`linked`, `sourceRef`, `attachedTo` and board node links point at "a todo _or_
a task _or_ …". Postgres cannot put one foreign key on that. The join tables
carry a `kind` column constrained by `check`, and integrity is enforced by a
trigger per kind rather than by FK. That is a deliberate trade: the alternative
(one nullable FK column per target table) multiplies columns for every new kind.

### Referenced-by-name finance data

`transactions.category` and `transactions.tags[]` hold category and tag
**names**, and renaming a tag rewrites every transaction's strings
(`app.ts` tag rename/merge). Phase 2 switches these to ids
(`category_id`, `transaction_tags(transaction_id, tag_id)`), which turns a
rename into one row update. The import resolves names to ids once; a name with
no matching category row gets one created, so no transaction loses its label.

### Features that do not survive

- **Per-user renamable collections** (`tradesCollection`, `dacoitCollection`,
  `expensesCollection`, `securedCollection`). A per-user pointer to a physical
  collection has no meaning with fixed tables. Every user's rows go to
  `trades`, `dacoit_signals`, `expenses`, `secured`, and the rename UI
  (`useCollectionRename`, `collectionMove`, `collectionProbe`) is removed.
  The import reads whatever collection each user pointed at, so nothing is lost.
- **Firestore's offline write queue** — already gone in phase 1 (documented
  there). Not reintroduced here.

### How the app switches over

One domain at a time, in this order — each is small enough to review, and each
leaves the app working:

1. **Trading** (trades, signals, expenses, secured) — already one row per item
   in phase 1, so it is the simplest cut and it removes the renamable
   collections early.
2. **Settings** (`user_settings`).
3. **Tasks & todos** with their links — the largest and most-used, so it goes
   once the pattern is proven.
4. Goals, notes, reminders, deadlines, ideas, stocks, trips, boards.
5. Finance (transactions, debts, tags, categories).
6. AI chats, bots, wallets, repos/issues.

For each domain: migration SQL creates the tables and copies the rows out of
`astra_documents` with `jsonb_to_recordset`; the store's persistence for that
domain moves from "one big document write" to per-row upserts plus a Realtime
subscription on the new table; the domain's keys are then removed from the
workspace document. `astra_documents` stays until the last domain has moved.

The per-row writes also retire the current save model — the whole workspace
document rewritten on every change (600 ms debounce) — which is what the
1 MiB Firestore document limit and the `statusLog` cap were working around.

### Verification

No Supabase CLI or Docker here, so SQL is checked against **PGlite**
(Postgres compiled to WASM, run from Vitest) with `auth.jwt()` stubbed: every
migration must apply cleanly, every table must deny a different user's rows,
and the copy out of `astra_documents` must round-trip a fixture workspace
exported from the current app.

## Phase 2, step 1 — trading (built)

Trades, expenses and the secured ledger. Dacoit signals stay in Firestore until
their writer, the `dacoitSignal` function, moves in phase 4.

**What is in the repo**

| Piece                                                                                               | Where                                                |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Tables, RLS, Realtime, the copy out of `astra_documents`                                            | `supabase/migrations/20260923_normalise_trading.sql` |
| Field ↔ column mapping                                                                              | `src/db/tableRoutes.ts`                              |
| The adapter serving those collections from the tables                                               | `src/supabaseFirestore.ts`                           |
| Tests on real Postgres (PGlite): the copy, RLS, round trips through the app's own reader and writer | `src/db/*.test.ts`, `src/supabaseFirestore.test.ts`  |

**Switching it on**

1. In the Supabase SQL editor, run
   `supabase/migrations/20260923_normalise_trading.sql`. It is safe to run again;
   the copy never overwrites a row that already exists.
2. Check what did not come across — it should return no rows:
   ```sql
   select * from public.astra_trading_not_copied;
   ```
   A row here has no usable date, so it could never have appeared in a month
   in the app either. Fix its date in `astra_documents` and run step 1 again.
3. Add `VITE_SUPABASE_TABLES=trading` to `.env`, run the app, open Trades
   and Expenses, and check the current month matches what was there before.
4. Add the same variable to the deploy environment (Netlify) and redeploy.

To switch back, remove the variable: the app reads `astra_documents` again,
which the migration leaves untouched. Anything written while the tables were
on is in the tables only, so do not switch back after real use without copying
those rows back.

Once trading is served from tables, renaming its collections is refused: a
fixed table has no per-user name.

**Fixed in phase 1 at the same time** (active with or without the variable):

- **Dacoit signals** are read from Firestore again. Their writer is still the
  Firebase function, so reading them from Supabase showed only what was
  imported once and never a new signal.
- **Settings** (`Astra-users`) are also written to Firestore after the
  Supabase write, because the GitHub webhook/sweep read `trackedRepos` and
  `dacoitSignal` reads `dacoitCollection` from there. Without it, a repo
  tracked in the app never reached the Code tab.

## Phase 3 — sign-in on Supabase Auth (built, brought forward)

Brought forward because the Firebase project ran out of quota. Sign-in is
Supabase Auth now; Firebase is no longer involved in who you are.

**What changed in the app**

- `src/supabase.ts` — the one Supabase client, with a persisted, auto-refreshed
  session. The data adapter and sign-in share it, so REST and Realtime always
  carry the current token (this also retires the one-hour Realtime expiry that
  caused "Sync interrupted").
- `src/stores/auth.ts` — **email + passcode** (Supabase password sign-in). With
  one allowed email the address is filled in, so signing in is typing the
  passcode. There is no sign-up in the app: the account is made once in the
  dashboard. GitHub sign-in remains as a secondary option (OAuth, a redirect).
  **Google sign-in is off for now**, and with it the Google Calendar token; it
  will be wired back later. Calendar's "reconnect" says so instead of doing
  nothing.
- `/api/github` verifies the Supabase session with `/auth/v1/user` instead of
  Firebase's account lookup.
- Things that were Firebase-only switch off cleanly instead of failing:
  device sessions (no more `registerSession`/`heartbeat` CORS errors), and the
  Firestore reads for data Firebase Functions still write.

**Setup (dashboard — once)**

1. **Supabase** → Authentication → Users → **Add user** → _Create new user_:
   your email and a passcode (at least 6 characters), with **Auto Confirm
   User** ticked.
2. **Supabase** → Authentication → Sign In / Providers → Email: keep it
   enabled, and turn **off "Allow new users to sign up"**. The publishable key
   is public, so leaving sign-up on would let anyone create an account (the
   allowlist would still keep them out of the app, and row-level security out of
   your rows — but there is no reason to allow it).
3. `.env` (and Netlify): `VITE_ALLOWED_UIDS` must hold **Supabase** user ids
   now, or be removed — `VITE_ALLOWED_EMAILS` keeps working unchanged.
4. Optional, for GitHub sign-in or "Link GitHub": a GitHub OAuth app with the
   callback `https://<project-ref>.supabase.co/auth/v1/callback`, the GitHub
   provider enabled in Supabase with its client id and secret, "Allow manual
   linking" on, and `http://localhost:5173/**` plus your site under
   Authentication → URL Configuration → Redirect URLs.

**Moving your data to the new account (once)**

Your rows are owned by the old Firebase uid; the Supabase account has a new id.

1. Restart the dev server and **sign in with your email and passcode**. The
   app shows an empty workspace — expected, it is a new account.
2. SQL editor: run `supabase/migrations/20260924_remap_user_to_supabase_auth.sql`.
3. `select id from auth.users where email = '<your email>';`
4. Dry run (changes nothing):
   `select * from public.astra_remap_user('<old firebase uid>', '<new id>');`
5. Apply: the same with `, true` as a third argument. Reload the app.

The empty workspace from step 1 is kept, renamed `<new id>__before-remap-<time>`,
not deleted. Tested on PGlite: nothing is left under the old id, other users are
untouched, and no signed-in user can call the function.

**Unavailable until their writers move (phases 4–5)**

These are written or served by Firebase Functions / Storage, which only accept
Firebase sign-in: the news feed, the GitHub mirror and setup panel on the Code
tab, Dacoit signals, device sessions (Security panel), and uploading receipt
attachments (existing attachment links still open). The GitHub tab and the
repo list keep working — they use `/api/github`, which is on Supabase now.

Once the move is done, the Firebase entry in Supabase → Third-Party Auth can be
removed.

## Open questions

1. **Phase 3 identity mapping.** Supabase Auth issues new user ids. The plan
   assumes matching by verified email (one account today). Confirm before
   phase 3.
2. **Realtime granularity.** Per-table Realtime subscriptions replace one
   document listener. Fine for one user; revisit if the app goes multi-user.
3. **`depth`/`root_id`** are stored today. Computing them (recursive CTE or
   view) is cleaner; storing them keeps the store unchanged. Decide in the
   tasks/todos step.
