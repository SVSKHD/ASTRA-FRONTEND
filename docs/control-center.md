# Control center (`/dev`)

Phase 21. One admin-only page over Aureon's GitHub, Actions, agents, self-repair, review and approval APIs,
built phone-first (375 px, no horizontal page scroll). Decisions are in [decisions.md](decisions.md) (D-21-*).

- **Sign-in:** the trading panel's Aureon gate (`src/trading/session.ts`). Signed out → the Aureon sign-in card;
  a non-admin → "Admins only", with no `/api/v1/*` call made.
- **Layout:** `src/views/ControlCenterView.vue`. Each module is a lazy chunk in `src/components/control/`. On a
  phone the modules are a bottom bar (GitHub, PRs, Actions, Inbox, More); from 768 px up they are a tab strip.
- **Repository:** the GitHub modules work on one allowlisted repository, picked in the header and kept per
  browser (`localStorage` `cc.repo`). The list comes from the server, which only returns allowlisted repos.
- **Credentials:** none in the browser. GitHub, Claude and Discord tokens stay on the server; a test fails on any
  new secret-looking `VITE_` variable (D-21-2).
- **Offline:** the service worker serves the app shell only; `/api/*` is network-only (D-21-6).

## Modules

| Route       | Module                                                                                             | Endpoints                                                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dev`      | GitHub dashboard: connection health, rate limit, repositories, recent runs, open PR / issue counts | `GET /api/v1/github/connection`, `POST …/connection/check`, `GET /api/v1/github/repositories[?refresh=true]`, `GET R/pulls?state=open`, `GET R/issues?state=open`, `GET R/actions/runs?per_page=5` |
| `/dev/repo` | Repository explorer: branches, commits, tree, text file viewer                                     | `GET R/branches`, `GET R/commits?sha=`, `GET R/tree?ref=&path=`, `GET R/contents/{path}?ref=`                                                                                                      |

`R` = `/api/v1/github/repositories/{owner}/{repo}`.

## Shared pieces

- `src/control/api.ts`: the selected repo, `must`, `rawGet` / `rawPost` for endpoints not yet in the schema.
- `src/control/poll.ts`: `usePoll` (visibility-aware), `useNow`, `countdown`.
- `src/control/diff.ts`: `parseDiff` (capped) and `tail`.
- `src/components/control/DiffViewer.vue`, `LogViewer.vue`: monospace, own scroll box, capped.
