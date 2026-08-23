// Section 25b. A form needs a red that can be read on the page it is on.
import { describe, expect, it } from 'vitest'
import { THEMES, THEME_DESCRIPTORS } from '@/themes'
import { contrastRatio } from '@/themes/contrast'
import { statusToken, statusTokens } from '@/themes/status'

const KINDS = ['danger', 'success', 'warning'] as const

describe('every theme gets a readable status colour', () => {
  for (const d of THEME_DESCRIPTORS) {
    const t = THEMES[d.id]
    it(`${d.id}: all three clear 4.5:1 on the page`, () => {
      for (const kind of KINDS) {
        // 4.5 and not 3, because these are used for the error *message* as well
        // as the border, and meeting the stricter of the two is one rule
        // instead of two.
        expect(
          contrastRatio(statusToken(t, kind), t.bgSolid),
          `${d.id}/${kind}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})

describe('the zero-chroma themes', () => {
  it('get no hue at all — status is glyph, weight and underline there', () => {
    for (const id of ['monoDark', 'monoLight'] as const) {
      const t = THEMES[id]
      for (const kind of KINDS) expect(statusToken(t, kind), `${id}/${kind}`).toBe(t.text)
    }
  })
})

describe('the three are distinguishable', () => {
  it('are three different colours on a chromatic theme', () => {
    const t = THEMES.deepSpace
    const values = KINDS.map((k) => statusToken(t, k))
    expect(new Set(values).size).toBe(3)
  })
})

describe('what apply.ts sets', () => {
  it('is the three names the components read', () => {
    expect(Object.keys(statusTokens(THEMES.deepSpace)).sort()).toEqual([
      '--theme-danger',
      '--theme-success',
      '--theme-warning',
    ])
  })
})
