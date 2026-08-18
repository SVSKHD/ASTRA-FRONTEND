// The dialog as the reader meets it (section 18): opened from a row, addressed
// by the URL, edited in place, drilled into and closed again.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import DetailHost from '@/components/detail/DetailHost.vue'
// The host loads its bodies on demand. Importing them here puts them in the
// module cache so the dynamic import resolves immediately, rather than each
// test waiting out a first-time transform of the markdown editor underneath.
import '@/components/detail/TaskDetailBody.vue'
import '@/components/detail/GoalDetailBody.vue'
import { useAppStore } from '@/stores/app'
import { useSyncGuard } from '@/composables/useSyncGuard'
import { INLINE_SAVE_MS } from '@/composables/useInlineField'
import type { Task } from '@/types'

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

async function mountHost(path = '/', tasks: Task[] = [makeTask(1), makeTask(2), makeTask(3)]) {
  setActivePinia(createPinia())
  const guard = useSyncGuard()
  for (const id of [...guard.editingIds]) guard.editingIds.delete(id)
  const app = useAppStore()
  app.tasks = tasks
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Blank }],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(DetailHost, { global: { plugins: [router] }, attachTo: document.body })
  await settle(app.detailOpen ? wrapper : undefined)
  return { app, router, wrapper, guard }
}

type Wrapper = ReturnType<typeof mount>

// The body is loaded on demand, so opening a dialog needs the dynamic import to
// resolve before the sections it renders exist.
// The body arrives one tick after the frame does, so anything that inspects it
// waits for it — and returns the instant it is up.
async function settle(wrapper?: Wrapper, selector = '.tdb') {
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5))
    await flushPromises()
    if (!wrapper || wrapper.find(selector).exists()) return
  }
}

const titleInput = (wrapper: Wrapper) => wrapper.find('input[aria-label="Task title"]')

describe('opening', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows nothing until something is opened', async () => {
    const { wrapper } = await mountHost()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('opens the task a row asked for, with its detail (acceptance 85)', async () => {
    const { app, wrapper } = await mountHost('/', [makeTask(1, { title: 'Ship the thing' })])
    app.openTaskDialog(1, [1])
    await settle(wrapper)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect((titleInput(wrapper).element as HTMLInputElement).value).toBe('Ship the thing')
    expect(wrapper.text()).toContain('Subtasks')
  })

  it('opens over the list on a cold load of its address (acceptance 86)', async () => {
    const { wrapper } = await mountHost('/?task=2')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect((titleInput(wrapper).element as HTMLInputElement).value).toBe('task 2')
  })

  it('back closes it (acceptance 86)', async () => {
    const { app, router, wrapper } = await mountHost()
    app.openTaskDialog(1, [1, 2, 3])
    await settle(wrapper)
    router.back()
    await flushPromises()
    expect(app.detailOpen).toBe(false)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('says so, with the shell already up, for an id the workspace does not have', async () => {
    const { wrapper } = await mountHost('/?task=404', [])
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('not in your workspace')
  })
})

describe('editing in place (acceptance 87)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('autosaves a title edit without anybody pressing anything', async () => {
    const { app, wrapper } = await mountHost('/?task=1')
    await titleInput(wrapper).setValue('Renamed in the dialog')
    // Still inside the debounce: the dialog knows it has an unsaved edit.
    expect(app.detailDirty).toBe(true)
    await vi.waitFor(
      () => expect(app.tasks.find((t) => t.id === 1)?.title).toBe('Renamed in the dialog'),
      { timeout: INLINE_SAVE_MS * 4 },
    )
    expect(app.detailDirty).toBe(false)
  })

  it('writes on blur rather than making the reader wait out the debounce', async () => {
    const { app, wrapper } = await mountHost('/?task=1')
    await titleInput(wrapper).setValue('Renamed in the dialog')
    await titleInput(wrapper).trigger('blur')
    expect(app.tasks.find((t) => t.id === 1)?.title).toBe('Renamed in the dialog')
    expect(app.detailDirty).toBe(false)
  })

  it('persists the edit through the close, and lets the guard go only after', async () => {
    const { app, wrapper, guard } = await mountHost('/?task=1')
    await titleInput(wrapper).setValue('Renamed in the dialog')
    await titleInput(wrapper).trigger('blur')
    await wrapper.find('button[aria-label="Close"]').trigger('click')
    await flushPromises()
    expect(app.detailOpen).toBe(false)
    expect(app.tasks.find((t) => t.id === 1)?.title).toBe('Renamed in the dialog')
    // The guard is released by the flush, not before it (section 18e).
    expect(guard.isEditing(1)).toBe(false)
    expect(app.tasks.find((t) => t.id === 1)!.localRev).toBeGreaterThan(0)
  })

  it('really does discard when the reader says discard', async () => {
    const { app, wrapper } = await mountHost('/?task=1')
    await titleInput(wrapper).setValue('half typed')
    await wrapper.find('button[aria-label="Close"]').trigger('click')
    await wrapper.findAll('.detail__confirm button')[1].trigger('click')
    await flushPromises()
    expect(app.detailOpen).toBe(false)
    // Flushing here instead of reverting would save exactly what was refused.
    expect(app.tasks.find((t) => t.id === 1)?.title).toBe('task 1')
  })

  it('asks before dropping an unsaved edit on a click outside', async () => {
    const { app, wrapper } = await mountHost('/?task=1')
    await titleInput(wrapper).setValue('half typed')
    await wrapper.find('[data-testid="detail-scrim"]').trigger('click')
    expect(app.detailOpen).toBe(true)
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
  })
})

