import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import type { Task, Todo } from '@/types'

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

describe('store: interlinked todos/tasks', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('links both directions across collections', () => {
    const app = useAppStore()
    app.todos = [makeTodo(1)]
    app.tasks = [makeTask(2)]
    const res = app.linkItems({ id: 1, collection: 'todos' }, { id: 2, collection: 'tasks' })
    expect(res.ok).toBe(true)
    expect(app.todos[0].linked).toEqual([{ id: 2, collection: 'tasks' }])
    expect(app.tasks[0].parents).toEqual([{ id: 1, collection: 'todos' }])
  })

  it('rejects a cycle', () => {
    const app = useAppStore()
    app.todos = [makeTodo(1), makeTodo(2)]
    app.linkItems({ id: 1, collection: 'todos' }, { id: 2, collection: 'todos' })
    const res = app.linkItems({ id: 2, collection: 'todos' }, { id: 1, collection: 'todos' })
    expect(res).toEqual({ ok: false, reason: 'cycle' })
  })

  it('derives progress from direct children status', () => {
    const app = useAppStore()
    app.todos = [makeTodo(1)]
    app.tasks = [makeTask(2), makeTask(3, { status: 'done', done: true })]
    app.linkItems({ id: 1, collection: 'todos' }, { id: 2, collection: 'tasks' })
    app.linkItems({ id: 1, collection: 'todos' }, { id: 3, collection: 'tasks' })
    expect(app.linkProgressOf({ id: 1, collection: 'todos' })).toEqual({
      done: 1,
      total: 2,
      pct: 50,
    })
  })

  it('unlink removes both directions', () => {
    const app = useAppStore()
    app.todos = [makeTodo(1)]
    app.tasks = [makeTask(2)]
    app.linkItems({ id: 1, collection: 'todos' }, { id: 2, collection: 'tasks' })
    app.unlinkItems({ id: 1, collection: 'todos' }, { id: 2, collection: 'tasks' })
    expect(app.todos[0].linked).toEqual([])
    expect(app.tasks[0].parents).toEqual([])
  })

  it('deleting an item cleans up links on its counterparts', () => {
    const app = useAppStore()
    app.todos = [makeTodo(1)]
    app.tasks = [makeTask(2)]
    app.linkItems({ id: 1, collection: 'todos' }, { id: 2, collection: 'tasks' })
    app.deleteWithUndo('tasks', 'task', 2)
    expect(app.todos[0].linked).toEqual([])
  })
})
