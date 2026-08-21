// Section 21a, from the store's side: attaching moves both ends, detaching
// clears both, and a workspace written before any of this existed loads with
// its notes intact and filed exactly where they were — nowhere.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { hydrateNoteFields } from '@/utils/noteRefs'
import type { Note, Task } from '@/types'

function makeTask(id: number, over: Partial<Task> = {}): Task {
  return {
    id,
    title: 'task ' + id,
    tag: '',
    done: false,
    status: 'pending',
    deadline: '',
    notes: '',
    repo: '',
    rolledOverAt: null,
    rolloverCount: 0,
    completedAt: null,
    linked: [],
    parents: [],
    reminderIds: [],
    sourceRef: null,
    parentId: null,
    order: id,
    depth: 0,
    rootId: id,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

function makeNote(id: number, over: Partial<Note> = {}): Note {
  return { id, text: 'note ' + id, format: 'md', ts: 0, createdAt: 0, updatedAt: 0, ...over }
}

describe('attaching a note to a task', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('writes both ends of the reference', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    app.notes = [makeNote(10)]
    app.attachNote('task', 1, 10)
    expect(app.tasks[0].noteIds).toEqual([10])
    expect(app.notes[0].attachedTo).toEqual([{ type: 'task', id: 1 }])
  })

  it('reads back in the order the reader attached them', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    app.notes = [makeNote(10), makeNote(11)]
    app.attachNote('task', 1, 11)
    app.attachNote('task', 1, 10)
    expect(app.notesFor('task', 1).map((n) => n.id)).toEqual([11, 10])
  })

  it('is idempotent', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    app.notes = [makeNote(10)]
    app.attachNote('task', 1, 10)
    app.attachNote('task', 1, 10)
    expect(app.tasks[0].noteIds).toEqual([10])
    expect(app.notes[0].attachedTo).toHaveLength(1)
  })

  it('lets one note hang off a task and a goal at once', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    app.goals = [
      {
        id: 5,
        title: 'Ship it',
        description: '',
        status: 'active',
        targetDate: '',
        startDate: '',
        color: '',
        icon: '',
        source: 'manual',
        sourceUrl: '',
        parentId: null,
        order: 0,
        depth: 0,
        rootId: 5,
        localRev: 0,
        updatedBy: '',
        createdAt: 0,
        updatedAt: 0,
      },
    ]
    app.notes = [makeNote(10)]
    app.attachNote('task', 1, 10)
    app.attachNote('goal', 5, 10)
    expect(app.noteOwners(10)).toEqual([
      { type: 'task', id: 1 },
      { type: 'goal', id: 5 },
    ])
    expect(app.notesFor('goal', 5).map((n) => n.id)).toEqual([10])
  })

  it('refuses to point at something that is not there', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    app.notes = [makeNote(10)]
    app.attachNote('task', 404, 10)
    app.attachNote('task', 1, 404)
    expect(app.tasks[0].noteIds ?? []).toEqual([])
    expect(app.notes[0].attachedTo ?? []).toEqual([])
  })
})

describe('detaching', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('clears both ends and keeps the note itself', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    app.notes = [makeNote(10)]
    app.attachNote('task', 1, 10)
    app.detachNote('task', 1, 10)
    expect(app.tasks[0].noteIds).toEqual([])
    expect(app.notes[0].attachedTo).toEqual([])
    // Detaching is filing, not deleting.
    expect(app.notes).toHaveLength(1)
  })

  it('leaves the note attached to everything else it belongs to', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1), makeTask(2)]
    app.notes = [makeNote(10)]
    app.attachNote('task', 1, 10)
    app.attachNote('task', 2, 10)
    app.detachNote('task', 1, 10)
    expect(app.noteOwners(10)).toEqual([{ type: 'task', id: 2 }])
  })
})

describe('a new note on an item', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('arrives blank, attached, and in the drawer like any other note', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    const noteId = app.createNoteFor('task', 1)
    expect(noteId).not.toBeNull()
    expect(app.notes.map((n) => n.id)).toEqual([noteId])
    expect(app.notes[0].text).toBe('')
    expect(app.tasks[0].noteIds).toEqual([noteId])
    expect(app.notes[0].attachedTo).toEqual([{ type: 'task', id: 1 }])
  })

  it('is not created for an item that does not exist', () => {
    const app = useAppStore()
    expect(app.createNoteFor('task', 404)).toBeNull()
    expect(app.notes).toHaveLength(0)
  })
})

describe('a workspace from before section 21 (acceptance 106)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('keeps its standalone notes standalone', () => {
    // What a note read off the wire looks like once the new fields are filled
    // in: the same note, filed nowhere, which is where it already was.
    expect(hydrateNoteFields({})).toEqual({
      title: '',
      tags: [],
      pinned: false,
      attachedTo: [],
    })
    const app = useAppStore()
    app.notes = [makeNote(10, hydrateNoteFields({}))]
    app.reconcileNoteRefs()
    expect(app.notes[0].text).toBe('note 10')
    expect(app.notes[0].attachedTo).toEqual([])
  })

  it('gives an idea note the back-reference the idea already implied', () => {
    // Ideas have carried a one-way noteIds list since long before this; the
    // migration reads it rather than asking anybody to re-file.
    const app = useAppStore()
    app.notes = [makeNote(10)]
    app.ideas = [
      {
        id: 1,
        title: 'An idea',
        description: '',
        deadline: '',
        ideaType: 'feature',
        tag: '',
        noteIds: [10],
        createdAt: 0,
        updatedAt: 0,
      },
    ]
    app.reconcileNoteRefs()
    expect(app.notes[0].attachedTo).toEqual([{ type: 'idea', id: 1 }])
    expect(app.notesFor('idea', 1).map((n) => n.id)).toEqual([10])
  })

  it('drops a pointer whose other end is gone', () => {
    const app = useAppStore()
    app.notes = [makeNote(10, { attachedTo: [{ type: 'task', id: 404 }] })]
    app.tasks = [makeTask(1, { noteIds: [999] })]
    app.reconcileNoteRefs()
    expect(app.notes[0].attachedTo).toEqual([])
    expect(app.tasks[0].noteIds).toEqual([])
  })

  it('writes nothing when the two directions already agree', () => {
    // Every write here is a workspace save, and this runs on every snapshot.
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    app.notes = [makeNote(10)]
    app.attachNote('task', 1, 10)
    const notes = app.notes
    const tasks = app.tasks
    app.reconcileNoteRefs()
    expect(app.notes).toBe(notes)
    expect(app.tasks).toBe(tasks)
  })
})

describe('deleting either end', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('leaves no dangling pointer behind, and undo puts it back', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    app.notes = [makeNote(10)]
    app.attachNote('task', 1, 10)
    app.deleteWithUndo('notes', 'note', 10)
    expect(app.tasks[0].noteIds).toEqual([])
    app.undoDelete()
    expect(app.notes.map((n) => n.id)).toEqual([10])
    expect(app.tasks[0].noteIds).toEqual([10])
    expect(app.notes[0].attachedTo).toEqual([{ type: 'task', id: 1 }])
  })
})
