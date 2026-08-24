// Section 27b, acceptance 143 — the float-to-integer lift, and the property that
// makes it safe to run on every load.
import { describe, expect, it } from 'vitest'
import { migrateDebtAmounts, migrateTxnAmounts, txnMinor } from '@/utils/finance'
import { migrateFinanceSettings, resolveIncome } from '@/utils/budget'
import { toMinor } from '@/utils/money'
import { emptyFinanceSettings, type Debt, type Txn } from '@/types'

// A row as it exists on disk today: a rupee float, no amountMinor.
const legacyTxn = (amount: number): Txn =>
  ({
    id: 1,
    kind: 'expense',
    scope: 'personal',
    amount,
    date: '2026-07-10',
    note: '',
    category: 'Food',
    tags: [],
    createdAt: 0,
    updatedAt: 0,
  }) as unknown as Txn

const legacyDebt = (principal: number, payments: number[] = []): Debt =>
  ({
    id: 1,
    direction: 'owed_by_me',
    scope: 'personal',
    counterparty: 'Ravi',
    principal,
    currency: 'INR',
    startDate: '2026-01-01',
    status: 'open',
    note: '',
    tags: [],
    payments: payments.map((amount, i) => ({ id: i, amount, date: '2026-02-01', note: '' })),
    createdAt: 0,
    updatedAt: 0,
  }) as unknown as Debt

describe('lifting transactions', () => {
  it('converts the rupee float and drops it', () => {
    const { txns, changed } = migrateTxnAmounts([legacyTxn(1500.5)])
    expect(changed).toBe(true)
    expect(txns[0].amountMinor).toBe(150050)
    // Dropped, not kept in sync. Two fields holding the same number is how they
    // end up holding two different numbers.
    expect('amount' in txns[0]).toBe(false)
  })

  it('leaves an already-migrated list completely alone', () => {
    // Identity, not just equality: the store watches these arrays deeply and
    // saves on change, so returning a new array every load would write the whole
    // workspace back to Firestore on every open, forever.
    const done: Txn[] = [{ ...legacyTxn(1500), amount: undefined, amountMinor: 150000 }]
    delete (done[0] as { amount?: number }).amount
    const result = migrateTxnAmounts(done)
    expect(result.changed).toBe(false)
    expect(result.txns).toBe(done)
  })

  it('reads a legacy row correctly even before the migration runs', () => {
    // The accessor and the migration agree, so nothing has to be ordered after
    // anything else to be correct.
    expect(txnMinor(legacyTxn(450))).toBe(45000)
  })

  it('treats a row with neither field as zero rather than NaN', () => {
    expect(txnMinor({ amountMinor: undefined as unknown as number })).toBe(0)
  })
})

describe('lifting debts', () => {
  it('converts the principal and every payment', () => {
    const { debts, changed } = migrateDebtAmounts([legacyDebt(5000, [1000, 250.25])])
    expect(changed).toBe(true)
    expect(debts[0].principalMinor).toBe(500000)
    expect(debts[0].payments.map((p) => p.amountMinor)).toEqual([100000, 25025])
    expect('principal' in debts[0]).toBe(false)
    expect('amount' in debts[0].payments[0]).toBe(false)
  })

  it('migrates a debt whose principal is done but whose payments are not', () => {
    // The half-migrated shape, which a naive `if (principalMinor) return` misses
    // and which then leaves the payments reading as zero forever.
    const half = {
      ...legacyDebt(5000, [1000]),
      principalMinor: 500000,
      principal: undefined,
    } as unknown as Debt
    delete (half as { principal?: number }).principal
    const { debts, changed } = migrateDebtAmounts([half])
    expect(changed).toBe(true)
    expect(debts[0].payments[0].amountMinor).toBe(100000)
  })

  it('leaves a fully migrated list alone', () => {
    const { debts } = migrateDebtAmounts([legacyDebt(5000, [1000])])
    const second = migrateDebtAmounts(debts)
    expect(second.changed).toBe(false)
    expect(second.debts).toBe(debts)
  })
})

describe('lifting the income settings', () => {
  it('converts both the fallback and the per-month map', () => {
    const { settings, changed } = migrateFinanceSettings({
      ...emptyFinanceSettings(),
      monthlyIncome: 90000,
      incomeByMonth: { '2026-07': 85000 },
    })
    expect(changed).toBe(true)
    expect(settings.monthlyIncomeMinor).toBe(toMinor(90000))
    expect(settings.incomeByMonthMinor['2026-07']).toBe(toMinor(85000))
    expect('monthlyIncome' in settings).toBe(false)
  })

  it('is a no-op on settings that are already minor units', () => {
    const done = migrateFinanceSettings({
      ...emptyFinanceSettings(),
      monthlyIncomeMinor: toMinor(90000),
    })
    expect(done.changed).toBe(false)
    const again = migrateFinanceSettings(done.settings)
    expect(again.settings).toBe(done.settings)
  })

  it('still finds a legacy income when the new map exists but is empty', () => {
    // The bug this caught: emptyFinanceSettings() initialises incomeByMonthMinor
    // to {}, and `{} ?? legacy` is `{}` — so preferring the new field by
    // PRESENCE returned 0 for any settings object holding both. Merging, with
    // the minor entries last, finds the legacy value and still lets a migrated
    // month win over its own legacy copy.
    const mixed = {
      ...emptyFinanceSettings(),
      monthlyIncome: 90000,
      incomeByMonth: { '2026-07': 85000 },
    }
    expect(resolveIncome(mixed, '2026-07')).toBe(toMinor(85000))
    expect(resolveIncome(mixed, '2026-01')).toBe(toMinor(90000))
  })

  it('lets a migrated month override its own legacy copy', () => {
    const mixed = {
      ...emptyFinanceSettings(),
      incomeByMonth: { '2026-07': 85000 },
      incomeByMonthMinor: { '2026-07': toMinor(95000) },
    }
    expect(resolveIncome(mixed, '2026-07')).toBe(toMinor(95000))
  })
})
