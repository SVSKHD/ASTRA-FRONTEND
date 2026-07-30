import { describe, expect, it } from 'vitest'
import {
  chunk,
  eligibleTasks,
  eligibleTodos,
  isOverdueTask,
  isOverdueTodo,
  todayKey,
} from '@/utils/rollover'
import type { Task, Todo } from '@/types'

function task(over: Partial<Task>): Task {
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
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

const TODAY = '2026-07-30'

describe('todayKey', () => {
  it('is a local YYYY-MM-DD for the given date', () => {
    // Constructed with local Y/M/D so the assertion is timezone-independent.
    expect(todayKey(new Date(2026, 6, 30, 23, 30))).toBe('2026-07-30')
  })
})

describe('isOverdueTask', () => {
  it('is true for a not-done task dated before today', () => {
    expect(isOverdueTask(task({ deadline: '2026-07-29' }), TODAY)).toBe(true)
  })

  it('is false for a task due today or in the future', () => {
    expect(isOverdueTask(task({ deadline: TODAY }), TODAY)).toBe(false)
    expect(isOverdueTask(task({ deadline: '2026-08-01' }), TODAY)).toBe(false)
  })

  it('never touches a task with no deadline', () => {
    expect(isOverdueTask(task({ deadline: '' }), TODAY)).toBe(false)
  })

  it('never touches a done task even if overdue', () => {
    expect(isOverdueTask(task({ deadline: '2026-07-01', status: 'done', done: true }), TODAY)).toBe(
      false,
    )
  })
})

describe('eligibleTasks', () => {
  const tasks = [
    task({ id: 1, deadline: '2026-07-28' }), // overdue
    task({ id: 2, deadline: '2026-07-29', status: 'progress' }), // overdue, in progress
    task({ id: 3, deadline: TODAY }), // today
    task({ id: 4, deadline: '' }), // undated
    task({ id: 5, deadline: '2026-07-01', status: 'done', done: true }), // done
  ]

  it('returns only overdue, not-done, dated tasks in order', () => {
    expect(eligibleTasks(tasks, TODAY).map((t) => t.id)).toEqual([1, 2])
  })

  it('is idempotent: once rolled to today, nothing is eligible', () => {
    const rolled = tasks.map((t) =>
      eligibleTasks([t], TODAY).length ? { ...t, deadline: TODAY } : t,
    )
    expect(eligibleTasks(rolled, TODAY)).toEqual([])
  })
})

function todo(over: Partial<Todo>): Todo {
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
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

// A local timestamp for 09:00 on the given Y/M/D, so ymd() reads the intended
// calendar day regardless of the runner's timezone.
function at(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 9, 0, 0).getTime()
}

describe('isOverdueTodo / eligibleTodos (todos use createdAt as their day)', () => {
  it('is overdue when the not-done todo was created before today', () => {
    expect(isOverdueTodo(todo({ createdAt: at(2026, 7, 29) }), TODAY)).toBe(true)
  })

  it('is not overdue when created today or later', () => {
    expect(isOverdueTodo(todo({ createdAt: at(2026, 7, 30) }), TODAY)).toBe(false)
    expect(isOverdueTodo(todo({ createdAt: at(2026, 8, 1) }), TODAY)).toBe(false)
  })

  it('leaves done todos and undated (createdAt 0) todos alone', () => {
    expect(
      isOverdueTodo(todo({ createdAt: at(2020, 1, 1), status: 'done', done: true }), TODAY),
    ).toBe(false)
    expect(isOverdueTodo(todo({ createdAt: 0 }), TODAY)).toBe(false)
  })

  it('eligibleTodos returns only the overdue ones', () => {
    const list = [
      todo({ id: 1, createdAt: at(2026, 7, 1) }),
      todo({ id: 2, createdAt: at(2026, 7, 30) }),
      todo({ id: 3, createdAt: 0 }),
    ]
    expect(eligibleTodos(list, TODAY).map((t) => t.id)).toEqual([1])
  })
})

describe('chunk', () => {
  it('splits into fixed-size pieces', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
  it('returns a single chunk when size covers everything', () => {
    expect(chunk([1, 2, 3], 400)).toEqual([[1, 2, 3]])
  })
  it('handles an empty list', () => {
    expect(chunk([], 400)).toEqual([])
  })
})
