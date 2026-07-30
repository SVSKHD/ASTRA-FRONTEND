import { describe, expect, it } from 'vitest'
import { bucketPct, computeMonthlyOverview, type OverviewInput } from '@/utils/overview'
import { emptyFinanceSettings, type Finance, type Reminder, type Task, type Todo } from '@/types'

// July 2026 timestamps (local) for completion stamps.
const jul = (d: number) => new Date(2026, 6, d, 10).getTime()
const jun = (d: number) => new Date(2026, 5, d, 10).getTime()

function task(o: Partial<Task>): Task {
  return {
    id: 1,
    title: 't',
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
    ...o,
  }
}
function todo(o: Partial<Todo>): Todo {
  return {
    id: 1,
    text: 't',
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
    ...o,
  }
}
function reminder(o: Partial<Reminder>): Reminder {
  return {
    id: 1,
    title: 'r',
    note: '',
    start: '',
    repeat: { type: 'none' },
    priority: 'normal',
    calSync: 'local',
    calEventId: null,
    lastFiredOcc: null,
    acknowledgedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...o,
  }
}
function fin(o: Partial<Finance>): Finance {
  return {
    id: 1,
    amount: 0,
    category: 'Other',
    note: '',
    date: '2026-07-01',
    createdAt: 0,
    updatedAt: 0,
    ...o,
  }
}
function input(over: Partial<OverviewInput>): OverviewInput {
  return {
    todos: [],
    tasks: [],
    reminders: [],
    finances: [],
    settings: emptyFinanceSettings(),
    ...over,
  }
}

const M = '2026-07'

describe('computeMonthlyOverview — tasks', () => {
  it('counts done-in-month and due-in-month', () => {
    const tasks = [
      task({ id: 1, deadline: '2026-07-10' }), // due this month, not done
      task({ id: 2, deadline: '2026-07-12', status: 'done', done: true, completedAt: jul(12) }), // due + done
      task({ id: 3, deadline: '2026-08-01' }), // next month
    ]
    expect(computeMonthlyOverview(input({ tasks }), M).tasks).toEqual({ done: 1, total: 2 })
  })

  it('counts a rolled-over task in the month it was completed, not when due', () => {
    const tasks = [
      task({ id: 1, deadline: '2026-06-30', status: 'done', done: true, completedAt: jul(2) }),
    ]
    expect(computeMonthlyOverview(input({ tasks }), M).tasks).toEqual({ done: 1, total: 1 })
    // In June it is due-but-not-done-here (completed in July).
    expect(computeMonthlyOverview(input({ tasks }), '2026-06').tasks).toEqual({ done: 0, total: 1 })
  })
})

describe('computeMonthlyOverview — todos/reminders/finance', () => {
  it('todos use createdAt as their due day', () => {
    const todos = [
      todo({ id: 1, createdAt: jul(1) }),
      todo({ id: 2, createdAt: jul(2), status: 'done', done: true, completedAt: jul(3) }),
      todo({ id: 3, createdAt: jun(1) }),
    ]
    expect(computeMonthlyOverview(input({ todos }), M).todos).toEqual({ done: 1, total: 2 })
  })

  it('reminders: acknowledged this month over scheduled this month', () => {
    const reminders = [
      reminder({ id: 1, start: '2026-07-05T09:00' }),
      reminder({ id: 2, start: '2026-07-06T09:00', acknowledgedAt: jul(6) }),
    ]
    expect(computeMonthlyOverview(input({ reminders }), M).reminders).toEqual({ done: 1, total: 2 })
  })

  it('finance sums the month and resolves income', () => {
    const finances = [
      fin({ amount: 20000, date: '2026-07-01' }),
      fin({ amount: 9999, date: '2026-06-30' }),
    ]
    const settings = {
      ...emptyFinanceSettings(),
      monthlyIncome: 85000,
      incomeByMonth: { '2026-07': 85000 },
    }
    expect(computeMonthlyOverview(input({ finances, settings }), M).finance).toEqual({
      spent: 20000,
      income: 85000,
    })
  })
})

describe('bucketPct', () => {
  it('is 0 when nothing due', () => {
    expect(bucketPct({ done: 0, total: 0 })).toBe(0)
  })
  it('rounds done/total', () => {
    expect(bucketPct({ done: 1, total: 3 })).toBe(33)
  })
})
