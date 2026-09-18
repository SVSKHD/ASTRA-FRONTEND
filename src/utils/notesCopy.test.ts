import { describe, expect, it } from 'vitest'
import { groupLabel, noteCount, noteToMarkdown, notesToMarkdown } from '@/utils/notesCopy'

describe('noteToMarkdown', () => {
  it('heads the body with the note title', () => {
    expect(noteToMarkdown({ title: 'Plan', text: '- one\n- two' }, 2)).toBe(
      '## Plan\n\n- one\n- two',
    )
  })
  it('is just the body when the note has no title', () => {
    expect(noteToMarkdown({ title: '', text: 'hello\n' })).toBe('hello')
  })
  it('is just the heading when the body is empty', () => {
    expect(noteToMarkdown({ title: 'Empty', text: '  ' }, 3)).toBe('### Empty')
  })
})

describe('notesToMarkdown', () => {
  const own = { title: 'Launch', path: [], notes: [{ title: 'A', text: 'a' }] }
  const deep = {
    title: 'Deep',
    path: ['Child'],
    notes: [{ title: '', text: 'd' }],
  }
  const bare = { title: 'Nothing', path: [], notes: [] }

  it('copies one item without an item heading', () => {
    expect(notesToMarkdown([own], false)).toBe('## A\n\na')
  })
  it('heads each group with its path below the item and skips groups without notes', () => {
    expect(notesToMarkdown([own, bare, deep])).toBe(
      '## Launch\n\n### A\n\na\n\n---\n\n## Child › Deep\n\nd',
    )
  })
  it('keeps the heading when a single subtask has notes', () => {
    expect(notesToMarkdown([bare, deep])).toBe('## Child › Deep\n\nd')
  })
  it('is empty when nothing has notes', () => {
    expect(notesToMarkdown([bare])).toBe('')
  })
  it('counts and labels', () => {
    expect(noteCount([own, bare, deep])).toBe(2)
    expect(groupLabel({ title: '', path: ['P'], notes: [] })).toBe('P › Untitled')
  })
})
