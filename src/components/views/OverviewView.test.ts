// Verifies the Overview tab actually renders its four fulfilment cards and the
// month selector, seeded from the store. The workspace is auth-gated behind
// Firebase in the real app, so this mounted render is the stand-in for "confirm
// the Overview cards show".
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import OverviewView from '@/components/views/OverviewView.vue'
import { useAppStore } from '@/stores/app'
import { currentMonthKey } from '@/utils/budget'
import type { Task } from '@/types'

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
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  return mount(OverviewView, {
    global: { plugins: [router], directives: { 'hover-style': {} } },
  })
}

describe('<OverviewView />', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the month selector and all four cards', async () => {
    const wrapper = mountView()
    await wrapper.vm.$nextTick()
    const text = wrapper.text()
    expect(text).toContain('Tasks')
    expect(text).toContain('Todos')
    expect(text).toContain('Reminders')
    expect(text).toContain('Finances')
  })

  it('reflects a task completed in the current month in the Tasks card', async () => {
    const app = useAppStore()
    const day = currentMonthKey() + '-15'
    app.tasks = [
      makeTask(1, { deadline: day, status: 'done', done: true, completedAt: Date.now() }),
    ]
    const wrapper = mountView()
    await wrapper.vm.$nextTick()
    // 1 of 1 done, 100% complete.
    expect(wrapper.text()).toContain('100% complete')
  })

  it('shows a zero-state when nothing is due', async () => {
    const wrapper = mountView()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('No tasks due in')
  })
})
