// Section 21b: the note read beside the thing it is attached to — how the
// dialog grows the column, how it degrades on a narrow screen and a phone, and
// what order the two columns' writes go out in.
import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import DetailHost from '@/components/detail/DetailHost.vue'
import '@/components/detail/TaskDetailBody.vue'
import '@/components/detail/NoteColumn.vue'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useSyncGuard } from '@/composables/useSyncGuard'
import { PANEL_WIDTH_ONE, PANEL_WIDTH_TWO, SPLIT_MAX } from '@/utils/noteColumn'
import type { Note, Task } from '@/types'

const Blank = defineComponent({ render: () => h('div') })

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
  }
}

type Wrapper = ReturnType<typeof mount>

// The bodies load on demand; the column does too.
async function settle(wrapper?: Wrapper, selector = '.tdb') {
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5))
    await flushPromises()
    if (!wrapper || wrapper.find(selector).exists()) return
  }
}

async function mountHost(viewportWidth = 1440) {
  setActivePinia(createPinia())
  const guard = useSyncGuard()
  for (const id of [...guard.editingIds]) guard.editingIds.delete(id)
  const app = useAppStore()
  const ui = useUiStore()
  ui.vw = viewportWidth
  app.tasks = [makeTask(1)]
  app.notes = [makeNote(10, { title: 'Rollout plan' })]
  app.attachNote('task', 1, 10)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Blank },
      // Section 22c's "Open full" target, so the menu has somewhere to push to.
      { path: '/notes/:noteId', name: 'note-page', component: Blank },
    ],
  })
  await router.push('/?task=1')
  await router.isReady()
  const wrapper = mount(DetailHost, { global: { plugins: [router] }, attachTo: document.body })
  await settle(wrapper)
  return { app, ui, wrapper, guard }
}

const panel = (wrapper: Wrapper) => wrapper.find('[role="dialog"]')

describe('the attached notes list', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('lists each note as one line (acceptance 107)', async () => {
    const { wrapper } = await mountHost()
    const rows = wrapper.findAll('.nsec__open')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('Rollout plan')
  })

  it('opens the note beside the task rather than instead of it', async () => {
    const { app, wrapper } = await mountHost()
    await wrapper.find('.nsec__open').trigger('click')
    await settle(wrapper, '.ncol')
    expect(app.noteColumnId).toBe(10)
    // The task is still there, in its own column.
    expect(wrapper.find('.tdb').exists()).toBe(true)
    expect(wrapper.find('.ncol').exists()).toBe(true)
  })

  it('detaching keeps the note and only drops the reference', async () => {
    const { app, wrapper } = await mountHost()
    // Detach moved onto the row's ⋯ menu when the section became an
    // attachment surface (section 22a); the behaviour it guards has not.
    wrapper
      .findComponent({ name: 'NotesSection' })
      .findComponent({ name: 'Dropdown' })
      .vm.$emit('select', 'detach')
    await wrapper.vm.$nextTick()
    expect(app.notes).toHaveLength(1)
    expect(app.tasks[0].noteIds).toEqual([])
    expect(wrapper.findAll('.nsec__open')).toHaveLength(0)
  })

  it('+ New note creates one, attaches it and opens it', async () => {
    const { app, wrapper } = await mountHost()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '+ New note')!
      .trigger('click')
    await settle(wrapper, '.ncol')
    expect(app.notes).toHaveLength(2)
    expect(app.noteColumnId).toBe(app.notes[1].id)
    expect(app.tasks[0].noteIds).toEqual([10, app.notes[1].id])
  })
})

describe('the shape of the extension', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('widens the panel into a second column on a wide screen', async () => {
    const { app, wrapper } = await mountHost(1440)
    expect(panel(wrapper).attributes('style')).toContain(`--detail-w: ${PANEL_WIDTH_ONE}px`)
    app.openNoteColumn(10)
    await settle(wrapper, '.ncol')
    expect(panel(wrapper).attributes('style')).toContain(`--detail-w: ${PANEL_WIDTH_TWO}px`)
    expect(wrapper.find('[data-testid="detail-divider"]').exists()).toBe(true)
  })

  it('slides the note over the details on a narrower one, with a way back', async () => {
    const { app, wrapper } = await mountHost(900)
    app.openNoteColumn(10)
    await settle(wrapper, '.ncol')
    // One column's worth of panel, the note covering it, the task still mounted
    // underneath so coming back is instant.
    expect(panel(wrapper).attributes('style')).toContain(`--detail-w: ${PANEL_WIDTH_ONE}px`)
    expect(wrapper.find('.detail__col--hidden').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Back to details"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="detail-divider"]').exists()).toBe(false)
  })

  it('never puts two half-width columns on a phone (acceptance 108)', async () => {
    const { app, wrapper } = await mountHost(390)
    app.openNoteColumn(10)
    await settle(wrapper, '.ncol')
    // Its own sheet above the dialog's, not a column beside it.
    expect(wrapper.find('.detail--aside').exists()).toBe(true)
    expect(wrapper.find('[data-testid="detail-divider"]').exists()).toBe(false)
    expect(wrapper.find('.detail__col--aside').exists()).toBe(false)
  })
})

