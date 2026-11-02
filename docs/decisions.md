# Decisions log (frontend)

Decisions made while moving ASTRA-FRONTEND onto Aureon_Agentic. Each has an ID, the choice, why it was made, and what
would change it. The backend keeps its own log in `Aureon_agents_Assembler/docs/decisions.md`.

## D — Frontend Prompt 11 finish

- **D-F1: both flags flip together, to Aureon.** `VITE_AUTH_PROVIDER` now defaults to `aureon`, and so does
  `VITE_AI_BACKEND`. They are flipped together because the AI tab and the finance data both need the Aureon session
  cookie, and that cookie only exists after an Aureon sign-in. The old paths are still selectable:
  `VITE_AUTH_PROVIDER=supabase` brings back Supabase sign-in and Supabase data, and `VITE_AI_BACKEND=proxy` brings
  back the Netlify AI function. Any other value, or an unset variable, means Aureon.
- **D-F2: production is served same-origin by nginx on spasta.online.** nginx serves the SPA and routes `/api/*` to
  Aureon on `127.0.0.1:8000` (backend `deploy/nginx/aureon-api.conf`, `docs/14-frontend.md`). This is required:
  Aureon's session and CSRF cookies are `SameSite=Strict` (and `__Host-` prefixed over https), so a page on another
  origin never sends them.
  - **A Netlify-hosted build** (deploy previews, or the old Netlify site) is on another origin. It must set
    `VITE_AUTH_PROVIDER=supabase` and `VITE_AI_BACKEND=proxy` in its Netlify environment, or it signs in to nothing.
  - These values are not put in `netlify.toml`, because the repository's defaults are what production builds. The
    Netlify environment overrides them for the Netlify site only.
- **D-F3: the data layer stays Firestore-shaped.** Stage 3 adds a third implementation of the `loadFirestore()`
  handle (`src/aureonFirestore.ts`) instead of rewriting the composables. `useTrades`, `useExpenses`, `useSecured`,
  `useSettings`, the workspace and the outbox are unchanged.
  - Trades, expenses and secured go to the normalised endpoints at their client-minted ids. A 409 on create (a
    replay) becomes a PATCH of the same row, so a retry never makes a second trade.
  - Everything else goes to the documents API under its old namespace name. A write with `merge` is a PUT with
    `merge: true`.
- **D-F4: money is numbers inside the app, strings on the wire.** The API speaks exact decimal strings. The readers
  already do their maths on numbers, so the numeric columns are converted once, at the handle boundary. They are
  written back as strings with at most 8 decimals, which is what the API's Decimal accepts.
- **D-F5: live updates are one shared poller.** `GET /api/finance/changes` is polled every 5 s while the tab is
  visible, and paused while it is hidden. Errors back off by doubling, up to 60 s. A truncated batch is followed at
  once with the returned cursor. A write triggers an immediate poll.
  - The first cursor reaches 5 minutes back, to cover clock skew between the browser and the server. Re-sent rows are
    harmless.
  - A tombstone is applied only when it is newer than the row held, as the backend contract requires.
- **D-F6: GitHub waits for Phase 21.** The issue / pull-request mirror and the GitHub setup move to the backend's
  `/api/v1/github/*`, which is being built (Phases 15/16/21).
  - Until then the Code tab says so, and the `gh-*` namespaces report "unavailable" with that reason instead of
    showing an empty list.
  - What exists today, the read-only repository browser and code tasks, is in Code (Aureon) at `/code-aureon`
    (admin-only on the server).
- **D-F7: receipts attach to expenses on Aureon.** The attachments API attaches a file to a finance row (`trades`,
  `expenses`, `secured`) and checks that the row is yours. A workspace transaction lives inside the workspace document
  and has no row. So on Aureon, receipts are added from the Expenses tab (Receipts on each row). Attach on a workspace
  transaction explains this instead of uploading.
  - Would change if the backend accepts a document-scoped kind.
- **D-F8: share ids are UUIDs on Aureon.** Anyone holding a public share's id can read it through
  `/api/public/shares/{id}`, so new ids are `crypto.randomUUID()`. Ids already minted keep working. A private share is
  read as the owner's own document.
- **D-F9: the paper tab refreshes from the stream, with a timer as backstop.** It reloads when the live stream reports
  a new risk decision or signal, and every 15 s while the page is visible. The approval inbox (admin) is one shared
  copy, so the count on the Paper tab and the list never disagree. "Approve live" stays disabled.
- **D-F10: Security → Devices on Aureon shows what the server keeps.** That is the sign-in time, the expiry, the IP
  and the user agent. There is no location map and no activity feed. "Sign out everywhere else" deletes each other
  session. "Sign out everywhere, this device included" uses `revoke-all`.

## D-21 — Control center (Phase 21)

- **D-21-1: `/dev` reuses the trading panel's Aureon gate.** The control center signs in through
  `src/trading/session.ts` (`GET /api/auth/me`), so one sign-in serves `/trading` and `/dev`. Signed out it
  asks for the Aureon passcode; signed in as a non-admin it says the page is for admins and calls no
  `/api/v1/*` endpoint. The server checks the role on every call anyway; the gate only keeps the page honest.
  - The DEV-only `/dev/login` and `/dev/shot/*` routes are static segments, so they still win over
    `/dev/:module` in development.
