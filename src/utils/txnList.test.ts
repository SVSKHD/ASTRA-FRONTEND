// Section 27b — the list, acceptance 141.
import { describe, expect, it } from 'vitest'
import {
  applyFilters,
  closingBalance,
  emptyFilters,
  groupTransactions,
  isFiltered,
  listTotals,
  signedMinor,
} from '@/utils/txnList'
import { toMinor } from '@/utils/money'
import type { Txn } from '@/types'

let seq = 0
function txn(over: Partial<Txn> & { amount?: number }): Txn {
  const { amount, ...rest } = over
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
    ...rest,
  }
}

describe('the running balance', () => {
  it('counts up from the oldest, not down from the newest', () => {
    // The bug this exists to prevent: accumulating in DISPLAY order (newest
    // first) produces a column that counts down from the total instead of up to
    // it. Every row but one is wrong, and every row looks plausible.
    const groups = groupTransactions([
      txn({ kind: 'income', amount: 1000, date: '2026-07-01' }),
      txn({ kind: 'expense', amount: 300, date: '2026-07-02' }),
      txn({ kind: 'expense', amount: 200, date: '2026-07-03' }),
    ])
    const balances = groups[0].days.map((d) => d.rows[0].balanceMinor)
    // Days are newest first: the 3rd, the 2nd, the 1st.
    expect(balances).toEqual([toMinor(500), toMinor(700), toMinor(1000)])
  })

  it('carries in an opening balance, so filtering a month does not imply an empty account', () => {
    const groups = groupTransactions(
      [txn({ kind: 'expense', amount: 200, date: '2026-07-01' })],
      toMinor(5000),
    )
    expect(groups[0].days[0].rows[0].balanceMinor).toBe(toMinor(4800))
  })

  it('keeps same-day entries in the order they were entered', () => {
    // Two rows on one date have no date to sort by, so the id decides. Without
    // that, the balance column reorders itself between renders.
    const a = txn({ kind: 'expense', amount: 100, date: '2026-07-01' })
    const b = txn({ kind: 'expense', amount: 400, date: '2026-07-01' })
    const groups = groupTransactions([b, a])
    // Displayed newest-first within the day, so b (entered second) is on top
    // and carries the later balance.
    expect(groups[0].days[0].rows.map((r) => r.txn.id)).toEqual([b.id, a.id])
    expect(groups[0].days[0].rows[0].balanceMinor).toBe(toMinor(-500))
    expect(groups[0].days[0].rows[1].balanceMinor).toBe(toMinor(-100))
  })

  it('reports the closing balance as the newest row', () => {
    const groups = groupTransactions([
      txn({ kind: 'income', amount: 1000, date: '2026-07-01' }),
      txn({ kind: 'expense', amount: 250, date: '2026-08-01' }),
    ])
    expect(closingBalance(groups)).toBe(toMinor(750))
  })

  it('reports the opening balance for an empty list rather than zero', () => {
    expect(closingBalance([], toMinor(900))).toBe(toMinor(900))
  })
})

describe('the grouping', () => {
  it('nests days inside months, newest first', () => {
    const groups = groupTransactions([
      txn({ date: '2026-06-15' }),
      txn({ date: '2026-07-01' }),
      txn({ date: '2026-07-20' }),
    ])
    expect(groups.map((g) => g.monthKey)).toEqual(['2026-07', '2026-06'])
    expect(groups[0].days.map((d) => d.date)).toEqual(['2026-07-20', '2026-07-01'])
  })

  it('subtotals each day and each month as a net, not a sum of magnitudes', () => {
    const groups = groupTransactions([
      txn({ kind: 'income', amount: 1000, date: '2026-07-01' }),
      txn({ kind: 'expense', amount: 400, date: '2026-07-01' }),
    ])
    expect(groups[0].days[0].subtotalMinor).toBe(toMinor(600))
    expect(groups[0].subtotalMinor).toBe(toMinor(600))
  })

  it('signs an expense negative, so summing IS netting', () => {
    expect(signedMinor(txn({ kind: 'expense', amount: 100 }))).toBe(toMinor(-100))
    expect(signedMinor(txn({ kind: 'income', amount: 100 }))).toBe(toMinor(100))
  })

  it('handles an empty list', () => {
    expect(groupTransactions([])).toEqual([])
  })
})

