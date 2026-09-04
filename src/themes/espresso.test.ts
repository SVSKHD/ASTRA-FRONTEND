// Espresso's own numbers (section 29).
//
// The palette is stated twice on purpose — once in the registry, for the running
// app, and once in `components/ui/tokens.css`, which is what paints the first
// frame before any module is parsed. Two copies of a palette drift, so the first
// test here reads both and compares them, and the rest hold the contrast claims
// the theme is built on.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { THEMES } from '@/themes'
import { contrastRatio, over, parseColor } from '@/themes/contrast'
import { AA_TEXT, PL_STEPS, WASH_ALPHA, plFlat, plInk, plWash } from '@/themes/plScale'

const espresso = THEMES.espresso
const TOKENS = readFileSync(join(process.cwd(), 'src/components/ui/tokens.css'), 'utf8')
const BLOCK = TOKENS.slice(
  TOKENS.indexOf("[data-theme='espresso'] {"),
  TOKENS.indexOf('/* The overlay layer'),
)

function token(name: string): string {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(BLOCK)?.[1].trim() ?? ''
}

/** WCAG floors, rounded the way a spec sheet quotes them. */
const ratio = (fg: string, bg: string) => Math.round(contrastRatio(fg, bg) * 100) / 100

describe('the two copies of the palette agree', () => {
  // Compared as colours rather than as strings: the stylesheet writes modern
  // `rgb(r g b / n%)` and the registry writes `rgba(r, g, b, n)`, which are the
  // same colour and different text. A string comparison would fail on the
  // punctuation and pass on a genuinely wrong value with the right punctuation.
  const same = (a: string, b: string) => {
    const [x, y] = [parseColor(a), parseColor(b)]
    return (
      Math.abs(x.r - y.r) < 1 &&
      Math.abs(x.g - y.g) < 1 &&
      Math.abs(x.b - y.b) < 1 &&
      Math.abs(x.a - y.a) < 0.01
    )
  }

  const PAIRS: [string, string][] = [
    ['--bg', espresso.pageBg],
    // The three glass tints (section 43). These are what applyThemeToDom writes
    // to :root as inline styles, so a drift here is a drift the running app has
    // and the first frame does not.
    ['--glass-base', espresso.glass],
    ['--glass-raised', espresso.card],
    ['--glass-border', espresso.border],
    ['--glass-solid', espresso.bgSolid],
    ['--text-primary', espresso.text],
    ['--text-secondary', espresso.textSecondary!],
    ['--text-muted', espresso.textMuted!],
    ['--accent', espresso.accent],
    ['--accent-soft', espresso.accentSoft!],
  ]

  for (const [name, registry] of PAIRS) {
    it(`${name} is the same in the stylesheet and the registry`, () => {
      expect(same(token(name), registry), `${token(name)} vs ${registry}`).toBe(true)
    })
  }

  it('states the surfaces darkest to lightest, composited over the page', () => {
    // Each tint over the page it actually sits on: a translucent surface has no
    // lightness of its own, and comparing the tints raw would rank them by
    // their opaque colour rather than by what a reader sees.
    const page = parseColor(espresso.pageBg)
    const order = ['--glass-base', '--glass-raised', '--glass-overlay'].map((n) => {
      const c = over(parseColor(token(n)), page)
      return contrastRatio('#ffffff', `rgb(${c.r}, ${c.g}, ${c.b})`)
    })
    // Contrast against white falls as a surface lightens, so the ladder is
    // strictly descending — the machine-readable form of "darkest to lightest,
    // and no two the same".
    for (let i = 1; i < order.length; i += 1) expect(order[i]).toBeLessThan(order[i - 1])
  })
})

