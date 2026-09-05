# Aureon

A liquid-glass, space-themed personal tracker — todos, tasks, deadlines,
reminders and finances in one place — built with **Vue 3 + Vite + Firebase**.
Implemented from the `Aureon.dc.html` Claude Design.

## Features

- **Six tabs** — Todo, Tasks, Deadlines, Reminders, Finances, Trips, with a sliding
  glass tab indicator, keyboard navigation (`←`/`→`, `1`–`6`, `N`, `⌘/Ctrl-K`)
  and touch swipe.
- **Seven themes + Auto** — Daylight Cosmos, Golden Dawn, Aurora Day, Deep Space,
  Nebula Rose, Solar Flare, Aurora Night. Auto follows the time of day. Each
  theme has its own animated celestial body (sun, orbiting moon, aurora, …).
- **Tasks** — day grouping with drag-and-drop, inline detail dialog, full-page
  task view, and a GitHub panel (repo metadata, CI status, PRs, issue import).
- **Reminders** — flexible recurrence (interval or specific weekdays), browser
  notifications, snooze, and one-click "Add to Google Calendar".
- **Finances** — animated weekly/monthly totals and categorised expenses.
- **Notes** — a side drawer with a rich-text editor.
- **Trips** — locations grouped day by day, with quick add, edit and delete.
- **Share links**, **delete-with-undo** toasts, an animated starfield and a
  cursor comet trail.
- **Owner-only Firebase auth** (Google / GitHub) with user-scoped Firestore sync.
- **PIN lock** with a 50-minute inactivity timeout and a “do not auto-lock” option.

## Getting started

```bash
npm install
npm run dev
```

## Firebase setup (required)

Copy `.env.example` to `.env.local` and fill in your Firebase web config:

```bash
cp .env.example .env.local
```

