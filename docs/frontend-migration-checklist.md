# Frontend migration checklist — cloud → Aureon_Agentic

This is the migration of ASTRA-FRONTEND off Supabase, the Netlify functions and Firebase, onto the self-hosted
backend [SVSKHD/Aureon_agents_Assembler](https://github.com/SVSKHD/Aureon_agents_Assembler) ("Aureon").

- **Stages:** each stage is its own PR, and the old path stays until the new one is validated on the server.
- **Same origin:** nginx serves the SPA and routes `/api/*` to Aureon on `127.0.0.1:8000` (backend
  `deploy/nginx/aureon-api.conf`). This is required because Aureon's session and CSRF cookies are `SameSite=Strict`.
- **Tripwire:** `npm run e2e:smoke` checks every finance route offline, before and after each stage.

Status values:

- **done**: merged and validated
- **ready**: PR open, behind a flag, old path still the default
- **blocked**: needs a backend piece that does not exist yet
- **planned**: not started
- **remove**: dropped, with the reason given

## Stage 1 — typed client

| Feature           | Old source                            | New endpoint                                                                                      | Status |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| API types         | none (hand-written fetches)           | `src/api/schema.d.ts` from Aureon's OpenAPI (`npm run api:gen`)                                   | ready  |
| HTTP client       | per-feature `fetch` + Supabase bearer | `src/api/client.ts`: `openapi-fetch`, cookies, `X-CSRF-Token`, 401 hook                           | ready  |
| Streams           | per-feature SSE parsing               | `src/api/sse.ts`: `readSse` (POST/fetch) and `openStream` (EventSource with reconnect and cursor) | ready  |
| Finance e2e smoke | none                                  | `scripts/e2e-smoke.mjs` (`npm run e2e:smoke`)                                                     | ready  |

## Stage 2 — sign-in

| Feature                     | Old source                                            | New endpoint                                                                                               | Status                                            |
| --------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Email + passcode sign-in    | `supabase.auth.signInWithPassword` (`stores/auth.ts`) | `POST /api/auth/login`                                                                                     | ready (flag `VITE_AUTH_PROVIDER=aureon`)          |
| Session restore on load     | `supabase.auth.getSession` / `onAuthStateChange`      | `GET /api/auth/me`; any later 401 returns to sign-in                                                       | ready                                             |
| Sign-out                    | `supabase.auth.signOut`                               | `POST /api/auth/logout`                                                                                    | ready                                             |
| Sign out other devices      | Firebase callable `revokeOtherSessions`               | `DELETE /api/auth/sessions/{id}` per other session; `POST /api/auth/sessions/revoke-all` for every session | ready                                             |
| GitHub OAuth sign-in / link | `signInWithOAuth`, `linkIdentity`                     | none (Aureon has email + password only)                                                                    | remove: the button is hidden under Aureon sign-in |
| Owner allowlist             | `VITE_ALLOWED_UIDS` / `VITE_ALLOWED_EMAILS`           | Aureon accounts (admin bootstrap; the server decides)                                                      | ready                                             |
| PIN lock                    | `stores/lock.ts` (hash in workspace doc)              | unchanged; it is local                                                                                     | n/a                                               |

**Caveat:** finance and workspace data still come from Supabase, and its RLS needs a Supabase session. Switching
sign-in to Aureon before stage 3 would sign the owner in to an empty app. Stage 2 therefore ships behind the flag, and
the flag flips together with stage 3.

## Stage 3 — finance data

All of it goes through one Aureon implementation of the Firestore-shaped `loadFirestore()` handle
(`src/aureonFirestore.ts`), selected with `VITE_AUTH_PROVIDER=aureon`. `useTrades`, `useExpenses`, `useSecured`,
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

**Server step before the flip:** the owner's legacy rows are invisible until an admin claims them
(`POST /api/finance/claim`, backend `docs/02-auth-and-finance.md`). Run the dry run, then `apply`.

## Stage 4 — AI

| Feature                                            | Old source                                                         | New endpoint                                                                                                             | Status                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| AI chat tab                                        | Netlify `/api/ai` (Bytez / OpenRouter), `composables/useAiChat.ts` | `POST /api/chat` (SSE), local Ollama                                                                                     | ready (flag `VITE_AI_BACKEND=aureon`; needs the stage 2 session) |
| Model picker                                       | static `AI_PROVIDERS` catalogue (`types.ts`)                       | `GET /api/models` (`AureonModelPicker.vue`)                                                                              | ready                                                            |
| One-shot asks (autocorrect, typo sweep, prompt AI) | `utils/aiAsk.ts` → `/api/ai`                                       | `POST /api/chat`, collected (`askOnce`); as-you-type autocorrect is off on Aureon, the typo sweep and prompt helpers run | ready                                                            |
| Read linked pages (`readLinks`)                    | server-side fetch in `netlify/functions/ai.ts`                     | none (Aureon is offline by design)                                                                                       | remove: links are no longer fetched                              |

## Stage 5 — GitHub

| Feature                                              | Old source                                                                   | New endpoint                                                                                       | Status                                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Repository browser (read-only)                       | Netlify `/api/github` (`utils/ghProxy.ts`)                                   | `/api/repos`, `…/{name}/branches`, `…/tree`, `…/file`, `…/commits` — Code (Aureon), `/code-aureon` | ready (admin; linked from the Code tab when the Aureon flag is on)                          |
| Code tasks (analyze, change, diff, approve / reject) | none (new)                                                                   | `/api/code/analyze`, `/api/code/tasks[/{id}[/diff\|approve\|reject]]` — Code (Aureon)              | ready (admin; approve makes a local branch, nothing is pushed)                              |
| Issues, pulls, comments (18 ops)                     | Netlify `/api/github` (`utils/ghProxy.ts`)                                   | `/api/v1/github/*`                                                                                 | planned → Phase 21: the backend GitHub integration is being built (Phases 15/16/21)         |
| Code tab live mirror                                 | Firestore `gh-repos`, `gh-pulls`, `gh-comments` (already failing)            | `/api/v1/github/*`                                                                                 | planned → Phase 21: same; the adapter reports these namespaces unavailable with that reason |
| GitHub setup                                         | Firebase callables `githubConnect`/`Status`/`Repos`/`Disconnect`/`TestEvent` | `/api/v1/github/*`                                                                                 | planned → Phase 21: same; the Code tab shows "GitHub moves to Aureon in Phase 21"           |

## Stage 6 — Firebase leftovers

| Feature             | Old source                                                                                   | New endpoint                                                                                                    | Status                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Receipt attachments | Firebase Storage (`services/attachments.ts`), broken today because there is no Firebase user | `/api/finance/attachments` (multipart `kind` + `ref`, list, `…/{id}/file`, delete): Receipts on expense rows    | ready (workspace transactions have no server row, so on Aureon their Attach says to use the expense; see blockers) |
| Security → Devices  | Firebase callables + Firestore `users/{uid}/sessions`, `/activity`                           | `GET /api/auth/sessions`, `DELETE /api/auth/sessions/{id}`, `POST /api/auth/sessions/revoke-all`                | ready (no locations or activity feed on Aureon; the panel says what is stored)                                     |
| News / forex feed   | Firebase `pullNews` + Firestore `forex` (failing today)                                      | `GET /api/public/forex` (backend `news_pull` job), re-read every 5 min while shown                              | ready (the job is off until `NEWS_FEED_URLS` is set on the server; the feed-health panel is hidden on Aureon)      |
| Dacoit signals      | Firebase `dacoitSignal` + Firestore `astra-dacoit-signals`                                   | `/api/trading/signals` (trading panel, Signals)                                                                 | done-by-trading-panel                                                                                              |
| GitHub webhooks     | Firebase `githubEvent` / `githubSweep`                                                       | `/api/v1/github/*`                                                                                              | planned → Phase 21                                                                                                 |
| Shares              | compat namespace `aureon-shares` (Supabase)                                                  | owner: `PUT /api/finance/documents/aureon-shares/{uuid}` with `isPublic`; reader: `GET /api/public/shares/{id}` | ready (new share ids are UUIDs; a private share is read as the owner's document)                                   |
| Wallet balance      | `VITE_WALLET_BALANCE_URL` Cloud Function (unset)                                             | none                                                                                                            | remove: unset today; no chain API in the backend                                                                   |

## Trading panel (Trading Phase E)

| Feature                                                                                                                                                                                                                                                                 | Old source | New endpoint                                                                                                                                                                  | Status |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `/trading` panel: overview, Dhan, MT5, watchlist + charts, signals + AI explanation, strategies + backtests, orders / executions / positions / P&L, risk (admin), agents, mode badge, disabled approval controls                                                        | none (new) | `/api/trading/*`, `GET /api/trading/stream` (SSE, resumable)                                                                                                                  | ready  |
| Paper trading (Trading Phase F): "Send to paper" on signals, Paper tab (paper book, intents, admin approve / cancel, reconcile, manual paper order), admin OBSERVE ⇄ PAPER switch; "Approve live" stays disabled                                                        | none (new) | `/api/trading/order-intents[/{id}[/approve\|cancel]]`, `/api/trading/accounts/{id}/paper[/reconcile]`, `/api/trading/accounts/{id}/mode`                                      | ready  |
| Paper extras (Prompt 11): admin approval inbox (every PENDING_RISK intent across accounts, count on the Paper tab), simulated executions with charges, reconciliation history, refresh on new risk decisions / signals from the live stream or every 15 s while visible | none (new) | `/api/trading/order-intents?status=PENDING_RISK`, `/api/trading/executions` (source=simulated), `/api/trading/accounts/{id}/paper/reconciliations`, `GET /api/trading/stream` | ready  |

## Validation per stage (on the server)

1. `npm run build` exits 0 (format, stylelint, vue-tsc, vitest).
2. `npm run e2e:smoke` passes.
3. Deploy behind nginx (backend `docs/14-frontend.md`), flip the stage's flag, use the feature for a day, then make
   the flag the default. Only then delete the old path.
