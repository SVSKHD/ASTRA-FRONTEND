// Section 22d: what the toolbar keeps when the editor is inside a dialog.
import { describe, expect, it } from 'vitest'
import {
  COMPACT_ACTIONS,
  COMPACT_MAX_HEIGHT,
  COMPACT_MIN_HEIGHT,
  EDITOR_TOOLS,
  editorModes,
  effectiveMode,
  splitTools,
} from '@/utils/noteTools'

describe('the toolbar', () => {
  it('is drawn whole when there is room for it', () => {
    const { primary, overflow } = splitTools(false)
    expect(primary).toHaveLength(EDITOR_TOOLS.length)
    expect(overflow).toEqual([])
  })

  it('keeps exactly the seven section 22d names, in that order', () => {
    const { primary } = splitTools(true)
    expect(primary.map((t) => t.action)).toEqual([
      'bold',
      'italic',
      'link',
      'h2',
      'bullet',
      'checklist',
      'code',
    ])
  })

  it('files everything else behind the overflow rather than dropping it', () => {
    const { primary, overflow } = splitTools(true)
    const shown = new Set([...primary, ...overflow].map((t) => t.action))
    // Nothing is lost: every action is still reachable, just not all on the bar.
    expect(shown.size).toBe(EDITOR_TOOLS.length)
    expect(overflow.some((t) => t.action === 'table')).toBe(true)
  })

  it('keeps the full set order in the overflow', () => {
    const { overflow } = splitTools(true)
    const order = EDITOR_TOOLS.map((t) => t.action).filter((a) => !COMPACT_ACTIONS.includes(a))
    expect(overflow.map((t) => t.action)).toEqual(order)
  })
})

describe('the mode switch', () => {
  it('offers Split only where a split fits', () => {
    expect(editorModes(false)).toContain('split')
    expect(editorModes(true)).toEqual(['edit', 'preview'])
  })

  it('narrows a stored Split preference rather than rewriting it', () => {
    expect(effectiveMode('split', { compact: true })).toBe('edit')
    expect(effectiveMode('split', { narrow: true })).toBe('edit')
    expect(effectiveMode('split', { mobile: true })).toBe('edit')
    expect(effectiveMode('split', {})).toBe('split')
  })

  it('leaves the other two modes alone wherever they are', () => {
    expect(effectiveMode('preview', { compact: true })).toBe('preview')
    expect(effectiveMode('edit', {})).toBe('edit')
  })
})

describe('the compact writing area', () => {
  it('starts at a paragraph and stops before it owns the dialog', () => {
    expect(COMPACT_MIN_HEIGHT).toBe(220)
    expect(COMPACT_MAX_HEIGHT).toBe('45vh')
  })
})
