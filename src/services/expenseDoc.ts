// One expense, in both directions (section 35). Split from the composable for
// the same reason `tradeDoc` is: reading and writing are one contract, and they
// are pure, so the shape can be tested without a database.

import type { DocumentData } from 'firebase/firestore'
import { round2 } from '@/utils/tradeMath'
import type { Expense, ExpenseKind, ExpenseMethod, ExpenseNeed } from '@/types'

export interface ExpenseDraft {
  date: string
  amount: number
  category: string
  note: string
  kind: ExpenseKind
  recurDay?: number
  /** Defaults to 'debit' — invents no card debt. */
  method?: ExpenseMethod
  /** Defaults to 'essential' — calls nothing waste. */
  need?: ExpenseNeed
  /** Defaults to INR, the base currency `amount` is always in. */
  currency?: string
  /** Foreign only: what was paid, in `currency`. */
  originalAmount?: number
  /** Foreign only: INR per one unit of `currency`. */
  fxRate?: number
}

const METHODS: readonly ExpenseMethod[] = ['card', 'debit', 'cash']
const NEEDS: readonly ExpenseNeed[] = ['essential', 'lifestyle', 'avoidable']
const BASE = 'INR'

function currencyOf(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/.test(code) ? code : BASE
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function millis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis(): number }).toMillis()
  }
  return typeof value === 'number' ? value : 0
}

export function readExpense(id: string, data: DocumentData): Expense {
  const currency = currencyOf(data.currency)
  const foreign = currency !== BASE
  return {
    id,
    userId: String(data.userId ?? ''),
    date: String(data.date ?? ''),
    // Absolute on read as well as on write: a negative amount from a hand edit
    // is a size that was typed with a sign, not an income.
    amount: Math.abs(num(data.amount)),
    category: String(data.category ?? 'Other'),
    note: String(data.note ?? ''),
    kind: data.kind === 'recurring' ? 'recurring' : 'one-off',
    recurDay: typeof data.recurDay === 'number' ? data.recurDay : undefined,
    // A row that predates these fields (or came through a backend that does
    // not store them) reads as paid from the bank, essential, in INR.
    method: METHODS.includes(data.method) ? (data.method as ExpenseMethod) : 'debit',
    need: NEEDS.includes(data.need) ? (data.need as ExpenseNeed) : 'essential',
    currency,
    originalAmount: foreign ? positive(data.originalAmount) : undefined,
    fxRate: foreign ? positive(data.fxRate) : undefined,
    createdAt: millis(data.createdAt),
  }
}

export function expenseDocument(
  draft: ExpenseDraft,
  fs: { serverTimestamp: () => unknown },
): Record<string, unknown> {
  const currency = currencyOf(draft.currency)
  const foreign = currency !== BASE
  return {
    date: draft.date,
    amount: round2(Math.abs(draft.amount)),
    category: draft.category.trim() || 'Other',
    note: draft.note,
    kind: draft.kind,
    // The day of the month it repeats on, taken from the date it was first
    // logged when nobody said otherwise.
    recurDay: draft.kind === 'recurring' ? (draft.recurDay ?? Number(draft.date.slice(8))) : null,
    method: draft.method ?? 'debit',
    need: draft.need ?? 'essential',
    currency,
    // Nulls, not absent keys: a merge must overwrite an old conversion when an
    // expense is set back to INR.
    originalAmount: foreign ? (positive(draft.originalAmount) ?? null) : null,
    fxRate: foreign ? (positive(draft.fxRate) ?? null) : null,
    createdAt: fs.serverTimestamp(),
  }
}
