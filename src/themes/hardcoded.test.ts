// A status colour is a token, never a literal (section 44, item 10).
//
// THE DISTINCTION THIS TEST ENCODES, because "no hard-coded colours" is too
// blunt a rule and would be either ignored or wrong:
//
//   A STATUS colour says how something is going — a failing check, an overdue
//   row, a met target. It has to be derived per theme, because it must clear
//   4.5:1 against nineteen different grounds and must collapse to the theme's
//   own text on the two zero-chroma themes, which carry status by weight and
//   glyph instead of by hue. A literal red cannot do either of those things: it
//   was picked once, against one ground, by somebody looking at one theme.
//
//   An IDENTITY colour is what something IS. Google's four-colour G, a chain's
//   brand colour, a category's swatch, the palette a user picks a goal colour
//   from, the planets in the starfield. Theming those would be wrong: a Google
//   logo in espresso brown is not a themed logo, it is a broken one.
//
// So this checks the first and leaves the second alone, and the allow-list
// below is the list of things that are identity — each with a reason, because
// an allow-list without reasons becomes the place things get added to instead
// of fixed.
//
// The runtime half of the same audit is `scripts/check-theme.mjs`, which renders
// every view under two opposite themes and reports any painted colour that did
// not move. This static half catches what the runtime half cannot: a colour on
// a state no fixture happens to produce — an overdue chip with nothing overdue,
// a warning box with nothing wrong.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SRC = resolve(__dirname, '..')

/**
 * Files whose colours are IDENTITY, not status.
 *
 * Every entry is a thing that would be wrong to theme, with why.
 */
const IDENTITY: Record<string, string> = {
  'components/AuthDialog.vue': "Google's four-colour G. A themed brand mark is a broken one.",
  'components/Celestial.vue': 'The planets and the moon. Scene art, not chrome.',
  'components/Starfield.vue': 'The sky itself.',
  'components/CursorTail.vue': 'The pointer trail, drawn on the sky.',
  'components/ui/ColorPicker.vue': 'The swatches are the choices.',
  'components/GoalCreateSlideOver.vue': 'The palette a goal colour is picked FROM.',
  'components/WalletQrDialog.vue': 'A QR code is black on white or it does not scan.',
  'components/trips/TripLightbox.vue': 'White on a photograph, which has no theme.',
  'components/trips/TripDetail.vue': 'Likewise, over imagery.',
  'components/trips/TripItinerary.vue': 'Likewise, over imagery.',
  'components/views/FinancesView.vue': 'A categorical series palette for the chart.',
  'components/shell/ShellBar.vue': "The Auto theme's swatch is a wheel of every theme.",
  'utils/chains.ts': 'Chain brand colours — Ethereum purple is Ethereum purple.',
  'utils/txnCategories.ts': 'Category identity swatches.',
  'utils/colors.ts': 'The urgency ramp itself, which is where that ramp is defined.',
  'utils/mono.ts': 'The zero-chroma helpers, which are about the absence of hue.',
  'utils/gradient.ts': 'Derives the accent gradient from the theme.',
  'themes/index.ts': 'The theme definitions themselves.',
  'themes/extra.ts': 'The theme definitions themselves.',
  'stores/app.ts': 'TAG_COLORS is the palette a finance tag colour is picked FROM.',
  'utils/calendarEvents.ts':
    'One colour per event SOURCE. Green for a goal means "goal", not "good".',
  'utils/githubModel.ts':
    "Mirrors GitHub's own open/closed colours so a reader recognises the chip.",
  'themes/status.ts': 'Where the status tokens are derived. The literals ARE the derivation.',
  'themes/plScale.ts': 'Where the P/L ramp is derived.',
  'themes/spendScale.ts': 'Where the spend ramp is derived.',
  'themes/contrast.ts': 'The contrast maths.',
  'views/UiShowcaseView.vue': 'The component gallery, which shows colours as its subject.',
  'dev/LoadingStates.vue': 'A dev-only stage.',
  'styles.ts': 'Declares the tokens.',
}

/** Roughly: a red, an amber or a green — the three a status colour can be. */
function statusHues(source: string): string[] {
  const hits: string[] = []
  // oklch(L C H) — hue 20–35 is red, 45–95 amber/gold, 130–170 green.
  for (const m of source.matchAll(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/g)) {
    const chroma = Number(m[2])
    const hue = Number(m[3])
    // A near-zero chroma is a neutral, whatever its hue says.
    if (chroma < 0.05) continue
    const isStatus =
      (hue >= 18 && hue <= 35) || (hue >= 45 && hue <= 95) || (hue >= 130 && hue <= 170)
    if (isStatus) hits.push(m[0] + ')')
  }
  return hits
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (/\.(vue|ts)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full)
  }
  return out
}

describe('status colours are tokens', () => {
  const files = walk(SRC)

  it('finds the source tree', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('has no red, amber or green literal outside the files that define them', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = relative(SRC, file).split('\\').join('/')
      if (IDENTITY[rel]) continue
      const hits = statusHues(readFileSync(file, 'utf8'))
      if (hits.length) offenders.push(`${rel}: ${[...new Set(hits)].join(', ')}`)
    }
    // The message is the list, so a failure names the file and the colour
    // rather than a count.
    expect(offenders).toEqual([])
  })

  it('gives every identity exemption a reason', () => {
    // An allow-list without reasons becomes the place things get added to
    // instead of fixed.
    for (const [file, why] of Object.entries(IDENTITY)) {
      expect(why.length, file).toBeGreaterThan(12)
    }
  })

  it('names only files that exist', () => {
    // A stale exemption silently un-exempts nothing and quietly exempts a
    // future file that lands on the same path.
    for (const file of Object.keys(IDENTITY)) {
      expect(() => readFileSync(join(SRC, file), 'utf8'), file).not.toThrow()
    }
  })
})

describe('the tokens themselves', () => {
  it('are custom-property references, so a theme change reaches them through the cascade', async () => {
    const { DANGER, SUCCESS, WARNING } = await import('@/styles')
    expect(DANGER).toBe('var(--theme-danger)')
    expect(SUCCESS).toBe('var(--theme-success)')
    expect(WARNING).toBe('var(--theme-warning)')
  })

  it('are all written to the document by applyThemeToDom', () => {
    // A reference to a property nothing sets is a colour that renders as
    // nothing — worse than the literal it replaced.
    const apply = readFileSync(resolve(__dirname, 'apply.ts'), 'utf8')
    expect(apply).toContain('statusTokens')
    const status = readFileSync(resolve(__dirname, 'status.ts'), 'utf8')
    for (const name of ['--theme-danger', '--theme-success', '--theme-warning']) {
      expect(status, name).toContain(name)
    }
  })
})
