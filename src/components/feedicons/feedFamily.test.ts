// The feed family's audit (sections 39–40), and the one rule that matters most:
// NO GLYPH IS SHARED WITH THE TRADE FAMILY.
//
// That is the whole reason this is a second directory rather than nine more
// files in the first one. A glyph that means "buy" beside a price and "merged"
// beside a branch means neither, and the failure is silent — nobody notices
// until the two sets are on screen together, which is exactly what the Trades
// tab's news strip does.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import * as feed from './index'

const DIR = join(process.cwd(), 'src/components/feedicons')
const TRADE_DIR = join(process.cwd(), 'src/components/icons')
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.vue'))
const TRADE_FILES = readdirSync(TRADE_DIR).filter((f) => f.endsWith('.vue'))

const source = (dir: string, file: string) => readFileSync(join(dir, file), 'utf8')
const geometryOf = (dir: string, file: string) =>
  (source(dir, file).match(/<(?:path|circle|rect|line|polyline)\b[^>]*\/>/g) ?? [])
    .join('')
    .replace(/\s+/g, ' ')

const FRAME = [
  'viewBox="0 0 24 24"',
  // Its own family marker, so a theme can thicken this set independently of the
  // trade set — and so the two are distinguishable in the DOM.
  'data-family="feed"',
  'fill="none"',
  'stroke="currentColor"',
  'stroke-width="1.5"',
  'stroke-linecap="round"',
  'stroke-linejoin="round"',
]

describe('the feed icon family is one hand', () => {
  it('has a file for every concept and a concept for every file', () => {
    // Three news categories and six pull-request states.
    expect(FILES).toHaveLength(9)
    expect(Object.keys(feed).sort()).toEqual(FILES.map((f) => f.replace('.vue', '')).sort())
  })

  for (const attribute of FRAME) {
    it(`every icon sets ${attribute}`, () => {
      expect(FILES.filter((f) => !source(DIR, f).includes(attribute))).toEqual([])
    })
  }

  it('carries no colour of its own', () => {
    // `currentColor` and nothing else: the row decides what an icon means by
    // where it is, and a hex here would survive every theme change.
    const offenders = FILES.filter((f) => /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i.test(geometryOf(DIR, f)))
    expect(offenders).toEqual([])
  })

  it('draws in absolute coordinates only', () => {
    // A relative command carries a negative number, and a negative number in a
    // path is the one thing that reads correctly and scales wrongly when the
    // box changes. Absolute-only makes the geometry checkable by eye.
    const offenders = FILES.filter((f) =>
      /\sd="[^"]*[a-z]/.test(geometryOf(DIR, f).replace(/[A-Z]/g, '')),
    )
    expect(offenders).toEqual([])
  })

  it('draws inside the box', () => {
    for (const file of FILES) {
      const numbers = [...geometryOf(DIR, file).matchAll(/-?\d+(?:\.\d+)?/g)].map((m) =>
        Number(m[0]),
      )
      for (const n of numbers) {
        expect(n, `${file}: ${n}`).toBeGreaterThanOrEqual(0)
        expect(n, `${file}: ${n}`).toBeLessThanOrEqual(24)
      }
    }
  })

  it('gives every glyph its own geometry', () => {
    const seen = new Map<string, string>()
    for (const file of FILES) {
      const geometry = geometryOf(DIR, file)
      const twin = seen.get(geometry)
      expect(twin, `${file} draws the same as ${twin}`).toBeUndefined()
      seen.set(geometry, file)
    }
  })

  it('shares no geometry with the trade family', () => {
    // The point of the whole directory. Checked as identical geometry, which is
    // the machine-readable half of "one meaning per glyph".
    const trade = new Map(TRADE_FILES.map((f) => [geometryOf(TRADE_DIR, f), f]))
    const clashes: string[] = []
    for (const file of FILES) {
      const twin = trade.get(geometryOf(DIR, file))
      if (twin) clashes.push(`${file} ↔ ${twin}`)
    }
    expect(clashes).toEqual([])
  })

  it('renders at the size it is asked for, and is hidden unless titled', () => {
    for (const [name, component] of Object.entries(feed)) {
      const plain = mount(component as Component, { props: { size: 20 } })
      expect(plain.attributes('width'), name).toBe('20')
      expect(plain.attributes('aria-hidden'), name).toBe('true')
      const titled = mount(component as Component, { props: { title: 'Merged' } })
      expect(titled.attributes('role'), name).toBe('img')
      expect(titled.find('title').text(), name).toBe('Merged')
    }
  })
})
