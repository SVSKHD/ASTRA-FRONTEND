// The notes section in a right-hand detail pane: attached notes listed under the
// description, opened in place, and new or existing notes attached from there —
// for a subtask exactly as for a top-level task.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PaneNotes from '@/components/detail/PaneNotes.vue'
import { useAppStore } from '@/stores/app'
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
  return {
    id,
    text: 'a note',
    format: 'md',
    ts: 0,
    title: '',
    tags: [],
    pinned: false,
    attachedTo: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as Note
}

let app: ReturnType<typeof useAppStore>
beforeEach(() => {
  setActivePinia(createPinia())
  app = useAppStore()
  // A nested subtask: 1 › 2 › 3.
  app.tasks = [
    makeTask(1),
    makeTask(2, { parentId: 1, depth: 1, rootId: 1 }),
    makeTask(3, { parentId: 2, depth: 2, rootId: 1 }),
  ]
  app.notes = [makeNote(10, { title: 'Rollout plan' }), makeNote(11, { title: 'Spare' })]
})

const mountFor = (id: number) =>
  mount(PaneNotes, { props: { type: 'task', id }, attachTo: document.body })

describe('notes in the detail pane', () => {
  it('shows the empty state with both ways to add a note', () => {
    const w = mountFor(3)
    expect(w.text()).toContain('No notes on this task yet')
    expect(w.find('button[title="New note"]').exists()).toBe(true)
    expect(w.find('button[title="Attach"]').exists()).toBe(true)
    // Nothing to copy, so no Copy button.
    expect(w.find('button[title="Copy"]').exists()).toBe(false)
  })

  it('lists the notes attached to a nested subtask', () => {
    app.attachNote('task', 3, 10)
    const w = mountFor(3)
    expect(w.text()).toContain('Rollout plan')
    expect(w.text()).not.toContain('Spare')
  })

  it('+ New note creates a note attached to this item and opens it for editing', async () => {
    const w = mountFor(2)
    await w.find('button[title="New note"]').trigger('click')
    await flushPromises()
    const attached = app.notesFor('task', 2)
    expect(attached).toHaveLength(1)
    expect(attached[0]!.attachedTo).toEqual([{ type: 'task', id: 2 }])
    expect(w.find('.pnr.is-open').exists()).toBe(true)
  })

  it('detaching keeps the note in the workspace', async () => {
    app.attachNote('task', 3, 10)
    const w = mountFor(3)
    await w.find('button[title="Detach from this item"]').trigger('click')
    await flushPromises()
    expect(app.notesFor('task', 3)).toHaveLength(0)
    expect(app.notes.some((n) => n.id === 10)).toBe(true)
  })

  it('copies the notes of every nested subtask, labelled by where they sit', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    app.attachNote('task', 1, 11)
    app.attachNote('task', 3, 10)
    const w = mountFor(1)
    await w.find('button[title="Copy"]').trigger('click')
    // Subtasks have notes, so Copy asks which — inline, not in a popover.
    const everything = w.findAll('.pn__choice').find((b) => b.text().includes('Everything'))!
    await everything.trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(
      [
        '## task 1',
        '### Spare',
        'a note',
        '---',
        '## task 2 › task 3',
        '### Rollout plan',
        'a note',
      ].join('\n\n'),
    )
    expect(app.toast?.message).toBe('Copied 2 notes')
  })

  it('copies straight away when only this item has notes', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    app.attachNote('task', 3, 10)
    const w = mountFor(3)
    await w.find('button[title="Copy"]').trigger('click')
    await flushPromises()
    expect(w.find('.pn__panel').exists()).toBe(false)
    expect(writeText).toHaveBeenCalledWith(['## Rollout plan', 'a note'].join('\n\n'))
  })

  it('shows every note action as a visible button, with no menu to clip', () => {
    app.attachNote('task', 3, 10)
    const w = mountFor(3)
    for (const label of [
      'Copy note',
      'Edit note',
      'Open in notes',
      'Detach from this item',
      'Delete note',
    ])
      expect(w.find(`button[title="${label}"]`).exists(), label).toBe(true)
    expect(w.findComponent({ name: 'Dropdown' }).exists()).toBe(false)
  })
})
