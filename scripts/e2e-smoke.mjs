// End-to-end smoke test for the existing finance routes (Phase 6 migration guard).
//
//   npm run e2e:smoke                       # starts its own fixture dev server
//   node scripts/e2e-smoke.mjs --base http://localhost:5173   # an already-running one
//
// The migration replaces the data, auth and AI layers underneath these screens,
// stage by stage. This script is the tripwire: every finance route must still
// mount, render its real content and throw nothing, before AND after each stage.
//
// It runs fully offline: the dev server is started with VITE_FIXTURE=1, so the
// data layer is the in-memory seed (src/dev/fixture.ts) and no Supabase, Netlify
// or Aureon call leaves the machine. Two kinds of check:
//
//   1. The finance VIEWS through the stage (/dev/shot/<view>), which mounts the
//      real component with seeded data and a signed-in demo user. These must
//      reach data-ready (trades, expenses) or render their content, with no
//      uncaught error.
//   2. The production ROUTES (/trades, /expenses, /?tab=finances, ...), which
//      must resolve, keep their URL and mount the shell with no uncaught error.
//      (Signed out here, so they stop at the sign-in card — the point is that
//      the router and the boot path survive, not the data.)
//
// Exit code 0 only when every check passes.

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const PORT = Number(flag('port', '5179'))
const EXTERNAL = flag('base', '')
const BASE = EXTERNAL || `http://127.0.0.1:${PORT}`

/** Finance views on the stage, and the text each must show once rendered. */
const VIEWS = [
  { name: 'trades journal', path: '/dev/shot/trades?mode=journal&month=2026-08', ready: true },
  { name: 'trades signals', path: '/dev/shot/trades?mode=signals&month=2026-08', ready: true },
  { name: 'trades combined', path: '/dev/shot/trades?mode=combined&month=2026-08', ready: true },
  { name: 'trades calculator', path: '/dev/shot/trades?mode=calculator', ready: true },
  { name: 'expenses', path: '/dev/shot/expenses?month=2026-08', ready: true },
  { name: 'finances', path: '/dev/shot/finances' },
  { name: 'wallets', path: '/dev/shot/wallets' },
  { name: 'bots', path: '/dev/shot/bots' },
]

/** Production routes that must still resolve and boot. */
const ROUTES = [
  { name: '/trades', path: '/trades' },
  { name: '/trades?mode=signals', path: '/trades?mode=signals' },
  { name: '/expenses', path: '/expenses' },
  { name: 'finances tab', path: '/?tab=finances' },
  { name: 'wallets tab', path: '/?tab=wallets' },
  { name: 'stocks tab', path: '/?tab=stocks' },
  { name: 'bots tab', path: '/?tab=bots' },
]

/** Noise that is not a failure of the page under test. */
const IGNORED = [
  /Failed to load resource/i, // offline fixture: favicons, fonts, feeds
  /net::ERR_/i,
  /\[vite\]/i,
  /Download the Vue Devtools/i,
  /service worker/i,
]

async function startServer() {
  const child = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--port',
      String(PORT),
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    {
      env: { ...process.env, VITE_FIXTURE: '1', BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let log = ''
  child.stdout.on('data', (d) => (log += d))
  child.stderr.on('data', (d) => (log += d))
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(BASE)
      if (r.ok) return child
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) break
    await sleep(500)
  }
  child.kill('SIGTERM')
  throw new Error(`dev server did not start on ${BASE}\n${log.slice(-2000)}`)
}

async function check(context, { name, path, ready }, kind) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const text = m.text()
    if (!IGNORED.some((re) => re.test(text))) errors.push(`console: ${text}`)
  })
  const started = Date.now()
  let failure = ''
  try {
    const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    if (!res || !res.ok()) failure = `HTTP ${res?.status()}`
    if (!failure && kind === 'view') {
      if (ready) {
        await page.waitForSelector('[data-ready="true"]', { timeout: 20_000 })
      } else {
        await page.waitForFunction(
          () => (document.querySelector('#app')?.textContent ?? '').trim().length > 40,
          null,
          { timeout: 20_000 },
        )
      }
    }
    if (!failure && kind === 'route') {
      await page.waitForFunction(
        () => (document.querySelector('#app')?.childElementCount ?? 0) > 0,
        null,
        {
          timeout: 20_000,
        },
      )
      await page.waitForTimeout(800) // let the boot path settle; late errors count
      const url = new URL(page.url())
      const want = new URL(BASE + path)
      if (url.pathname !== want.pathname) failure = `redirected to ${url.pathname}`
    }
    await page.waitForTimeout(300)
  } catch (e) {
    failure = e.message.split('\n')[0]
  }
  await page.close()
  if (!failure && errors.length) failure = errors[0]
  const ms = Date.now() - started
  console.log(
    `${failure ? 'FAIL' : 'ok  '}  ${kind.padEnd(5)}  ${name.padEnd(22)} ${ms} ms${failure ? `  — ${failure}` : ''}`,
  )
  return !failure
}

async function main() {
  const server = EXTERNAL ? null : await startServer()
  const browser = await chromium.launch()
  let ok = true
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    // The fixture never syncs; keep the PWA service worker out of the way.
    await context.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'serviceWorker', { value: undefined })
      } catch {
        /* read-only in some builds */
      }
    })
    for (const v of VIEWS) ok = (await check(context, v, 'view')) && ok
    for (const r of ROUTES) ok = (await check(context, r, 'route')) && ok
  } finally {
    await browser.close()
    server?.kill('SIGTERM')
  }
  console.log(ok ? '\nfinance smoke: all checks passed' : '\nfinance smoke: FAILED')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
