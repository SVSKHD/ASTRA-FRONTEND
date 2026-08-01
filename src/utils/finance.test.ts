import { describe, expect, it } from 'vitest'
import {
  accruedInterest,
  balanceState,
  debtOutstanding,
  debtSummary,
  effectiveDebtStatus,
  extraIncome,
  filterTxns,
  isOverdue,
  migrateExpenses,
  monthTotals,
  tagBreakdown,
  UNTAGGED,
} from '@/utils/finance'
import type { Debt, Txn } from '@/types'

let seq = 0
function txn(over: Partial<Txn>): Txn {
  return {
    id: ++seq,
    kind: 'expense',
    scope: 'personal',
    amount: 100,
    date: '2026-07-10',
    note: '',
    category: 'Food',
    tags: [],
    debtId: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe('scope filtering', () => {
  const txns = [txn({ scope: 'personal', amount: 100 }), txn({ scope: 'business', amount: 200 })]
  it('personal and business never leak into each other', () => {
    expect(filterTxns(txns, { scope: 'personal', monthKey: '2026-07' })).toHaveLength(1)
    expect(filterTxns(txns, { scope: 'business', monthKey: '2026-07' })).toHaveLength(1)
    expect(filterTxns(txns, { scope: 'all', monthKey: '2026-07' })).toHaveLength(2)
  })
  it('other months are excluded', () => {
    const t = [...txns, txn({ date: '2026-06-01' })]
    expect(filterTxns(t, { scope: 'all', monthKey: '2026-07' })).toHaveLength(2)
  })
})

describe('monthTotals + extra income', () => {
  const txns = [
    txn({ kind: 'income', amount: 85000, source: 'Salary' }),
    txn({ kind: 'income', amount: 12000, source: 'Freelance' }),
    txn({ kind: 'income', amount: 5000, confirmed: false, isRecurring: true }), // expected only
    txn({ kind: 'expense', amount: 20000, category: 'Rent' }),
    txn({ kind: 'expense', amount: 3000, category: 'Debt', debtId: 7 }),
  ]
  it('separates received from expected and sums outflow incl. debt repayments', () => {
    const t = monthTotals(txns, 'personal', '2026-07')
    expect(t.incomeReceived).toBe(97000)
    expect(t.incomeExpected).toBe(5000)
    expect(t.out).toBe(23000)
    expect(t.debtRepay).toBe(3000)
    expect(t.net).toBe(74000)
  })
  it('extra income is receipts beyond the baseline', () => {
    expect(extraIncome(97000, 85000)).toBe(12000)
    expect(extraIncome(80000, 85000)).toBe(0)
  })
})

describe('balanceState thresholds', () => {
  it('green over 40% left, amber 15-40, red under 15, over when negative', () => {
    expect(balanceState(100000, 40000).level).toBe('good') // 60% left
    expect(balanceState(100000, 70000).level).toBe('warn') // 30% left
    expect(balanceState(100000, 90000).level).toBe('bad') // 10% left
    const over = balanceState(100000, 104200)
    expect(over.level).toBe('over')
    expect(over.overBy).toBe(4200)
  })
})

describe('tagBreakdown', () => {
  it('splits a multi-tag txn so columns sum to the month total without double counting', () => {
    const txns = [
      txn({ kind: 'expense', amount: 300, tags: ['a', 'b', 'c'] }),
      txn({ kind: 'expense', amount: 100, tags: ['a'] }),
      txn({ kind: 'income', amount: 90, tags: ['a'] }),
      txn({ kind: 'expense', amount: 50, tags: [] }), // → Untagged
    ]
    const rows = tagBreakdown(txns, 'personal', '2026-07')
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]))
    // 'a' gets 300/3 + 100 = 200 spent, and appears in the 3-tag txn.
    expect(byName['a'].spent).toBe(200)
    expect(byName['a'].earned).toBe(90)
    expect(byName['a'].count).toBe(3) // three txns carry 'a'
    expect(byName['b'].spent).toBe(100)
    expect(byName[UNTAGGED].spent).toBe(50)
    // Spend column reconciles to the month's total expense (450), no double count.
    const totalSpent = rows.reduce((s, r) => s + r.spent, 0)
    expect(Math.round(totalSpent)).toBe(450)
  })
})

describe('debts', () => {
  let dseq = 0
  function debt(over: Partial<Debt>): Debt {
    return {
      id: ++dseq,
      direction: 'owed_by_me',
      scope: 'personal',
      counterparty: 'Bank',
      principal: 10000,
      currency: 'INR',
      interestType: 'none',
      startDate: '2026-01-01',
      status: 'open',
      note: '',
      tags: [],
      payments: [],
      createdAt: 0,
      updatedAt: 0,
      ...over,
    }
  }
  const NOW = Date.parse('2027-01-01T00:00:00') // one year later

  it('simple interest and outstanding after payments', () => {
    const d = debt({ principal: 10000, interestRatePct: 12, interestType: 'simple' })
    // ~12% of 10000 over ~one year (365 / 365.25 ≈ 1199).
    expect(accruedInterest(d, NOW)).toBeCloseTo(1200, -1)
    d.payments = [{ id: 1, amount: 4000, date: '2026-06-01', note: '' }]
    expect(debtOutstanding(d, NOW)).toBeCloseTo(7200, -1) // 10000 + ~1200 − 4000
  })
  it('compound interest exceeds simple over a year+', () => {
    const simple = debt({ interestRatePct: 12, interestType: 'simple' })
    const comp = debt({ interestRatePct: 12, interestType: 'compound' })
    expect(accruedInterest(comp, NOW)).toBeGreaterThan(accruedInterest(simple, NOW) - 1)
  })
  it('overdue only past the due date with a balance', () => {
    const d = debt({ dueDate: '2026-12-01' })
    expect(isOverdue(d, NOW)).toBe(true)
    expect(effectiveDebtStatus(d, NOW)).toBe('overdue')
    d.payments = [{ id: 1, amount: 10000, date: '2026-11-01', note: '' }]
    expect(isOverdue(d, NOW)).toBe(false)
    expect(effectiveDebtStatus(d, NOW)).toBe('settled')
  })
  it('summary nets owed-to-me against I-owe and counts overdue', () => {
    const debts = [
      debt({ direction: 'owed_by_me', principal: 5000, dueDate: '2026-01-01' }), // overdue
      debt({ direction: 'owed_to_me', principal: 8000 }),
      debt({ direction: 'owed_by_me', principal: 3000, status: 'written_off' }), // excluded
    ]
    const s = debtSummary(debts, 'personal', NOW)
    expect(s.iOwe).toBe(5000)
    expect(s.owedToMe).toBe(8000)
    expect(s.net).toBe(3000)
    expect(s.overdueCount).toBe(1)
  })
})

describe('migrateExpenses', () => {
  it('lifts legacy expenses into personal expense txns with no data loss', () => {
    const out = migrateExpenses([
      { id: 5, amount: 250, category: 'Food', note: 'lunch', date: '2026-07-02' },
    ])
    expect(out[0]).toMatchObject({
      id: 5,
      kind: 'expense',
      scope: 'personal',
      amount: 250,
      category: 'Food',
      note: 'lunch',
      date: '2026-07-02',
      tags: [],
    })
  })
})
