// Section 22a: what the notes surface reads as before anything renders it.
import { describe, expect, it } from 'vitest'
import {
  LEGACY_ROW_ID,
  LEGACY_ROW_TITLE,
  NOTES_ROW_LIMIT,
  blankNoteDraft,
  draftWorthSaving,
  legacyNoteField,
  legacyNoteText,
  legacyRow,
  noteRow,
  overflowLabel,
  shortAgo,
  visibleRows,
} from '@/utils/notesSection'
import type { Note } from '@/types'

const NOW = Date.UTC(2024, 5, 12, 12, 0, 0)
const note = (over: Partial<Note> = {}): Note => ({
  id: 1,
  text: 'body',
  format: 'md',
  ts: NOW,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
})

describe('the stamp on a row', () => {
  it('is short, because it shares a line with a title and a menu', () => {
    expect(shortAgo(NOW - 30_000, NOW)).toBe('just now')
    expect(shortAgo(NOW - 5 * 60_000, NOW)).toBe('5m ago')
    expect(shortAgo(NOW - 3 * 3_600_000, NOW)).toBe('3h ago')
    expect(shortAgo(NOW - 2 * 86_400_000, NOW)).toBe('2d ago')
  })

  it('becomes a date past a week, because nobody reads "63d ago"', () => {
    expect(shortAgo(NOW - 63 * 86_400_000, NOW)).not.toMatch(/ago/)
  })

  it('says nothing at all for a note with no stamp', () => {
    expect(shortAgo(0, NOW)).toBe('')
    expect(shortAgo(null, NOW)).toBe('')
  })
})

describe('a row', () => {
  it('takes its name from the note title', () => {
    expect(noteRow(note({ title: 'Q3 budget' }), NOW).title).toBe('Q3 budget')
  })

  it('falls back to the first line, exactly as the note list does', () => {
    expect(noteRow(note({ title: '', text: '# Heading\nbody' }), NOW).title).toBe('Heading')
  })

  it('prefers the note updated stamp over the older ts field', () => {
    const row = noteRow(note({ ts: NOW - 86_400_000, updatedAt: NOW - 60_000 }), NOW)
    expect(row.ago).toBe('1m ago')
  })
})

describe('the legacy row', () => {
  it('is named for the field, not for its first line', () => {
    // The point of the row is "this is the notes field", so a first line that
    // happens to read like a title must not stand in for that.
    expect(legacyRow(NOW, NOW).title).toBe(LEGACY_ROW_TITLE)
  })

  it('carries an id nothing real can collide with', () => {
    expect(legacyRow(NOW, NOW).id).toBe(LEGACY_ROW_ID)
    expect(LEGACY_ROW_ID).toBeLessThan(0)
  })

  it('is told apart from a real note by its kind, not by a nullable id', () => {
    expect(legacyRow(NOW, NOW).kind).toBe('legacy')
    expect(noteRow(note(), NOW).kind).toBe('note')
  })
})

describe('how many rows are shown', () => {
  const rows = Array.from({ length: 6 }, (_, i) => noteRow(note({ id: i + 1 }), NOW))

  it('stops at three and counts the rest', () => {
    const shown = visibleRows(rows)
    expect(shown.rows).toHaveLength(NOTES_ROW_LIMIT)
    expect(shown.hidden).toBe(3)
    expect(overflowLabel(shown.hidden)).toBe('+3 more')
  })

  it('shows all of them once the reader asks', () => {
    const shown = visibleRows(rows, { expanded: true })
    expect(shown.rows).toHaveLength(6)
    expect(shown.hidden).toBe(0)
  })

  it('holds nothing back when there is nothing to hold back', () => {
    expect(visibleRows(rows.slice(0, 3)).hidden).toBe(0)
    expect(visibleRows([]).rows).toEqual([])
  })
})

describe('the draft note', () => {
  it('starts empty and is not worth writing', () => {
    expect(draftWorthSaving(blankNoteDraft())).toBe(false)
    expect(draftWorthSaving(null)).toBe(false)
  })

  it('is worth writing once either field has something in it', () => {
    expect(draftWorthSaving({ title: 'Plan', text: '' })).toBe(true)
    expect(draftWorthSaving({ title: '', text: 'a line' })).toBe(true)
  })

  it('is not worth writing when both fields are only whitespace', () => {
    expect(draftWorthSaving({ title: '   ', text: '\n\n' })).toBe(false)
  })
})

describe('the legacy string', () => {
  it('is only the task notes field', () => {
    expect(legacyNoteField('task')).toBe('notes')
    // A todo's description and a goal's are their own labelled fields; this
    // feature must not eat them.
    expect(legacyNoteField('todo')).toBe(null)
    expect(legacyNoteField('goal')).toBe(null)
  })

  it('is read off the item, and whitespace does not count as text', () => {
    expect(legacyNoteText('task', { notes: 'the old text' })).toBe('the old text')
    expect(legacyNoteText('task', { notes: '   \n ' })).toBe('')
    expect(legacyNoteText('task', {})).toBe('')
    expect(legacyNoteText('todo', { description: 'kept' })).toBe('')
    expect(legacyNoteText('task', null)).toBe('')
  })
})
