// Acceptance 75: the mono themes contain no chromatic values, and status is
// still conveyed. "No chroma" is checked rather than asserted — every token is
// parsed and its channels compared, so a hue slipping into a mono token fails
// here rather than being noticed on someone's screen.
import { describe, expect, it } from 'vitest'
import { THEMES, THEME_DESCRIPTORS, type Theme, type ThemeKey } from '@/themes'
import { contrastRatio, parseColor } from '@/themes/contrast'
import { statusColor, tagChip } from '@/styles'
import {
  MONO_DASHES,
  MONO_PATTERNS,
  monoDashFor,
  monoNeutral,
  monoPatternCss,
  monoPatternFor,
  monoStatus,
} from '@/utils/mono'
import { tagColor } from '@/utils/tags'

const MONO_KEYS: ThemeKey[] = ['monoDark', 'monoLight']

// Every colour-bearing token on a theme.
function colorTokens(theme: Theme): [string, string][] {
  return (
    [
      ['glass', theme.glass],
      ['card', theme.card],
      ['border', theme.border],
      ['text', theme.text],
      ['dim', theme.dim],
      ['input', theme.input],
      ['onAccent', theme.onAccent],
      ['pageBg', theme.pageBg],
      ['bgSolid', theme.bgSolid],
      ['accent', theme.accent],
    ] as [string, string][]
  ).filter(([, value]) => typeof value === 'string')
}

function isAchromatic(value: string): boolean {
  const { r, g, b } = parseColor(value)
  return r === g && g === b
}

describe('the mono themes are registered', () => {
  it('both appear in the picker as special themes', () => {
    const ids = THEME_DESCRIPTORS.filter((d) => d.special).map((d) => d.id)
    expect(ids).toContain('monoDark')
    expect(ids).toContain('monoLight')
  })

  it('both drop the glass blur in favour of a solid 1px border', () => {
    for (const key of MONO_KEYS) {
      expect(THEMES[key].noGlass, key).toBe(true)
      expect(THEMES[key].mono, key).toBe(true)
    }
  })
})

describe('zero chroma (acceptance 75)', () => {
  for (const key of MONO_KEYS) {
    it(`${key}: every token is achromatic`, () => {
      const chromatic = colorTokens(THEMES[key])
        .filter(([, value]) => !isAchromatic(value))
        .map(([name, value]) => `${name}: ${value}`)
      expect(chromatic).toEqual([])
    })
  }

  it('mono-dark is black on white, mono-light the reverse', () => {
    expect(THEMES.monoDark.bgSolid).toBe('#000000')
    expect(THEMES.monoDark.text).toBe('#ffffff')
    expect(THEMES.monoDark.accent).toBe('#ffffff')
    expect(THEMES.monoLight.bgSolid).toBe('#ffffff')
    expect(THEMES.monoLight.text).toBe('#000000')
    expect(THEMES.monoLight.accent).toBe('#000000')
  })

  it('both clear the contrast assertion trivially — 21:1', () => {
    for (const key of MONO_KEYS) {
      expect(contrastRatio(THEMES[key].text, THEMES[key].bgSolid), key).toBeCloseTo(21, 0)
    }
  })

  it('a tag colour collapses to a neutral under mono', () => {
    expect(isAchromatic(tagColor('work', true, true))).toBe(true)
    expect(isAchromatic(tagColor('home', false, true))).toBe(true)
    // …and keeps its hue everywhere else.
    expect(isAchromatic(tagColor('work', true, false))).toBe(false)
  })

  it('the in-progress status colour loses its hue under mono', () => {
    expect(isAchromatic(statusColor(THEMES.monoDark, 'progress'))).toBe(true)
    expect(isAchromatic(statusColor(THEMES.deepSpace, 'progress'))).toBe(false)
  })

  it('a tag chip carries a pattern instead of a tint under mono', () => {
    const mono = tagChip(THEMES.monoDark, 'work', true)
    expect(String(mono.background)).toContain('gradient')
    const coloured = tagChip(THEMES.deepSpace, 'work', true)
    expect(String(coloured.background)).not.toContain('gradient')
  })
})

describe('status survives without hue', () => {
  it('every status maps to a distinct glyph', () => {
    const glyphs = (['success', 'warning', 'danger', 'info', 'neutral'] as const).map(
      (k) => monoStatus(k).glyph,
    )
    expect(new Set(glyphs).size).toBe(glyphs.length)
  })

  it('danger and warning carry weight and an underline as well as a glyph', () => {
    expect(monoStatus('danger').underline).toBe(true)
    expect(monoStatus('warning').underline).toBe(true)
    expect(monoStatus('danger').weight).toBeGreaterThan(monoStatus('info').weight)
  })

  it('neutrals keep their place in the hierarchy on both mono themes', () => {
    expect(monoNeutral(true, 'strong')).toBe('#ffffff')
    expect(monoNeutral(false, 'strong')).toBe('#000000')
    expect(monoNeutral(true, 'soft')).not.toBe(monoNeutral(true, 'strong'))
  })
})

describe('patterns replace hue for projects, goals and charts', () => {
  it('assigns the same pattern to the same key every time', () => {
    expect(monoPatternFor('work')).toBe(monoPatternFor('work'))
    expect(MONO_PATTERNS).toContain(monoPatternFor('anything'))
  })

  it('spreads different keys across the vocabulary', () => {
    const used = new Set(
      ['work', 'home', 'errands', 'health', 'finance', 'travel', 'study'].map(monoPatternFor),
    )
    expect(used.size).toBeGreaterThan(1)
  })

  it('renders a pattern as a CSS background in the given neutral', () => {
    expect(monoPatternCss('stripe', '#fff')).toContain('repeating-linear-gradient')
    expect(monoPatternCss('dots', '#fff')).toContain('radial-gradient')
    expect(monoPatternCss('solid', '#fff')).toBe('#fff')
  })

  it('gives chart series a dash instead of a colour', () => {
    expect(MONO_DASHES).toContain(monoDashFor('series-a'))
    expect(monoDashFor('series-a')).toBe(monoDashFor('series-a'))
  })
})
