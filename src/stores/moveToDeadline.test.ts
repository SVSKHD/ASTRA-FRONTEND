// "Move to Deadlines": a todo / task is archived and an idea / reminder removed,
// a dated deadline takes its place, and the toast's Undo reverses both halves.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import type { Idea, Task, Todo } from '@/types'

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
function makeIdea(id: number, over: Partial<Idea> = {}): Idea {
  return {
    id,
    title: 'idea ' + id,
    description: '',
    deadline: '',
    ideaType: 'feature',
    tag: '',
    noteIds: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe('moveToDeadline', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('turns a todo into a deadline and archives the todo; Undo reverses it', () => {
    const app = useAppStore()
    app.todos = [makeTodo(1, { text: 'Buy Sierra' })]
    app.deadlines = []

    const id = app.moveToDeadline('todo', 1, '2027-03-01')
    expect(id).not.toBeNull()
    expect(app.deadlines).toHaveLength(1)
    expect(app.deadlines[0]).toMatchObject({ title: 'Buy Sierra', due: '2027-03-01' })
    expect(app.todos[0].archivedAt).toBeTypeOf('number')

    app.performUndo()
    expect(app.deadlines).toHaveLength(0)
    expect(app.todos[0].archivedAt ?? null).toBeNull()
  })

  it('turns a task into a deadline and archives the task', () => {
    const app = useAppStore()
    app.tasks = [makeTask(7, { title: 'Ship v2' })]
    app.deadlines = []

    app.moveToDeadline('task', 7, '2027-01-15')
    expect(app.deadlines[0]).toMatchObject({ title: 'Ship v2', due: '2027-01-15' })
    expect(app.tasks[0].archivedAt).toBeTypeOf('number')
  })

  it('removes an idea, and Undo brings the idea back and drops the deadline', () => {
    const app = useAppStore()
    app.ideas = [makeIdea(3, { title: 'Trading bot' })]
    app.deadlines = []

    app.moveToDeadline('idea', 3, '2026-12-31')
    expect(app.ideas).toHaveLength(0)
    expect(app.deadlines[0]).toMatchObject({ title: 'Trading bot', due: '2026-12-31' })

    app.performUndo()
    expect(app.ideas.map((i) => i.id)).toEqual([3])
    expect(app.deadlines).toHaveLength(0)
  })

  it('refuses a malformed date and leaves everything untouched', () => {
    const app = useAppStore()
    app.todos = [makeTodo(1)]
    app.deadlines = []

    expect(app.moveToDeadline('todo', 1, 'tomorrow')).toBeNull()
    expect(app.deadlines).toHaveLength(0)
    expect(app.todos[0].archivedAt ?? null).toBeNull()
  })
})
