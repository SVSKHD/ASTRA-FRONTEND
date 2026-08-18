import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import type { Task, Todo } from '@/types'

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
const byId = (app: ReturnType<typeof useAppStore>, id: number) =>
  app.tasks.find((t) => t.id === id) as Task

describe('moveTask — reparent + subtree recompute', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reparents a task, setting depth and rootId', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1), makeTask(2)]
    expect(app.moveTask(2, 1, 0)).toBe(true)
    expect(byId(app, 2).parentId).toBe(1)
    expect(byId(app, 2).depth).toBe(1)
    expect(byId(app, 2).rootId).toBe(1)
    expect(byId(app, 2).localRev).toBe(1)
  })

  it('drags the whole subtree, recomputing depth/rootId for descendants', () => {
    const app = useAppStore()
    // 1 → 2 → 3 ; promote 2 (with 3) to the root.
    app.tasks = [
      makeTask(1),
      makeTask(2, { parentId: 1, depth: 1, rootId: 1 }),
      makeTask(3, { parentId: 2, depth: 2, rootId: 1 }),
    ]
    expect(app.moveTask(2, null, 0)).toBe(true)
    expect(byId(app, 2)).toMatchObject({ parentId: null, depth: 0, rootId: 2 })
    expect(byId(app, 3)).toMatchObject({ parentId: 2, depth: 1, rootId: 2 })
  })
})

describe('moveTask — cycle guard', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('rejects dropping a task onto its own descendant and writes nothing', () => {
    const app = useAppStore()
    app.tasks = [
      makeTask(1),
      makeTask(2, { parentId: 1, depth: 1, rootId: 1 }),
      makeTask(3, { parentId: 2, depth: 2, rootId: 1 }),
    ]
    const before = JSON.stringify(app.tasks)
    expect(app.moveTask(1, 3, 0)).toBe(false)
    expect(JSON.stringify(app.tasks)).toBe(before) // untouched
  })

  it('rejects dropping onto self', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    expect(app.moveTask(1, 1, 0)).toBe(false)
  })
})

describe('moveTask — fractional reorder', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reorders within a sibling group by bisecting neighbours (one field)', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1, { order: 0 }), makeTask(2, { order: 10 }), makeTask(3, { order: 20 })]
    // Move 3 to slot 1 → between 1 (0) and 2 (10) → 5.
    expect(app.moveTask(3, null, 1)).toBe(true)
    expect(byId(app, 3).order).toBe(5)
    expect(byId(app, 3).parentId).toBe(null)
    // Neighbours were not rewritten.
    expect(byId(app, 1).order).toBe(0)
    expect(byId(app, 2).order).toBe(10)
  })

  it('renormalises a sibling group to integers when a gap gets too small', () => {
    const app = useAppStore()
    app.tasks = [
      makeTask(1, { order: 0 }),
      makeTask(2, { order: 0.00005 }),
      makeTask(3, { order: 1 }),
    ]
    // Any move into this group triggers a renormalise pass.
    app.moveTask(3, null, 3)
    const orders = app.tasks.map((t) => t.order).sort((a, b) => a - b)
    // All integers, evenly spaced.
    expect(orders.every((o) => Number.isInteger(o))).toBe(true)
  })
})

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
    reminderIds: [],
    sourceRef: null,
    linked: [],
    parents: [],
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

describe('moveTodo — flat hierarchy parity with tasks', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reparents a todo with its subtree and rejects cycles', () => {
    const app = useAppStore()
    app.todos = [
      makeTodo(1),
      makeTodo(2, { parentId: 1, depth: 1, rootId: 1 }),
      makeTodo(3, { parentId: 2, depth: 2, rootId: 1 }),
    ]
    // Promote 2 (with 3) to the root.
    expect(app.moveTodo(2, null, 0)).toBe(true)
    expect(app.todos.find((t) => t.id === 2)).toMatchObject({ parentId: null, depth: 0, rootId: 2 })
    expect(app.todos.find((t) => t.id === 3)).toMatchObject({ parentId: 2, depth: 1, rootId: 2 })
    // Cycle: dropping 2 back under its own child 3 is rejected.
    expect(app.moveTodo(2, 3, 0)).toBe(false)
  })
})

describe('edit-safe flush — dialog close bumps localRev', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('writes the local edit (localRev++) when the task dialog closes', () => {
    const app = useAppStore()
    app.tasks = [makeTask(5, { localRev: 2 })]
    // A task row now opens the section-18 detail dialog, which owns the flush.
    app.openTaskDialog(5)
    app.updateTask(5, 'title', 'edited')
    app.closeDetail()
    expect(byId(app, 5).title).toBe('edited')
    expect(byId(app, 5).localRev).toBe(3)
  })
})
