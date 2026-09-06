// Section 44, items 1–5, as rules the build enforces.
//
// The three overlaps in the report — the reminder pill over "+ New todo", the
// sync pill over the dock, the action cluster over the trades table's last rows
// — were one bug wearing three hats: an element at `position: fixed` reserves no
// space, so everything in flow is free to grow into the same pixels, and no
// z-index changes that. These tests are written mostly as ABSENCES, because the
// fix is a set of declarations that must not come back.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BAR_HEIGHT,
  BAR_HEIGHT_PHONE,
  barGeometry,
  barHeight,
  contentGeometry,
  railGeometry,
  railWidth,
  shellGeometry,
  stripGeometry,
} from '@/views/appShell'

const BREAKPOINTS = [
  { name: 'desktop', isPhone: false, isTablet: false },
  { name: 'tablet', isPhone: false, isTablet: true },
  { name: 'phone', isPhone: true, isTablet: false },
] as const

describe('every persistent element has a region', () => {
  it('names all four regions in the template areas, at every breakpoint', () => {
    for (const bp of BREAKPOINTS) {
      const areas = shellGeometry(bp).gridTemplateAreas
      for (const region of ['rail', 'strip', 'content', 'bar']) {
        expect(areas, `${bp.name}/${region}`).toContain(region)
      }
    }
  })

  it('assigns each region to its own grid area', () => {
    for (const bp of BREAKPOINTS) {
      expect(stripGeometry(bp).gridArea, bp.name).toBe('strip')
      expect(contentGeometry(bp).gridArea, bp.name).toBe('content')
      expect(barGeometry(bp).gridArea, bp.name).toBe('bar')
      expect(railGeometry(bp).gridArea, bp.name).toBe('rail')
    }
  })

  it('never takes a region out of flow', () => {
    // This is THE rule. A region at `position: fixed` or `absolute` occupies no
    // layout space, which is precisely how three pieces of chrome ended up on
    // top of live content while each looked correct on its own.
    for (const bp of BREAKPOINTS) {
      for (const [name, style] of [
        ['strip', stripGeometry(bp)],
        ['content', contentGeometry(bp)],
        ['bar', barGeometry(bp)],
        ['rail', railGeometry(bp)],
      ] as const) {
        const position = (style as { position?: string }).position
        expect(position, `${bp.name}/${name}`).not.toBe('fixed')
        expect(position, `${bp.name}/${name}`).not.toBe('absolute')
      }
    }
  })

  it('gives the strip a positioning context, so the page title centres on IT', () => {
    // The strip centres the current tab's name with `position: absolute;
    // left: 50%`. Left `static`, the nearest positioned ancestor is the shell —
    // which is `position: relative` and the size of the window — so the title
    // was centred on the whole screen and rendered in the middle of the tab's
    // content. On Trades it sat on top of the table.
    //
    // `relative` takes nothing out of flow, so the rule above still holds; it
    // only decides which box the 50% is 50% OF.
    for (const bp of BREAKPOINTS) {
      expect(stripGeometry(bp).position, bp.name).toBe('relative')
    }
  })
})

