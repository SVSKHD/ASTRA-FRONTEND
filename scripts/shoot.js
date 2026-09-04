// The screenshot harness (section 38).
//
//   node scripts/shoot.js --out screenshots/after
//   node scripts/shoot.js --live            # against the real demo account
//
// It takes the SAME set every run — every mode, both themes, both widths, and
// the three forced states — because a baseline is only useful if the after shot
// is of the same things in the same order.
//
// FOUR RULES, and each of them exists because of a way this goes wrong:
//
//   1. WAIT FOR `data-ready="true"`, never for `load` or a sleep. The flag is
//      set only when the settings, the trades and the signals have each
//      delivered a first snapshot, so a shot cannot catch a half-filled table.
//   2. TURN THE MOTION OFF. Every animation and transition is zeroed before the
//      shutter, so a staggered calendar sweep cannot be caught mid-stagger and
//      diffed as a layout change.
//   3. PIN THE CLOCK. The seed is written against a fixed day; without pinning
//      `Date.now()` the session countdown reads differently every run and every
//      single image differs.
//   4. FAIL LOUDLY. A missing element or a timeout exits non-zero rather than
//      writing a picture of the wrong thing.

import { mkdir } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const has = (name) => args.includes(`--${name}`)

const BASE = flag('base', 'http://localhost:5173')
const OUT = flag('out', 'screenshots/shot')
const LIVE = has('live')

/** The clock the seed was written against, so every run reads the same. */
const PINNED_NOW = Date.parse('2026-09-04T14:20:00.000Z')

const WIDTHS = [
  { name: '1440', width: 1440, height: 1100 },
  { name: '390', width: 390, height: 1400 },
]
const THEMES = ['aurora', 'espresso']

/** Everything worth a picture, named the way a reviewer would ask for it. */
const SHOTS = [
  // A FULL month first: the pinned clock lands four days into September, which
  // is what the app looks like most of the time but photographs as a nearly
  // empty calendar. August is the month with sixty days of seed behind it.
  { name: 'trades-month', path: '/dev/shot/trades?mode=journal&month=2026-08' },
  { name: 'signals-month', path: '/dev/shot/trades?mode=signals&month=2026-08' },
  { name: 'combined-month', path: '/dev/shot/trades?mode=combined&month=2026-08' },
  { name: 'expenses-month', path: '/dev/shot/expenses?month=2026-08' },
  { name: 'trades-journal', path: '/dev/shot/trades?mode=journal' },
  { name: 'trades-signals', path: '/dev/shot/trades?mode=signals' },
  { name: 'trades-combined', path: '/dev/shot/trades?mode=combined' },
  { name: 'trades-day', path: '/dev/shot/trades?mode=journal&day=2026-09-02' },
  { name: 'expenses', path: '/dev/shot/expenses' },
  // The two live tabs (sections 39-40). `code` is shot with the tree opened —
  // a picture of three collapsed repository rows says nothing about the thing
  // the tab is for, which is reading a review without leaving the desk.
  { name: 'news', path: '/dev/shot/news' },
  { name: 'code', path: '/dev/shot/code' },
  { name: 'code-thread', path: '/dev/shot/code', open: 'thread' },
  // The bottom of a full month (section 42). The whole point of the scroll fix
  // is that there IS a bottom and it can be reached; a shot of the top proves
  // nothing about that.
  { name: 'trades-bottom', path: '/dev/shot/trades?mode=journal&month=2026-08', scroll: 'bottom' },
  { name: 'state-empty', path: '/dev/shot/trades?state=empty' },
  { name: 'state-loading', path: '/dev/shot/trades?state=loading', ready: false },
  { name: 'state-error', path: '/dev/shot/trades?state=error', ready: false },
]

/** Rule 3, installed before any of the app's own script runs. */
const PIN_CLOCK = `
  const fixed = ${PINNED_NOW};
  const RealDate = Date;
  class PinnedDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [fixed])) }
    static now() { return fixed }
  }
  Date = PinnedDate;
`

