// Section 42, item 1, as a rule the build enforces.
//
// Three declarations made the trade table unreachable at the bottom of the
// screen, and every one of them looked reasonable in isolation. These tests are
// written as absences on purpose: what must not come back.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stageGeometry, stageWrapGeometry } from '@/views/workspaceStage'
import { shellGeometry } from '@/views/appShell'

describe('the stage is in flow and the page is what scrolls', () => {
  const desktop = stageGeometry({ vw: 1440, isPhone: false })
  const phone = stageGeometry({ vw: 390, isPhone: true })

  it('keeps a stable height for every tab', () => {
    for (const [name, style] of [
      ['desktop', desktop],
      ['phone', phone],
    ] as const) {
      expect(style.height, name).toBe(name === 'phone' ? 'calc(100% - 20px)' : 'calc(100% - 28px)')
      expect(style.minHeight, name).toBe(0)
      expect(style.overflow, name).toBe('hidden')
    }
  })

  it('never transforms: no idle drift on the element holding every row', () => {
    for (const style of [desktop, phone, stageWrapGeometry()]) {
      const keys = Object.keys(style).map((k) => k.toLowerCase())
      expect(keys).not.toContain('transform')
      expect(keys).not.toContain('animation')
    }
  })

  it('is not taken out of flow', () => {
    expect(desktop.position).toBe('relative')
    expect(stageWrapGeometry().position).toBe('relative')
  })

  it('fills its region rather than measuring the viewport itself', () => {
    expect(stageWrapGeometry().height).toBe('100%')
    expect(phone.height).toBe('calc(100% - 20px)')
  })

  it('sizes itself against its container, never against the viewport', () => {
    // A `vw` width was measured against a viewport the stage no longer spans:
    // the rail has its own grid column now, so 70vw starting after the rail
    // runs off the right-hand edge by the rail's width.
    for (const style of [desktop, phone]) expect(style.width).not.toMatch(/vw$/)
  })
})

describe('the shell is the one thing measured against the viewport', () => {
  // `dvh`, not `vh`: on a phone `vh` is measured against the viewport with the
  // URL bar retracted, so a `100vh` shell is permanently taller than what can be
  // seen and the bottom utility bar lives under the browser chrome — which is
  // the overlap section 44 exists to end, reintroduced by a unit.
  it('is exactly one visible viewport tall, at both breakpoints', () => {
    for (const isPhone of [true, false]) {
      const g = shellGeometry({ isPhone, isTablet: false })
      expect(g.height).toBe('100dvh')
    }
  })

  it('uses dvh in the global stylesheet too', () => {
    const css = readFileSync(resolve(__dirname, '../style.css'), 'utf8')
    // A `100vh` here would put the bottom of every page under the URL bar,
    // whatever the stage above does.
    expect(css).toMatch(/#app \{[^}]*min-height: 100dvh/)
    expect(css).not.toMatch(/#app \{[^}]*min-height: 100vh/)
  })
})
