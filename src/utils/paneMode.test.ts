// The detail pane's three modes, as an order rather than a set.
import { describe, expect, it } from 'vitest'
import {
  PANE_MODE_LABEL,
  PANE_MODE_ORDER,
  nextPaneMode,
  paneModeAction,
  paneModeIcon,
} from '@/utils/paneMode'
import { isPaneMode } from '@/types'

describe('the mode cycle', () => {
  it('starts in the tab and steps out of it', () => {
    // The order is the whole feature: the column first, because that is where
    // a list is worked down, and the drawer only when the detail is being read.
    expect(PANE_MODE_ORDER).toEqual(['inline', 'compact', 'large'])
    expect(nextPaneMode('inline')).toBe('compact')
    expect(nextPaneMode('compact')).toBe('large')
  })

  it('wraps, so the button is never a dead end', () => {
    expect(nextPaneMode('large')).toBe('inline')
    // Three presses from anywhere and you are back where you started.
    let mode = PANE_MODE_ORDER[0]
    for (let i = 0; i < PANE_MODE_ORDER.length; i++) mode = nextPaneMode(mode)
    expect(mode).toBe(PANE_MODE_ORDER[0])
  })

  it('names and pictures the mode the press LEADS to', () => {
    // The button carries the destination, not the current state — a maximise
    // arrow on a pane that is already maximised is a button that lies.
    expect(paneModeIcon('inline')).toBe('columns')
    expect(paneModeIcon('compact')).toBe('minimize')
    expect(paneModeIcon('large')).toBe('maximize')
    expect(paneModeAction('compact')).toBe('Switch to compact drawer')
    for (const mode of PANE_MODE_ORDER) {
      expect(PANE_MODE_LABEL[mode]).toBeTruthy()
      expect(isPaneMode(mode)).toBe(true)
    }
  })
})

describe('a stored mode', () => {
  it('is rejected when it is not one of the three', () => {
    expect(isPaneMode('half')).toBe(false)
    expect(isPaneMode('')).toBe(false)
    expect(isPaneMode(undefined)).toBe(false)
  })
})
