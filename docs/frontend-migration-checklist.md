# Frontend migration checklist — cloud → Aureon_Agentic

This is the migration of ASTRA-FRONTEND off Supabase, the Netlify functions and Firebase, onto the self-hosted
backend [SVSKHD/Aureon_agents_Assembler](https://github.com/SVSKHD/Aureon_agents_Assembler) ("Aureon").

- **Stages:** each stage was its own PR. Since Prompt 11 the Aureon paths are the **default**
  (`VITE_AUTH_PROVIDER=aureon`, `VITE_AI_BACKEND=aureon`; [decisions.md](decisions.md) D-F1). The old paths stay
  selectable (`supabase` / `proxy`) until the new ones have been validated on the server.
- **Same origin:** nginx serves the SPA and routes `/api/*` to Aureon on `127.0.0.1:8000` (backend
  `deploy/nginx/aureon-api.conf`). This is required because Aureon's session and CSRF cookies are `SameSite=Strict`.
- **Tripwire:** `npm run e2e:smoke` checks every finance route offline, before and after each stage.

Status values:

- **done**: merged, and nothing is left to do on the frontend
- **ready**: merged and the default; the old path is kept until the on-server validation below has passed
- **remove**: dropped, with the reason given

## Stage 1 — typed client

| Feature           | Old source                            | New endpoint                                                                                      | Status |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| API types         | none (hand-written fetches)           | `src/api/schema.d.ts` from Aureon's OpenAPI (`npm run api:gen`)                                   | done   |
| HTTP client       | per-feature `fetch` + Supabase bearer | `src/api/client.ts`: `openapi-fetch`, cookies, `X-CSRF-Token`, 401 hook                           | done   |
| Streams           | per-feature SSE parsing               | `src/api/sse.ts`: `readSse` (POST/fetch) and `openStream` (EventSource with reconnect and cursor) | done   |
| Finance e2e smoke | none                                  | `scripts/e2e-smoke.mjs` (`npm run e2e:smoke`)                                                     | done   |

## Stage 2 — sign-in

| Feature                     | Old source                                            | New endpoint                                                                                               | Status                                                 |
| --------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Email + passcode sign-in    | `supabase.auth.signInWithPassword` (`stores/auth.ts`) | `POST /api/auth/login`                                                                                     | ready (default; `VITE_AUTH_PROVIDER=supabase` reverts) |
| Session restore on load     | `supabase.auth.getSession` / `onAuthStateChange`      | `GET /api/auth/me`; any later 401 returns to sign-in                                                       | ready                                                  |
| Sign-out                    | `supabase.auth.signOut`                               | `POST /api/auth/logout`                                                                                    | ready                                                  |
| Sign out other devices      | Firebase callable `revokeOtherSessions`               | `DELETE /api/auth/sessions/{id}` per other session; `POST /api/auth/sessions/revoke-all` for every session | ready                                                  |
| GitHub OAuth sign-in / link | `signInWithOAuth`, `linkIdentity`                     | none (Aureon has email + password only)                                                                    | remove: the button is hidden under Aureon sign-in      |
| Owner allowlist             | `VITE_ALLOWED_UIDS` / `VITE_ALLOWED_EMAILS`           | Aureon accounts (admin bootstrap; the server decides)                                                      | ready                                                  |
| PIN lock                    | `stores/lock.ts` (hash in workspace doc)              | unchanged; it is local                                                                                     | done (nothing to move)                                 |

**Flipped with stage 3.** Sign-in and the data move together: `VITE_AUTH_PROVIDER` selects both, because Supabase's RLS
needs a Supabase session and Aureon's data needs the Aureon cookie. The old caveat (an empty app if sign-in moved
first) no longer applies.

## Stage 3 — finance data

