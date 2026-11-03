// Personal spending from the Finances tab, read into the Expenses tab (35d).
//
// The two tabs keep two ledgers: Expenses its own rows, Finances a unified
// transaction list split Personal / Business. The Expenses tab adds the month's
// PERSONAL outflow in, so its totals, capital, charts and advice cover all of
// it. Business stays out — it is not this desk's money.
//
// The rows are a read-only view: they are converted to the Expense shape here,
// marked `source: 'personal'`, and edited where they live, in Finances.
import { filterTxns, txnMinor } from '@/utils/finance'
import { toMajor } from '@/utils/money'
import type { Expense, ExpenseMethod, Txn, TxnMethod } from '@/types'

/** Prefix on a converted row's id, so it can never collide with an expense's. */
export const PERSONAL_ID = 'personal-'

const METHOD: Record<TxnMethod, ExpenseMethod> = {
  card: 'card',
  cash: 'cash',
  upi: 'debit',
  bank: 'debit',
  other: 'debit',
}

/** The month's personal expenses, in the Expenses tab's shape, oldest first. */
export function personalExpenses(txns: Txn[], month: string): Expense[] {
  return filterTxns(txns, { scope: 'personal', monthKey: month, kind: 'expense' })
    .map((t): Expense => ({
      id: `${PERSONAL_ID}${t.id}`,
      userId: '',
      date: t.date,
      amount: toMajor(txnMinor(t)),
      category: t.category || 'Uncategorised',
      note: t.note || t.party || '',
      kind: t.isRecurring || t.recurringId != null ? 'recurring' : 'one-off',
      method: t.method ? METHOD[t.method] : 'debit',
      // Finances does not ask whether it was needed; essential is the
      // assumption that never calls real spending waste.
      need: 'essential',
      currency: 'INR',
      createdAt: t.createdAt ?? 0,
      source: 'personal',
    }))
    .filter((e) => e.amount > 0)
}

/** Both ledgers as one month, in date order, the way the table reads them. */
export function mergeLedgers(own: Expense[], personal: Expense[]): Expense[] {
  if (!personal.length) return own
  return [...own, ...personal].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
  )
}
