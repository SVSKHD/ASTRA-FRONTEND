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
- **Firebase auth** (Google / GitHub) with **Firestore** sync across devices.

## Getting started

```bash
npm install
npm run dev
```

The app runs immediately in **local-only mode** with seed data — no Firebase
config required. Sign-in buttons fall back to a demo profile.

## Firebase (optional, for cloud sync)

Copy `.env.example` to `.env.local` and fill in your Firebase web config:

```bash
cp .env.example .env.local
```

In the [Firebase console](https://console.firebase.google.com/):

1. Enable **Authentication** → Google and GitHub providers.
2. Create a **Cloud Firestore** database.
3. Copy the web app config values into `.env.local`.

All tracker data is stored per user at `aureon-notes/{uid}` and kept in sync
through a realtime listener. Deploy the included owner-only Firestore rules with
`firebase deploy --only firestore:rules`.

## Scripts

| Script               | Description                         |
| -------------------- | ----------------------------------- |
| `npm run dev`        | Start the Vite dev server           |
| `npm run build`      | Type-check and build for production |
| `npm run preview`    | Preview the production build        |
| `npm run type-check` | Run `vue-tsc` only                  |

## Notes

- GitHub repo/PR/issue data is currently mocked (deterministic per repo name);
  the real GitHub API calls are marked with comments where they would slot in.
- The previous Next.js/React app has been moved to [`legacy-next/`](./legacy-next).