describe('the divider', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('moves from the keyboard and keeps what it was set to', async () => {
    const { app, wrapper } = await mountHost(1440)
    app.openNoteColumn(10)
    await settle(wrapper, '.ncol')
    const divider = wrapper.find('[data-testid="detail-divider"]')
    await divider.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(app.detailSplit).toBe(60)
    await divider.trigger('keydown', { key: 'ArrowLeft' })
    expect(app.detailSplit).toBe(58)
  })

  it('will not let a column disappear', async () => {
    const { app, wrapper } = await mountHost(1440)
    app.openNoteColumn(10)
    await settle(wrapper, '.ncol')
    const divider = wrapper.find('[data-testid="detail-divider"]')
    for (let i = 0; i < 10; i++)
      await divider.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(app.detailSplit).toBe(SPLIT_MAX)
  })
})

describe('closing, in order (acceptance 109)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('holds the note against a remote snapshot while it is open', async () => {
    const { app, guard, wrapper } = await mountHost()
    app.openNoteColumn(10)
    await settle(wrapper, '.ncol')
    expect(guard.isEditing(10)).toBe(true)
    expect(guard.isEditing(1)).toBe(true)
    app.closeNoteColumn()
    expect(guard.isEditing(10)).toBe(false)
    // The frame beside it is still being read.
    expect(guard.isEditing(1)).toBe(true)
  })

  it('writes the note before the task, and lets the guard go only after both', async () => {
    const { app, guard, wrapper } = await mountHost()
    app.openNoteColumn(10)
    await settle(wrapper, '.ncol')
    const titleField = wrapper.find('textarea[aria-label="Note title"]')
    await titleField.setValue('Renamed in the column')
    await titleField.trigger('blur')
    expect(app.notes[0].title).toBe('Renamed in the column')
    await wrapper.find('button[aria-label="Close"]').trigger('click')
    await flushPromises()
    expect(app.detailOpen).toBe(false)
    // Both holds go, and the note's went first — the frame's flush is what
    // drains the list behind, so it has to be the last one out.
    expect(guard.isEditing(10)).toBe(false)
    expect(guard.isEditing(1)).toBe(false)
  })

  it('asks before dropping a half-typed note, same as any other field', async () => {
    const { app, wrapper } = await mountHost()
    app.openNoteColumn(10)
    await settle(wrapper, '.ncol')
    await wrapper.find('textarea[aria-label="Note title"]').setValue('half typed')
    await wrapper.find('button[aria-label="Close"]').trigger('click')
    expect(app.detailOpen).toBe(true)
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
  })

  it('closes with the dialog rather than outliving it', async () => {
    const { app, wrapper } = await mountHost()
    app.openNoteColumn(10)
    await settle(wrapper, '.ncol')
    await wrapper.find('button[aria-label="Close"]').trigger('click')
    await flushPromises()
    expect(app.noteColumnId).toBeNull()
  })

  it('goes with the frame when the reader steps to the next task', async () => {
    const { app, wrapper } = await mountHost()
    app.tasks = [makeTask(1, { noteIds: [10] }), makeTask(2)]
    app.openTaskDialog(1, [1, 2])
    await settle(wrapper)
    app.openNoteColumn(10)
    await settle(wrapper, '.ncol')
    app.stepDetail(2)
    await flushPromises()
    // The note was attached to the task that just left the screen.
    expect(app.noteColumnId).toBeNull()
  })
})

// Section 22c: the note's own header carries its actions.
describe('the note header menu', () => {
  beforeEach(() => setActivePinia(createPinia()))

  async function openColumn() {
    const context = await mountHost()
    context.app.openNoteColumn(10)
    await settle(context.wrapper, '.ncol')
    return context
  }

  const asideMenu = (wrapper: Wrapper) =>
    wrapper
      .findAllComponents({ name: 'Dropdown' })
      .find((menu) =>
        (menu.props('items') as { value: string }[]).some((item) => item.value === 'full'),
      )!

  it('offers open full, copy as markdown, detach and delete', async () => {
    const { wrapper } = await openColumn()
    const items = asideMenu(wrapper).props('items') as { value: string }[]
    expect(items.map((i) => i.value)).toEqual(['full', 'copy', 'detach', 'delete'])
  })

  it('detaches without deleting (acceptance 116)', async () => {
    const { app, wrapper } = await openColumn()
    asideMenu(wrapper).vm.$emit('select', 'detach')
    await flushPromises()
    expect(app.notes).toHaveLength(1)
    expect(app.tasks[0].noteIds).toEqual([])
    expect(app.noteColumnId).toBe(null)
  })

  it('deletes the note and closes the column with it', async () => {
    const { app, wrapper } = await openColumn()
    asideMenu(wrapper).vm.$emit('select', 'delete')
    await flushPromises()
    expect(app.notes).toEqual([])
    expect(app.noteColumnId).toBe(null)
  })

  it('opens the note on its own page', async () => {
    const { wrapper } = await openColumn()
    asideMenu(wrapper).vm.$emit('select', 'full')
    await flushPromises()
    expect(wrapper.vm.$router.currentRoute.value.path).toBe('/notes/10')
  })

  it('offers no detach for a note that is not attached to what is open', async () => {
    const { app, wrapper } = await openColumn()
    app.detachNote('task', 1, 10)
    await flushPromises()
    const detach = (
      asideMenu(wrapper).props('items') as { value: string; disabled?: boolean }[]
    ).find((i) => i.value === 'detach')!
    expect(detach.disabled).toBe(true)
  })
})
