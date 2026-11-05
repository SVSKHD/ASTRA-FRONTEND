# Dhan in Spasta: connection, market data, operations

Three screens, all over the same-origin `/api` (src/api/config.ts). No Dhan token,
API key or secret ever reaches the browser: the server keeps them and reports state.

| Screen              | Where                                                             | Component                                |
| ------------------- | ----------------------------------------------------------------- | ---------------------------------------- |
| Connection          | Control center → Settings (detailed), `/trading` banner (compact) | `components/control/DhanSessionBar.vue`  |
| Market-data monitor | `/trading/dhan`, under the status card                            | `components/trading/DhanFeedMonitor.vue` |
| Operations          | Control center → Dhan ops (`/dev/dhan`)                           | `components/control/CcDhan.vue`          |

Pure logic, with tests: `control/dhanSession.ts` (connection states), `trading/dhanHealth.ts`
(health checks, quote freshness, feed summary), `control/dhanOps.ts` (ops state, approval
scope, incident matching, redaction).

## Endpoints used

| Endpoint                                                         | Used for                                                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /api/v1/dhan/auth/status`                                   | Session state: `source`, `valid_until`, `expires_soon`, `session_expired`                             |
| `POST /api/v1/dhan/auth/start`                                   | Connect / Reconnect: returns Dhan's consent URL (only `https://…/login/consentApp-login` is followed) |
| `POST /api/v1/dhan/auth/consume`                                 | Finishes the login when Dhan redirects back with `?dhan_token_id=`                                    |
| `DELETE /api/v1/dhan/auth/session`                               | Disconnect: the server forgets the login session (Dhan has no revoke)                                 |
| `GET /api/trading/accounts`                                      | The registered Dhan account (label, masked client id, mode)                                           |
| `GET /api/trading/accounts/{id}/health`                          | Whether Dhan accepted the session: "verified" or "invalid"                                            |
| `GET /api/trading/accounts/{id}/funds`                           | Account-data freshness (`as_of`)                                                                      |
| `GET /api/trading/stream` (SSE)                                  | Quotes (`received_at`, `stale`), agent state; one stream per tab                                      |
| `GET /api/trading/candles`                                       | Stored 1m candles (shown as history, never as live)                                                   |
| `GET /api/v1/system/integrations` (admin)                        | Feed worker heartbeat/state, reconcile last run, server-listed problems                               |
| `GET /api/system/status` (admin)                                 | Redis reachability (`redis.ok`, `latency_ms`)                                                         |
| `GET /api/agents`, `POST /api/agents/{id}/pause\|resume`         | Feed worker details; pause/resume                                                                     |
| `GET /api/v1/repairs/incidents[/{id}]`, `POST …/resolve\|ignore` | Incidents, recovery attempts, diagnostics                                                             |
| `GET /api/v1/approvals[/inbox]`, `/approvals/stream`             | Approvals; approve/deny happens in the inbox with password re-auth                                    |

## States

**Connection:** `connected` (verified when account health says ok), `expiring`, `disconnected`,
`expired`, `invalid` (Dhan refused the stored session/token), `unavailable` (the status could not
be read; never shown as "disconnected"), `not_configured`. Disconnect is offered only for a login
session: a manual `DHAN_ACCESS_TOKEN` is managed in Settings and is not affected by `DELETE /session`.

**Quote freshness:** a price reads **Live** only when the stream is open, the market is open (NSE
09:15–15:30 IST, Mon–Fri), the feed's `stale` flag is clear and the tick is under 2 min old by
`received_at`. Otherwise **Stale**, **Market closed**, or **Last known** (stream not open).
Quotes for instruments no longer subscribed are dropped, so they cannot linger as current.

**Ops:** `failed` (an auth/error check) › `recovering` (an incident in `recovering`/`repair_queued`)
› `degraded` (open incident or stale check) › `recovered` (an incident the server resolved within
the last hour, by `resolved_at`) › `healthy`.

## Subscriptions

The page opens one `EventSource` per tab at sign-in, subscribed to the per-device watchlist
(`trading/watchlist.ts`). `connect()` is a no-op for the same instrument set, so remounts and
re-renders never add a stream or a listener. A browser refresh drops the old connection with the
page. `/dev/dhan` opens and closes its own stream on mount/unmount.

## Missing backend contract

Shown in the UI as "not reported", never guessed. Needed for the full spec:

1. **Dhan account identity from Dhan.** `StatusOut` has no client id or name. The UI shows the
   registered account's label and a masked `account_id`. An authenticated
   `GET /api/v1/dhan/auth/status` field such as `client_id_masked` / `account_name` (from Dhan's
   profile call) would let the connection card show what Dhan itself returned.
2. **Dhan WebSocket state.** Only the dhan-feed worker's heartbeat/state is exposed. Needed:
   `ws_state` (connected/reconnecting/disconnected), `ws_connected_at`, `last_disconnect_reason`,
   `reconnect_attempts`, e.g. in `integrations.dhan.feed` or the agent's `details`.
3. **Last successful connection.** No `last_connected_at` / `last_tick_at` from the worker; the UI
   uses the heartbeat as the nearest signal and says so.
4. **Feed worker subscriptions.** The UI lists this tab's stream subscriptions only. Needed:
   `GET /api/v1/dhan/feed/subscriptions` (instrument ids the worker follows on Dhan).
5. **Redis tick pipeline health.** Only Redis reachability is exposed. Needed: stream/queue lag,
   consumer-group pending count, last published tick time.
6. **Dhan-specific incidents and recovery.** Incidents come from the generic self-repair detector
   and are matched by `dhan` in the title/fingerprint. Needed: a `component`/`integration` field on
   incidents (filterable), and a recovery-attempt log (each attempt's time, action, outcome).
7. **Operator recovery actions.** Besides pause/resume of the worker, there is no
   "restart feed" / "resubscribe" endpoint. None is offered until the backend adds one with admin
   authorization.
8. **Exchange holidays.** Market hours are computed client-side without holidays; a
   `GET /api/trading/market-status` (open/closed/holiday, from the server's calendar) would replace it.
9. **Approval account/risk fields.** The affected account is read from `payload.broker_account_id`
   (else `target`); a typed `account_id` and risk context on `ApprovalOut` would make this exact.
