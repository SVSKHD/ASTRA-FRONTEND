// Section 21b: what shape the note extension takes, and where the divider lands.
import { describe, expect, it } from 'vitest'
import {
  NOTE_COLUMN_BREAKPOINT,
  PANEL_WIDTH_ONE,
  PANEL_WIDTH_TWO,
  SPLIT_MAX,
  SPLIT_MIN,
  clampSplit,
  columnTemplate,
  noteColumnMode,
  noteRowLabel,
  panelWidth,
  splitFromDrag,
} from '@/utils/noteColumn'

describe('what shape the extension takes', () => {
  it('is two columns on a wide screen', () => {
    expect(noteColumnMode(1440, false)).toBe('split')
    expect(noteColumnMode(NOTE_COLUMN_BREAKPOINT, false)).toBe('split')
  })

  it('is a slide-over on a narrow one', () => {
    expect(noteColumnMode(NOTE_COLUMN_BREAKPOINT - 1, false)).toBe('over')
  })

  it('is never two half-width columns on a phone (acceptance 108)', () => {
    // Even on a landscape phone reporting a desktop-ish width.
    expect(noteColumnMode(1440, true)).toBe('sheet')
    expect(noteColumnMode(390, true)).toBe('sheet')
  })
})

describe('the panel', () => {
  it('widens only when there are two columns to hold', () => {
    expect(panelWidth(false, 'split')).toBe(PANEL_WIDTH_ONE)
    expect(panelWidth(true, 'split')).toBe(PANEL_WIDTH_TWO)
    expect(panelWidth(true, 'over')).toBe(PANEL_WIDTH_ONE)
    expect(panelWidth(true, 'sheet')).toBe(PANEL_WIDTH_ONE)
  })

  it('gives both columns a zero minimum, so neither can push the other out', () => {
    // The middle track is the divider — a column, not something laid over the
    // seam, so nothing in the dialog needs absolute positioning.
    expect(columnTemplate(true, 'split', 50)).toBe('minmax(0, 50fr) auto minmax(0, 50fr)')
    expect(columnTemplate(false, 'split', 50)).toBe('minmax(0, 1fr)')
    // A slide-over is one column that happens to hold the note.
    expect(columnTemplate(true, 'over', 50)).toBe('minmax(0, 1fr)')
  })

  it("honours the reader's stored width", () => {
    expect(columnTemplate(true, 'split', 65)).toBe('minmax(0, 65fr) auto minmax(0, 35fr)')
  })
})

describe('the divider', () => {
  it('will not let either column disappear', () => {
    expect(clampSplit(5)).toBe(SPLIT_MIN)
    expect(clampSplit(95)).toBe(SPLIT_MAX)
    expect(clampSplit(50)).toBe(50)
  })

  it('falls back to even when there is nothing stored', () => {
    expect(clampSplit(Number.NaN)).toBe(50)
  })

  it('follows the pointer in proportion to the panel', () => {
    // A quarter of a 1000px panel is 25 points of split.
    expect(splitFromDrag(50, 250, 1000)).toBe(SPLIT_MAX)
    expect(splitFromDrag(50, -100, 1000)).toBe(40)
  })

  it('stops at the clamp rather than running past it', () => {
    expect(splitFromDrag(50, 900, 1000)).toBe(SPLIT_MAX)
    expect(splitFromDrag(50, -900, 1000)).toBe(SPLIT_MIN)
  })

  it('ignores a drag on a panel with no width to divide', () => {
    expect(splitFromDrag(50, 300, 0)).toBe(50)
  })
})

describe('one note, one line', () => {
  it('shows the title when there is one', () => {
    expect(noteRowLabel({ title: 'Rollout plan', text: '# Something else' })).toBe('Rollout plan')
  })

  it('falls back to the first line of the body, heading marks off', () => {
    expect(noteRowLabel({ text: '## Rollout plan\n\nbody' })).toBe('Rollout plan')
  })

  it('skips the blank lines a note often starts with', () => {
    expect(noteRowLabel({ text: '\n\n   \nfirst real line' })).toBe('first real line')
  })

  it('says so rather than showing an empty row', () => {
    expect(noteRowLabel({})).toBe('Untitled note')
    expect(noteRowLabel({ title: '   ', text: '' })).toBe('Untitled note')
  })
})