All of it goes through one Aureon implementation of the Firestore-shaped `loadFirestore()` handle
(`src/aureonFirestore.ts`), selected with `VITE_AUTH_PROVIDER=aureon` (the default). `useTrades`, `useExpenses`, `useSecured`,
`useSettings` and the workspace are unchanged, and so are the payload shapes and the client-minted ids.

| Feature                                                                         | Old source                                                                 | New endpoint                                                                                    | Status |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------ |
| Trades (journal)                                                                | `astra-trades` / normalised `trades` (`useTrades`, `services/tradeDoc.ts`) | `/api/finance/trades` (POST at the client id; a 409 replay is a PATCH)                          | ready  |
| Expenses                                                                        | `astra-expenses` / `expenses` (`useExpenses`, `services/expenseDoc.ts`)    | `/api/finance/expenses`                                                                         | ready  |
| Secured ledger                                                                  | `astra-secured` / `secured` (`useSecured`)                                 | `/api/finance/secured`                                                                          | ready  |
| Logger settings, budget, targets                                                | `Astra-users/{uid}` (`useSettings`)                                        | `/api/finance/documents/Astra-users/{uid}` (setDoc merge = PUT `merge: true`)                   | ready  |
| Workspace finance fields (finances, transactions, debts, wallets, stocks, bots) | workspace doc `aureon-notes/{uid}` (`stores/app.ts`)                       | `/api/finance/documents/aureon-notes/{uid}`                                                     | ready  |
| Other compat namespaces (renamed collections, …)                                | `astra_documents` namespaces                                               | `/api/finance/documents/{namespace}/{doc_id}`                                                   | ready  |
| Portfolio profile                                                               | Supabase `portfolio_profiles` (`utils/profile.ts`)                         | `/api/finance/portfolio-profiles/hithesh` (write: admin)                                        | ready  |
| Live updates (`onSnapshot`)                                                     | Supabase Realtime                                                          | one shared poller on `GET /api/finance/changes?since=` (5 s while visible, backoff to 60 s)     | ready  |
| Offline queue                                                                   | IndexedDB outbox → `fs.setDoc` (`services/outbox.ts`)                      | the same outbox, replaying through the Aureon handle                                            | ready  |
| Money                                                                           | `double precision` numbers                                                 | decimal strings on the wire; numbers at the handle boundary (readers unchanged), ≤ 8 dp written | ready  |

**Server step before the first sign-in on the new default:** the owner's legacy rows are invisible until an admin claims them
(`POST /api/finance/claim`, backend `docs/02-auth-and-finance.md`). Run the dry run, then `apply`.

## Stage 4 — AI

| Feature                                            | Old source                                                         | New endpoint                                                                                                             | Status                                           |
| -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| AI chat tab                                        | Netlify `/api/ai` (Bytez / OpenRouter), `composables/useAiChat.ts` | `POST /api/chat` (SSE), local Ollama                                                                                     | ready (default; `VITE_AI_BACKEND=proxy` reverts) |
| Model picker                                       | static `AI_PROVIDERS` catalogue (`types.ts`)                       | `GET /api/models` (`AureonModelPicker.vue`)                                                                              | ready                                            |
| One-shot asks (autocorrect, typo sweep, prompt AI) | `utils/aiAsk.ts` → `/api/ai`                                       | `POST /api/chat`, collected (`askOnce`); as-you-type autocorrect is off on Aureon, the typo sweep and prompt helpers run | ready                                            |
| Read linked pages (`readLinks`)                    | server-side fetch in `netlify/functions/ai.ts`                     | none (Aureon is offline by design)                                                                                       | remove: links are no longer fetched              |

## Stage 5 — GitHub

