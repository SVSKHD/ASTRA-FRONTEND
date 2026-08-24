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
import { toMinor } from '@/utils/money'
import type { Debt, Txn } from '@/types'

// Every figure these functions return is an integer count of paise (acceptance
// 143). The factories below still take rupees, because a test that reads
// `amount: 85000` is a test about a salary and one that reads
// `amountMinor: 8500000` is a test about arithmetic — but the EXPECTATIONS are
// written in toMinor(), so the unit is stated at every assertion rather than
// assumed.
let seq = 0
function txn({ amount, ...over }: Partial<Txn> & { amount?: number }): Txn {
  return {
    id: ++seq,
    kind: 'expense',
    scope: 'personal',
    amountMinor: toMinor(amount ?? 100),
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
    expect(t.incomeReceived).toBe(toMinor(97000))
    expect(t.incomeExpected).toBe(toMinor(5000))
    expect(t.out).toBe(toMinor(23000))
    expect(t.debtRepay).toBe(toMinor(3000))
    expect(t.net).toBe(toMinor(74000))
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
    expect(byName['a'].spent).toBe(toMinor(200))
    expect(byName['a'].earned).toBe(toMinor(90))
    expect(byName['a'].count).toBe(3) // three txns carry 'a'
    expect(byName['b'].spent).toBe(toMinor(100))
    expect(byName[UNTAGGED].spent).toBe(toMinor(50))
    // Spend column reconciles to the month's total expense (450), no double count.
    const totalSpent = rows.reduce((s, r) => s + r.spent, 0)
    expect(totalSpent).toBe(toMinor(450))
  })
})

describe('debts', () => {
  let dseq = 0
  function debt({ principal, ...over }: Partial<Debt> & { principal?: number }): Debt {
    return {
      id: ++dseq,
      direction: 'owed_by_me',
      scope: 'personal',
      counterparty: 'Bank',
      principalMinor: toMinor(principal ?? 10000),
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
    // ~12% of ₹10,000 over ~one year (365 / 365.25 ≈ ₹1,199), in paise.
    expect(accruedInterest(d, NOW)).toBeCloseTo(toMinor(1200), -3)
    d.payments = [{ id: 1, amountMinor: toMinor(4000), date: '2026-06-01', note: '' }]
    expect(debtOutstanding(d, NOW)).toBeCloseTo(toMinor(7200), -3) // 10000 + ~1200 − 4000
  })
  it('compound interest exceeds simple once more than a year has passed', () => {
    // The horizon matters and this test used to hide it. NOW is 365 days after
    // the start date, which is 0.9993 of a year against a 365.25-day year — and
    // BELOW one year compound is less than simple, not more. The old assertion
    // read `toBeGreaterThan(simple - 1)`, and that ₹1 of slack was the only
    // reason it passed; in paise the same slack is a hundredth as wide and the
    // test failed, which is the useful thing about storing integers.
    const twoYears = Date.parse('2028-01-01T00:00:00')
    const simple = debt({ interestRatePct: 12, interestType: 'simple' })
    const comp = debt({ interestRatePct: 12, interestType: 'compound' })
    expect(accruedInterest(comp, twoYears)).toBeGreaterThan(accruedInterest(simple, twoYears))
  })

  it('compound is BELOW simple inside the first year, as the maths says', () => {
    const simple = debt({ interestRatePct: 12, interestType: 'simple' })
    const comp = debt({ interestRatePct: 12, interestType: 'compound' })
    const sixMonths = Date.parse('2026-07-01T00:00:00')
    expect(accruedInterest(comp, sixMonths)).toBeLessThan(accruedInterest(simple, sixMonths))
  })
  it('overdue only past the due date with a balance', () => {
    const d = debt({ dueDate: '2026-12-01' })
    expect(isOverdue(d, NOW)).toBe(true)
    expect(effectiveDebtStatus(d, NOW)).toBe('overdue')
    d.payments = [{ id: 1, amountMinor: toMinor(10000), date: '2026-11-01', note: '' }]
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
    expect(s.iOwe).toBe(toMinor(5000))
    expect(s.owedToMe).toBe(toMinor(8000))
    expect(s.net).toBe(toMinor(3000))
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
      // Lifted into paise on the way through: the legacy array is the last
      // place in the app a rupee float exists.
      amountMinor: toMinor(250),
      category: 'Food',
      note: 'lunch',
      date: '2026-07-02',
      tags: [],
    })
  })
})
