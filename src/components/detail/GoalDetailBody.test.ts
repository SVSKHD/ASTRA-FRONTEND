// The goal body (section 18d): the blocks it shows, the points it edits inline,
// and the drill-in from an attached task.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GoalDetailBody from '@/components/detail/GoalDetailBody.vue'
import { useAppStore } from '@/stores/app'
import { INLINE_SAVE_MS } from '@/composables/useInlineField'
import type { Goal, Task } from '@/types'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: {} }),
}))

function makeGoal(id: number, over: Partial<Goal> = {}): Goal {
  return {
    id,
    title: 'goal ' + id,
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
    rootId: id,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

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

function setup(goal = makeGoal(10), tasks: Task[] = []) {
  setActivePinia(createPinia())
  const app = useAppStore()
  app.goals = [goal]
  app.tasks = tasks
  return app
}

const mountBody = (goalId = 10) =>
  mount(GoalDetailBody, { props: { goalId }, attachTo: document.body })

beforeEach(() => {
  push.mockReset()
})

describe('what the body shows', () => {
  it('shows every block the spec names', () => {
    setup()
    const text = mountBody().text()
    for (const label of [
      'Progress',
      'Timeline',
      'Repeats',
      'Points',
      'Tasks',
      'Todos',
      'Description',
    ])
      expect(text).toContain(label)
  })

  it('spells the counts out rather than only drawing a ring', () => {
    const app = setup(makeGoal(10), [makeTask(1, { goalIds: [10], status: 'done', done: true })])
    app.addChecklistItem(10, 'first point')
    const text = mountBody().text()
    expect(text).toContain('points')
    expect(text).toContain('1/1 tasks')
  })

  it('shows how long is left against the target', () => {
    const inAWeek = new Date()
    inAWeek.setDate(inAWeek.getDate() + 7)
    const ymd = inAWeek.toISOString().slice(0, 10)
    setup(makeGoal(10, { targetDate: ymd }))
    expect(mountBody().text()).toContain('days left')
  })

  it('marks an overdue goal as overdue', () => {
    setup(makeGoal(10, { targetDate: '2020-01-01' }))
    const wrapper = mountBody()
    expect(wrapper.find('.gdb__chip--overdue').exists()).toBe(true)
  })

  it('renders nothing for a goal that is not there', () => {
    setup()
    expect(mountBody(999).text()).toBe('')
  })
})

describe('points', () => {
  it('adds one inline', async () => {
    const app = setup()
    const wrapper = mountBody()
    const input = wrapper
      .findAll('input')
      .find((i) => i.attributes('placeholder') === 'Add a point…')!
    await input.setValue('Draft the thing')
    await input.trigger('keydown', { key: 'Enter' })
    expect(app.checklistOf(10).map((p) => p.text)).toEqual(['Draft the thing'])
  })

  it('ticks one', async () => {
    const app = setup()
    app.addChecklistItem(10, 'A point')
    const wrapper = mountBody()
    await wrapper.find('.gpr__box').trigger('click')
    expect(app.checklistOf(10)[0].done).toBe(true)
  })

  it('renames one in place', async () => {
    const app = setup()
    app.addChecklistItem(10, 'A point')
    const wrapper = mountBody()
    await wrapper.find('.gpr__text').setValue('A better point')
    expect(app.checklistOf(10)[0].text).toBe('A better point')
  })

  it('shows the whole point, however long, rather than cutting it off', () => {
    const app = setup()
    const long = 'truthiness, == vs ===, and the whole coercion table in one sitting'
    app.addChecklistItem(10, long)
    const field = mountBody().find('.gpr__text')
    // A textarea holds its value; an input of fixed width hid the tail of it.
    expect(field.element.tagName).toBe('TEXTAREA')
    expect((field.element as HTMLTextAreaElement).value).toBe(long)
  })

  it('takes a per-point estimate once the estimate is clicked', async () => {
    const app = setup()
    app.addChecklistItem(10, 'A point')
    const wrapper = mountBody()
    // At rest it is plain text, not a field — that is the decluttering.
    expect(wrapper.find('.gpr__mins').exists()).toBe(false)
    await wrapper.find('.gpr__estimate').trigger('click')
    await wrapper.vm.$nextTick()
    const field = wrapper.find('.gpr__mins')
    ;(field.element as HTMLInputElement).value = '30'
    await field.trigger('blur')
    expect(app.checklistOf(10)[0].estimateMins).toBe(30)
  })

  it('starts and stops the timer', async () => {
    const app = setup()
    app.addChecklistItem(10, 'A point')
    const wrapper = mountBody()
    const timer = wrapper.findAll('button').find((b) => b.text().startsWith('▶'))!
    await timer.trigger('click')
    expect(app.checklistOf(10)[0].timerStartedAt).toBeTypeOf('number')
    await wrapper
      .findAll('button')
      .find((b) => b.text().startsWith('■'))!
      .trigger('click')
    expect(app.checklistOf(10)[0].timerStartedAt).toBe(null)
  })

  it('deletes one', async () => {
    const app = setup()
    app.addChecklistItem(10, 'A point')
    const wrapper = mountBody()
    await wrapper.find('button[aria-label="Delete point"]').trigger('click')
    expect(app.checklistOf(10)).toHaveLength(0)
  })
})

describe('attached items', () => {
  it('lists attached tasks and drills into one rather than opening it fresh', async () => {
    setup(makeGoal(10), [makeTask(5, { title: 'Attached task', goalIds: [10] })])
    const wrapper = mountBody()
    const row = wrapper.findAll('.gdb__attachedtitle').find((b) => b.text() === 'Attached task')!
    await row.trigger('click')
    expect(wrapper.emitted('open')).toEqual([[{ kind: 'task', id: 5 }]])
  })

  it('detaches without deleting the task', async () => {
    const app = setup(makeGoal(10), [makeTask(5, { goalIds: [10] })])
    const wrapper = mountBody()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Detach')!
      .trigger('click')
    expect(app.tasks).toHaveLength(1)
    expect(app.tasks[0].goalIds).toEqual([])
  })

  it('says so when nothing is attached', () => {
    setup()
    expect(mountBody().text()).toContain('No tasks attached.')
  })
})

describe('the description', () => {
  it('autosaves after typing stops', () => {
    vi.useFakeTimers()
    const app = setup()
    const wrapper = mountBody()
    wrapper.findComponent({ name: 'NoteEditor' }).vm.$emit('update:modelValue', 'What done is')
    expect(app.goals[0].description).toBe('')
    vi.advanceTimersByTime(INLINE_SAVE_MS)
    expect(app.goals[0].description).toBe('What done is')
    vi.useRealTimers()
  })
})

describe('the footer', () => {
  it('links to the goal’s own wide page', async () => {
    setup()
    const wrapper = mountBody()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Open full page')!
      .trigger('click')
    expect(push).toHaveBeenCalledWith('/goals/10')
  })
})

describe('the ⋯ menu', () => {
  it('archives and closes', async () => {
    const app = setup()
    const wrapper = mountBody()
    await wrapper.find('[aria-haspopup]').trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Archive')!
      .trigger('click')
    expect(app.goals[0].status).toBe('archived')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('exports the goal as a JSON file', async () => {
    setup()
    const createObjectURL = vi.fn(() => 'blob:goal')
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const wrapper = mountBody()
    await wrapper.find('[aria-haspopup]').trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Export JSON')!
      .trigger('click')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect((createObjectURL.mock.calls[0] as unknown as Blob[])[0].type).toContain(
      'application/json',
    )
    expect(click).toHaveBeenCalled()
    click.mockRestore()
    await new Promise((resolve) => setTimeout(resolve, 0))
    vi.unstubAllGlobals()
  })
})
