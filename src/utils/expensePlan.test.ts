import { describe, expect, it } from 'vitest'
import {
  allocationAdvice,
  byMethod,
  byNeed,
  capitalRows,
  dailySeries,
  expenseKpis,
  planBudget,
  projectSpend,
  ruleSplit,
} from '@/utils/expensePlan'
import type { Expense } from '@/types'

let seq = 0
function expense(over: Partial<Expense> = {}): Expense {
  seq += 1
  return {
    id: `e${seq}`,
    userId: 'u1',
    date: '2026-09-02',
    amount: 100,
    category: 'Groceries',
    note: '',
    kind: 'one-off',
    method: 'debit',
    need: 'essential',
    currency: 'INR',
    createdAt: 0,
    ...over,
  }
}

describe('planBudget', () => {
  it('prefers the set budget and falls back to the capital assigned', () => {
    expect(planBudget(5000, { A: 100 })).toBe(5000)
    expect(planBudget(0, { A: 100, B: 250.5 })).toBe(350.5)
    expect(planBudget(0, {})).toBe(0)
  })
})

describe('projectSpend', () => {
  it('counts recurring once and carries only one-offs forward', () => {
    const rows = [
      expense({ amount: 3000, kind: 'recurring', category: 'Rent' }),
      expense({ amount: 100 }),
    ]
    // Ten days in, a 30-day month: 3000 + 100 / 10 × 30.
    expect(projectSpend(rows, 10, 30)).toBe(3300)
  })
})

describe('capitalRows', () => {
  it('lists planned-but-untouched and spent-but-unplanned categories alike', () => {
    const rows = capitalRows(
      [expense({ amount: 400 }), expense({ amount: 50, category: 'Coffee' })],
      { Groceries: 1000, Books: 300 },
      10,
      30,
    )
    const by = Object.fromEntries(rows.map((r) => [r.category, r]))
    expect(by.Groceries.status).toBe('pacing-over') // 400 → 1200 projected
    expect(by.Groceries.remaining).toBe(600)
    expect(by.Books.status).toBe('idle')
    expect(by.Coffee.status).toBe('unplanned')
    expect(rows[0].category).toBe('Groceries')
  })

  it('calls a category over once spending passes its capital', () => {
    const [row] = capitalRows([expense({ amount: 1200 })], { Groceries: 1000 }, 30, 30)
    expect(row.status).toBe('over')
    expect(row.pct).toBe(120)
  })
})

describe('splits', () => {
  const rows = [
    expense({ amount: 300, method: 'card', need: 'lifestyle' }),
    expense({ amount: 100, method: 'cash', need: 'avoidable' }),
    expense({ amount: 600 }),
  ]
  it('by method, with shares of the total', () => {
    const card = byMethod(rows).find((p) => p.key === 'card')!
    expect(card.amount).toBe(300)
    expect(card.share).toBe(30)
  })
  it('by need, always all three in a fixed order', () => {
    expect(byNeed(rows).map((p) => [p.key, p.amount])).toEqual([
      ['essential', 600],
      ['lifestyle', 300],
      ['avoidable', 100],
    ])
    expect(byNeed([]).every((p) => p.share === 0)).toBe(true)
  })
})

describe('dailySeries', () => {
  it('stops at today and measures each day against an even allowance', () => {
    const series = dailySeries(
      [expense({ date: '2026-09-01', amount: 50 }), expense({ date: '2026-09-03', amount: 200 })],
      3000,
      '2026-09',
      3,
    )
    expect(series).toHaveLength(3)
    expect(series.map((d) => d.saved)).toEqual([50, 100, -100])
    expect(series[2].cumulative).toBe(250)
    expect(series[2].pace).toBe(300)
  })
})

describe('expenseKpis', () => {
  it('works out what is kept, the pace and the card share', () => {
    const k = expenseKpis({
      expenses: [
        expense({ date: '2026-09-01', amount: 400, method: 'card' }),
        expense({ date: '2026-09-02', amount: 100, need: 'avoidable' }),
      ],
      budget: 3000,
      income: 5000,
      capital: { Groceries: 2000 },
      month: '2026-09',
      elapsed: 10,
    })
    expect(k.kept).toBe(4500)
    expect(k.savingsRate).toBe(90)
    expect(k.vsPace).toBe(500) // 1000 of plan used by day 10, 500 spent
    expect(k.cardShare).toBe(80)
    expect(k.avoidable).toBe(100)
    expect(k.safePerDay).toBe(125) // 2500 over 20 days
    expect(k.unallocated).toBe(1000)
    expect(k.biggest?.amount).toBe(400)
  })

  it('leaves the income figures empty rather than dividing by nothing', () => {
    const k = expenseKpis({
      expenses: [],
      budget: 0,
      income: 0,
      capital: {},
      month: '2026-09',
      elapsed: 30,
    })
    expect(k.kept).toBeNull()
    expect(k.savingsRate).toBeNull()
    expect(k.safePerDay).toBeNull()
  })
})

describe('ruleSplit', () => {
  it('measures needs, wants and savings against 50/30/20 of income', () => {
    const parts = ruleSplit(
      [expense({ amount: 600 }), expense({ amount: 200, need: 'lifestyle' })],
      1000,
    )
    expect(parts.map((p) => [p.key, p.actual, p.target])).toEqual([
      ['needs', 600, 500],
      ['wants', 200, 300],
      ['savings', 200, 200],
    ])
    expect(ruleSplit([], 0)).toEqual([])
  })
})

describe('allocationAdvice', () => {
  it('covers an overrun from a category with room before anything else', () => {
    const expenses = [expense({ amount: 900 }), expense({ amount: 50, category: 'Books' })]
    const capital = { Groceries: 1000, Books: 500 }
    const rows = capitalRows(expenses, capital, 15, 30)
    const k = expenseKpis({
      expenses,
      budget: 0,
      income: 0,
      capital,
      month: '2026-09',
      elapsed: 15,
    })
    const advice = allocationAdvice(rows, k)
    expect(advice[0].id).toBe('over-Groceries')
    // Projected 1800 against 1000: 800 short, Books has 400 spare.
    expect(advice[0].detail).toContain('Move 400.00 from Books')
  })

  it('reminds what is owed on the card and names the waste', () => {
    const expenses = [expense({ method: 'card', need: 'avoidable', amount: 300 })]
    const rows = capitalRows(expenses, {}, 5, 30)
    const k = expenseKpis({
      expenses,
      budget: 0,
      income: 0,
      capital: {},
      month: '2026-09',
      elapsed: 5,
    })
    const ids = allocationAdvice(rows, k).map((a) => a.id)
    expect(ids).toContain('card')
    expect(ids).toContain('avoidable')
    expect(ids).toContain('unplanned-Groceries')
  })

  it('asks for a plan when there is nothing to measure against', () => {
    const k = expenseKpis({
      expenses: [],
      budget: 0,
      income: 0,
      capital: {},
      month: '2026-09',
      elapsed: 5,
    })
    expect(allocationAdvice([], k).map((a) => a.id)).toEqual(['no-plan'])
  })
})
