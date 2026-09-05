// Which colours do NOT move when the theme does? (section 44, item 10.)
//
//   node scripts/check-theme.mjs
//   node scripts/check-theme.mjs --views todo,trades
//
// THE METHOD. A hard-coded colour is not findable by grepping for `oklch(` —
// half the app's colours are written that way legitimately, in the theme
// modules that derive them. What makes a colour wrong is that it stays the same
// when the ground underneath it changes. So this renders every view twice, under
// two themes with opposite grounds — Espresso, a near-black roast, and Aurora, a
// pale one — walks the DOM in both, and reports every element whose PAINTED
// colour is byte-identical across the two.
//
// It only counts colour that is actually painted:
//
//   • a `color` on an element with no text of its own is not on screen;
//   • a `background-color` of `transparent` is not a colour;
//   • a `border-color` on a zero-width border is the browser's default `gray`
//     showing through a `border-style: none`, which is what a table gets for
//     free and is not a decision anybody made.
//
// Without those three filters the report is nine hundred rows of noise, which is
// the same as no report.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}

const BASE = flag('base', 'http://localhost:5173')
const PINNED_NOW = Date.parse('2026-09-04T14:20:00.000Z')

/** Every view the shot stage can mount. */
const ALL_VIEWS = [
  'overview',
  'todo',
  'tasks',
  'reminders',
  'deadlines',
  'finances',
  'goals',
  'ideas',
  'bots',
  'wallets',
  'trades',
  'expenses',
  'news',
  'code',
]
const VIEWS = flag('views', '') ? flag('views', '').split(',') : ALL_VIEWS

/**
 * Two themes with opposite grounds.
 *
 * Espresso is a near-black roast and Aurora is pale. A colour that is right on
 * both without changing is either a token doing its job through a `color-mix`
 * that happens to land the same — vanishingly unlikely — or a literal.
 */
const THEMES = ['espresso', 'aurora']

const PIN_CLOCK = `
  const fixed = ${PINNED_NOW};
  const RealDate = Date;
  class PinnedDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [fixed])) }
    static now() { return fixed }
  }
  Date = PinnedDate;
`

const GRAB = `(() => {
  const out = []
  const seen = new Set()
  const label = (el) => {
    const cls =
      typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\\s+/)[0]
        : ''
    return el.tagName.toLowerCase() + cls
  }
  const walk = (el, path) => {
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (r.width > 1 && r.height > 1) {
      // Text of its own, not its children's: a wrapper's inherited colour is
      // painted by the leaf, and reporting both is reporting it twice.
      const ownText = [...el.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
      )
      const paints = {
        color: ownText ? s.color : '',
        background: s.backgroundColor,
        borderTop: parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' ? s.borderTopColor : '',
        outline: parseFloat(s.outlineWidth) > 0 && s.outlineStyle !== 'none' ? s.outlineColor : '',
      }
      out.push([path, paints])
    }
    let i = 0
    for (const child of el.children) walk(child, path + '>' + label(child) + ':' + i++)
  }
  const root = document.querySelector('.app-shell__content')
  if (root) walk(root, 'root')
  void seen
  return out
})()`

const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent', ''])

function resolveChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  if (!existsSync(root)) return undefined
  return readdirSync(root)
    .filter((d) => d.startsWith('chromium-'))
    .map((d) => join(root, d, 'chrome-linux', 'chrome'))
    .filter((p) => existsSync(p))[0]
}

async function main() {
  const browser = await chromium.launch({
    executablePath: resolveChromium(),
    args: ['--no-sandbox', '--disable-lcd-text'],
  })
  const context = await browser.newContext({ deviceScaleFactor: 1 })
  await context.addInitScript(PIN_CLOCK)
  const page = await context.newPage()
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue()
    }
    return route.abort()
  })

  let total = 0
  const rows = []

  for (const view of VIEWS) {
    const grabs = {}
    for (const theme of THEMES) {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(`${BASE}/dev/shot/${view}?shell=1&theme=${theme}`, {
        waitUntil: 'domcontentloaded',
      })
      await page.addStyleTag({
        content:
          '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}',
      })
      await page.waitForSelector('[data-ready="true"]', { timeout: 20_000 }).catch(() => {})
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
      grabs[theme] = await page.evaluate(GRAB)
    }

    const first = new Map(grabs[THEMES[0]].map((r) => [r[0], r[1]]))
    const stuck = new Map()
    for (const [path, paints] of grabs[THEMES[1]]) {
      const other = first.get(path)
      if (!other) continue
      for (const key of Object.keys(paints)) {
        const value = paints[key]
        if (TRANSPARENT.has(value)) continue
        if (value !== other[key]) continue
        const entry = stuck.get(`${key}: ${value}`) ?? { count: 0, where: path }
        entry.count += 1
        stuck.set(`${key}: ${value}`, entry)
      }
    }
    total += [...stuck.values()].reduce((n, e) => n + e.count, 0)
    rows.push({ view, stuck })
  }

  await browser.close()

  for (const { view, stuck } of rows) {
    if (!stuck.size) {
      console.log(`ok    ${view}`)
      continue
    }
    console.log(`STUCK ${view}`)
    for (const [decl, entry] of [...stuck.entries()].sort((a, b) => b[1].count - a[1].count)) {
      console.log(`        ${String(entry.count).padStart(3)}×  ${decl}`)
      console.log(`             e.g. ${entry.where.slice(-90)}`)
    }
  }
  console.log(`\n${total} painted declaration(s) identical across ${THEMES.join(' and ')}`)
  if (total) process.exit(1)
}

await main()
