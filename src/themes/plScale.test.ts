// The scale's two promises, checked on every theme in the registry: the steps
// are ordered and distinct, and every one of them can carry the day number.
import { describe, expect, it } from 'vitest'
import { THEMES, type ThemeKey } from '@/themes'
import { contrastRatio, parseColor } from '@/themes/contrast'
import {
  AA_TEXT,
  PL_STEPS,
  plFlat,
  plScaleTokens,
  plStep,
  plWash,
  plWashVar,
} from '@/themes/plScale'

const KEYS = Object.keys(THEMES) as ThemeKey[]

// Perceived lightness of an sRGB colour, for asserting the ramp is monotonic.
function luma(color: string): number {
  const { r, g, b } = parseColor(color)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('plStep', () => {
  it('spreads the target over five steps', () => {
    expect(plStep(1, 10)).toBe(1)
    expect(plStep(2, 10)).toBe(1)
    expect(plStep(3, 10)).toBe(2)
    expect(plStep(6, 10)).toBe(3)
    expect(plStep(9, 10)).toBe(5)
    expect(plStep(10, 10)).toBe(5)
  })

  it('caps a day that beat the target rather than running off the ramp', () => {
    expect(plStep(400, 10)).toBe(PL_STEPS)
  })

  it('reads a loss by its size, not its sign', () => {
    expect(plStep(-6, 10)).toBe(plStep(6, 10))
  })

  it('gives a day that did not move no step at all', () => {
    expect(plStep(0, 10)).toBe(0)
    expect(plWashVar('flat', 0, 10)).toBe('var(--pl-flat)')
    expect(plWashVar('pos', 0, 10)).toBe('var(--pl-flat)')
  })

  it('survives a target of zero', () => {
    expect(plStep(5, 0)).toBe(PL_STEPS)
  })

  it('names the token a cell asks for', () => {
    expect(plWashVar('pos', 6, 10)).toBe('var(--pl-pos-3)')
    expect(plWashVar('neg', 10, 10)).toBe('var(--pl-neg-5)')
  })
})

describe('the ramp, on every theme', () => {
  for (const key of KEYS) {
    const theme = THEMES[key]

    it(`${key}: every step carries the day number at ${AA_TEXT}:1`, () => {
      for (const side of ['pos', 'neg'] as const) {
        for (let step = 1; step <= PL_STEPS; step += 1) {
          const wash = plWash(theme, side, step)
          expect(contrastRatio(theme.text, wash), `${key} ${side}-${step}`).toBeGreaterThanOrEqual(
            AA_TEXT,
          )
        }
      }
      expect(contrastRatio(theme.text, plFlat(theme)), `${key} flat`).toBeGreaterThanOrEqual(
        AA_TEXT,
      )
    })

    it(`${key}: the steps are distinct and ordered away from the page`, () => {
      for (const side of ['pos', 'neg'] as const) {
        const ramp = Array.from({ length: PL_STEPS }, (_, i) => plWash(theme, side, i + 1))
        // Distinct: five steps that resolve to three colours is a three-step
        // scale with a five-step API.
        expect(new Set(ramp).size, `${key} ${side}`).toBe(PL_STEPS)
        // Ordered: a dark theme's ramp lightens, a light theme's darkens, and
        // in both the last step is furthest from the surface.
        const rising = theme.group !== 'light'
        for (let i = 1; i < ramp.length; i += 1) {
          const step = luma(ramp[i]) - luma(ramp[i - 1])
          expect(rising ? step : -step, `${key} ${side} step ${i}`).toBeGreaterThan(0)
        }
      }
    })

    it(`${key}: a zero-chroma theme gets a zero-chroma ramp`, () => {
      if (!theme.mono) return
      for (let step = 1; step <= PL_STEPS; step += 1) {
        // Achromatic means the three channels agree; the sign is carried by
        // the cell's edge and its mark instead.
        for (const side of ['pos', 'neg'] as const) {
          const { r, g, b } = parseColor(plWash(theme, side, step))
          expect(Math.max(r, g, b) - Math.min(r, g, b), `${key} ${side}-${step}`).toBeLessThan(6)
        }
      }
    })
  }

  it('publishes eleven tokens, so a surface can use the ramp without rebuilding it', () => {
    const tokens = plScaleTokens(THEMES.deepSpace)
    expect(Object.keys(tokens).sort()).toEqual(
      [
        '--pl-flat',
        ...Array.from({ length: PL_STEPS }, (_, i) => `--pl-neg-${i + 1}`),
        ...Array.from({ length: PL_STEPS }, (_, i) => `--pl-pos-${i + 1}`),
      ].sort(),
    )
  })
})
