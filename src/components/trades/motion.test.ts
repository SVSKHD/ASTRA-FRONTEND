// The motion budget, as a test rather than as a promise (section 28b).
//
// The rule for this screen is one orchestrated moment and no other: the day
// cells fill in a single staggered sweep when a month loads, and everything
// else moves only in answer to something the reader just did. Both halves are
// checkable — the sweep's arithmetic is in the stylesheet, and "answers an
// action" means no `appear` on the lists and no animation outside the grid.
//
// Timing is asserted from the source rather than from a computed style because
// jsdom does not resolve `calc(min(...))`, and the number that matters is the
// one a future edit would change.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')
const read = (file: string) => readFileSync(join(SRC, file), 'utf8')

const PICKER = read('components/ui/GlassDatePicker.vue')
const TRADE_FILES = readdirSync(join(SRC, 'components/trades')).filter((f) => f.endsWith('.vue'))

describe('the sweep is one moment, and a short one', () => {
  const rule = PICKER.slice(PICKER.indexOf('.gdp__grid.is-painted .gdp__day.has-wash'))
  const step = Number(/var\(--gdp-day-order, 0\) \* (\d+(?:\.\d+)?)/.exec(rule)?.[1])
  const cap = Number(/,\s*(\d+(?:\.\d+)?)\)\s*\* 1ms/.exec(rule)?.[1])
  const duration = Number(/animation: gdpDayWash (\d+)ms/.exec(rule)?.[1])

  it('staggers by no more than 40ms a cell', () => {
    expect(step).toBeGreaterThan(0)
    expect(step).toBeLessThanOrEqual(40)
  })

  it('is over inside 400ms however many cells the month has', () => {
    // The cap is what makes this true of a six-week month as well as a
    // four-week one: without it, 42 cells at any stagger runs long.
    expect(cap + duration).toBeLessThanOrEqual(400)
  })

  it('runs on the cells and on nothing else', () => {
    const animations = [...PICKER.matchAll(/^\s*animation:\s*([\w-]+)/gm)]
      .map((m) => m[1])
      // `animation: none` is a reduced-motion block switching one off, which is
      // the opposite of a third animation.
      .filter((name) => name !== 'none')
    // The sheet's own entrance is the panel's, and it is a bottom-sheet
    // opening — an answer to a tap. The only other one is the sweep.
    expect(new Set(animations)).toEqual(new Set(['gdpSheetIn', 'gdpDayWash']))
  })
})

describe('every other transition answers an action', () => {
  it('no list animates its rows on mount', () => {
    // `appear` is what would turn a month that simply loaded into a
    // performance; TransitionGroup is off by default and this keeps it off.
    for (const file of TRADE_FILES) {
      expect(read(`components/trades/${file}`), file).not.toMatch(/<TransitionGroup[^>]*\bappear\b/)
    }
  })

  it('nothing in the trade components runs a keyframe animation at all', () => {
    // Everything here is a transition — width, opacity, transform — which by
    // definition needs a previous value, so none of it can fire on first paint.
    for (const file of TRADE_FILES) {
      expect(read(`components/trades/${file}`), file).not.toMatch(/^\s*animation:/m)
    }
  })
})

describe('reduced motion turns all of it off', () => {
  it('every file that moves says what stops', () => {
    const offenders: string[] = []
    for (const file of [
      'components/ui/GlassDatePicker.vue',
      ...TRADE_FILES.map((f) => `components/trades/${f}`),
    ]) {
      const source = read(file)
      const moves = /^\s*(transition|animation):/m.test(source)
      if (moves && !source.includes('prefers-reduced-motion')) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it('the count-up is a no-op when motion is not wanted', () => {
    // The one piece of motion that is JavaScript rather than CSS, so a media
    // query cannot switch it off — it has to ask.
    expect(read('composables/useCountUp.ts')).toContain('prefers-reduced-motion')
  })
})
