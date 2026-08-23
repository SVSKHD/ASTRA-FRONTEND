// Section 24b, acceptances 121 and 122. Every theme, every tinted surface.
//
// The old assertion checked the theme's own tokens against the theme's own
// page — which is the easy half. What was actually broken was text on surfaces
// the theme never declared: a chip tinted with a project colour, on which the
// page's text lands by inheritance and nobody measured anything.
import { describe, expect, it } from 'vitest'
import { THEMES, THEME_DESCRIPTORS } from '@/themes'
import { contrastRatio } from '@/themes/contrast'
import { AA_TEXT, CHIP_TINT, surfacePair, surfacePairVars } from '@/themes/surfacePair'

// The colours the app actually tints with: the four event sources, plus the
// ends of the tag palette. If a pair holds for these it holds for the app.
const SOURCE_COLOURS = [
  'oklch(0.65 0.16 260)', // tasks
  'oklch(0.68 0.14 200)', // todos
  'oklch(0.72 0.15 150)', // goals
  'oklch(0.75 0.16 60)', // reminders
  '#7c5cff',
  '#111111',
  '#ffffff',
  '#e23b3b',
]

describe('a tinted surface always carries readable text', () => {
  for (const d of THEME_DESCRIPTORS) {
    const theme = THEMES[d.id]
    it(`${d.id}: every source colour clears AA, tinted or fallen back`, () => {
      for (const source of SOURCE_COLOURS) {
        const pair = surfacePair(source, theme)
        expect(pair.ratio, `${d.id} / ${source}`).toBeGreaterThanOrEqual(AA_TEXT)
      }
    })
  }
})

describe('the fallback', () => {
  it('fires rather than shipping an unreadable tint', () => {
    // A near-white tint on a light theme is the case that cannot work: 12% of
    // white over a pale page is still a pale page, and the theme's dark text
    // reads on it — so this one does NOT fall back. The one that does is a
    // dark source on a dark theme, where the tint drags the surface toward the
    // text it has to carry.
    const dark = THEMES.deepSpace
    const pair = surfacePair('#ffffff', dark)
    expect(pair.ratio).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('keeps the source colour even when it drops the tint', () => {
    // The bar still says which project it is. Losing the tint must not lose the
    // identity, or the fallback trades one failure for another.
    for (const d of THEME_DESCRIPTORS) {
      const pair = surfacePair('#7c5cff', THEMES[d.id])
      expect(pair.accent, d.id).toBe('#7c5cff')
    }
  })

  it('reports itself, so which themes fall back is knowable', () => {
    const pair = surfacePair('#7c5cff', THEMES.deepSpace)
    expect(typeof pair.fellBack).toBe('boolean')
  })
})

describe('the pair is a pair', () => {
  it('never derives the foreground from the source', () => {
    // Coloured text on a coloured fill of the same hue is the thing section 24b
    // is about. However good the ratio, two values a few steps apart on one
    // axis read as a smudge. So the foreground is the theme's own text, always
    // — stated as "is the text token" rather than "is not the source", because
    // a theme whose text happens to equal a source colour is not a violation.
    for (const d of THEME_DESCRIPTORS) {
      const theme = THEMES[d.id]
      for (const source of SOURCE_COLOURS) {
        expect(surfacePair(source, theme).foreground, `${d.id} / ${source}`).toBe(theme.text)
      }
    }
  })

  it('returns an opaque background, so no caller has to know what is behind it', () => {
    // "Behind it" is a glass panel over a gradient over an image. A translucent
    // answer would push the compositing back to the call site, which is where
    // it was being got wrong.
    for (const d of THEME_DESCRIPTORS) {
      const bg = surfacePair('#7c5cff', THEMES[d.id]).background
      expect(bg, d.id).toMatch(/^rgba\(\d+,\d+,\d+,1\)$/)
    }
  })

  it('tints at the 12% section 24b fixes for a chip', () => {
    expect(CHIP_TINT).toBe(0.12)
  })

  it('hands a component the pair as custom properties in one call', () => {
    const vars = surfacePairVars('#7c5cff', THEMES.deepSpace)
    expect(Object.keys(vars).sort()).toEqual(['--on-surface', '--surface', '--surface-accent'])
    expect(vars['--surface-accent']).toBe('#7c5cff')
  })
})

describe('muted text has a floor (section 24b)', () => {
  for (const d of THEME_DESCRIPTORS) {
    const t = THEMES[d.id]
    it(`${d.id}: --text-muted clears 4.5:1 on --bg-base`, () => {
      // Was 3:1, the large-text floor, which is how out-of-month calendar days
      // ended up near-invisible: muted was carrying both "less important" and
      // "disabled", and had been tuned for the second.
      expect(contrastRatio(t.dim, t.bgSolid)).toBeGreaterThanOrEqual(AA_TEXT)
    })
  }
})
