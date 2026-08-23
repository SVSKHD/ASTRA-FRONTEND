// Contrast assertion for every registry theme (acceptances 20 and 121). Body
// text and muted text both clear WCAG AA's 4.5:1 against the theme's solid
// surface; the accent clears the 3:1 UI floor, which is the right floor for it
// because the accent is a border, a fill and a ring — never body text. Text on
// a *tinted* surface is a different question, and is asserted in
// surfacePair.test.ts. A new or edited theme that regresses fails here.
import { describe, expect, it } from 'vitest'
import { THEMES, THEME_DESCRIPTORS } from '@/themes'
import { contrastRatio } from '@/themes/contrast'

describe('contrast utility', () => {
  it('computes known ratios (black on white ≈ 21, and parses oklch)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    // A light oklch on near-black clears AA comfortably.
    expect(contrastRatio('oklch(0.85 0.16 90)', '#000000')).toBeGreaterThan(4.5)
  })
})

describe('every theme passes WCAG AA', () => {
  for (const d of THEME_DESCRIPTORS) {
    const t = THEMES[d.id]
    it(`${d.id}: body text ≥ 4.5:1 on its surface`, () => {
      expect(contrastRatio(t.text, t.bgSolid)).toBeGreaterThanOrEqual(4.5)
    })
    it(`${d.id}: secondary text ≥ 4.5:1`, () => {
      // --text-secondary is a mix of text and dim; since both clear 4.5:1 on
      // the surface and contrast is monotonic between them, asserting the two
      // ends is what actually holds the middle. Stated rather than assumed,
      // because "it is between two good values" is exactly the reasoning that
      // let muted drift below the floor in the first place.
      expect(contrastRatio(t.text, t.bgSolid)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t.dim, t.bgSolid)).toBeGreaterThanOrEqual(4.5)
    })
    it(`${d.id}: muted text ≥ 4.5:1 — it is text, not a border`, () => {
      // Raised from the 3:1 large-text floor by section 24b. Muted was being
      // used for real reading — meta lines, out-of-month day numbers — and 3:1
      // is not a reading ratio.
      expect(contrastRatio(t.dim, t.bgSolid)).toBeGreaterThanOrEqual(4.5)
    })
  }
})