describe('the content area is the one scrollport', () => {
  it('can shrink: min-height 0 on both the track and the item', () => {
    for (const bp of BREAKPOINTS) {
      // The track. `minmax(0, 1fr)` is `min-height: 0` for a grid track; a bare
      // `1fr` defaults to `min-height: auto` and refuses to shrink below its
      // content, which pushes the bar off the bottom of the screen — the same
      // bug in a new costume.
      expect(shellGeometry(bp).gridTemplateRows, bp.name).toContain('minmax(0, 1fr)')
      // The item. A shrinkable track holding an unshrinkable item does not shrink.
      expect(contentGeometry(bp).minHeight, bp.name).toBe(0)
    }
  })

  it('scrolls vertically', () => {
    for (const bp of BREAKPOINTS) expect(contentGeometry(bp).overflowY, bp.name).toBe('auto')
  })

  it('reserves the bar height beneath the last row', () => {
    // Item 5: the last row of the trades table must be reachable AND clear, not
    // merely uncovered. The bar already has a row of its own; this is what puts
    // air under the final row instead of leaving it flush against the chrome.
    expect(contentGeometry({ isPhone: false }).paddingBottom).toBe(`${BAR_HEIGHT}px`)
    expect(contentGeometry({ isPhone: true }).paddingBottom).toBe(`${BAR_HEIGHT_PHONE}px`)
    for (const isPhone of [true, false]) {
      expect(contentGeometry({ isPhone }).paddingBottom).toBe(`${barHeight(isPhone)}px`)
      expect(barGeometry({ isPhone }).height).toBe(`${barHeight(isPhone)}px`)
    }
  })

  it('does not let the shell itself scroll', () => {
    // If it did, the strip and the bar would scroll away with the month and the
    // chrome would no longer be where it says it is.
    for (const bp of BREAKPOINTS) expect(shellGeometry(bp).overflow, bp.name).toBe('hidden')
  })
})

describe('the rail owns a column, so nothing has to dodge it', () => {
  it('reserves its width in the grid on desktop and tablet', () => {
    for (const bp of BREAKPOINTS.filter((b) => !b.isPhone)) {
      expect(shellGeometry(bp).gridTemplateColumns, bp.name).toBe(
        `${railWidth(bp)}px minmax(0, 1fr)`,
      )
      expect(railWidth(bp), bp.name).toBeGreaterThan(0)
    }
  })

  it('becomes a bottom row on a phone rather than eating a fifth of the screen', () => {
    const phone = { isPhone: true, isTablet: false }
    expect(railWidth(phone)).toBe(0)
    expect(shellGeometry(phone).gridTemplateColumns).toBe('minmax(0, 1fr)')
    // Last in the source order, which on a single-column grid is the bottom.
    expect(shellGeometry(phone).gridTemplateAreas.trim().endsWith('"rail"')).toBe(true)
  })
})

describe('the chrome that used to float is gone from the source', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')

  it('docks the icon dock instead of fixing it to the viewport', () => {
    expect(read('components/FloatingDock.vue')).not.toContain("position: 'fixed'")
  })

  it('keeps the reminder pill and the sync status in flow', () => {
    // A DISMISS SCRIM IS ALLOWED TO BE FIXED and is the one exception. It
    // exists only while a popover is open, it covers the viewport on purpose so
    // a click anywhere closes the menu, and it is transparent — it cannot hide
    // anything because there is nothing drawn on it. The rule is about
    // PERSISTENT chrome: an element that is on screen while you work, sized by
    // its content, at a coordinate somebody chose. So the check is that the
    // only fixed declaration in these files belongs to a scrim.
    for (const file of ['components/shell/ReminderPill.vue', 'components/shell/ShellSync.vue']) {
      const source = read(file)
      const fixedDecls = source
        .split('\n')
        .map((line, i) => ({ line, i, source }))
        .filter(({ line }) => line.includes("position: 'fixed'"))
        .map(({ i }) => declarationNameAbove(source, i))
      expect(fixedDecls, file).toEqual(fixedDecls.filter((name) => /scrim/i.test(name)))
    }
  })

  /** The `const <name> = ...` a line belongs to, for the message above. */
  function declarationNameAbove(source: string, lineIndex: number): string {
    const lines = source.split('\n')
    for (let i = lineIndex; i >= 0; i--) {
      const match = /^\s*(?:const|let)\s+([A-Za-z0-9_]+)/.exec(lines[i])
      if (match) return match[1]
    }
    return '(top level)'
  }

  it('has no component left that mounts chrome at a viewport coordinate', () => {
    // The three files that did — SyncPill, FloatingChrome and Ticker — were
    // deleted rather than restyled, because each of them was a wrapper whose
    // only content was a set of coordinates.
    for (const gone of [
      'components/SyncPill.vue',
      'components/FloatingChrome.vue',
      'components/Ticker.vue',
    ]) {
      expect(() => read(gone), gone).toThrow()
    }
  })
})