/** Rule 2. Injected as a stylesheet so it beats anything the app declares. */
const STILL = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
`

async function shoot(page, shot, theme, size, outDir) {
  const sep = shot.path.includes('?') ? '&' : '?'
  const url = `${BASE}${shot.path}${sep}theme=${theme}`
  await page.setViewportSize({ width: size.width, height: size.height })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.addStyleTag({ content: STILL })

  if (shot.ready !== false) {
    // Rule 1.
    await page.waitForSelector('[data-ready="true"]', { timeout: 15_000 })
  } else {
    // A forced state never becomes ready by design, so wait for the stage
    // itself and then for the frame it painted.
    await page.waitForSelector('[data-state]', { timeout: 15_000 })
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
  }

  // An opened state is opened by CLICKING, not by a query parameter the app
  // would then have to carry in production. The picture is of the real
  // interaction or it is a picture of something else.
  if (shot.open === 'thread') {
    await page
      .getByRole('button', { name: /astra-frontend/ })
      .first()
      .click()
    await page.getByRole('button', { name: /#61/ }).first().click()
    await page.waitForSelector('.cthread__list', { timeout: 15_000 })
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
  }

  // The bottom of the document, then a frame to settle — with the page
  // scrolling rather than a box inside it, this is a real scroll of the window.
  if (shot.scroll === 'bottom') {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
  }

  const file = join(outDir, `${shot.name}--${theme}--${size.name}.png`)
  // `fullPage` on a scrolled shot would photograph the whole document and lose
  // the thing being proved, which is what the bottom of the viewport looks like.
  await page.screenshot({ path: file, fullPage: shot.scroll !== 'bottom' })
  return file
}

async function main() {
  const outDir = OUT
  await mkdir(outDir, { recursive: true })

  const browser = await chromium.launch({
    executablePath: resolveChromium(),
    args: ['--no-sandbox', '--disable-lcd-text'],
  })
  const context = await browser.newContext({ deviceScaleFactor: 1, colorScheme: 'dark' })
  await context.addInitScript(PIN_CLOCK)
  const page = await context.newPage()

  // Nothing outside the dev server. A web font that loads on one run and times
  // out on the next is a diff on every glyph in every image, and a harness that
  // depends on the network is a harness that fails for reasons that are not
  // about the app.
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue()
    }
    return route.abort()
  })

  const failures = []
  const written = []

  if (LIVE) {
    // The real demo account. `next` is where to land after signing in.
    await page.goto(`${BASE}/dev/login?next=/trades`, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/trades/, { timeout: 20_000 }).catch(() => {
      failures.push('dev login did not reach /trades — check .env.local')
    })
  }

  for (const shot of SHOTS) {
    for (const theme of THEMES) {
      for (const size of WIDTHS) {
        try {
          written.push(await shoot(page, shot, theme, size, outDir))
        } catch (err) {
          failures.push(`${shot.name} ${theme} ${size.name}: ${err.message}`)
        }
      }
    }
  }

  await browser.close()

  for (const file of written) console.log(`wrote ${file}`)
  if (failures.length) {
    console.error(`\n${failures.length} shot(s) failed:`)
    for (const f of failures) console.error(`  ${f}`)
    process.exit(1)
  }
  console.log(`\n${written.length} shots in ${outDir}`)
}

/**
 * The browser this machine actually has.
 *
 * Playwright's own path is derived from the version it was installed with, and
 * a pinned browser in the image will not match it. Preferring what is on disk
 * is what stops the harness trying to download 150MB in a sandbox.
 */
function resolveChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  if (!existsSync(root)) return undefined
  const candidates = readdirSync(root)
    .filter((d) => d.startsWith('chromium-'))
    .map((d) => join(root, d, 'chrome-linux', 'chrome'))
    .filter((p) => existsSync(p))
  return candidates[0]
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
