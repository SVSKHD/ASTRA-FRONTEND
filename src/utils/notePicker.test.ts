// Section 22b: what "Attach existing" finds, and in what order.
import { describe, expect, it } from 'vitest'
import {
  PICKER_LIMIT,
  attachLabel,
  searchNotes,
  searchTerms,
  toggleSelection,
} from '@/utils/notePicker'
import type { Note } from '@/types'

const note = (id: number, over: Partial<Note> = {}): Note => ({
  id,
  text: 'body ' + id,
  format: 'md',
  ts: id,
  createdAt: id,
  updatedAt: id,
  ...over,
})

describe('with no query at all', () => {
  it('offers the most recent first — the note you want is usually today’s', () => {
    const found = searchNotes([note(1), note(3), note(2)], '')
    expect(found.map((n) => n.id)).toEqual([3, 2, 1])
  })

  it('stops at a screenful rather than listing the workspace', () => {
    const many = Array.from({ length: 40 }, (_, i) => note(i + 1))
    expect(searchNotes(many, '')).toHaveLength(PICKER_LIMIT)
  })
})

describe('the query', () => {
  const notes = [
    note(1, { title: 'Q3 budget', text: 'nothing to see' }),
    note(2, { title: '', text: 'a line about the budget for later' }),
    note(3, { title: 'Groceries', text: 'milk' }),
  ]

  it('matches the title', () => {
    expect(searchNotes(notes, 'Q3').map((n) => n.id)).toEqual([1])
  })

  it('matches the body too — most notes have no title', () => {
    expect(searchNotes(notes, 'milk').map((n) => n.id)).toEqual([3])
  })

  it('takes every term in any order, across title and body', () => {
    expect(searchNotes(notes, 'budget q3').map((n) => n.id)).toEqual([1])
    expect(searchNotes(notes, 'later budget').map((n) => n.id)).toEqual([2])
  })

  it('ignores case and stray spacing', () => {
    expect(searchTerms('  Q3   BUDGET ')).toEqual(['q3', 'budget'])
    expect(searchNotes(notes, '  qUaRtEr ')).toEqual([])
  })
})

describe('what is already attached', () => {
  it('is listed and marked, not hidden', () => {
    // Hiding it makes "did I already attach this?" unanswerable without
    // closing the picker.
    const found = searchNotes([note(1), note(2)], '', { attachedIds: [2] })
    expect(found.map((n) => n.id)).toEqual([2, 1])
    expect(found.find((n) => n.id === 2)!.attached).toBe(true)
    expect(found.find((n) => n.id === 1)!.attached).toBe(false)
  })
})

describe('the selection', () => {
  it('toggles rather than only adding', () => {
    expect(toggleSelection([], 4)).toEqual([4])
    expect(toggleSelection([4, 7], 4)).toEqual([7])
  })

  it('names its count on the button, so three ticks do not read as one', () => {
    expect(attachLabel(0)).toBe('Attach')
    expect(attachLabel(1)).toBe('Attach 1 note')
    expect(attachLabel(3)).toBe('Attach 3 notes')
  })
})
