// The task body (section 18c): what it shows, what it writes, and the two
// interactions the acceptances name — drilling into a subtask, and an edit that
// survives the close.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TaskDetailBody from '@/components/detail/TaskDetailBody.vue'
import { useAppStore } from '@/stores/app'
import type { Task } from '@/types'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}))

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

function setup(tasks: Task[] = [makeTask(1)]) {
  setActivePinia(createPinia())
  const app = useAppStore()
  app.tasks = tasks
  return app
}

function mountBody(taskId: number) {
  return mount(TaskDetailBody, { props: { taskId }, attachTo: document.body })
}

describe('what the body shows', () => {
  beforeEach(() => setup())

  it('shows the task, not a spinner', () => {
    const app = setup([makeTask(1, { title: 'Ship the thing', notes: '# Plan' })])
    void app
    const wrapper = mountBody(1)
    expect(wrapper.text()).toContain('Details')
    expect(wrapper.text()).toContain('Notes')
  })

  it('shows every section the spec names', () => {
    setup()
    const text = mountBody(1).text()
    for (const label of [
      'Details',
      // Description is gone: `task.notes` was the free-text notes box and
      // section 22a retired it in favour of the notes section below.
      'Notes',
      'Subtasks',
      'Goals',
      'GitHub',
      'Calendar',
      'Activity',
    ])
      expect(text).toContain(label)
  })

  it('starts the activity section closed', () => {
    setup([makeTask(1, { createdAt: Date.now() - 90_000 })])
    const wrapper = mountBody(1)
    const activity = wrapper.findAll('button').find((b) => b.text().includes('Activity'))
    expect(activity?.attributes('aria-expanded')).toBe('false')
  })

  it('renders nothing for a task that is not there', () => {
    setup([])
    expect(mountBody(99).text()).toBe('')
  })
})

describe('the meta row', () => {
  beforeEach(() => setup())

  it('writes a priority straight through', async () => {
    const app = setup()
    const wrapper = mountBody(1)
    // A themed listbox rather than a native select, so the choice is made
    // through the portalled panel.
    await wrapper.findAll('.ui-sel__trigger')[0].trigger('click')
    await flushPromises()
    const high = Array.from(document.querySelectorAll('.ui-lb__opt')).find(
      (el) => el.querySelector('.ui-lb__label')?.textContent?.trim() === 'high',
    )!
    high.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flushPromises()
    expect(app.tasks[0].priority).toBe('high')
  })

  it('takes an estimate in the shapes people type', async () => {
    const app = setup()
    const wrapper = mountBody(1)
    const estimate = wrapper
      .findAll('input')
      .find((i) => i.attributes('placeholder')?.includes('1h'))!
    await estimate.trigger('focus')
    await estimate.setValue('1h 30m')
    await estimate.trigger('blur')
    expect(app.tasks[0].estimateMins).toBe(90)
  })

  it('leaves the estimate alone when it cannot read what was typed', async () => {
    const app = setup([makeTask(1, { estimateMins: 45 })])
    const wrapper = mountBody(1)
    const estimate = wrapper
      .findAll('input')
      .find((i) => i.attributes('placeholder')?.includes('1h'))!
    await estimate.trigger('focus')
    await estimate.setValue('sometime next week')
    await estimate.trigger('blur')
    expect(app.tasks[0].estimateMins).toBe(45)
  })

  it('clears the estimate when the field is emptied', async () => {
    const app = setup([makeTask(1, { estimateMins: 45 })])
    const wrapper = mountBody(1)
    const estimate = wrapper
      .findAll('input')
      .find((i) => i.attributes('placeholder')?.includes('1h'))!
    await estimate.trigger('focus')
    await estimate.setValue('')
    await estimate.trigger('blur')
    expect(app.tasks[0].estimateMins).toBe(null)
  })

  it('adds to the time spent', async () => {
    const app = setup()
    const wrapper = mountBody(1)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '+15m')!
      .trigger('click')
    expect(app.tasks[0].spentMins).toBe(15)
  })
})

// Section 22a: `task.notes` is no longer an editing surface. The string stays
// readable through the notes section, which offers to make it a real note.
describe('a task carrying legacy notes text (acceptance 117)', () => {
  it('shows it as a row rather than as a box to type in', () => {
    setup([makeTask(1, { notes: '# The old plan' })])
    const wrapper = mountBody(1)
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.text()).toContain('Convert to note')
  })

  it('offers nothing to convert when there is no legacy text', () => {
    setup([makeTask(1, { notes: '' })])
    expect(mountBody(1).text()).not.toContain('Convert to note')
  })

  it('converts it into a note without losing a character', async () => {
    const app = setup([makeTask(1, { notes: '# The old plan\n\nwith detail' })])
    const wrapper = mountBody(1)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Convert to note')!
      .trigger('click')
    expect(app.notes).toHaveLength(1)
    expect(app.notes[0].text).toBe('# The old plan\n\nwith detail')
    expect(app.notes[0].title).toBe('Notes')
    expect(app.tasks[0].noteIds).toEqual([app.notes[0].id])
    expect(app.notes[0].attachedTo).toEqual([{ type: 'task', id: 1 }])
    // Only now is the string cleared.
    expect(app.tasks[0].notes).toBe('')
    expect(wrapper.text()).not.toContain('Convert to note')
  })
})

