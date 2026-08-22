// Section 22a in the create dialog: there is no notes box to type into, and
// what the reader queues up is written when the item is.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ItemDialog from '@/components/ItemDialog.vue'
import { useAppStore } from '@/stores/app'
import type { Note } from '@/types'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const makeNote = (id: number, over: Partial<Note> = {}): Note => ({
  id,
  text: 'note ' + id,
  format: 'md',
  ts: id,
  title: '',
  tags: [],
  pinned: false,
  attachedTo: [],
  createdAt: id,
  updatedAt: id,
  ...over,
})

async function settle() {
  await nextTick()
  await nextTick()
}

function mountDialog() {
  return mount(ItemDialog, {
    attachTo: document.body,
    global: { directives: { 'hover-style': {} } },
  })
}

describe('the New task dialog (acceptance 112)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('has no free-text notes box', async () => {
    const app = useAppStore()
    const wrapper = mountDialog()
    app.openCreate('task')
    await settle()
    // The task form's only long field used to be this one. Nothing on the
    // dialog writes to `task.notes` any more.
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(app.blankDraft('task')).not.toHaveProperty('notes')
  })

  it('offers New note and Attach existing instead', async () => {
    const app = useAppStore()
    const wrapper = mountDialog()
    app.openCreate('task')
    await settle()
    const labels = wrapper.findAll('button').map((b) => b.text())
    expect(labels).toContain('+ New note')
    expect(labels).toContain('Attach existing')
  })

  it('keeps the sections in the order section 22e fixes', async () => {
    const app = useAppStore()
    const wrapper = mountDialog()
    app.openCreate('task')
    await settle()
    const labels = wrapper
      .findAll('.field-label, .dsec__label')
      .map((el) => el.text().trim().toUpperCase())
      .filter((text) => ['TASK', 'DUE', 'PROJECT TAG', 'NOTES', 'REPO'].includes(text))
    expect(labels).toEqual(['TASK', 'DUE', 'PROJECT TAG', 'NOTES', 'REPO'])
  })
})

describe('notes queued in a create dialog', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('are attached to the task the moment it exists, both ends at once', async () => {
    const app = useAppStore()
    app.notes = [makeNote(10), makeNote(11)]
    const wrapper = mountDialog()
    app.openCreate('task')
    await settle()

    wrapper.findComponent({ name: 'NotesSection' }).vm.$emit('update:draftIds', [10, 11])
    await settle()
    app.setDialogDraft('title', 'Ship it')
    expect(app.tasks).toHaveLength(0)

    expect(app.commitCreate()).toBe(true)
    expect(app.tasks).toHaveLength(1)
    expect(app.tasks[0].noteIds).toEqual([10, 11])
    expect(app.notes[0].attachedTo).toEqual([{ type: 'task', id: app.tasks[0].id }])
    expect(app.notes[1].attachedTo).toEqual([{ type: 'task', id: app.tasks[0].id }])
  })

  it('are attached to a todo just the same (section 22f)', async () => {
    const app = useAppStore()
    app.notes = [makeNote(10)]
    const wrapper = mountDialog()
    app.openCreate('todo')
    await settle()

    wrapper.findComponent({ name: 'NotesSection' }).vm.$emit('update:draftIds', [10])
    await settle()
    app.setDialogDraft('text', 'Buy oat milk')
    expect(app.commitCreate()).toBe(true)
    expect(app.todos[0].noteIds).toEqual([10])
    expect(app.notes[0].attachedTo).toEqual([{ type: 'todo', id: app.todos[0].id }])
  })

  it('write nothing at all when the dialog is cancelled', async () => {
    const app = useAppStore()
    app.notes = [makeNote(10)]
    const wrapper = mountDialog()
    app.openCreate('task')
    await settle()

    wrapper.findComponent({ name: 'NotesSection' }).vm.$emit('update:draftIds', [10])
    await settle()
    app.closeItemDialog()
    await settle()

    expect(app.tasks).toHaveLength(0)
    expect(app.notes[0].attachedTo).toEqual([])
  })
})
