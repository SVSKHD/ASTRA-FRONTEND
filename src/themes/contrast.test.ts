// Contrast assertion for every registry theme (acceptance 20). Per WCAG AA: body
// text clears 4.5:1 against the theme's solid surface, and muted/secondary text
// and the accent clear the 3:1 large-text/UI floor. A new or edited theme that
// regresses readability fails here.
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
    it(`${d.id}: muted text ≥ 3:1 (large/secondary)`, () => {
      expect(contrastRatio(t.dim, t.bgSolid)).toBeGreaterThanOrEqual(3)
    })
  }
})