describe('the hierarchy', () => {
  const family = () => [
    makeTask(1, { title: 'Parent' }),
    makeTask(2, { title: 'Child', parentId: 1, depth: 1, rootId: 1 }),
    makeTask(3, { title: 'Grandchild', parentId: 2, depth: 2, rootId: 1 }),
  ]

  it('shows the ancestors as a breadcrumb, each one clickable (acceptance 88)', async () => {
    setup(family())
    const wrapper = mountBody(3)
    const crumbs = wrapper.findAll('.tdb__crumb')
    expect(crumbs.map((c) => c.text())).toEqual(['Parent', 'Child'])
    await crumbs[0].trigger('click')
    expect(wrapper.emitted('open')).toEqual([[{ kind: 'task', id: 1 }]])
  })

  it('lists the subtasks and drills into one on click (acceptance 88)', async () => {
    setup(family())
    const wrapper = mountBody(1)
    const subs = wrapper.findAll('.tdb__subtitle')
    expect(subs.map((s) => s.text())).toEqual(['Child'])
    await subs[0].trigger('click')
    expect(wrapper.emitted('open')).toEqual([[{ kind: 'task', id: 2 }]])
  })

  it('ticks a subtask without opening it', async () => {
    const app = setup(family())
    const wrapper = mountBody(1)
    await wrapper.find('.tdb__box').trigger('click')
    expect(app.tasks.find((t) => t.id === 2)?.done).toBe(true)
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('adds a subtask under this task', async () => {
    const app = setup(family())
    const wrapper = mountBody(1)
    const input = wrapper
      .findAll('input')
      .find((i) => i.attributes('placeholder') === 'Add a subtask…')!
    await input.setValue('Another child')
    await input.trigger('keydown', { key: 'Enter' })
    const added = app.tasks.find((t) => t.title === 'Another child')
    expect(added?.parentId).toBe(1)
  })

  it('has no breadcrumb at the top of the tree', () => {
    setup(family())
    expect(mountBody(1).findAll('.tdb__crumb')).toHaveLength(0)
  })
})

describe('goals', () => {
  function withGoal() {
    const app = setup([makeTask(1, { goalIds: [] })])
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
    return app
  }

  it('attaches to a goal through the picker', async () => {
    const app = withGoal()
    const wrapper = mountBody(1)
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Attach to goal'))!
      .trigger('click')
    await wrapper
      .findAll('.tdb__pick')
      .find((b) => b.text() === 'Ship it')!
      .trigger('click')
    expect(app.tasks[0].goalIds).toEqual([50])
  })

  it('opens an attached goal from its chip', async () => {
    const app = withGoal()
    app.tasks = [makeTask(1, { goalIds: [50] })]
    const wrapper = mountBody(1)
    await wrapper.find('.tdb__goal').trigger('click')
    expect(wrapper.emitted('open')).toEqual([[{ kind: 'goal', id: 50 }]])
  })
})

describe('the ⋯ menu', () => {
  it('duplicates and opens the copy', async () => {
    const app = setup([makeTask(1, { title: 'Ship it' })])
    const wrapper = mountBody(1)
    await wrapper.find('.ui-dropdown__trigger, [aria-haspopup]').trigger('click')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Duplicate')!
      .trigger('click')
    const copy = app.tasks.find((t) => t.title === 'Ship it (copy)')
    expect(copy).toBeTruthy()
    expect(wrapper.emitted('open')).toEqual([[{ kind: 'task', id: copy!.id }]])
  })

  it('archives and closes rather than deleting', async () => {
    const app = setup([makeTask(1)])
    const wrapper = mountBody(1)
    await wrapper.find('.ui-dropdown__trigger, [aria-haspopup]').trigger('click')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Archive')!
      .trigger('click')
    expect(app.tasks[0].archivedAt).toBeTypeOf('number')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

describe('the calendar section', () => {
  it('schedules an unscheduled task', async () => {
    const app = setup()
    const wrapper = mountBody(1)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Add to calendar')!
      .trigger('click')
    await flushPromises()
    expect(app.tasks[0].startAt).toBeTypeOf('number')
  })

  it('offers to take a scheduled one off again', () => {
    setup([makeTask(1, { startAt: Date.now(), endAt: Date.now() + 3_600_000 })])
    const wrapper = mountBody(1)
    expect(wrapper.text()).toContain('Scheduled for')
    expect(wrapper.findAll('button').some((b) => b.text() === 'Remove')).toBe(true)
  })
})
