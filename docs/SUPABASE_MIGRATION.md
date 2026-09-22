# Supabase data migration

Astra now uses Supabase for app-owned document data while keeping Firebase
Authentication during the first migration phase.

## What moves in phase 1

When `VITE_SUPABASE_URL` and a Supabase publishable/anon key are configured,
the browser stores these namespaces in `public.astra_documents`:

- `aureon-notes` (the main workspace document)
- `Astra-users` (settings and collection pointers)
- owned trading/finance collections such as trades, expenses, signals and secured
- `aureon-shares`
- any renamed owned collection reached through the collection settings

The compatibility table keeps the old Firestore model deliberately:

| Firestore           | Supabase     |
| ------------------- | ------------ |
| collection/path     | `namespace`  |
| document id         | `doc_id`     |
| authenticated owner | `user_id`    |
| document fields     | `data jsonb` |

This lets the current views/composables move databases without a simultaneous
application-wide rewrite.

## What still uses Firebase in phase 1

These stay on Firebase until their server-side writers are migrated:

- Firebase Authentication (Google/GitHub sign-in and Google Calendar consent)
- Firebase Functions
- Firebase Storage attachments
- `forex` news mirror
- `gh-repos`, `gh-pulls`, `gh-comments`
- `users/{uid}/sessions` and `users/{uid}/activity`

Do not delete Firestore rules/indexes or the Firebase project yet.

## 1. Create/configure Supabase

1. Create the Supabase project.
2. Open the SQL editor and run
   `supabase/migrations/20260922_firestore_compat.sql`.
3. In Supabase Authentication, configure Firebase as a third-party auth provider
   for the same Firebase project used by Astra.
4. Assign the Firebase custom claim `role: "authenticated"` to every Astra user.
   Supabase uses this literal JWT claim to select the authenticated Postgres role.
5. Never put a Supabase service-role key in a `VITE_*` environment variable.

The SQL migration enables RLS and Realtime on `astra_documents`. Browser writes
derive ownership from the verified Firebase JWT through `astra_set_document`;
the client cannot choose another row owner.

### Assign the Firebase role claim

Using the same Firebase Admin credentials used for the data import:

```bash
cd functions

export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/firebase-service-account.json
export FIREBASE_PROJECT_ID=your-firebase-project-id

# Strongly recommended for this single-account app:
export FIREBASE_UID=your-firebase-uid

node scripts/set-supabase-auth-role.mjs
```

If `FIREBASE_UID` is omitted, the helper applies the claim to all Firebase Auth
users and preserves their existing custom claims.

After the claim is assigned, sign out and sign in again so Firebase issues a new
ID token containing the role.

For future new users, add the same claim in your Firebase Authentication
sign-up/sign-in flow before broadening access beyond the current allowlist.

## 2. Configure the frontend

Add these to local/deployment environment variables:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

For older Supabase projects, `VITE_SUPABASE_ANON_KEY` is accepted as a fallback.

Keep the existing `VITE_FIREBASE_*` values. They are still required for
identity, Functions, Storage and the temporary Firestore mirrors listed above.

With Supabase variables present, app-owned data uses Supabase. Without them,
the branch intentionally falls back to the existing Firestore data path so
environment rollout can be performed before the old database is removed.

## 3. Import existing Firestore data

Install the Functions dependencies if they are not already present:

```bash
cd functions
npm ci
```

Set server-only migration credentials:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/firebase-service-account.json
export FIREBASE_PROJECT_ID=your-firebase-project-id
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY

# Optional but recommended for a first migration of one account:
export FIREBASE_UID=your-firebase-uid
```

Then run:

```bash
node scripts/migrate-firestore-to-supabase.mjs
```

The importer is idempotent: rows use the old collection path and document id as
their conflict key, so a rerun updates the same row. It skips the function-owned
mirror namespaces that still belong in Firestore during phase 1.

After import, compare the main workspace/settings and a few month-backed
collections in Supabase before enabling the Supabase variables in production.

## 4. Package lock

The frontend adds `@supabase/supabase-js@2.109.0`. Run `npm install` once from
the repository root and commit the regenerated `package-lock.json` before
using any pipeline that installs with `npm ci`.

Netlify currently uses the npm install path, but keeping the lockfile in sync is
still required before treating the migration as complete.

## Runtime differences

Supabase Realtime is used to preserve the app's current live-update behavior.
Firestore's IndexedDB queued-write cache is not emulated. The existing app
therefore reports the Supabase path as memory/non-persistent mode when offline.

The next migration phase should move the function-owned mirrors and attachments,
then remove Firestore database/storage dependencies and the compatibility layer.
