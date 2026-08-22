// "Attach existing" — finding one note among all of them (section 22b).
//
// Two rules decide what this shows, and both come from how somebody actually
// reaches for a note. First: recent notes first, with no query at all, because
// the note you want to attach to the task you are creating is usually the one
// you wrote this morning. Second: the query matches the body as well as the
// title, because most notes have no title and the words somebody remembers are
// in the text.
//
// Already-attached notes are listed rather than filtered out. A picker that
// hides them makes "did I already attach this?" unanswerable without closing it.

import { noteRowLabel } from '@/utils/noteColumn'
import { notePreview } from '@/utils/notes'
import type { Note } from '@/types'

export interface NoteCandidate {
  id: number
  title: string
  preview: string
  // Already on the item this picker was opened from.
  attached: boolean
  updatedAt: number
}

// How many rows the list holds before it stops. A picker is a search, not a
// directory listing — past twenty rows the answer is a better query.
export const PICKER_LIMIT = 20

function haystack(note: Note): string {
  return `${note.title ?? ''}\n${note.text ?? ''}`.toLowerCase()
}

// Every term has to appear somewhere, in any order: "budget q3" finds a note
// titled "Q3" whose body mentions the budget, which a single-substring match
// would not.
function matches(note: Note, terms: readonly string[]): boolean {
  if (!terms.length) return true
  const hay = haystack(note)
  return terms.every((term) => hay.includes(term))
}

export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

// Recency is the note's own — `updatedAt` where section 8's stamps reached it,
// falling back to the `ts` every note has carried since the beginning.
function recencyOf(note: Note): number {
  return note.updatedAt || note.ts || 0
}

export function searchNotes(
  notes: readonly Note[],
  query: string,
  options: { attachedIds?: readonly number[]; limit?: number } = {},
): NoteCandidate[] {
  const terms = searchTerms(query)
  const attached = new Set(options.attachedIds ?? [])
  return notes
    .filter((note) => matches(note, terms))
    .map((note) => ({
      id: note.id,
      title: noteRowLabel(note),
      preview: notePreview(note.text ?? '', 80),
      attached: attached.has(note.id),
      updatedAt: recencyOf(note),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt || b.id - a.id)
    .slice(0, options.limit ?? PICKER_LIMIT)
}

// The selection a multi-select picker carries: toggling is the whole
// interaction, and it is here so the component holds a value rather than logic.
export function toggleSelection(selected: readonly number[], id: number): number[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
}

// What the confirm button says. Naming the count is what makes a multi-select
// picker's button honest — "Attach" on a picker with three ticks reads as one.
export function attachLabel(count: number): string {
  if (count <= 0) return 'Attach'
  return `Attach ${count} note${count === 1 ? '' : 's'}`
}
