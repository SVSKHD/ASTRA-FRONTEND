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

| Route          | Module                                                                                                                                                                                                      | Endpoints                                                                                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dev`         | GitHub dashboard: connection health, rate limit, repositories, recent runs, open PR / issue counts                                                                                                          | `GET /api/v1/github/connection`, `POST …/connection/check`, `GET /api/v1/github/repositories[?refresh=true]`, `GET R/pulls?state=open`, `GET R/issues?state=open`, `GET R/actions/runs?per_page=5`                                                                  |
| `/dev/repo`    | Repository explorer: branches, commits, tree, text file viewer                                                                                                                                              | `GET R/branches`, `GET R/commits?sha=`, `GET R/tree?ref=&path=`, `GET R/contents/{path}?ref=`                                                                                                                                                                       |
| `/dev/actions` | Actions: workflows (dispatch only when allowlisted; production asks for approval), runs with status filter and pages, jobs with failed steps, the job log (text/plain, tail), re-run, re-run failed, cancel | `GET R/actions/workflows`, `GET R/actions/runs`, `GET R/actions/runs/{id}/jobs`, `GET R/actions/jobs/{id}/logs` (text/plain), `POST R/actions/workflows/{file}/dispatch`, `POST R/actions/runs/{id}/rerun\|rerun-failed\|cancel` (202 `sent` or `pending_approval`) |
| `/dev/agents`  | Agents: the registry with heartbeat age, pause / resume, recent runs and logs; the scheduler jobs with pause / resume / run now                                                                             | `GET /api/agents`, `POST /api/agents/{id}/pause\|resume`, `GET /api/agents/{id}/runs`, `GET /api/agents/{id}/logs`, `GET /api/scheduler/jobs`, `POST /api/scheduler/jobs/{id}/pause\|resume\|run`; live state from `GET /api/trading/stream` (`agent` events)       |
| `/dev/repairs` | Repairs: status, incidents (repair / resolve / ignore), repair tasks with the patch (diff viewer) and test output (log viewer), retry, cancel                                                               | `GET /api/v1/repairs/status`, `GET /api/v1/repairs/incidents`, `POST …/incidents/{id}/resolve\|ignore`, `GET/POST /api/v1/repairs`, `GET /api/v1/repairs/{id}`, `POST /api/v1/repairs/{id}/retry\|cancel`                                                           |

`R` = `/api/v1/github/repositories/{owner}/{repo}`.

## Live updates

| Data                           | How                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Agent state                    | the trading stream's `agent` events (SSE), plus a 15 s poll for runs, jobs and fields the stream does not carry |
| Actions runs and jobs, repairs | 15 s visibility-aware poll                                                                                      |
| Dashboard counts               | 60 s visibility-aware poll                                                                                      |
| Reviews                        | 5 s poll while one is queued or running                                                                         |

## Gated operations

A merge (and, in Actions, a production dispatch or re-run) never runs from the page. The endpoint answers
202 with an approval id; the page shows **Approval required** with a link to `/dev/inbox?id=<approval id>`,
where an admin approves with their password. The request carries `expected_head_sha`, so a push after the
request invalidates it.

## Issue ↔ task links

`task_ref` is the workspace task id as a string (backend D-16-1). The picker reads the tasks the app store
holds when the workspace is loaded in this tab, and otherwise the workspace document
`aureon-notes/{uid}` once; archived tasks are left out. A numeric id can be typed when no task list is
available.

## Shared pieces

- `src/control/api.ts`: the selected repo, `must`, `rawGet` / `rawPost` for endpoints not yet in the schema.
- `src/control/poll.ts`: `usePoll` (visibility-aware), `useNow`, `countdown`.
- `src/control/diff.ts`: `parseDiff` (capped) and `tail`.
- `src/components/control/DiffViewer.vue`, `LogViewer.vue`: monospace, own scroll box, capped.