describe('espresso text clears the floor', () => {
  const BASE = espresso.bgSolid

  it('primary, secondary and muted all clear 4.5:1 on the base surface', () => {
    expect(ratio(espresso.text, BASE)).toBeGreaterThanOrEqual(AA_TEXT)
    expect(ratio(espresso.textSecondary!, BASE)).toBeGreaterThanOrEqual(AA_TEXT)
    expect(ratio(espresso.textMuted!, BASE)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('and on the raised surface a panel actually uses', () => {
    for (const colour of [espresso.text, espresso.textSecondary!, espresso.textMuted!]) {
      expect(ratio(colour, espresso.card)).toBeGreaterThanOrEqual(AA_TEXT)
    }
  })

  it('muted clears it on the overlay surface too, which is the tightest place it sits', () => {
    // The first cut of this theme failed here at 4.35:1 and needed a second
    // muted step for the overlay. The retune fixed it at the surface instead,
    // which is one token rather than two — and this is the measurement that
    // says so, so a future darkening of the overlay fails here.
    const overlay = token('--surface-overlay')
    expect(ratio(espresso.textMuted!, overlay)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('the accent clears the 3:1 a ring or a bar needs, everywhere it is drawn', () => {
    for (const surface of [
      espresso.pageBg,
      espresso.bgSolid,
      espresso.card,
      token('--surface-overlay'),
    ]) {
      expect(ratio(espresso.accent, surface)).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('the espresso P/L ramp', () => {
  it('is built from the theme’s own endpoints, not the derived hues', () => {
    expect(espresso.plRamp).toEqual({
      pos: ['#3F7A4B', '#8FC98A'],
      neg: ['#A34434', '#F0A090'],
    })
  })

  it('lays it on harder than the shared default, because of what it lands on', () => {
    // 12%–70% is right over a near-neutral surface and wrong over this one:
    // measured at the default, the shallowest loss sat at 1.03:1 against a
    // traded-but-flat cell — indistinguishable from an untraded day. The shared
    // default is unchanged for every other theme.
    expect(WASH_ALPHA).toEqual({ from: 0.12, to: 0.7 })
    expect(espresso.washAlpha).toEqual({ from: 0.34, to: 0.85 })
  })

  it('keeps every wash legible by moving the numeral, never the wash', () => {
    for (const side of ['pos', 'neg'] as const) {
      for (let step = 1; step <= PL_STEPS; step += 1) {
        const wash = plWash(espresso, side, step)
        expect(ratio(plInk(espresso, side, step), wash), `${side}-${step}`).toBeGreaterThanOrEqual(
          AA_TEXT,
        )
      }
    }
  })

  it('flips the numeral only where white cannot sit on the wash', () => {
    // Four steps out of ten. The retune lays the wash on harder (34% rather
    // than 12% at the shallow end, because 12% of anything over warm brown is
    // warm brown), so the deep half of both ramps is now too light for white
    // and takes the dark ink instead. Named rather than counted, because a
    // change that flips a SHALLOW step is a change to the ramp itself.
    const flipped: string[] = []
    for (const side of ['pos', 'neg'] as const) {
      for (let step = 1; step <= PL_STEPS; step += 1) {
        if (plInk(espresso, side, step) !== espresso.text) flipped.push(`${side}-${step}`)
      }
    }
    expect(flipped).toEqual(['pos-4', 'pos-5', 'neg-4', 'neg-5'])
  })

  it('keeps the negative ramp off the surface it sits on', () => {
    // The specific risk on a warm brown ground: a muted brick red IS brown, so
    // the shallowest loss step stops reading as a loss and starts reading as an
    // untraded day. Measured against the flat cell, which is what it would be
    // confused with, and required to be at least as separated as the positive
    // side's shallowest step — which has an easy time of it here.
    const flat = plFlat(espresso)
    const negOne = contrastRatio(plWash(espresso, 'neg', 1), flat)
    const posOne = contrastRatio(plWash(espresso, 'pos', 1), flat)
    expect(negOne).toBeGreaterThan(1.08)
    expect(negOne).toBeGreaterThanOrEqual(posOne * 0.9)
  })

  it('gives a traded-but-flat day the raised surface, not a colour', () => {
    expect(plFlat(espresso).replace(/\s/g, '')).toBe('rgb(43,22,11)')
  })
})

describe('espresso is a dark theme that draws its own chrome', () => {
  it('tells the browser so, for the parts a stylesheet cannot reach', () => {
    expect(espresso.colorScheme).toBe('dark')
    expect(BLOCK).toContain('color-scheme: dark')
  })

  it('has glass now, and a blur that deepens as the layer rises (section 43)', () => {
    // The earlier reasoning was "a blur over a near-black page is a slightly
    // different near-black", and it was right about a near-black page. The page
    // is a starfield: a panel that hides it is a hole cut in the sky.
    expect(espresso.noGlass).toBeUndefined()
    const radius = (name: string) => Number(/blur\((\d+)px\)/.exec(token(name))?.[1] ?? 0)
    expect(radius('--glass-blur-base')).toBe(20)
    expect(radius('--glass-blur-raised')).toBe(24)
    expect(radius('--glass-blur-overlay')).toBe(32)
    // Saturation with the blur, not instead of it: blurring alone greys what is
    // behind the pane, and a greyed starfield is a starfield gone.
    for (const name of ['--glass-blur-base', '--glass-blur-raised', '--glass-blur-overlay']) {
      expect(token(name), name).toMatch(/saturate\(1[4-9]0%\)/)
    }
  })

  it('every layer carries the edge highlight — it is what reads as glass', () => {
    // One pixel of light along the top, the way a real pane catches it. More of
    // the illusion lives here than in the blur, which is why it is in every
    // recipe rather than left to each component.
    expect(token('--glass-edge')).toMatch(/inset 0 1px 0/)
    for (const layer of ['base', 'raised', 'overlay']) {
      const recipe = token(`--layer-${layer}-shadow`)
      expect(recipe, layer).toMatch(/var\(--glass-edge\)|inset 0 1px 0/)
    }
    const recipes = ['base', 'raised', 'overlay'].map((l) => token(`--layer-${l}-shadow`))
    // Three recipes, none of them shared: one reused across two layers is what
    // makes a layered interface read as flat with blur on it.
    expect(new Set(recipes).size).toBe(3)
  })

  it('thickens the icon hairline for a near-black ground', () => {
    expect(token('--icon-stroke')).toBe('1.6')
  })
})
