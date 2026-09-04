// The trade family's own audit (section 28b).
//
// `ui/oneIconSet.test.ts` can police the sprite because the sprite is one file:
// the weight and the box are set once on the symbol and no geometry can carry
// its own. This set is fourteen files, so the same guarantee has to be read back
// out of them — otherwise the fifteenth icon is drawn at 2, on a 20×20 box, in
// a hex colour, and nobody notices until it is beside the others.
//
// The rule that matters most is the last one: one meaning per glyph. That is
// what the whole set exists for, and it is checked here as "no two files draw
// the same geometry", which is the machine-readable half of it.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import * as family from './index'

const DIR = join(process.cwd(), 'src/components/icons')
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.vue'))
const source = (file: string) => readFileSync(join(DIR, file), 'utf8')
const geometryOf = (file: string) =>
  (source(file).match(/<(?:path|circle|rect|line|polyline)\b[^>]*\/>/g) ?? [])
    .join('')
    .replace(/\s+/g, ' ')

// The frame every file must carry, verbatim. A list rather than a regex over
// the whole tag, so a failure names the attribute that drifted.
const FRAME = [
  'viewBox="0 0 24 24"',
  // The marker a theme sets the weight through: CSS beats a presentation
  // attribute, so `svg[data-family='trade'] { stroke-width: … }` can thicken the
  // whole set on a ground where 1.5 reads as a hairline (section 29).
  'data-family="trade"',
  'fill="none"',
  'stroke="currentColor"',
  'stroke-width="1.5"',
  'stroke-linecap="round"',
  'stroke-linejoin="round"',
]

describe('the trade icon family is one hand', () => {
  it('has a file for every concept and a concept for every file', () => {
    expect(FILES).toHaveLength(14)
    expect(Object.keys(family).sort()).toEqual(FILES.map((f) => f.replace('.vue', '')).sort())
  })

  for (const attribute of FRAME) {
    it(`every icon sets ${attribute}`, () => {
      expect(FILES.filter((f) => !source(f).includes(attribute))).toEqual([])
    })
  }

  it('no icon carries a colour of its own', () => {
    // A hex, an rgb(), an oklch() or a named fill in here is an icon that stops
    // matching the text it sits beside the moment the theme changes.
    const offenders = FILES.filter((f) =>
      /#[0-9a-f]{3,8}\b|rgb\(|oklch\(|fill="(?!none)|stroke="(?!currentColor)/i.test(source(f)),
    )
    expect(offenders).toEqual([])
  })

  it('no icon sets its own weight on a shape', () => {
    // The frame carries the stroke; geometry that re-declares it is how a set
    // ends up with two weights in one glyph.
    const offenders = FILES.filter((f) => /stroke-width/.test(geometryOf(f)))
    expect(offenders).toEqual([])
  })

  it('draws in absolute coordinates only', () => {
    // Not a style preference: a relative segment (`h13`, `l-4 2`) is a delta,
    // so a set of relative deltas can leave the box while every number in the
    // file still looks small. Absolute-only is what makes the next check mean
    // what it says — and it also makes a glyph editable by reading it.
    const offenders = FILES.filter((f) => /\sd="[^"]*[a-z][-\d.]/.test(geometryOf(f)))
    expect(offenders).toEqual([])
  })

  it('draws inside the box', () => {
    // Coordinates, radii and lengths all live in the same 0–24 space, so this
    // is the checkable half of "on the grid": nothing reaches outside the
    // viewBox, which is what clips a glyph at 16px.
    const offenders = FILES.filter((file) =>
      (geometryOf(file).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).some((n) => n < 0 || n > 24),
    )
    expect(offenders).toEqual([])
  })

  it('never draws the same glyph for two meanings', () => {
    const seen = new Map<string, string>()
    const duplicates: string[] = []
    for (const file of FILES) {
      const geometry = geometryOf(file)
      const first = seen.get(geometry)
      if (first) duplicates.push(`${file} repeats ${first}`)
      else seen.set(geometry, file)
    }
    expect(duplicates).toEqual([])
  })

  it('renders decorative by default and named when it is given a title', () => {
    const plain = mount(family.IconBuy)
    expect(plain.attributes('aria-hidden')).toBe('true')
    expect(plain.find('title').exists()).toBe(false)

    const named = mount(family.IconSell, { props: { title: 'Sell' } })
    expect(named.attributes('role')).toBe('img')
    expect(named.attributes('aria-hidden')).toBeUndefined()
    expect(named.get('title').text()).toBe('Sell')
  })

  it('takes its size from the call site and stays square', () => {
    const icon = mount(family.IconFilter, { props: { size: 20 } })
    expect(icon.attributes('width')).toBe('20')
    expect(icon.attributes('height')).toBe('20')
  })
})
