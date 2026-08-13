// Verifies the button is actually RENDERED (visible) when there is overdue work
// in the given collection, and renders nothing when there isn't — the app's
// workspace is auth-gated behind Firebase, so this mounted render is the
// faithful stand-in for "confirm the button shows in the header".
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MovePendingButton from '@/components/MovePendingButton.vue'
import { useAppStore } from '@/stores/app'
import type { Task, Todo } from '@/types'

function overdueTask(id: number): Task {
  return {
    id,
    title: 'Task ' + id,
    tag: '',
    done: false,
    status: 'pending',
    deadline: '2020-01-01',
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
    order: 0,
    depth: 0,
    rootId: id,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
  }
}
function overdueTodo(id: number): Todo {
  return {
    id,
    text: 'Todo ' + id,
    done: false,
    status: 'pending',
    tag: '',
    description: '',
    isPublic: false,
    shareId: null,
    sharedAt: null,
    rolledOverAt: null,
    rolloverCount: 0,
    completedAt: null,
    linked: [],
    parents: [],
    reminderIds: [],
    sourceRef: null,
    parentId: null,
    order: 0,
    depth: 0,
    rootId: id,
    localRev: 0,
    updatedBy: '',
    createdAt: new Date(2020, 0, 1, 9).getTime(),
    updatedAt: 0,
  }
}

describe('<MovePendingButton /> visibility', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the tasks button with label + count when tasks are overdue', () => {
    const app = useAppStore()
    app.tasks = [overdueTask(1), overdueTask(2), overdueTask(3)]
    const wrapper = mount(MovePendingButton, { props: { collection: 'tasks' } })
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.text()).toContain('Move pending tasks to today')
    expect(wrapper.text()).toContain('3')
  })

  it('renders the todos button with its own label + count when todos are overdue', () => {
    const app = useAppStore()
    app.todos = [overdueTodo(1), overdueTodo(2)]
    const wrapper = mount(MovePendingButton, { props: { collection: 'todos' } })
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.text()).toContain('Move pending todos to today')
    expect(wrapper.text()).toContain('2')
  })

  it('renders NOTHING when the collection has no overdue items', () => {
    const app = useAppStore()
    app.tasks = [overdueTask(1)] // overdue tasks, but...
    const wrapper = mount(MovePendingButton, { props: { collection: 'todos' } }) // ...todos empty
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })
})
