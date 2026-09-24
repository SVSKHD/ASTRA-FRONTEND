// Notes, doing the four things every other item does — and doing them the way
// every other item does them. Each test here is a behaviour that used to differ
// between one note surface and another, or between notes and everything else.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { noteLabel } from '@/utils/notes'

describe('a note is called the same thing everywhere', () => {
  it('prefers its own title, and falls back to the first line of the body', () => {
    // The drawer and the full reader used to ask a function that cannot see a
    // title at all, so a note called "Groceries" in a detail pane read as
    // "Untitled note" in the drawer. One question, one answer.
    expect(noteLabel({ title: 'Groceries', text: '# Something else' })).toBe('Groceries')
    expect(noteLabel({ title: '', text: '# Rollout plan\nbody' })).toBe('Rollout plan')
    expect(noteLabel({ title: '   ', text: '' })).toBe('Untitled note')
  })
})

describe('the note dialog', () => {
  let app: ReturnType<typeof useAppStore>
  beforeEach(() => {
    setActivePinia(createPinia())
    app = useAppStore()
  })

  it('writes no row for a new note that was never typed into', () => {
    app.newNote()
    app.saveNoteView('')
    expect(app.notes).toHaveLength(0)
  })

  it('creates on the first save, carrying the title as well as the body', () => {
    app.newNote()
    app.setDraft('title', 'Groceries')
    app.saveNoteView('milk\neggs')
    expect(app.notes).toHaveLength(1)
    expect(app.notes[0].title).toBe('Groceries')
    expect(app.notes[0].text).toBe('milk\neggs')
    // Markdown from here on, the way every other live write marks it.
    expect(app.notes[0].format).toBe('md')
  })

  it('does not delete a note just because it was emptied', () => {
    // It used to. Select-all + Delete + Done ran deleteWithUndo, while the same
    // keystrokes in a detail pane or a note column stored an empty note. Two
    // surfaces, the same keystrokes, opposite outcomes — and the destructive
    // one looked exactly like a text editor.
    app.newNote()
    app.saveNoteView('something')
    const id = app.notes[0].id
    app.openNoteView(id)
    app.editNoteView()
    app.saveNoteView('')
    expect(app.notes.map((n) => n.id)).toEqual([id])
  })

  it('autosaves the title, and a title alone is enough to make the note', () => {
    app.newNote()
    app.editNoteView()
    app.setDraft('title', 'Just a name')
    app.autosaveNoteDraft('')
    expect(app.notes).toHaveLength(1)
    expect(app.notes[0].title).toBe('Just a name')
  })

  it('names the note in its undo toast', () => {
    // The label fell through to `text`, so deleting a titled note with an empty
    // body offered `Deleted ""` and no way to tell what had gone.
    app.newNote()
    app.setDraft('title', 'Groceries')
    app.saveNoteView('')
    const id = app.notes[0].id
    app.deleteWithUndo('notes', 'note', id)
    expect(app.toast?.message ?? '').toContain('Groceries')
  })
})
