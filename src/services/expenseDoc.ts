// One expense, in both directions (section 35). Split from the composable for
// the same reason `tradeDoc` is: reading and writing are one contract, and they
// are pure, so the shape can be tested without a database.

import type { DocumentData } from 'firebase/firestore'
import { round2 } from '@/utils/tradeMath'
import type { Expense, ExpenseKind } from '@/types'

export interface ExpenseDraft {
  date: string
  amount: number
  category: string
  note: string
  kind: ExpenseKind
  recurDay?: number
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
    createdAt: millis(data.createdAt),
  }
}

export function expenseDocument(
  draft: ExpenseDraft,
  fs: { serverTimestamp: () => unknown },
): Record<string, unknown> {
  return {
    date: draft.date,
    amount: round2(Math.abs(draft.amount)),
    category: draft.category.trim() || 'Other',
    note: draft.note,
    kind: draft.kind,
    // The day of the month it repeats on, taken from the date it was first
    // logged when nobody said otherwise.
    recurDay: draft.kind === 'recurring' ? (draft.recurDay ?? Number(draft.date.slice(8))) : null,
    createdAt: fs.serverTimestamp(),
  }
}
