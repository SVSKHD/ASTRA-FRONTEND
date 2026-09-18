// Notes as clipboard text (the "Copy" actions in a detail pane's Notes section).
//
// Markdown, because that is what a note already is: pasted into another note,
// a doc or a chat it keeps its headings and lists. The item a note hangs off is
// a heading above its notes, so a copy that spans a task and its subtasks still
// says which note came from where.

import { noteRowLabel } from '@/utils/noteColumn'

export interface NoteLike {
  title?: string
  text?: string
}

// One note: its name as a heading, then the body. A note with no given title
// is just its body — heading the first line would repeat it.
export function noteToMarkdown(note: NoteLike, level = 3): string {
  const body = (note.text ?? '').trim()
  const title = (note.title ?? '').trim()
  if (!title) return body || noteRowLabel(note)
  const heading = `${'#'.repeat(level)} ${title}`
  return body ? `${heading}\n\n${body}` : heading
}

// A group of notes under the item they are attached to. `path` is the item's
// place below the item being copied from — empty for that item itself.
export interface NoteGroup {
  title: string
  path: string[]
  notes: NoteLike[]
}

export function groupLabel(group: NoteGroup): string {
  return [...group.path, group.title || 'Untitled'].join(' › ')
}

// Every group that has notes, separated by a rule. `headed` puts each group
// under its item's name — wanted whenever subtasks are in the copy, and not
// when copying one item's own notes, where the reader knows where they are from.
export function notesToMarkdown(groups: readonly NoteGroup[], headed = true): string {
  const withNotes = groups.filter((g) => g.notes.length)
  if (!withNotes.length) return ''
  return withNotes
    .map((g) => {
      const notes = g.notes.map((n) => noteToMarkdown(n, headed ? 3 : 2)).join('\n\n')
      return headed ? `## ${groupLabel(g)}\n\n${notes}` : notes
    })
    .join('\n\n---\n\n')
}

export function noteCount(groups: readonly NoteGroup[]): number {
  return groups.reduce((sum, g) => sum + g.notes.length, 0)
}
