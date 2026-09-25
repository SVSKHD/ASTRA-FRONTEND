import { describe, expect, it } from 'vitest'
import { buildSharedItemSnapshot, sharedTreeContains } from './shareTree'
import type { Task, Todo } from '@/types'

function todo(id: number, over: Partial<Todo> = {}): Todo {
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

function task(id: number, over: Partial<Task> = {}): Task {
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
    reminderIds: [],
    sourceRef: null,
    linked: [],
    parents: [],
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

describe('public share trees', () => {
  it('includes nested todos and linked tasks under a public todo snapshot', () => {
    const todos = [
      todo(1, { text: 'Launch' }),
      todo(2, { text: 'Checklist', parentId: 1, depth: 1, rootId: 1 }),
    ]
    const tasks = [task(10, { title: 'Build API' })]
    todos[0].linked = [{ id: 10, collection: 'tasks' }]

    const snap = buildSharedItemSnapshot('todo', 1, todos, tasks)

    expect(snap?.title).toBe('Launch')
    expect(snap?.children?.map((child) => [child.type, child.title])).toEqual([
      ['todo', 'Checklist'],
      ['task', 'Build API'],
    ])
  })

  it('can tell whether a changed child belongs to a shared root', () => {
    const todos = [todo(1, { linked: [{ id: 10, collection: 'tasks' }] })]
    const tasks = [task(10, { linked: [{ id: 2, collection: 'todos' }] })]
    todos.push(todo(2))

    expect(
      sharedTreeContains(
        { id: 1, collection: 'todos' },
        { id: 2, collection: 'todos' },
        todos,
        tasks,
      ),
    ).toBe(true)
    expect(
      sharedTreeContains(
        { id: 2, collection: 'todos' },
        { id: 1, collection: 'todos' },
        todos,
        tasks,
      ),
    ).toBe(false)
  })
})
