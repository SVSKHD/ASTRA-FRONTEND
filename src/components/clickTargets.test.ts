// Click-target isolation (section 18b, acceptances 85 and 89). What opens the
// detail dialog, and — more to the point — what must not.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TreeList from '@/components/TreeList.vue'
import GoalsView from '@/components/views/GoalsView.vue'
import { useAppStore } from '@/stores/app'
import type { Goal, Task } from '@/types'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: {}, params: {} }),
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

// A tap: pointer down and up in the same place, a moment apart.
async function tap(wrapper: { element: Element }) {
  wrapper.element.dispatchEvent(
    new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }),
  )
  wrapper.element.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }),
  )
  await Promise.resolve()
}

describe('a task row (acceptance 85)', () => {
  let app: ReturnType<typeof useAppStore>

  function mountRow(tasks: Task[] = [makeTask(1)]) {
    setActivePinia(createPinia())
    app = useAppStore()
    app.tasks = tasks
    return mount(TreeList, {
      props: {
        collection: 'tasks',
        rootIds: tasks.filter((t) => t.parentId == null).map((t) => t.id),
      },
      attachTo: document.body,
    })
  }

  beforeEach(() => push.mockReset())

  it('opens the dialog when the title area is clicked', async () => {
    const wrapper = mountRow()
    await tap(wrapper.find('.tree-row > div'))
    expect(app.detailFrame).toEqual({ kind: 'task', id: 1 })
  })

  it('does not open when the status control is clicked — it advances the status', async () => {
    const wrapper = mountRow()
    await wrapper.find('.tree-row button[title^="Status"]').trigger('click')
    expect(app.detailOpen).toBe(false)
    expect(app.tasks[0].status).not.toBe('pending')
  })

  it('does not open when the drag handle is grabbed', async () => {
    const wrapper = mountRow()
    await wrapper.find('[aria-label="Reorder task"]').trigger('click')
    expect(app.detailOpen).toBe(false)
  })

  it('does not open when the delete button is clicked', async () => {
    const wrapper = mountRow()
    const buttons = wrapper.findAll('.tree-row button')
    await buttons[buttons.length - 1].trigger('click')
    expect(app.detailOpen).toBe(false)
  })

  it('a goal chip opens its goal, not the row it sits on', async () => {
    const wrapper = mountRow([makeTask(1, { goalIds: [50] })])
    app.goals = [makeGoal(50, { title: 'Ship it' })]
    await wrapper.vm.$nextTick()
    const chip = wrapper.findAll('button').find((b) => b.text().includes('Ship it'))!
    await chip.trigger('click')
    expect(app.detailFrame).toEqual({ kind: 'goal', id: 50 })
  })

  it('a press the browser turned into a drag does not open on release', async () => {
    const wrapper = mountRow()
    const zone = wrapper.find('.tree-row > div').element
    zone.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }))
    // A long press that becomes a drag is signalled by the browser cancelling
    // the pointer. (The timing rule itself is checked in pressGesture.test.ts,
    // where the timestamps can actually be controlled.)
    zone.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }))
    zone.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))
    await wrapper.vm.$nextTick()
    expect(app.detailOpen).toBe(false)
  })

  it('a press that travelled does not open either', async () => {
    const wrapper = mountRow()
    const zone = wrapper.find('.tree-row > div').element
    zone.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }))
    zone.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 300 }))
    await wrapper.vm.$nextTick()
    expect(app.detailOpen).toBe(false)
  })
})

describe('a goal card (acceptance 89)', () => {
  let app: ReturnType<typeof useAppStore>

  function mountCards(goal = makeGoal(50)) {
    setActivePinia(createPinia())
    app = useAppStore()
    app.goals = [goal]
    return mount(GoalsView, { attachTo: document.body })
  }

  beforeEach(() => push.mockReset())

  it('opens the goal dialog when the card is clicked', async () => {
    const wrapper = mountCards()
    await tap(wrapper.findAll('[draggable]')[0])
    expect(app.detailFrame).toEqual({ kind: 'goal', id: 50 })
  })

  it('does not open when the progress ring is clicked', async () => {
    const wrapper = mountCards()
    await tap(wrapper.find('.goalcard__ring'))
    expect(app.detailOpen).toBe(false)
  })

  it('does not open when the ⋯ menu is used', async () => {
    const wrapper = mountCards()
    await wrapper.find('[aria-haspopup]').trigger('click')
    expect(app.detailOpen).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text() === 'Duplicate')).toBe(true)
  })

  it('shows no today-tick on a goal that does not repeat', () => {
    const wrapper = mountCards()
    expect(wrapper.find('.gct').exists()).toBe(false)
  })

  it('the today-tick captures the value instead of opening the goal', async () => {
    const goal = makeGoal(50, {
      recurrence: {
        enabled: true,
        freq: 'daily',
        daysOfWeek: [],
        timeOfDay: '09:00',
        timezone: 'UTC',
        startDate: new Date().toISOString().slice(0, 10),
        endDate: null,
      },
      metric: {
        enabled: true,
        label: 'Steps',
        unit: 'count',
        target: 500,
        direction: 'at_least',
        allowPartial: true,
      },
    })
    const wrapper = mountCards(goal)
    app.generateOccurrences()
    await wrapper.vm.$nextTick()
    const tick = wrapper.find('.gct__box')
    expect(tick.exists()).toBe(true)
    await tick.trigger('click')
    // The capture popover, not the dialog (acceptance 89).
    expect(app.detailOpen).toBe(false)
    expect(wrapper.text()).toContain('How did today go?')
  })
})
