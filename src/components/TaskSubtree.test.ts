// Verifies the flat-hierarchy accordion renders a task's whole subtree — direct
// children and deeper descendants — inside the parent, matching the linked-items
// accordion's nested rendering.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TaskSubtree from '@/components/TaskSubtree.vue'
import { useAppStore } from '@/stores/app'
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
    ...over,
  }
}

describe('<TaskSubtree />', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('renders direct children and deeper descendants of the given task', async () => {
    const app = useAppStore()
    // 1 → {2, 3}; 2 → 4 (a grandchild of 1)
    app.tasks = [
      makeTask(1),
      makeTask(2, { parentId: 1, depth: 1, rootId: 1, order: 0 }),
      makeTask(3, { parentId: 1, depth: 1, rootId: 1, order: 1, status: 'done', done: true }),
      makeTask(4, { parentId: 2, depth: 2, rootId: 1, order: 0 }),
    ]
    const wrapper = mount(TaskSubtree, {
      props: { taskId: 1 },
      global: { directives: { 'hover-style': {} } },
    })
    await wrapper.vm.$nextTick()
    const text = wrapper.text()
    expect(text).toContain('task 2')
    expect(text).toContain('task 3')
    expect(text).toContain('task 4') // grandchild rendered via recursion
    // Node 2 has one descendant (4), none done → 0/1 progress chip.
    expect(text).toContain('0/1')
  })
})