describe('filtering', () => {
  const rows = [
    txn({
      id: 1,
      amount: 500,
      date: '2026-07-01',
      category: 'Food',
      method: 'upi',
      tags: ['work'],
    }),
    txn({ id: 2, amount: 5000, date: '2026-07-15', category: 'Rent', method: 'bank' }),
    txn({ id: 3, kind: 'income', amount: 85000, date: '2026-07-05', category: 'Salary' }),
    txn({ id: 4, amount: 200, date: '2026-08-02', category: 'Food', scope: 'business' }),
  ]
  const f = (over: Partial<ReturnType<typeof emptyFilters>>) => ({ ...emptyFilters(), ...over })
  const ids = (filters: ReturnType<typeof emptyFilters>) =>
    applyFilters(rows, filters).map((t) => t.id)

  it('passes everything through by default', () => {
    expect(ids(emptyFilters())).toHaveLength(4)
    expect(isFiltered(emptyFilters())).toBe(false)
  })

  it('bounds the date range inclusively at both ends', () => {
    expect(ids(f({ from: '2026-07-01', to: '2026-07-15' }))).toEqual([1, 2, 3])
    expect(ids(f({ from: '2026-07-02' }))).toEqual([2, 3, 4])
  })

  it('takes ANY of the chosen tags, not all of them', () => {
    // Filtering by "goa" and "work" means both trips, not the transactions that
    // were somehow both.
    expect(ids(f({ tags: ['work', 'goa'] }))).toEqual([1])
  })

  it('filters by category, method, kind and scope', () => {
    expect(ids(f({ categories: ['Food'] }))).toEqual([1, 4])
    expect(ids(f({ methods: ['bank'] }))).toEqual([2])
    expect(ids(f({ kind: 'income' }))).toEqual([3])
    expect(ids(f({ scope: 'business' }))).toEqual([4])
  })

  it('excludes a row with no method when a method is chosen', () => {
    expect(ids(f({ methods: ['upi'] }))).toEqual([1])
  })

  it('bounds the amount, treating 0 as "no bound"', () => {
    // 0 must not mean "amounts of at most nothing", or setting a minimum and
    // clearing it again would empty the list.
    expect(ids(f({ minMinor: toMinor(1000) }))).toEqual([2, 3])
    expect(ids(f({ maxMinor: toMinor(1000) }))).toEqual([1, 4])
    expect(ids(f({ minMinor: 0, maxMinor: 0 }))).toHaveLength(4)
  })

  it('searches the fields a person would remember, and not the amount', () => {
    // "500" would match ₹500, ₹1,500 and ₹500,000. Three unrelated rows for an
    // exact recollection is worse than none.
    const noted = [txn({ id: 9, amount: 500, note: 'Coffee with Ravi' })]
    expect(applyFilters(noted, f({ search: 'ravi' })).map((t) => t.id)).toEqual([9])
    expect(applyFilters(noted, f({ search: 'COFFEE' })).map((t) => t.id)).toEqual([9])
    expect(applyFilters(noted, f({ search: '500' }))).toEqual([])
  })

  it('knows when it is narrowing anything', () => {
    expect(isFiltered(f({ search: '  ' }))).toBe(false)
    expect(isFiltered(f({ search: 'x' }))).toBe(true)
    expect(isFiltered(f({ categories: ['Food'] }))).toBe(true)
    expect(isFiltered(f({ minMinor: 1 }))).toBe(true)
  })
})

describe('the totals strip', () => {
  it('reports in, out and net separately', () => {
    const t = listTotals([
      txn({ kind: 'income', amount: 1000 }),
      txn({ kind: 'expense', amount: 400 }),
      txn({ kind: 'expense', amount: 100 }),
    ])
    expect(t.inMinor).toBe(toMinor(1000))
    expect(t.outMinor).toBe(toMinor(500))
    expect(t.netMinor).toBe(toMinor(500))
    expect(t.count).toBe(3)
  })

  it('is all zeros on an empty list, not NaN', () => {
    expect(listTotals([])).toEqual({ inMinor: 0, outMinor: 0, netMinor: 0, count: 0 })
  })
})
