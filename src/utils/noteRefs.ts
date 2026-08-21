// The two-way reference between a note and the thing it is attached to
// (section 21a).
//
// A note is not a field on a task. It is its own document, and the same note
// can hang off a task, the goal that task belongs to, and nothing else at all.
// So attachment is a pair of pointers: the owner lists the note id, the note
// lists the owner. Storing both means neither read has to scan the other list —
// "the notes on this task" and "where does this note live" are both a lookup.
//
// Two pointers can disagree, which is the price of storing both. Everything
// here is written to make them agree again: the edits return both sides at
// once, and `buildAttachmentIndex` rebuilds the pair from whatever the workspace
// actually holds. That rebuild is also the migration — ideas, stocks and trips
// have carried a one-way `noteIds` list since long before this, and running it
// gives those notes their back-reference without anybody re-filing anything.
import type { NoteOwnerType, NoteRef } from '@/types'

export const NOTE_OWNER_TYPES: NoteOwnerType[] = ['task', 'todo', 'goal', 'idea', 'stock', 'trip']

const OWNER_TYPES = new Set<string>(NOTE_OWNER_TYPES)

export function isNoteOwnerType(value: unknown): value is NoteOwnerType {
  return typeof value === 'string' && OWNER_TYPES.has(value)
}

// The key an owner is indexed by. Ids are only unique within a list, so a bare
// number would let a task and a goal that happen to share an id swap notes.
export function ownerKey(type: NoteOwnerType, id: number): string {
  return `${type}:${id}`
}

export function sameRef(a: NoteRef, b: NoteRef): boolean {
  return a.type === b.type && a.id === b.id
}

export function hasRef(refs: readonly NoteRef[] | undefined, ref: NoteRef): boolean {
  return (refs ?? []).some((r) => sameRef(r, ref))
}

// Append-if-absent. New attachments go on the end, so the order a reader put
// their notes in is the order they keep.
export function withRef(refs: readonly NoteRef[] | undefined, ref: NoteRef): NoteRef[] {
  const current = refs ?? []
  return hasRef(current, ref) ? current.slice() : [...current, { type: ref.type, id: ref.id }]
}

export function withoutRef(refs: readonly NoteRef[] | undefined, ref: NoteRef): NoteRef[] {
  return (refs ?? []).filter((r) => !sameRef(r, ref))
}

export function withId(ids: readonly number[] | undefined, id: number): number[] {
  const current = ids ?? []
  return current.includes(id) ? current.slice() : [...current, id]
}

export function withoutId(ids: readonly number[] | undefined, id: number): number[] {
  return (ids ?? []).filter((x) => x !== id)
}

// Stored JSON is not typed. Anything that is not a well-formed reference is
// dropped rather than repaired — a ref to a type that no longer exists is not
// recoverable, and keeping it would only make the next read fail differently.
export function normaliseRefs(raw: unknown): NoteRef[] {
  if (!Array.isArray(raw)) return []
  const out: NoteRef[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const { type, id } = entry as { type?: unknown; id?: unknown }
    if (!isNoteOwnerType(type) || typeof id !== 'number' || !Number.isFinite(id)) continue
    const ref = { type, id }
    if (!hasRef(out, ref)) out.push(ref)
  }
  return out
}

export function normaliseIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const value of raw) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (!out.includes(value)) out.push(value)
  }
  return out
}

// What a note read out of the workspace document looks like once section 21's
// fields are filled in. A note written before them keeps its text and gets the
// empty versions of everything else — untitled, untagged, unpinned, filed
// nowhere — which is precisely what it already was (acceptance 106).
export function hydrateNoteFields(raw: {
  title?: unknown
  tags?: unknown
  pinned?: unknown
  attachedTo?: unknown
}): { title: string; tags: string[]; pinned: boolean; attachedTo: NoteRef[] } {
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    pinned: raw.pinned === true,
    attachedTo: normaliseRefs(raw.attachedTo),
  }
}

// ---- The rebuild ----------------------------------------------------------

export interface NoteLike {
  id: number
  attachedTo?: NoteRef[]
}
export interface OwnerLike {
  id: number
  noteIds?: number[]
}
export interface OwnerList {
  type: NoteOwnerType
  items: readonly OwnerLike[]
}

export interface AttachmentIndex {
  // noteId → the owners it is attached to.
  refsByNote: Map<number, NoteRef[]>
  // ownerKey → the notes attached to it, in the owner's own order.
  idsByOwner: Map<string, number[]>
}

// Reconcile the two directions into one truth.
//
// A link counts if either side claims it: the forward list is what ideas and
// stocks have always had, the back list is what a note written by section 21
// has, and a workspace mid-migration has some of each. A link is dropped only
// when one of its ends is gone — a note that was deleted, or an owner that was.
// Dangling pointers are the one thing worth losing here; everything else is
// somebody's filing.
//
// Order is the owner's: the forward list first, in the order it was stored,
// then anything only the note knew about. That keeps a reader's arrangement of
// notes on an item stable across a rebuild.
export function buildAttachmentIndex(
  notes: readonly NoteLike[],
  owners: readonly OwnerList[],
): AttachmentIndex {
  const liveNotes = new Set(notes.map((n) => n.id))
  const liveOwners = new Set<string>()
  for (const list of owners)
    for (const item of list.items) liveOwners.add(ownerKey(list.type, item.id))

  const refsByNote = new Map<number, NoteRef[]>()
  const idsByOwner = new Map<string, number[]>()
  for (const note of notes) refsByNote.set(note.id, [])

  const link = (ref: NoteRef, noteId: number) => {
    if (!liveNotes.has(noteId)) return
    const key = ownerKey(ref.type, ref.id)
    if (!liveOwners.has(key)) return
    const ids = idsByOwner.get(key)
    if (!ids) idsByOwner.set(key, [noteId])
    else if (!ids.includes(noteId)) ids.push(noteId)
    const refs = refsByNote.get(noteId)!
    if (!hasRef(refs, ref)) refs.push({ type: ref.type, id: ref.id })
  }

  // Forward first, so the owner's ordering wins.
  for (const list of owners)
    for (const item of list.items)
      for (const noteId of normaliseIds(item.noteIds))
        link({ type: list.type, id: item.id }, noteId)
  for (const note of notes) for (const ref of normaliseRefs(note.attachedTo)) link(ref, note.id)

  return { refsByNote, idsByOwner }
}

// Whether a rebuilt list differs from what is stored. Used so a reconcile that
// changes nothing writes nothing — every write in this app is a workspace save.
export function idsEqual(a: readonly number[] | undefined, b: readonly number[]): boolean {
  const left = a ?? []
  return left.length === b.length && left.every((value, i) => value === b[i])
}

export function refsEqual(a: readonly NoteRef[] | undefined, b: readonly NoteRef[]): boolean {
  const left = a ?? []
  return left.length === b.length && left.every((ref, i) => sameRef(ref, b[i]))
}
