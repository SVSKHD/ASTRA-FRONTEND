// Section 21e, enforced rather than asserted once.
//
// The state this replaced was thirty-four inline `<svg>` elements at seven
// stroke weights and six sizes. None of them was wrong on its own; together
// they read as a UI assembled from parts. A rule that only held on the day it
// was written would be back to seven weights within a month, so it is checked
// here: an icon drawn by hand, or sized by a number instead of a step, fails
// the build.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ICONS, ICON_NAMES, ICON_SIZES, ICON_STROKE } from '@/components/ui/icons'

const SRC = join(process.cwd(), 'src')

// Only the markup. A component's script may well build an `<Icon …>` string
// (the /ui page's copy button does), and that is a string, not a call site.
function template(source: string): string {
  const start = source.indexOf('<template>')
  return start < 0 ? '' : source.slice(start)
}

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return vueFiles(full)
    return entry.endsWith('.vue') ? [full] : []
  })
}

// The three places an `<svg>` is still the right answer, each for a reason that
// is not "this is an icon":
//
//   Icon / IconSprite   the set itself has to be drawn somewhere
//   ProgressRing        a value drawn as an arc — geometry computed from data,
//                       not a glyph from a set
//   BotsView            an equity sparkline, likewise
//   AuthDialog          the Google and GitHub marks: fixed multi-colour brand
//                       geometry that must NOT be restyled to one weight
const ALLOWED = new Set([
  'components/ui/Icon.vue',
  'components/ui/IconSprite.vue',
  'components/ui/ProgressRing.vue',
  'components/views/BotsView.vue',
  'components/AuthDialog.vue',
  //   SessionMap          a dot plot of sign-in coordinates on a graticule —
  //                       geometry projected from data, like the sparkline, and
  //                       deliberately not a map library (see the component)
  'components/security/SessionMap.vue',
])

// The trade family (section 28b) is the one place a second set is allowed, and
// it is allowed as a SET rather than as fourteen exceptions: every file in this
// directory is one glyph, and `components/icons/family.test.ts` holds it to its
// own frame — 24×24, currentColor, 1.5, round caps, no colour, no duplicate
// geometry. The rule this whole audit exists for is unchanged: what is banned
// is an icon drawn by hand at a call site, not a second deliberate set with its
// own audit behind it.
const TRADE_FAMILY = /^components\/icons\/Icon[A-Za-z]+\.vue$/

describe('one set, drawn once', () => {
  it('nothing draws its own icon (acceptance 111)', () => {
    const offenders = vueFiles(SRC)
      .filter((file) => template(readFileSync(file, 'utf8')).includes('<svg'))
      .map((file) => file.replace(SRC + '/', ''))
      .filter((rel) => !ALLOWED.has(rel) && !TRADE_FAMILY.test(rel))
    expect(offenders).toEqual([])
  })

  it('every icon carries the same weight', () => {
    const sprite = readFileSync(join(SRC, 'components/ui/IconSprite.vue'), 'utf8')
    expect(sprite).toContain('ICON_STROKE')
    expect(ICON_STROKE).toBe(2.25)
    // Nothing in the geometry may set its own stroke, fill or cap — those are
    // the symbol's, which is what makes it one weight rather than one default.
    for (const [name, geometry] of Object.entries(ICONS)) {
      expect(geometry, name).not.toMatch(/stroke-width|stroke=|fill=|stroke-linecap/)
    }
  })

  it('every icon is drawn on the same grid', () => {
    // A 20×20 icon dropped into a 24×24 set is the other way a set drifts.
    const sprite = readFileSync(join(SRC, 'components/ui/IconSprite.vue'), 'utf8')
    expect(sprite).toContain('ICON_VIEWBOX')
  })
})

describe('the size scale', () => {
  it('is the five steps and nothing else', () => {
    expect(ICON_SIZES).toEqual({ xs: 14, sm: 16, md: 20, lg: 24, xl: 32 })
  })

  it('is never bypassed with a number at the call site', () => {
    const offenders: string[] = []
    for (const file of vueFiles(SRC)) {
      const source = readFileSync(file, 'utf8')
      // `size="16"` or `:size="19"` on an Icon: a pixel where a step belongs.
      for (const tag of template(source).match(/<Icon\b[^>]*>/gs) ?? []) {
        if (/:?size\s*=\s*["']\s*\d/.test(tag)) offenders.push(`${file.replace(SRC + '/', '')}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('gives the icon a square box a flex row cannot squash', () => {
    const icon = readFileSync(join(SRC, 'components/ui/Icon.vue'), 'utf8')
    expect(icon).toContain('flex-shrink: 0')
    // Width and height come from the step, so an icon is never sized by CSS at
    // the call site or inherited from font-size.
    expect(icon).toContain(':width="px"')
    expect(icon).toContain(':height="px"')
  })
})

describe('the sprite', () => {
  it('holds every name in the set exactly once', () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length)
    expect(ICON_NAMES.length).toBeGreaterThan(20)
  })

  it('is mounted once, at the app root', () => {
    const app = readFileSync(join(SRC, 'App.vue'), 'utf8')
    expect(app).toContain('<IconSprite />')
    const mounted = vueFiles(SRC).filter((file) => /<IconSprite\b/.test(readFileSync(file, 'utf8')))
    expect(mounted.map((f) => f.replace(SRC + '/', ''))).toEqual(['App.vue'])
  })

  it('every icon referenced in the app is in the set', () => {
    const known = new Set<string>(ICON_NAMES)
    const missing: string[] = []
    for (const file of vueFiles(SRC)) {
      const source = readFileSync(file, 'utf8')
      for (const tag of template(source).match(/<Icon\b[^>]*>/gs) ?? []) {
        const literal = tag.match(/(?<!:)name\s*=\s*"([^"]+)"/)
        if (literal && !known.has(literal[1]))
          missing.push(`${file.replace(SRC + '/', '')}: ${literal[1]}`)
      }
    }
    expect(missing).toEqual([])
  })
})