- **D-21-2: no credential in a `VITE_` variable, enforced by a test.** GitHub, Claude and Discord credentials
  stay on the Aureon server. `src/security/viteSecrets.test.ts` scans `src`, `env.d.ts` and every `.env*` file
  for `VITE_` names matching `TOKEN|SECRET|PAT|KEY`, and fails on any that is not one of the three known public
  values (the Supabase publishable / anon key and the Firebase web API key), each listed with why it is public.
- **D-21-3: a merge is a request, never a merge.** "Request merge" sends `POST R/pulls/{n}/merge` with the
  PR's current head as `expected_head_sha` and shows the 202 as "Approval required" with a link into the
  inbox. There is no other merge path in the frontend; a test asserts the gated POST is the only write.
  - Links use `task_ref` = the workspace task id; the picker reads pinia's `app` state when it is loaded and
    the workspace document otherwise, so the `/dev` chunk never imports the whole workspace store.
- **D-21-4: polling is visibility-aware where there is no stream.** `usePoll` (`src/control/poll.ts`) runs
  only while the page is visible and once more when it becomes visible again. The GitHub dashboard re-reads
  its counts every 60 s.
- **D-21-5: the diff viewer is capped, not virtualised.** A diff renders at most 2,000 lines
  (`DIFF_MAX_LINES`) and says how many it left out; a log shows its last 3,000 lines and a file its first
  3,000. Each sits in its own scroll box, so a wide line never scrolls the page sideways; lines wrap below
  768 px and keep their shape above. Virtualising would need fixed row heights, which wrapped lines do not have.
- **D-21-6: the service worker never caches the API.** `/api/*` is matched first in `runtimeCaching` with
  `NetworkOnly`, and `navigateFallbackDenylist` keeps API navigations off the offline shell. That covers JSON,
  SSE streams, text logs and attachment images. The manifest takes its colours from the theme tokens (the
  default dark theme's `bgSolid`), keeps the existing icon, and adds `/dev` and `/dev/inbox` as shortcuts.
- **D-21-7: `Alert` reports to the corner tray, so the control center draws inline notices itself.**
  `Alert.vue` renders a placeholder and posts its text to the warning tray, which cannot hold a link or a
  button. "Approval required" and "not configured" are inline `.cc-notice` blocks (`control.css`): a tone bar
  on the left, `--text-primary` text.
- **D-21-8: the inbox uses the approval engine, and falls back to polling on an older server.** Backend Phase 20
  (`docs/23-approval-engine.md`) adds `/api/v1/approvals/inbox` and an SSE stream. When this was first built the
  engine was not on the backend main yet. `src/control/approvals.ts` probes the inbox once: a 404 means "legacy", and the pending list
  (`GET /api/v1/approvals?status=pending`) is polled every 15 s while visible. When the inbox answers, the
  stream is opened with `openStream`, and any event other than `hello` re-reads the inbox. Re-reading
  instead of applying the event means the stream's payload shape does not matter yet.
  - Would change when Phase 20 lands: regenerate the types, move the inbox and audit calls onto the typed client,
    and switch approve to the engine's re-auth endpoint if it replaces the password body.
- **D-21-9: the audit module is hidden behind a 404 check.** `GET /api/v1/audit/events` is Phase 20 too. Until
  it exists, the module says "needs backend Phase 20" rather than showing an empty list.
- **D-21-10: one count, one copy.** The nav badge and the inbox read the same reactive store, and paper
  intents waiting for approval (from the shared trading inbox) are added to the count unless the engine
  already lists `trading.*` kinds.
- **D-21-11: the engine's inbox, re-auth stamp and drift check are used as they are.** The inbox lists what
  this admin can act on, with `reauth` (`password`, `session_stamp`, `none`). When it says `session_stamp` or
  `none`, the approve dialog also offers "Approve without the password" (`{use_reauth: true}`); otherwise the
  password is required. The page never creates a stamp itself: `POST /approvals/reauth` is left to a later
  change, because stamping from the inbox would make the password prompt optional by default.
  - Drift is checked on demand ("Check drift" → `GET /approvals/{id}?check_drift=true`), because that call
    may hit GitHub. The server re-checks before anything runs anyway.
  - Each request shows its risk level and "n of m approvals" when the policy needs more than one. A partial
    approval (200 `pending`) says it waits for another admin.
- **D-21-12: paper approval goes through the engine and asks for the password.** `POST
/api/trading/order-intents/{id}/approve` now files a `trading.paper_intent` request.
  - "Approve paper fill" (on the Paper tab, its inbox and the signal's Send-to-paper control) opens a password
    dialog. With the password and a one-approval policy, the server fills at once (200, the intent). "Send to
    the inbox" files the request without a password (202), and the control then links to
    `/dev/inbox?id=…`, where it is approved like any other request. A wrong password (403) fills nothing.
  - The engine lists `trading.*` kinds in its inbox, so the control center stops showing the separate
    paper card once one appears (D-21-10).
- **D-21-13: the engine's links have routes.** The Discord deep link `/dev/approvals/{id}` and the
  voice-navigation routes `/dev/approvals` and `/dev/prs/{n}` redirect to `/dev/inbox?id=…`, `/dev/inbox` and
  `/dev/pulls?n=…`. `/dev/repairs` and `/dev/agents` already match. Voice input itself (`POST /api/v1/voice/intent`)
  has no UI yet; the routes it returns already work.
