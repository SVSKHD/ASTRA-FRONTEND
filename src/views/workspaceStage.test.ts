// Section 42, item 1, as a rule the build enforces.
//
// Three declarations made the trade table unreachable at the bottom of the
// screen, and every one of them looked reasonable in isolation. These tests are
// written as absences on purpose: what must not come back.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stageGeometry, stageWrapGeometry } from '@/views/workspaceStage'

describe('the stage is in flow and the page is what scrolls', () => {
  const desktop = stageGeometry({ vw: 1440, isPhone: false })
  const phone = stageGeometry({ vw: 390, isPhone: true })

  it('has a floor, never a height', () => {
    for (const [name, style] of [
      ['desktop', desktop],
      ['phone', phone],
    ] as const) {
      expect(Object.keys(style), name).not.toContain('height')
      expect(style.minHeight, name).toMatch(/dvh$/)
    }
  })

  it('never clips: no overflow anywhere in the stage or its wrapper', () => {
    // An overflow other than visible would also make the stage the scrollport
    // that every sticky table header inside sticks to — which is the header's
    // whole job undone, silently.
    for (const style of [desktop, phone, stageWrapGeometry()]) {
      for (const key of Object.keys(style)) expect(key.toLowerCase()).not.toContain('overflow')
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

  it('measures the phone against the visible viewport, not the retracted one', () => {
    expect(stageWrapGeometry().minHeight).toBe('100dvh')
    expect(phone.minHeight).toBe('88dvh')
  })
})

describe('the shells agree', () => {
  it('uses dvh in the global stylesheet too', () => {
    const css = readFileSync(resolve(__dirname, '../style.css'), 'utf8')
    // A `100vh` here would put the bottom of every page under the URL bar,
    // whatever the stage above does.
    expect(css).toMatch(/#app \{[^}]*min-height: 100dvh/)
    expect(css).not.toMatch(/#app \{[^}]*min-height: 100vh/)
  })
})