| Feature                                              | Old source                                                                   | New endpoint                                                                                              | Status                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Repository browser (read-only)                       | Netlify `/api/github` (`utils/ghProxy.ts`)                                   | `/api/repos`, `…/{name}/branches`, `…/tree`, `…/file`, `…/commits` — Code (Aureon), `/code-aureon`        | ready (admin; linked from the Code tab when the Aureon flag is on)                         |
| Code tasks (analyze, change, diff, approve / reject) | none (new)                                                                   | `/api/code/analyze`, `/api/code/tasks[/{id}[/diff\|approve\|reject]]` — Code (Aureon)                     | ready (admin; approve makes a local branch, nothing is pushed)                             |
| Issues, pulls, comments (18 ops)                     | Netlify `/api/github` (`utils/ghProxy.ts`)                                   | `/api/v1/github/repositories/{owner}/{repo}/issues\|pulls/*` — control center `/dev/issues`, `/dev/pulls` | done (Phase 21; merge is gated through `/api/v1/approvals`)                                |
| Code tab live mirror                                 | Firestore `gh-repos`, `gh-pulls`, `gh-comments` (already failing)            | `/api/v1/github/*` — control center `/dev` (dashboard, repo explorer, PRs, Actions)                       | done (Phase 21; the Code tab keeps its "unavailable" note for the old mirror and links on) |
| GitHub setup                                         | Firebase callables `githubConnect`/`Status`/`Repos`/`Disconnect`/`TestEvent` | `GET /api/v1/github/connection`, `POST …/connection/check`, `GET …/repositories?refresh=true`             | done (Phase 21; the token lives in the server's `GITHUB_TOKEN`, never in the browser)      |

## Stage 6 — Firebase leftovers

| Feature             | Old source                                                                                   | New endpoint                                                                                                    | Status                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Receipt attachments | Firebase Storage (`services/attachments.ts`), broken today because there is no Firebase user | `/api/finance/attachments` (multipart `kind` + `ref`, list, `…/{id}/file`, delete): Receipts on expense rows    | ready (workspace transactions have no server row, so on Aureon their Attach says to use the expense; see blockers) |
| Security → Devices  | Firebase callables + Firestore `users/{uid}/sessions`, `/activity`                           | `GET /api/auth/sessions`, `DELETE /api/auth/sessions/{id}`, `POST /api/auth/sessions/revoke-all`                | ready (no locations or activity feed on Aureon; the panel says what is stored)                                     |
| News / forex feed   | Firebase `pullNews` + Firestore `forex` (failing today)                                      | `GET /api/public/forex` (backend `news_pull` job), re-read every 5 min while shown                              | ready (the job is off until `NEWS_FEED_URLS` is set on the server; the feed-health panel is hidden on Aureon)      |
| Dacoit signals      | Firebase `dacoitSignal` + Firestore `astra-dacoit-signals`                                   | `/api/trading/signals` (trading panel, Signals)                                                                 | done (by the trading panel)                                                                                        |
| GitHub webhooks     | Firebase `githubEvent` / `githubSweep`                                                       | `POST /api/v1/github/webhooks` (server-side, HMAC); runs shown in `/dev/actions`                                | done (Phase 21; nothing in the browser receives webhooks)                                                          |
| Shares              | compat namespace `aureon-shares` (Supabase)                                                  | owner: `PUT /api/finance/documents/aureon-shares/{uuid}` with `isPublic`; reader: `GET /api/public/shares/{id}` | ready (new share ids are UUIDs; a private share is read as the owner's document)                                   |
| Wallet balance      | `VITE_WALLET_BALANCE_URL` Cloud Function (unset)                                             | none                                                                                                            | remove: unset today; no chain API in the backend                                                                   |

## Trading panel (Trading Phase E)

| Feature                                                                                                                                                                                                                                                                 | Old source | New endpoint                                                                                                                                                                  | Status |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `/trading` panel: overview, Dhan, MT5, watchlist + charts, signals + AI explanation, strategies + backtests, orders / executions / positions / P&L, risk (admin), agents, mode badge, disabled approval controls                                                        | none (new) | `/api/trading/*`, `GET /api/trading/stream` (SSE, resumable)                                                                                                                  | ready  |
| Paper trading (Trading Phase F): "Send to paper" on signals, Paper tab (paper book, intents, admin approve / cancel, reconcile, manual paper order), admin OBSERVE ⇄ PAPER switch; "Approve live" stays disabled                                                        | none (new) | `/api/trading/order-intents[/{id}[/approve\|cancel]]`, `/api/trading/accounts/{id}/paper[/reconcile]`, `/api/trading/accounts/{id}/mode`                                      | ready  |
| Paper extras (Prompt 11): admin approval inbox (every PENDING_RISK intent across accounts, count on the Paper tab), simulated executions with charges, reconciliation history, refresh on new risk decisions / signals from the live stream or every 15 s while visible | none (new) | `/api/trading/order-intents?status=PENDING_RISK`, `/api/trading/executions` (source=simulated), `/api/trading/accounts/{id}/paper/reconciliations`, `GET /api/trading/stream` | ready  |

## Control center (Phase 21)

| Feature                                                                                                                       | Old source                                     | New endpoint                                                           | Status |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| `/dev`: GitHub dashboard, repo explorer, issues, PRs (gated merge), reviews, Actions                                          | none (new)                                     | `/api/v1/github/*`, `/api/v1/reviews`                                  | done   |
| `/dev/agents`, `/dev/repairs`                                                                                                 | none (new)                                     | `/api/agents`, `/api/scheduler/jobs`, `/api/v1/repairs/*`              | done   |
| `/dev/inbox`: approval inbox with password approve / deny, live count                                                         | none (new)                                     | `/api/v1/approvals/inbox` + `/api/v1/approvals/stream` (SSE)           | done   |
| `/dev/audit`                                                                                                                  | none (new)                                     | `/api/v1/audit/events`                                                 | done   |
| Paper approval through the approval engine: "Approve paper fill" asks for the password, or files the request for `/dev/inbox` | `POST …/order-intents/{id}/approve` (one call) | the same call, now 200 with `{password}` or 202 `trading.paper_intent` | done   |
| PWA: manifest from tokens, offline shell, `/api/*` network-only; no secrets in `VITE_` (test)                                 | vite-pwa                                       | n/a                                                                    | done   |

## Blockers and notes

- **No frontend blockers remain.** Backend Phase 2b (finance), the sessions list, attachments, public shares and the
  forex job all exist on the backend main, and the frontend uses them.
- **GitHub (done, Phase 21):** the control center at `/dev` ([control-center.md](control-center.md)) covers the
  issue / pull-request work, the GitHub setup, Actions and the webhook-fed runs on `/api/v1/github/*`, with the
  approval inbox and the audit log on backend Phase 20.
- **Paper approval (Phase 20):** "Approve paper fill" now asks for the password (server re-auth) or files the
  request for the `/dev` inbox ([decisions.md](decisions.md) D-21-12).
- **Receipts on workspace transactions:** the attachments API attaches to finance rows only. On Aureon, receipts are
  added from the Expenses tab. A document-scoped attachment kind on the backend would bring them back to the Finances
  tab ([decisions.md](decisions.md) D-F7).
- **Netlify:** a Netlify-hosted build must set `VITE_AUTH_PROVIDER=supabase` and `VITE_AI_BACKEND=proxy` in its
  environment. Aureon's cookies are `SameSite=Strict`, and production is served same-origin by nginx on spasta.online
  (D-F2).
- **Server steps before the first Aureon sign-in:** `alembic upgrade 0011`, then claim the legacy rows
  (`POST /api/finance/claim`: a dry run, then `apply`). Set `NEWS_FEED_URLS` to turn the news job on.

## Validation per stage (on the server)

1. `npm run build` exits 0 (format, stylelint, vue-tsc, vitest).
2. `npm run e2e:smoke` passes.
3. Deploy behind nginx (backend `docs/14-frontend.md`) with the defaults, and use every feature for a day. Only then
   delete the old path (Supabase data and sign-in, the Netlify AI proxy, the Firebase callables).