In the [Firebase console](https://console.firebase.google.com/):

1. Enable **Authentication** → Google and GitHub providers.
2. Create a **Cloud Firestore** database.
3. Copy the web app config values into `.env.local`.
4. `VITE_ALLOWED_EMAILS` is set to `8svskhd@gmail.com`; add comma-separated owner emails only when needed.

All tracker data is stored in the single collection path `aureon-notes/{uid}`
and kept in sync through a realtime listener. There is no local fallback or seed
data: a new/empty Firebase document displays empty views. The workspace is not
rendered until authentication and the user's Firebase snapshot are ready.

Deploy the included rules, which require the verified owner email:

```bash
firebase deploy --only firestore:rules
```

On first sign-in, the app asks for a 4–8 digit PIN. Only a salted PIN hash is
saved in Firebase. Auto-lock defaults to 50 minutes and can be disabled from the
account menu.

## Scripts

| Script                  | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| `npm run dev`           | Start the Vite dev server                                      |
| `npm run build`         | Verify (format, lint, types, tests) and build for production   |
| `npm run preview`       | Preview the production build                                   |
| `npm run type-check`    | Run `vue-tsc` only                                             |
| `npm run dev:fixture`   | Dev server serving the deterministic seed from memory          |
| `npm run shoot`         | The screenshot set — every mode, both themes, 1440px and 390px |
| `npm run check:overlap` | Does any chrome element sit on top of content? (section 44)    |
| `npm run check:theme`   | Which painted colours do NOT move when the theme does?         |
| `npm run check:feeds`   | Which news feeds are actually alive?                           |

The last three drive a real browser against a running dev server, which is why
they are not part of `npm run verify`. Start `npm run dev:fixture` first:

```sh
npm run dev:fixture &
npm run check:overlap    # 16/16 clean
npm run check:theme      # 0 stuck declarations
```

`check:feeds` needs open outbound HTTPS. In a sandbox whose egress policy blocks
general web hosts every row comes back `blocked` — a fact about the machine, not
a verdict on the feed — and the script says so rather than marking them dead.

## Notes

- GitHub repo/PR/issue data is currently mocked (deterministic per repo name);
  the real GitHub API calls are marked with comments where they would slot in.
- The previous Next.js/React app has been moved to [`legacy-next/`](./legacy-next).

## The Cloud Functions have to be deployed

`netlify.toml` builds and publishes the Vite front end and nothing else. The
scheduled functions — `pullNews`, `githubSweep`, `cleanupNews`,
`purgeExpiredActivity` — exist only once somebody has run
`firebase deploy --only functions`, and a scheduled function that was never
deployed has no Cloud Scheduler job behind it, has never run, and leaves its
collection empty in a way that reads from the app like a broken feature.

That is why the News tab returned nothing.
[`.github/workflows/deploy-functions.yml`](.github/workflows/deploy-functions.yml)
now deploys them on a push that touches `functions/`, the rules or the indexes,
and prints `functions:list` afterwards so a deploy that scheduled nothing is
visible. Its header lists the one-time service account and secrets it needs.

To check the news pipeline without waiting for the schedule: open the News tab,
press **Feeds**, then **Run a pull now**. Every feed reports its HTTP status,
whether the body parsed, how many items came back and how many documents
actually reached the `forex` collection.

## Connecting GitHub

Open the **Code** tab and press **Set up GitHub**. Four numbered steps: a
fine-grained token with `metadata`, `pull_requests` and `contents` at read-only;
paste it once (it goes straight to the Cloud Function and is never stored in the
browser, and the rules deny the collection it lands in to every client); pick the
repositories to track; add the webhook. **Send test event** posts a signed ping
to the deployed endpoint and reports whether the URL and the server-side secret
agree.

The webhook secret itself is still set once with
`firebase functions:secrets:set GITHUB_WEBHOOK_SECRET` — the app cannot read it,
which is the point of it being a secret.

## AI tab — aiProxy Cloud Function contract

The AI tab never holds the Anthropic API key. The Vue app POSTs to a Cloud
Function whose URL is `VITE_AI_PROXY_URL`; the function injects the key,
enforces per-user rate limits, and streams the response back (SSE, `data:`
lines). Request body sent by the app:

```jsonc
{
  "model": "claude-opus-4-6", // the chat's selected model id
  "messages": [{ "role": "user", "content": "…" }], // full history (stateless)
  "system": "[AUREON CONTEXT …]", // compact live-data block, omitted when "Use my data" is off
  "stream": true,
}
```

The app reads `data:` lines and appends `delta.text` (or a top-level `text`)
to the streaming bubble. Anything else (keep-alives, `[DONE]`) is ignored.
With no `VITE_AI_PROXY_URL` set, the composer still records the turn locally
and shows a note that the proxy is unconfigured.

## Bots tab — Firestore write contract (for the Python bot)

The app is a **control surface**: it reads everything the bot process writes and
only ever flips `enabled`. Wire the bot's service account to these paths under
`users/{uid}/bots/{botId}`:

| Path                              | Written by                                                 | Shape                                                                                                                                                                                |
| --------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bots/{botId}` (registry doc)     | bot (all fields) / app (`enabled`, `config` when disabled) | `{ name, symbol, engine, lot, enabled, mode, status, config, configFrozenAt, heartbeatAt, version, lastError }`                                                                      |
| `bots/{botId}/trades/{tradeId}`   | bot                                                        | closed trade `{ entryTime, exitTime, direction, lot, entry, exit, pl, exitReason }` — `exitReason ∈ TP \| SL \| TRAIL \| BASKET_BREAKEVEN \| BASKET_STOP \| PHASE_END \| DAILY_LOCK` |
| `bots/{botId}/positions/{ticket}` | bot                                                        | open position, **deleted on close** `{ ticket, direction, lot, entry, current, floatingPl, sl, layer }`                                                                              |
| `bots/{botId}/days/{YYYY-MM-DD}`  | bot                                                        | pre-aggregated rollup `{ trades, wins, pl, maxDD, stopped }` — the UI reads this for ranges, never summing raw trades                                                                |
| `bots/{botId}/events/{eventId}`   | bot                                                        | alerts / config changes / start-stop `{ type, message, at }`                                                                                                                         |

- **Heartbeat**: the bot updates `heartbeatAt` every ~30s. The UI shows the
  status dot green under 60s, amber to 5m, red beyond (heartbeat lost).
- **Enable handshake**: the app writes `enabled` and shows an intermediate
  "Starting…/Stopping…" state; the bot acts on the change and confirms by
  advancing `heartbeatAt` / `status`. The UI never claims a bot is off before
  that confirmation.
- **Security** (rules to add): bot subcollections are owner-read; `enabled` and
  `config` are owner-writable, everything else is written only by the bot's
  service account. Bot data is excluded from any public share view.

> This repo is the frontend control surface. The `aiProxy` Cloud Function, the
> Firestore security rules, and the Python bot process itself live outside it and
> are wired up via the contracts above.
