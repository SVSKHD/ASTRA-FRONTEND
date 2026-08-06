import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { todayKey } from '@/utils/rollover'
import type { Task, Todo } from '@/types'

// A clearly-past local day so items are overdue whatever day the test runs.
const PAST = new Date(2020, 0, 1, 9, 0, 0)

function makeTask(over: Partial<Task>): Task {
  return {
    id: 1,
    title: 'T',
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
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}
function makeTodo(over: Partial<Todo>): Todo {
  return {
    id: 1,
    text: 'T',
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
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe('movePendingTotoday (store, generalized)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('tasks: pendingOverdue lists only overdue not-done, and a move clears them', async () => {
    const app = useAppStore()
    app.tasks = [
      makeTask({ id: 1, deadline: '2020-01-01' }), // overdue
      makeTask({ id: 2, deadline: '2020-01-02', status: 'done', done: true }), // done
      makeTask({ id: 3, deadline: '' }), // undated
    ]
    expect(app.pendingOverdue('tasks').map((t) => t.id)).toEqual([1])

    const res = await app.movePendingToToday('tasks')
    expect(res.moved).toBe(1)
    expect(res.failed).toBe(0)

    const moved = app.tasks.find((t) => t.id === 1)!
    expect(moved.deadline).toBe(todayKey())
    expect(moved.rolloverCount).toBe(1)
    expect(moved.rolledOverAt).not.toBeNull()

    // Idempotent: nothing left to move.
    expect(app.pendingOverdue('tasks')).toEqual([])
    expect((await app.movePendingToToday('tasks')).moved).toBe(0)
  })

  it('todos: an overdue todo is re-stamped to today and then no longer eligible', async () => {
    const app = useAppStore()
    app.todos = [makeTodo({ id: 1, createdAt: PAST.getTime() })]
    expect(app.pendingOverdue('todos').map((t) => t.id)).toEqual([1])

    const res = await app.movePendingToToday('todos')
    expect(res.moved).toBe(1)
    expect(app.pendingOverdue('todos')).toEqual([])
    expect(app.todos[0].rolloverCount).toBe(1)
  })

  it('undo restores the previous day', async () => {
    const app = useAppStore()
    app.tasks = [makeTask({ id: 1, deadline: '2020-01-01' })]
    const res = await app.movePendingToToday('tasks')
    expect(app.tasks[0].deadline).toBe(todayKey())
    app.undoMovePending('tasks', res.restore)
    expect(app.tasks[0].deadline).toBe('2020-01-01')
    expect(app.tasks[0].rolloverCount).toBe(0)
  })

  it('the two collections are independent', async () => {
    const app = useAppStore()
    app.tasks = [makeTask({ id: 1, deadline: '2020-01-01' })]
    app.todos = [makeTodo({ id: 1, createdAt: PAST.getTime() })]
    await app.movePendingToToday('tasks')
    // Moving tasks does not touch the overdue todo's eligibility.
    expect(app.pendingOverdue('todos').map((t) => t.id)).toEqual([1])
  })
})
