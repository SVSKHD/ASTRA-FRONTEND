import { describe, expect, it } from 'vitest'
import { mergeLedgers, personalExpenses } from '@/utils/personalSpend'
import type { Expense, Txn } from '@/types'

function txn(over: Partial<Txn>): Txn {
  return {
    id: 1,
    kind: 'expense',
    scope: 'personal',
    amountMinor: 45_000,
    date: '2026-09-10',
    note: '',
    category: 'Groceries',
    tags: [],
    createdAt: 5,
    updatedAt: 5,
    ...over,
  }
}

describe('personalExpenses', () => {
  it('reads the month’s personal spending as expenses, in rupees', () => {
    const [e] = personalExpenses([txn({ method: 'upi', note: 'veg' })], '2026-09')
    expect(e).toMatchObject({
      id: 'personal-1',
      amount: 450,
      category: 'Groceries',
      note: 'veg',
      method: 'debit',
      need: 'essential',
      kind: 'one-off',
      currency: 'INR',
      source: 'personal',
    })
  })

  it('leaves out business money, income and other months', () => {
    const got = personalExpenses(
      [
        txn({ id: 1 }),
        txn({ id: 2, scope: 'business' }),
        txn({ id: 3, kind: 'income' }),
        txn({ id: 4, date: '2026-08-31' }),
      ],
      '2026-09',
    )
    expect(got.map((e) => e.id)).toEqual(['personal-1'])
  })

  it('keeps card and cash, and marks recurring occurrences as monthly', () => {
    const got = personalExpenses(
      [txn({ id: 1, method: 'card', recurringId: 9 }), txn({ id: 2, method: 'cash' })],
      '2026-09',
    )
    expect(got.map((e) => [e.method, e.kind])).toEqual([
      ['card', 'recurring'],
      ['cash', 'one-off'],
    ])
  })

  it('reads a legacy rupee row and names an empty category', () => {
    const legacy = txn({ amountMinor: undefined as unknown as number, amount: 12.5, category: '' })
    expect(personalExpenses([legacy], '2026-09')[0]).toMatchObject({
      amount: 12.5,
      category: 'Uncategorised',
    })
  })
})

describe('mergeLedgers', () => {
  it('interleaves both ledgers by date', () => {
    const own = [{ id: 'a', date: '2026-09-02', createdAt: 1 }] as Expense[]
    const personal = [
      { id: 'p1', date: '2026-09-01', createdAt: 1 },
      { id: 'p2', date: '2026-09-03', createdAt: 1 },
    ] as Expense[]
    expect(mergeLedgers(own, personal).map((e) => e.id)).toEqual(['p1', 'a', 'p2'])
  })
})
