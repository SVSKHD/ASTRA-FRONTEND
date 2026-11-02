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

| Feature                     | Old source                                            | New endpoint                                          | Status                                            |
| --------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Email + passcode sign-in    | `supabase.auth.signInWithPassword` (`stores/auth.ts`) | `POST /api/auth/login`                                | ready (flag `VITE_AUTH_PROVIDER=aureon`)          |
| Session restore on load     | `supabase.auth.getSession` / `onAuthStateChange`      | `GET /api/auth/me`; any later 401 returns to sign-in  | ready                                             |
| Sign-out                    | `supabase.auth.signOut`                               | `POST /api/auth/logout`                               | ready                                             |
| Sign out other devices      | Firebase callable `revokeOtherSessions`               | `POST /api/auth/sessions/revoke-all`                  | planned                                           |
| GitHub OAuth sign-in / link | `signInWithOAuth`, `linkIdentity`                     | none (Aureon has email + password only)               | remove: the button is hidden under Aureon sign-in |
| Owner allowlist             | `VITE_ALLOWED_UIDS` / `VITE_ALLOWED_EMAILS`           | Aureon accounts (admin bootstrap; the server decides) | ready                                             |
| PIN lock                    | `stores/lock.ts` (hash in workspace doc)              | unchanged; it is local                                | n/a                                               |

**Caveat:** finance and workspace data still come from Supabase, and its RLS needs a Supabase session. Switching
sign-in to Aureon before stage 3 would sign the owner in to an empty app. Stage 2 therefore ships behind the flag, and
the flag flips together with stage 3.

## Stage 3 — finance data

| Feature                                                                         | Old source                                                                 | New endpoint                             | Status                        |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------- |
| Trades (journal)                                                                | `astra-trades` / normalised `trades` (`useTrades`, `services/tradeDoc.ts`) | `/api/finance/trades`                    | **blocked**: backend Phase 2b |
| Expenses                                                                        | `astra-expenses` / `expenses` (`useExpenses`, `services/expenseDoc.ts`)    | `/api/finance/expenses`                  | **blocked**: backend Phase 2b |
| Secured ledger                                                                  | `astra-secured` / `secured` (`useSecured`)                                 | `/api/finance/secured`                   | **blocked**: backend Phase 2b |
| Logger settings, budget, targets                                                | `Astra-users/{uid}` (`useSettings`)                                        | `/api/finance/settings`                  | **blocked**: backend Phase 2b |
| Workspace finance fields (finances, transactions, debts, wallets, stocks, bots) | workspace doc `aureon-notes/{uid}` (`stores/app.ts`)                       | `/api/finance/*` or a workspace endpoint | **blocked**: backend Phase 2b |
| Portfolio profile                                                               | Supabase `portfolio_profiles` (`utils/profile.ts`)                         | `/api/finance/portfolio-profile`         | **blocked**: backend Phase 2b |
| Offline queue                                                                   | IndexedDB outbox → `fs.setDoc` (`services/outbox.ts`)                      | the same outbox replaying to Aureon      | planned with stage 3          |

**Blocker:** backend Phase 2b is waiting on the live finance DDL (Aureon `docs/00-inspection.md` §4). Once those
endpoints exist, the plan is to put an Aureon implementation behind the existing Firestore-shaped `loadFirestore()`
handle (`src/firebase.ts`, `src/supabaseFirestore.ts`). Then `useTrades`, `useExpenses` and the rest stay unchanged
and the payload shapes are preserved.

## Stage 4 — AI

| Feature                                            | Old source                                                         | New endpoint                                                                                                             | Status                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| AI chat tab                                        | Netlify `/api/ai` (Bytez / OpenRouter), `composables/useAiChat.ts` | `POST /api/chat` (SSE), local Ollama                                                                                     | ready (flag `VITE_AI_BACKEND=aureon`; needs the stage 2 session) |
| Model picker                                       | static `AI_PROVIDERS` catalogue (`types.ts`)                       | `GET /api/models` (`AureonModelPicker.vue`)                                                                              | ready                                                            |
| One-shot asks (autocorrect, typo sweep, prompt AI) | `utils/aiAsk.ts` → `/api/ai`                                       | `POST /api/chat`, collected (`askOnce`); as-you-type autocorrect is off on Aureon, the typo sweep and prompt helpers run | ready                                                            |
| Read linked pages (`readLinks`)                    | server-side fetch in `netlify/functions/ai.ts`                     | none (Aureon is offline by design)                                                                                       | remove: links are no longer fetched                              |

## Stage 5 — GitHub

| Feature                                                 | Old source                                                                   | New endpoint                | Status                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------ |
| Repos, issues, pulls, commits, branches, files (18 ops) | Netlify `/api/github` (`utils/ghProxy.ts`)                                   | `/api/repos`, `/api/code/*` | **blocked**: backend coding agent (Phase 5b) not built |
| Code tab live mirror                                    | Firestore `gh-repos`, `gh-pulls`, `gh-comments` (already failing)            | `/api/code/*`               | **blocked**: same                                      |
| GitHub setup                                            | Firebase callables `githubConnect`/`Status`/`Repos`/`Disconnect`/`TestEvent` | `/api/repos`                | **blocked**: same                                      |

## Stage 6 — Firebase leftovers

| Feature             | Old source                                                                                   | New endpoint                                                                  | Status                                           |
| ------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ |
| Receipt attachments | Firebase Storage (`services/attachments.ts`), broken today because there is no Firebase user | `/api/finance/attachments` on the 2 TB HDD                                    | **blocked**: backend Phase 2b                    |
| Security → Devices  | Firebase callables + Firestore `users/{uid}/sessions`, `/activity`                           | `GET/POST /api/auth/sessions…` (revoke-all exists; a list endpoint is needed) | planned (needs a small backend endpoint)         |
| News / forex feed   | Firebase `pullNews` + Firestore `forex` (failing today)                                      | a local feed job in Aureon                                                    | planned (backend scheduler job)                  |
| Dacoit signals      | Firebase `dacoitSignal` + Firestore `astra-dacoit-signals`                                   | `/api/trading/signals` (Phase D)                                              | planned with the trading panel                   |
| GitHub webhooks     | Firebase `githubEvent` / `githubSweep`                                                       | Aureon coding agent                                                           | **blocked**: Phase 5b                            |
| Shares              | compat namespace `aureon-shares` (Supabase)                                                  | `/api/shares`                                                                 | **blocked**: backend Phase 2b                    |
| Wallet balance      | `VITE_WALLET_BALANCE_URL` Cloud Function (unset)                                             | none                                                                          | remove: unset today; no chain API in the backend |

## Trading panel (Trading Phase E)

| Feature                                                                                                                                                                                                          | Old source | New endpoint                                                 | Status |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------ | ------ |
| `/trading` panel: overview, Dhan, MT5, watchlist + charts, signals + AI explanation, strategies + backtests, orders / executions / positions / P&L, risk (admin), agents, mode badge, disabled approval controls | none (new) | `/api/trading/*`, `GET /api/trading/stream` (SSE, resumable) | ready  |

## Validation per stage (on the server)

1. `npm run build` exits 0 (format, stylelint, vue-tsc, vitest).
2. `npm run e2e:smoke` passes.
3. Deploy behind nginx (backend `docs/14-frontend.md`), flip the stage's flag, use the feature for a day, then make
   the flag the default. Only then delete the old path.