describe('drilling in and back (acceptance 88)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const family = () => [
    makeTask(1, { title: 'Parent' }),
    makeTask(2, { title: 'Child', parentId: 1, depth: 1, rootId: 1 }),
  ]

  it('swaps to the subtask and comes back to where it started', async () => {
    const { app, wrapper } = await mountHost('/?task=1', family())
    await settle(wrapper)
    await wrapper.find('.tdb__subtitle').trigger('click')
    await settle(wrapper)
    expect((titleInput(wrapper).element as HTMLInputElement).value).toBe('Child')

    const back = wrapper.find('button[aria-label="Back to Parent"]')
    expect(back.exists()).toBe(true)
    await back.trigger('click')
    await settle(wrapper)
    expect((titleInput(wrapper).element as HTMLInputElement).value).toBe('Parent')
    expect(app.detailOpen).toBe(true)
  })

  it('writes a pending edit to the item it was typed into, not the one drilled to', async () => {
    const { app, wrapper } = await mountHost('/?task=1', family())
    await settle(wrapper)
    await titleInput(wrapper).setValue('Parent, renamed')
    await wrapper.find('.tdb__subtitle').trigger('click')
    await settle(wrapper)
    expect(app.tasks.find((t) => t.id === 1)?.title).toBe('Parent, renamed')
    expect(app.tasks.find((t) => t.id === 2)?.title).toBe('Child')
  })
})

describe('goals (acceptance 89)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('opens the goal dialog over the card grid', async () => {
    const { app, wrapper } = await mountHost()
    app.goals = [
      {
        id: 50,
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
        rootId: 50,
        localRev: 0,
        updatedBy: '',
        createdAt: 0,
        updatedAt: 0,
      },
    ]
    app.openGoalDialog(50, [50])
    await settle(wrapper, '.gdb')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect((wrapper.find('input[aria-label="Goal title"]').element as HTMLInputElement).value).toBe(
      'Ship it',
    )
    expect(wrapper.text()).toContain('Points')
  })
})

describe('stepping through the list behind', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('moves to the next task without closing', async () => {
    const { app, wrapper } = await mountHost()
    app.openTaskDialog(1, [1, 2, 3])
    await settle(wrapper)
    await wrapper.find('button[aria-label="Next"]').trigger('click')
    await settle(wrapper)
    expect((titleInput(wrapper).element as HTMLInputElement).value).toBe('task 2')
    expect(app.detailOpen).toBe(true)
  })

  it('has nothing to step to when the row was opened from nowhere in particular', async () => {
    const { app, wrapper } = await mountHost()
    app.openTaskDialog(1)
    await settle(wrapper)
    expect(wrapper.find('button[aria-label="Next"]').attributes('disabled')).toBeDefined()
  })
})
