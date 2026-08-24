import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { debtOutstanding, monthTotals } from '@/utils/finance'
import { serializeTxnRecurrence } from '@/utils/txnRecurring'
import { toMinor } from '@/utils/money'

// Money crosses the store in integer minor units (acceptance 143), so the
// amounts below are written as toMinor(rupees) rather than as raw paise: the
// unit is stated at every call instead of being a factor of 100 to remember.

describe('finance store actions', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('recording a debt payment creates a linked transaction that moves Out, and deleting it reverses both', () => {
    const app = useAppStore()
    const month = '2026-07'
    const debtId = app.addDebt({
      direction: 'owed_by_me',
      counterparty: 'Ravi',
      principalMinor: toMinor(5000),
      scope: 'personal',
      startDate: '2026-07-01',
    })

    // No outflow yet.
    expect(monthTotals(app.transactions, 'personal', month).out).toBe(0)

    app.recordDebtPayment(debtId, { amountMinor: toMinor(2000), date: '2026-07-05' })
    const txns = app.transactions
    expect(txns).toHaveLength(1)
    expect(txns[0].debtId).toBe(debtId)
    expect(txns[0].kind).toBe('expense')
    expect(monthTotals(txns, 'personal', month).out).toBe(toMinor(2000))
    expect(monthTotals(txns, 'personal', month).debtRepay).toBe(toMinor(2000))

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
      principalMinor: toMinor(10000),
      scope: 'business',
      startDate: '2026-07-01',
    })
    app.recordDebtPayment(debtId, { amountMinor: toMinor(4000), date: '2026-07-10' })
    expect(app.transactions[0].kind).toBe('income')
    expect(app.transactions[0].scope).toBe('business')
  })

  it('renaming a tag cascades to every transaction in one pass', () => {
    const app = useAppStore()
    app.ensureFinTag('trip-goa')
    app.addTxn({
      kind: 'expense',
      amountMinor: toMinor(100),
      tags: ['trip-goa'],
      date: '2026-07-01',
    })
    app.addTxn({
      kind: 'expense',
      amountMinor: toMinor(200),
      tags: ['trip-goa', 'food'],
      date: '2026-07-02',
    })
    const tag = app.financeTags.find((t) => t.name === 'trip-goa')!

    app.renameFinTag(tag.id, 'goa-2026')
    expect(app.financeTags.find((t) => t.id === tag.id)!.name).toBe('goa-2026')
    expect(app.transactions.every((t) => !t.tags.includes('trip-goa'))).toBe(true)
    expect(app.transactions.filter((t) => t.tags.includes('goa-2026'))).toHaveLength(2)
  })

  it('scope switch keeps personal and business separate', () => {
    const app = useAppStore()
    app.addTxn({
      kind: 'expense',
      amountMinor: toMinor(100),
      scope: 'personal',
      date: '2026-07-01',
    })
    app.addTxn({
      kind: 'expense',
      amountMinor: toMinor(500),
      scope: 'business',
      date: '2026-07-01',
    })
    expect(monthTotals(app.transactions, 'personal', '2026-07').out).toBe(toMinor(100))
    expect(monthTotals(app.transactions, 'business', '2026-07').out).toBe(toMinor(500))
    expect(monthTotals(app.transactions, 'all', '2026-07').out).toBe(toMinor(600))
  })
})

describe('recurring transactions (section 27b)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function addTemplate(app: ReturnType<typeof useAppStore>, dayOfMonth: number) {
    return app.addTxn({
      kind: 'expense',
      amountMinor: toMinor(45000),
      date: '2026-01-05',
      note: 'Rent',
      category: 'Rent',
      isRecurring: true,
      recurrenceRule: serializeTxnRecurrence({
        enabled: true,
        freq: 'monthly',
        daysOfWeek: [],
        timeOfDay: '09:00',
        timezone: 'Asia/Kolkata',
        startDate: '2026-01-01',
        endDate: null,
        dayOfMonth,
      }),
    })
  }

  it('materialises one row per firing date, and none the second time', () => {
    // Idempotence is the whole design. An occurrence is real money in a real
    // total: posting one twice is a month that says the rent was paid twice.
    const app = useAppStore()
    const templateId = addTemplate(app, 5)

    expect(app.generateRecurringTxns('2026-03-31')).toBe(3)
    expect(app.generateRecurringTxns('2026-03-31')).toBe(0)

    const generated = app.transactions.filter((t) => t.recurringId === templateId)
    expect(generated.map((t) => t.date)).toEqual(['2026-01-05', '2026-02-05', '2026-03-05'])
    expect(app.transactions.filter((t) => t.isRecurring)).toHaveLength(1)
  })

  it('lands the whole series in one pass, so a save cannot catch it half-written', () => {
    const app = useAppStore()
    addTemplate(app, 5)
    const before = app.transactions.length
    app.generateRecurringTxns('2026-03-31')
    // Synchronous: the deep watcher's single debounced save covers all of it.
    expect(app.transactions.length).toBe(before + 3)
  })

  it('ignores a template whose rule will not parse', () => {
    const app = useAppStore()
    app.addTxn({
      kind: 'expense',
      amountMinor: toMinor(100),
      date: '2026-01-05',
      isRecurring: true,
      recurrenceRule: 'not json',
    })
    expect(app.generateRecurringTxns('2026-12-31')).toBe(0)
  })

  it('does nothing at all when there are no templates', () => {
    expect(useAppStore().generateRecurringTxns('2026-12-31')).toBe(0)
  })
})

describe('recording a settlement (section 27b)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('writes a linked transaction and decrements the outstanding in one action', () => {
    const app = useAppStore()
    const debtId = app.addDebt({
      direction: 'owed_by_me',
      counterparty: 'Ravi',
      principalMinor: toMinor(10000),
      scope: 'personal',
      startDate: '2026-07-01',
    })
    const before = debtOutstanding(app.debts[0], Date.parse('2026-07-31T00:00:00'))
    app.recordDebtPayment(debtId, { amountMinor: toMinor(4000), date: '2026-07-10' })

    const after = debtOutstanding(app.debts[0], Date.parse('2026-07-31T00:00:00'))
    expect(after).toBe(before - toMinor(4000))
    // The two sides reference each other, which is what lets deleting either
    // one unwind the other.
    const txn = app.transactions.find((t) => t.debtId === debtId)
    expect(txn).toBeDefined()
    expect(app.debts[0].payments[0].transactionId).toBe(txn!.id)
  })

  it('auto-settles once the balance reaches zero', () => {
    const app = useAppStore()
    const debtId = app.addDebt({
      direction: 'owed_by_me',
      counterparty: 'Ravi',
      principalMinor: toMinor(10000),
      scope: 'personal',
      startDate: '2026-07-01',
    })
    app.recordDebtPayment(debtId, { amountMinor: toMinor(10000), date: '2026-07-10' })
    expect(app.debts[0].status).toBe('settled')
  })

  it('refuses a zero or negative settlement rather than writing an empty row', () => {
    const app = useAppStore()
    const debtId = app.addDebt({
      direction: 'owed_by_me',
      counterparty: 'Ravi',
      principalMinor: toMinor(10000),
      scope: 'personal',
      startDate: '2026-07-01',
    })
    app.recordDebtPayment(debtId, { amountMinor: 0 })
    app.recordDebtPayment(debtId, { amountMinor: -500 })
    expect(app.transactions).toHaveLength(0)
  })
})
