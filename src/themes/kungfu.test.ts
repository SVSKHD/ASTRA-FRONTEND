// Section 21d. The rules of this theme are the theme — "black and white" with a
// grey in it is just another dark theme — so they are checked rather than
// described: every token is parsed, and anything that is not black, white, or
// one of those two at reduced alpha fails here instead of on someone's screen.
import { describe, expect, it } from 'vitest'
import { STANDALONE_THEME_KEYS, THEMES, THEME_DESCRIPTORS, type ThemeKey } from '@/themes'
import { contrastRatio, parseColor } from '@/themes/contrast'

const KEYS: ThemeKey[] = ['kungfu', 'kungfuLight']

// Every colour-bearing token, named so a failure says which one it was.
function tokens(key: ThemeKey): [string, string][] {
  const t = THEMES[key]
  return [
    ['glass', t.glass],
    ['card', t.card],
    ['border', t.border],
    ['text', t.text],
    ['dim', t.dim],
    ['input', t.input],
    ['onAccent', t.onAccent],
    ['pageBg', t.pageBg],
    ['bgSolid', t.bgSolid],
    ['accent', t.accent],
  ]
}

describe('it is registered as a theme of its own', () => {
  it('is listed apart from the dark and light families (acceptance 110)', () => {
    const standalone = THEME_DESCRIPTORS.filter((d) => d.standalone).map((d) => d.id)
    expect(standalone).toEqual(STANDALONE_THEME_KEYS)
    expect(standalone).toContain('kungfu')
  })

  it('is a dark theme with a light companion', () => {
    expect(THEMES.kungfu.group).toBe('dark')
    expect(THEMES.kungfuLight.group).toBe('light')
  })

  it('is not filed under Special, which is a different group', () => {
    const special = THEME_DESCRIPTORS.filter((d) => d.special).map((d) => d.id)
    expect(special).not.toContain('kungfu')
  })
})

describe('two colours, and no others', () => {
  it('has no chroma anywhere', () => {
    for (const key of KEYS)
      for (const [name, value] of tokens(key)) {
        const { r, g, b } = parseColor(value)
        expect([r, g, b], `${key}.${name} = ${value}`).toEqual([r, r, r])
      }
  })

  it('names only #000000 and #ffffff', () => {
    // The one allowance is alpha: white at 72% is still white, and it is what
    // keeps secondary text reading as secondary without storing a grey.
    for (const key of KEYS)
      for (const [name, value] of tokens(key)) {
        const { r } = parseColor(value)
        expect([0, 255], `${key}.${name} = ${value}`).toContain(r)
      }
  })

  it('is set to zero chroma, so every colour helper follows', () => {
    for (const key of KEYS) expect(THEMES[key].mono, key).toBe(true)
  })
})

describe('edges instead of surfaces', () => {
  it('turns the glass blur off', () => {
    for (const key of KEYS) expect(THEMES[key].noGlass, key).toBe(true)
  })

  it('replaces the drop shadow with a one-pixel border', () => {
    // A soft shadow is a grey gradient, which is a third colour arriving by
    // the back door.
    for (const key of KEYS) {
      expect(THEMES[key].shadow, key).toMatch(/^0 0 0 1px #(000000|ffffff)$/)
    }
  })

  it('draws its own focus ring: 2px of the accent, held off by 2px of the page', () => {
    expect(THEMES.kungfu.focusRing).toBe('0 0 0 2px #000000, 0 0 0 4px #ffffff')
    expect(THEMES.kungfuLight.focusRing).toBe('0 0 0 2px #ffffff, 0 0 0 4px #000000')
  })
})

describe('what it reads like', () => {
  it('is the maximum contrast there is', () => {
    for (const key of KEYS) {
      const t = THEMES[key]
      expect(Math.round(contrastRatio(t.text, t.bgSolid)), key).toBe(21)
      expect(Math.round(contrastRatio(t.accent, t.bgSolid)), key).toBe(21)
    }
  })

  it('still separates secondary text from primary', () => {
    for (const key of KEYS) {
      const t = THEMES[key]
      expect(contrastRatio(t.dim, t.bgSolid), key).toBeLessThan(contrastRatio(t.text, t.bgSolid))
      // …without dropping under the 4.5:1 floor for body text.
      expect(contrastRatio(t.dim, t.bgSolid), key).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('is the exact inverse of its companion', () => {
    expect(THEMES.kungfu.bgSolid).toBe(THEMES.kungfuLight.text)
    expect(THEMES.kungfu.text).toBe(THEMES.kungfuLight.bgSolid)
    expect(THEMES.kungfu.border).toBe(THEMES.kungfuLight.bgSolid)
  })
})
