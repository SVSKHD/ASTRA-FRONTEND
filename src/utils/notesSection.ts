// The notes attachment surface, as arithmetic (section 22a).
//
// What replaced the free-text box is a list of references, and a list of
// references has to answer two questions before it is drawn: what each row
// reads as, and how many of them are shown before the section starts owning
// the dialog.
//
// Both are here rather than in the component, because the same component
// renders this for a task, a todo and a goal (section 22f) and the answers must
// not differ by entity. The component decides where the rows go; this decides
// what they are.

import { noteRowLabel } from '@/utils/noteColumn'
import type { Note } from '@/types'

// Three rows, then a count. Four attached notes is common and eleven is not
// unheard of; a section that renders all eleven pushes REPO and the footer off
// the dialog, and a reader who wants all eleven asks for them.
export const NOTES_ROW_LIMIT = 3

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// "2h ago", not "2 hours ago": this shares one line with a title and a menu, and
// the long form is what pushes the title into an ellipsis. Past a week it
// becomes a date, because "63d ago" is not a thing anybody reads as a time.
export function shortAgo(at: number | null | undefined, now = Date.now()): string {
  if (typeof at !== 'number' || at <= 0) return ''
  const delta = now - at
  if (delta < 0 || delta < MINUTE) return 'just now'
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`
  if (delta < 7 * DAY) return `${Math.floor(delta / DAY)}d ago`
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// One attached note, as one line. A row is an index entry, not the note: it
// carries only what tells the reader which note this is and how fresh it is.
export interface NoteRowModel {
  id: number
  title: string
  ago: string
  pinned: boolean
}

export function noteRow(note: Note, now = Date.now()): NoteRowModel {
  return {
    id: note.id,
    title: noteRowLabel(note),
    ago: shortAgo(note.updatedAt || note.ts, now),
    pinned: note.pinned === true,
  }
}

// The rows to draw, and how many are being held back. Expanding is one-way
// within an open dialog — a reader who asked for all of them is not asked again
// on the next render.
export function visibleRows(
  rows: readonly NoteRowModel[],
  options: { expanded?: boolean; limit?: number } = {},
): { rows: NoteRowModel[]; hidden: number } {
  const limit = options.limit ?? NOTES_ROW_LIMIT
  if (options.expanded || rows.length <= limit) return { rows: rows.slice(), hidden: 0 }
  return { rows: rows.slice(0, limit), hidden: rows.length - limit }
}

export function overflowLabel(hidden: number): string {
  return `+${hidden} more`
}

// ---- the draft note (section 22b) ------------------------------------------
// A note being written inside a create dialog, before there is anything to
// attach it to. It is held here rather than written on the first keystroke,
// because a cancelled creation must leave nothing behind (acceptance 113).
export interface NoteDraft {
  title: string
  text: string
}

export function blankNoteDraft(): NoteDraft {
  return { title: '', text: '' }
}

// Whether a draft is worth writing on ADD. An opened-and-abandoned editor is
// not a note, and writing it would leave an untitled empty row on every task
// somebody opened the editor on and thought better of.
export function draftWorthSaving(draft: NoteDraft | null | undefined): boolean {
  if (!draft) return false
  return draft.title.trim().length > 0 || draft.text.trim().length > 0
}
