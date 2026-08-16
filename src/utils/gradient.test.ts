// The vibrant pass, checked where it could do harm: the gradient must stay close
// to the theme's own accent, and text on it must still clear AA (section 16d).
import { describe, expect, it } from 'vitest'
import { THEMES, THEME_DESCRIPTORS } from '@/themes'
import { contrastRatio } from '@/themes/contrast'
import { accentGlow, accentGradient, gradientPassesAA, surfaceTint } from './gradient'

describe('accentGradient', () => {
  it('derives a two-stop gradient from an oklch accent', () => {
    const gradient = accentGradient({ accent: 'oklch(0.7 0.15 250)', group: 'dark' })
    expect(gradient.from).toMatch(/^oklch\(/)
    expect(gradient.to).toMatch(/^oklch\(/)
    expect(gradient.from).not.toBe(gradient.to)
  })

  it('keeps both stops near the accent rather than inventing a new colour', () => {
    const gradient = accentGradient({ accent: 'oklch(0.7 0.15 250)', group: 'dark' })
    const hueOf = (value: string) => Number(/\s([\d.]+)\)$/.exec(value)?.[1])
    expect(Math.abs(hueOf(gradient.from) - 250)).toBeLessThanOrEqual(15)
    expect(Math.abs(hueOf(gradient.to) - 250)).toBeLessThanOrEqual(15)
  })

  it('wraps the hue rather than producing a negative one', () => {
    const gradient = accentGradient({ accent: 'oklch(0.7 0.15 5)', group: 'dark' })
    expect(gradient.from).toContain('351')
  })

  it('gives a mono theme a flat pair, so the same components still render', () => {
    const gradient = accentGradient({ accent: '#ffffff', mono: true, group: 'dark' })
    expect(gradient.from).toBe('#ffffff')
    expect(gradient.to).toBe('#ffffff')
  })

  it('does not synthesise a gradient for a non-oklch accent', () => {
    const gradient = accentGradient({ accent: '#3366ff', group: 'dark' })
    expect(gradient.from).toBe('#3366ff')
    expect(gradient.to).toBe('#3366ff')
  })
})

describe('vibrancy never costs contrast', () => {
  for (const descriptor of THEME_DESCRIPTORS) {
    const theme = THEMES[descriptor.id]
    it(`${descriptor.id}: neither gradient stop reads worse than the flat accent`, () => {
      const gradient = accentGradient(theme)
      const flat = contrastRatio(theme.onAccent, theme.accent)
      expect(contrastRatio(theme.onAccent, gradient.from)).toBeGreaterThanOrEqual(
        Math.min(4.5, flat) - 0.01,
      )
      expect(contrastRatio(theme.onAccent, gradient.to)).toBeGreaterThanOrEqual(
        Math.min(4.5, flat) - 0.01,
      )
    })
    it(`${descriptor.id}: a gradient is only used where it keeps AA`, () => {
      const gradient = accentGradient(theme)
      const flatAlready = contrastRatio(theme.onAccent, theme.accent) >= 4.5
      // Where the flat accent clears AA, the gradient must too; where it does
      // not, the theme's own accent is the problem and the gradient collapses
      // to it rather than compounding it.
      if (flatAlready) expect(gradientPassesAA(gradient, theme.onAccent)).toBe(true)
      else expect(gradient.from).toBe(theme.accent)
    })
  }
})

describe('tint and glow', () => {
  it('tints a surface with a trace of the accent', () => {
    expect(surfaceTint({ accent: 'oklch(0.7 0.15 250)' })).toContain('color-mix')
  })

  it('leaves mono surfaces and focus rings untinted and unglowing', () => {
    expect(surfaceTint({ accent: '#fff', mono: true })).toBe('transparent')
    expect(accentGlow({ accent: '#fff', mono: true })).toBe('none')
  })

  it('expresses the glow as a shadow, never as a text colour', () => {
    expect(accentGlow({ accent: 'oklch(0.7 0.15 250)' })).toMatch(/^0 0 18px/)
  })
})
