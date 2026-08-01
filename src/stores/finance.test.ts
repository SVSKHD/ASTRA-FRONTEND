import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { monthTotals } from '@/utils/finance'

describe('finance store actions', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('recording a debt payment creates a linked transaction that moves Out, and deleting it reverses both', () => {
    const app = useAppStore()
    const month = '2026-07'
    const debtId = app.addDebt({
      direction: 'owed_by_me',
      counterparty: 'Ravi',
      principal: 5000,
      scope: 'personal',
      startDate: '2026-07-01',
    })

    // No outflow yet.
    expect(monthTotals(app.transactions, 'personal', month).out).toBe(0)

    app.recordDebtPayment(debtId, { amount: 2000, date: '2026-07-05' })
    const txns = app.transactions
    expect(txns).toHaveLength(1)
    expect(txns[0].debtId).toBe(debtId)
    expect(txns[0].kind).toBe('expense')
    expect(monthTotals(txns, 'personal', month).out).toBe(2000)
    expect(monthTotals(txns, 'personal', month).debtRepay).toBe(2000)

    // Deleting the linked transaction removes the payment from the debt too.
    app.deleteTxn(txns[0].id)
    expect(app.transactions).toHaveLength(0)
    expect(app.debts.find((d) => d.id === debtId)!.payments).toHaveLength(0)
  })

  it('owed-to-me payment records as income', () => {
    const app = useAppStore()
    const debtId = app.addDebt({
      direction: 'owed_to_me',
      counterparty: 'Client X',
      principal: 10000,
      scope: 'business',
      startDate: '2026-07-01',
    })
    app.recordDebtPayment(debtId, { amount: 4000, date: '2026-07-10' })
    expect(app.transactions[0].kind).toBe('income')
    expect(app.transactions[0].scope).toBe('business')
  })

  it('renaming a tag cascades to every transaction in one pass', () => {
    const app = useAppStore()
    app.ensureFinTag('trip-goa')
    app.addTxn({ kind: 'expense', amount: 100, tags: ['trip-goa'], date: '2026-07-01' })
    app.addTxn({ kind: 'expense', amount: 200, tags: ['trip-goa', 'food'], date: '2026-07-02' })
    const tag = app.financeTags.find((t) => t.name === 'trip-goa')!

    app.renameFinTag(tag.id, 'goa-2026')
    expect(app.financeTags.find((t) => t.id === tag.id)!.name).toBe('goa-2026')
    expect(app.transactions.every((t) => !t.tags.includes('trip-goa'))).toBe(true)
    expect(app.transactions.filter((t) => t.tags.includes('goa-2026'))).toHaveLength(2)
  })

  it('scope switch keeps personal and business separate', () => {
    const app = useAppStore()
    app.addTxn({ kind: 'expense', amount: 100, scope: 'personal', date: '2026-07-01' })
    app.addTxn({ kind: 'expense', amount: 500, scope: 'business', date: '2026-07-01' })
    expect(monthTotals(app.transactions, 'personal', '2026-07').out).toBe(100)
    expect(monthTotals(app.transactions, 'business', '2026-07').out).toBe(500)
    expect(monthTotals(app.transactions, 'all', '2026-07').out).toBe(600)
  })
})
