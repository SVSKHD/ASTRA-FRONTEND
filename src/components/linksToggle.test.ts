// "Expand links / Collapse links" in the Todos and Tasks toolbars: the button
// flips every linked parent's accordion, and each parent's linked children must
// show (and hide) wherever that parent is listed — today's rows and the
// carried-over rows alike.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TodoView from '@/components/views/TodoView.vue'
import TasksView from '@/components/views/TasksView.vue'
import { useAppStore } from '@/stores/app'
import type { Task, Todo } from '@/types'

const DAY = 24 * 60 * 60 * 1000

function makeTodo(id: number, over: Partial<Todo> = {}): Todo {
  return {
    id,
    text: 'todo ' + id,
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
    order: id,
    depth: 0,
    rootId: id,
    localRev: 0,
    updatedBy: '',
    createdAt: Date.now(),
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

const global = { directives: { 'hover-style': {} } }

function toggleButton(wrapper: ReturnType<typeof mount>) {
  const btn = wrapper.findAll('button').find((b) => /links/i.test(b.text()))
  expect(btn, 'Expand/Collapse links button').toBeTruthy()
  return btn!
}

describe('Expand / Collapse links', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  for (const [label, createdAt] of [
    ["today's todo", Date.now()],
    ['carried-over todo', Date.now() - 3 * DAY],
  ] as const) {
    it(`shows and hides the linked children of a ${label}`, async () => {
      const app = useAppStore()
      app.todos = [
        makeTodo(1, { text: 'parent todo', createdAt, linked: [{ id: 2, collection: 'todos' }] }),
        makeTodo(2, {
          text: 'linked child',
          createdAt,
          parents: [{ id: 1, collection: 'todos' }],
        }),
      ]
      const wrapper = mount(TodoView, { global, attachTo: document.body })
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).not.toContain('linked child')

      await toggleButton(wrapper).trigger('click')
      expect(wrapper.text()).toContain('linked child')
      expect(toggleButton(wrapper).text()).toMatch(/collapse/i)

      await toggleButton(wrapper).trigger('click')
      expect(wrapper.text()).not.toContain('linked child')
      wrapper.unmount()
    })
  }

  for (const [label, deadline] of [
    ["today's task", ''],
    ['carried-over task', new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10)],
  ] as const) {
    it(`shows and hides the linked children of a ${label}`, async () => {
      const app = useAppStore()
      app.tasks = [
        makeTask(1, { title: 'parent task', deadline, linked: [{ id: 2, collection: 'tasks' }] }),
        makeTask(2, { title: 'linked child', deadline, parents: [{ id: 1, collection: 'tasks' }] }),
      ]
      const wrapper = mount(TasksView, { global, attachTo: document.body })
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).not.toContain('linked child')

      await toggleButton(wrapper).trigger('click')
      expect(wrapper.text()).toContain('linked child')

      await toggleButton(wrapper).trigger('click')
      expect(wrapper.text()).not.toContain('linked child')
      wrapper.unmount()
    })
  }
})
