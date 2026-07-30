import { describe, expect, it } from 'vitest'
import { chunk, eligibleTasks, isOverdueTask, todayKey } from '@/utils/rollover'
import type { Task } from '@/types'

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
