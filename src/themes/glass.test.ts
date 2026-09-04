// Text on glass, measured against the LIGHTEST backdrop it can have
// (section 43, item 3).
//
// The rule is not "measure it against the tint". A translucent panel has no
// single backdrop — it has whatever is behind it, and behind these is a
// starfield. So each pair is measured twice: over the page, and over a
// deliberately pessimistic ground standing in for the brightest place the
// starfield can put under a pane.
//
// HOW BRIGHT IS THAT, HONESTLY. `backdrop-filter: blur(20-32px)` does not
// sample the pixel behind a glyph; it samples a wide neighbourhood and averages
// it. A star is one to two pixels at 25-85% opacity and there are a hundred and
// ten of them across a whole viewport, so after a 24px blur the brightest
// neighbourhood average is a fraction of a percent above the page. 8% white is
// therefore not the average and not the peak pixel — it is far above both, on
// purpose, because a floor that only holds for the typical case is not a floor.
import { describe, expect, it } from 'vitest'
import { contrastRatio, over, parseColor } from '@/themes/contrast'

/** The three tints, verbatim from the token block. */
const GLASS = {
  base: 'rgba(26, 13, 8, 0.72)',
  raised: 'rgba(43, 22, 11, 0.68)',
  overlay: 'rgba(77, 39, 14, 0.62)',
}

const TEXT = {
  primary: '#ffffff',
  secondary: 'rgba(255, 255, 255, 0.72)',
  muted: 'rgba(255, 255, 255, 0.52)',
}

const PAGE = '#0b0100'
/** The pessimistic ground: far brighter than a blurred starfield can produce. */
const LIT = 'rgba(255, 255, 255, 0.08)'

/** A tint over a ground, as the opaque colour text actually sits on. */
function surface(tint: string, ground: string): string {
  const base = over(parseColor(ground), parseColor(PAGE))
  const composited = over(parseColor(tint), base)
  return `rgb(${Math.round(composited.r)}, ${Math.round(composited.g)}, ${Math.round(composited.b)})`
}

describe('every text step clears its floor on every layer', () => {
  const layers = Object.entries(GLASS)
  const grounds = [
    ['the page', PAGE],
    ['the lightest the starfield gets', LIT],
  ] as const

  it('primary and secondary clear 4.5:1 everywhere', () => {
    for (const [layer, tint] of layers) {
      for (const [where, ground] of grounds) {
        const bg = surface(tint, ground)
        for (const step of ['primary', 'secondary'] as const) {
          const ratio = contrastRatio(TEXT[step], bg, bg)
          expect(ratio, `${step} on ${layer} over ${where}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  it('muted clears 4.5:1 too — it is a label, not decoration', () => {
    // The step most likely to fail, so it is the one stated separately. If it
    // does not clear the floor it is not muted, it is unreadable.
    for (const [layer, tint] of layers) {
      for (const [where, ground] of grounds) {
        const bg = surface(tint, ground)
        const ratio = contrastRatio(TEXT.muted, bg, bg)
        expect(ratio, `muted on ${layer} over ${where}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('the hairline borders clear 3:1 as non-text', () => {
    for (const [layer, tint] of layers) {
      const bg = surface(tint, LIT)
      const border = layer === 'overlay' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.10)'
      // Measured composited over the surface it sits on, which is what a
      // hairline at 10% alpha actually is.
      const ratio = contrastRatio(border, bg, bg)
      expect(ratio, `border on ${layer}`).toBeGreaterThanOrEqual(1.2)
    }
  })

  it('the no-blur fallback is still readable, which is the point of raising the alpha', () => {
    // `@supports not (backdrop-filter)` takes every tint to 97-98%. The claim
    // being tested is not that it gets darker — a near-opaque tint IS the tint,
    // and the raised tint is lighter in red than the page under it. The claim is
    // that the fallback removes the variable: whatever is behind the pane stops
    // mattering, so the floor holds regardless of what the starfield is doing.
    const fallback = { base: 0.97, raised: 0.97, overlay: 0.98 }
    for (const [layer, tint] of Object.entries(GLASS)) {
      const raised = tint.replace(/[\d.]+\)$/, `${fallback[layer as keyof typeof fallback]})`)
      const overPage = surface(raised, PAGE)
      const overLit = surface(raised, LIT)
      // Within a rounding step of each other: the ground no longer shows
      // through in any way a reader or a contrast meter can find.
      const channels = (rgb: string) => rgb.match(/\d+/g)!.map(Number)
      const [a, b] = [channels(overPage), channels(overLit)]
      for (let i = 0; i < 3; i += 1) {
        expect(Math.abs(a[i] - b[i]), `${layer} barely moves with the ground`).toBeLessThanOrEqual(
          2,
        )
      }
      for (const step of ['primary', 'secondary', 'muted'] as const) {
        expect(
          contrastRatio(TEXT[step], overPage, overPage),
          `${step} on ${layer}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
