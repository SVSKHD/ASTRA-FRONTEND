// Section 21a: a note and the thing it is attached to point at each other, and
// keep pointing at each other after a snapshot from another device lands.
import { describe, expect, it } from 'vitest'
import {
  buildAttachmentIndex,
  hasRef,
  idsEqual,
  isNoteOwnerType,
  normaliseIds,
  normaliseRefs,
  ownerKey,
  refsEqual,
  withId,
  withRef,
  withoutId,
  withoutRef,
} from '@/utils/noteRefs'
import type { NoteRef } from '@/types'

const ref = (type: NoteRef['type'], id: number): NoteRef => ({ type, id })

describe('the edits', () => {
  it('adds a reference once, however many times it is asked', () => {
    const once = withRef([], ref('task', 1))
    expect(withRef(once, ref('task', 1))).toEqual([{ type: 'task', id: 1 }])
  })

  it('keeps a task and a goal with the same id apart', () => {
    const refs = withRef(withRef([], ref('task', 7)), ref('goal', 7))
    expect(refs).toHaveLength(2)
    expect(hasRef(refs, ref('goal', 7))).toBe(true)
    expect(ownerKey('task', 7)).not.toBe(ownerKey('goal', 7))
  })

  it('detaching drops only the one end asked for', () => {
    const refs = [ref('task', 1), ref('goal', 2)]
    expect(withoutRef(refs, ref('task', 1))).toEqual([{ type: 'goal', id: 2 }])
  })

  it('appends new notes to the end, so the reader keeps their order', () => {
    expect(withId([3, 1], 2)).toEqual([3, 1, 2])
    expect(withId([3, 1], 3)).toEqual([3, 1])
    expect(withoutId([3, 1, 2], 1)).toEqual([3, 2])
  })

  it('never mutates what it was handed', () => {
    const refs = [ref('task', 1)]
    withRef(refs, ref('goal', 2))
    withoutRef(refs, ref('task', 1))
    expect(refs).toEqual([{ type: 'task', id: 1 }])
  })
})

describe('reading what was stored', () => {
  it('drops anything that is not a reference', () => {
    expect(
      normaliseRefs([
        { type: 'task', id: 1 },
        { type: 'nonsense', id: 2 },
        { type: 'goal' },
        null,
        'task:3',
        { type: 'goal', id: '4' },
      ]),
    ).toEqual([{ type: 'task', id: 1 }])
  })

  it('treats a missing list as an empty one', () => {
    expect(normaliseRefs(undefined)).toEqual([])
    expect(normaliseIds(null)).toEqual([])
  })

  it('de-duplicates', () => {
    expect(normaliseIds([1, 1, 2])).toEqual([1, 2])
    expect(normaliseRefs([ref('task', 1), ref('task', 1)])).toHaveLength(1)
  })
})

describe('rebuilding both directions (the migration)', () => {
  it('gives a note the back-reference its owner already implied', () => {
    // What ideas/stocks/trips have looked like since long before section 21:
    // the owner knows about the note, the note knows nothing.
    const index = buildAttachmentIndex(
      [{ id: 10 }],
      [{ type: 'idea', items: [{ id: 1, noteIds: [10] }] }],
    )
    expect(index.refsByNote.get(10)).toEqual([{ type: 'idea', id: 1 }])
    expect(index.idsByOwner.get(ownerKey('idea', 1))).toEqual([10])
  })

  it('leaves a standalone note standalone', () => {
    // Acceptance 106: no data loss, no forced re-filing.
    const index = buildAttachmentIndex([{ id: 10 }], [{ type: 'task', items: [{ id: 1 }] }])
    expect(index.refsByNote.get(10)).toEqual([])
    expect(index.idsByOwner.get(ownerKey('task', 1))).toBeUndefined()
  })

  it('completes a half-written link from the note end too', () => {
    const index = buildAttachmentIndex(
      [{ id: 10, attachedTo: [ref('task', 1)] }],
      [{ type: 'task', items: [{ id: 1 }] }],
    )
    expect(index.idsByOwner.get(ownerKey('task', 1))).toEqual([10])
  })

  it('keeps one note attached to several things at once', () => {
    const index = buildAttachmentIndex(
      [{ id: 10, attachedTo: [ref('goal', 5)] }],
      [
        { type: 'task', items: [{ id: 1, noteIds: [10] }] },
        { type: 'goal', items: [{ id: 5 }] },
      ],
    )
    expect(index.refsByNote.get(10)).toEqual([
      { type: 'task', id: 1 },
      { type: 'goal', id: 5 },
    ])
  })

  it('drops a pointer whose other end was deleted', () => {
    const index = buildAttachmentIndex(
      [{ id: 10, attachedTo: [ref('task', 404)] }],
      [{ type: 'task', items: [{ id: 1, noteIds: [999] }] }],
    )
    expect(index.refsByNote.get(10)).toEqual([])
    expect(index.idsByOwner.get(ownerKey('task', 1))).toBeUndefined()
  })

  it("keeps the owner's ordering when the two sides disagree about it", () => {
    const index = buildAttachmentIndex(
      [
        { id: 10, attachedTo: [ref('task', 1)] },
        { id: 11, attachedTo: [ref('task', 1)] },
      ],
      [{ type: 'task', items: [{ id: 1, noteIds: [11, 10] }] }],
    )
    expect(index.idsByOwner.get(ownerKey('task', 1))).toEqual([11, 10])
  })
})

describe('deciding whether a write is needed', () => {
  it('sees no change as no change', () => {
    expect(idsEqual([1, 2], [1, 2])).toBe(true)
    expect(idsEqual(undefined, [])).toBe(true)
    expect(refsEqual([ref('task', 1)], [ref('task', 1)])).toBe(true)
  })

  it('sees a reordering as a change', () => {
    expect(idsEqual([1, 2], [2, 1])).toBe(false)
    expect(refsEqual([ref('task', 1)], [ref('goal', 1)])).toBe(false)
  })

  it('knows the owner types it can store', () => {
    expect(isNoteOwnerType('task')).toBe(true)
    expect(isNoteOwnerType('reminder')).toBe(false)
  })
})
