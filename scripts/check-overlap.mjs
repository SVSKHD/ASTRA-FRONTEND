// Does any chrome element sit on top of content? (section 44, item 10.)
//
//   node scripts/check-overlap.mjs
//   node scripts/check-overlap.mjs --shots screenshots/shell
//
// This is the acceptance for the whole shell rework, and it is a measurement
// rather than a look. The three reported overlaps — the reminder pill over
// "+ New todo", the sync pill over the dock, the action cluster over the trades
// table's last rows — were all invisible in a code review and all obvious in a
// `getBoundingClientRect()`.
//
// WHAT IT CHECKS, per page, per theme, per width:
//
//   1. No chrome region's box intersects the content region's box. The four
//      regions are laid out by one grid, so this is the grid's own promise
//      being held to.
//   2. No individual chrome ELEMENT (every button and pill inside the strip,
//      the bar and the rail) intersects any content element that carries text.
//      Region boxes agreeing is not enough on its own: a popover, a tooltip or
//      an element with a negative margin can still escape its region.
//   3. The document does not scroll horizontally, at either width.
//   4. On the Trades page it scrolls the content region to its very bottom
//      first, so the check is made against the LAST row rather than the first —
//      which is the row that was covered.
//
// It exits non-zero on any overlap, and names both boxes.

import { mkdir } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}

const BASE = flag('base', 'http://localhost:5173')
const SHOTS = flag('shots', '')

/** The clock the seed was written against, so every run reads the same. */
const PINNED_NOW = Date.parse('2026-09-04T14:20:00.000Z')

const WIDTHS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 780 },
]
const THEMES = ['aurora', 'espresso']

/** Every page section 44 names, each shot with the real chrome around it. */
const PAGES = [
  { name: 'dashboard', path: '/dev/shot/overview?shell=1' },
  { name: 'todos', path: '/dev/shot/todo?shell=1' },
  // Scrolled to the final row: a check made at the top of a table proves
  // nothing about the row that was covered.
  { name: 'trades-last-row', path: '/dev/shot/trades?shell=1&month=2026-08', scroll: 'bottom' },
  { name: 'code-setup', path: '/dev/shot/code?shell=1', open: 'setup' },
]

const PIN_CLOCK = `
  const fixed = ${PINNED_NOW};
  const RealDate = Date;
  class PinnedDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [fixed])) }
    static now() { return fixed }
  }
  Date = PinnedDate;
`

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

/**
 * The measurement, run in the page.
 *
 * Two boxes overlap when they intrude on each other on BOTH axes. Elements
 * stacked in a column share a horizontal span for their whole width and that is
 * not a collision; only a mutual intrusion is. Two pixels of tolerance, because
 * text is sub-pixel positioned and adjacent boxes routinely share an edge.
 */
const MEASURE = `() => {
  const TOL = 2
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height }
  }
  const hits = (a, b) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > TOL &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > TOL
  const visible = (el) => {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  const where = (el) => {
    const id = el.id ? '#' + el.id : ''
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
      : ''
    const label = el.getAttribute('aria-label') || ''
    const text = (el.textContent || '').trim().slice(0, 34)
    return el.tagName.toLowerCase() + id + cls + (label ? '[' + label + ']' : '') +
      (text ? ' "' + text + '"' : '')
  }

  const shell = document.querySelector('.app-shell')
  if (!shell) return { error: 'no .app-shell on the page' }
  const strip = document.querySelector('.shell-strip')
  const bar = document.querySelector('.shell-bar')
  const rail = document.querySelector('.app-shell__rail')
  const content = document.querySelector('.app-shell__content')
  if (!strip || !bar || !rail || !content) return { error: 'a shell region is missing' }

  const regions = { strip, bar, rail }
  const contentBox = box(content)
  const regionOverlaps = []
  for (const [name, el] of Object.entries(regions)) {
    if (!visible(el)) continue
    const b = box(el)
    if (hits(b, contentBox)) {
      regionOverlaps.push({ region: name, regionBox: b, contentBox })
    }
  }

  // Every leaf-ish element inside the chrome, against every text-carrying
  // element inside the content. Leaves only: a container overlapping is its
  // children overlapping, reported once.
  const leaves = (root) =>
    [...root.querySelectorAll('*')].filter(
      (el) => visible(el) && !el.querySelector('*') || (visible(el) && el.matches('button, a, input'))
    )
  const chromeEls = [strip, bar, rail].flatMap((r) => leaves(r))
  const contentEls = [...content.querySelectorAll('*')].filter(
    (el) =>
      visible(el) &&
      (el.children.length === 0
        ? (el.textContent || '').trim().length > 0
        : el.matches('button, a, input, th, td'))
  )

  // A content element is CLIPPED BY ITS SCROLLPORT before it is compared.
  // \`getBoundingClientRect\` reports where a box would be, not where it is
  // painted: a table row scrolled above the top of the content region still
  // reports a negative-ish y, and testing that rectangle against the strip
  // finds an "overlap" in pixels the browser draws nothing in. Intersecting
  // with the content region first is what makes this a measurement of what is
  // actually on screen.
  const clip = (b) => {
    const left = Math.max(b.left, contentBox.left)
    const top = Math.max(b.top, contentBox.top)
    const right = Math.min(b.right, contentBox.right)
    const bottom = Math.min(b.bottom, contentBox.bottom)
    if (right - left <= 0 || bottom - top <= 0) return null
    return { left, top, right, bottom, w: right - left, h: bottom - top }
  }

  const elementOverlaps = []
  for (const a of chromeEls) {
    const ab = box(a)
    for (const b of contentEls) {
      // Scrolled out of the content region's window: not painted, not covered.
      const bb = clip(box(b))
      if (!bb) continue
      if (!hits(ab, bb)) continue
      elementOverlaps.push({ chrome: where(a), content: where(b), chromeBox: ab, contentEl: bb })
      if (elementOverlaps.length >= 12) break
    }
    if (elementOverlaps.length >= 12) break
  }

  return {
    regionOverlaps,
    elementOverlaps,
    docScrollsX: document.documentElement.scrollWidth - document.documentElement.clientWidth > 2,
    contentScrollsX: content.scrollWidth - content.clientWidth > 2,
    atBottom: content.scrollTop + content.clientHeight >= content.scrollHeight - 2,
    contentScrollHeight: content.scrollHeight,
  }
}`

function resolveChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  if (!existsSync(root)) return undefined
  const candidates = readdirSync(root)
    .filter((d) => d.startsWith('chromium-'))
    .map((d) => join(root, d, 'chrome-linux', 'chrome'))
    .filter((p) => existsSync(p))
  return candidates[0]
}

async function main() {
  if (SHOTS) await mkdir(SHOTS, { recursive: true })
  const browser = await chromium.launch({
    executablePath: resolveChromium(),
    args: ['--no-sandbox', '--disable-lcd-text'],
  })
  const context = await browser.newContext({ deviceScaleFactor: 1, colorScheme: 'dark' })
  await context.addInitScript(PIN_CLOCK)
  const page = await context.newPage()
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue()
    }
    return route.abort()
  })

  const failures = []
  const rows = []

  for (const shot of PAGES) {
    for (const theme of THEMES) {
      for (const size of WIDTHS) {
        const label = `${shot.name} · ${theme} · ${size.name}`
        try {
          const sep = shot.path.includes('?') ? '&' : '?'
          await page.setViewportSize({ width: size.width, height: size.height })
          await page.goto(`${BASE}${shot.path}${sep}theme=${theme}`, {
            waitUntil: 'domcontentloaded',
          })
          await page.addStyleTag({ content: STILL })
          await page.waitForSelector('[data-ready="true"]', { timeout: 20_000 })

          if (shot.open === 'setup') {
            const setup = page.getByRole('button', { name: /Connect GitHub|Set up GitHub/i }).first()
            if (await setup.count()) await setup.click()
          }
          if (shot.scroll === 'bottom') {
            await page.evaluate(() => {
              const el = document.querySelector('.app-shell__content')
              if (el) el.scrollTop = el.scrollHeight
            })
          }
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))

          const result = await page.evaluate(`(${MEASURE})()`)
          if (result.error) throw new Error(result.error)

          const problems = []
          for (const o of result.regionOverlaps) {
            problems.push(`region "${o.region}" intersects the content region`)
          }
          for (const o of result.elementOverlaps) {
            problems.push(`chrome ${o.chrome} sits on content ${o.content}`)
          }
          if (result.docScrollsX) problems.push('the document scrolls horizontally')
          if (result.contentScrollsX) problems.push('the content region scrolls horizontally')
          if (shot.scroll === 'bottom' && !result.atBottom) {
            problems.push('the content region would not scroll to its bottom')
          }

          rows.push({ label, problems })
          if (problems.length) failures.push({ label, problems })

          if (SHOTS) {
            await page.screenshot({
              path: join(SHOTS, `${shot.name}--${theme}--${size.name}.png`),
            })
          }
        } catch (err) {
          const problems = [`threw: ${err.message}`]
          rows.push({ label, problems })
          failures.push({ label, problems })
        }
      }
    }
  }

  await browser.close()

  for (const row of rows) {
    console.log(`${row.problems.length ? 'FAIL' : 'ok  '}  ${row.label}`)
    for (const p of row.problems) console.log(`        ${p}`)
  }
  console.log(`\n${rows.length - failures.length}/${rows.length} clean`)
  if (failures.length) process.exit(1)
}

await main()
