// Expenses (section 35), with the same four verbs as the trade log.
//
// THE MODEL, SETTLED BEFORE THE LAYOUT — because the reason an expense screen
// reads wrong is almost always that nobody decided what an expense is:
//
//   • `amount` is always POSITIVE. An expense is money spent; it has a size,
//     not a direction. A refund is not a negative expense, it is the absence of
//     one, so there is no side, no sign and no green anywhere in this feature.
//   • `date` is the day it was spent, local, and the field the month query
//     ranges over — the same shape as the trade log's `istDate`, under a
//     different name because an expense is not on a broker's clock.
//   • `kind` is 'one-off' or 'recurring', and a recurring row is STORED PER
//     MONTH like any other — the flag and `recurDay` exist so the month view
//     can offer "this repeats, log it" rather than so the app can invent rows.
//     Projected ghosts were the alternative and they are worse: a projection
//     cannot be edited or deleted, it disagrees with the total the moment the
//     real row lands, and a month showing eleven rows that do not exist is a
//     month whose figures cannot be reconciled with anything.
//   • Whether expenses net against trading profit is a SETTING, not a fact
//     about a row. A data feed nets; a grocery bill logged in the same tab does
//     not, and the app cannot tell which is which.

import { computed, onUnmounted, ref } from 'vue'
import { useOwnedMonth } from '@/composables/useOwnedMonth'
import { newId, ownedDelete, ownedMerge, ownedSet } from '@/services/owned'
import { UNDO_MS } from '@/composables/useTrades'
import { expenseDocument, readExpense, type ExpenseDraft } from '@/services/expenseDoc'
import type { Expense } from '@/types'

export function useExpenses(month: () => string) {
  const live = useOwnedMonth<Expense>({
    key: 'expensesCollection',
    field: 'date',
    read: readExpense,
    month,
  })

  const error = ref('')
  const undoable = ref<{ expense: Expense; until: number } | null>(null)
  let undoTimer: ReturnType<typeof setTimeout> | undefined

  /** What was actually spent this month, oldest first. Nothing invented. */
  const expenses = computed<Expense[]>(() =>
    live.rows.value
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id))),
  )

  /** The recurring rows in this month, which is what "repeat it" is offered from. */
  const recurring = computed(() => expenses.value.filter((e) => e.kind === 'recurring'))

  async function create(draft: ExpenseDraft): Promise<string> {
    const ref = await live.ref()
    if (!ref) {
      error.value = 'Sign in to log expenses.'
      return ''
    }
    const id = newId(ref)
    error.value = ''
    void ownedSet(ref, id, expenseDocument(draft, ref.fs)).catch((err) => {
      console.error('[Astra] Expense write refused:', err)
      error.value = 'That expense was refused. It is held locally and will retry.'
    })
    return id
  }

  async function update(id: string, patch: Partial<ExpenseDraft>): Promise<boolean> {
    const ref = await live.ref()
    const current = live.rows.value.find((e) => e.id === id)
    if (!ref || !current) return false
    try {
      await ownedMerge(ref, id, expenseDocument({ ...current, ...patch }, ref.fs))
      return true
    } catch (err) {
      console.error('[Astra] Expense update failed:', err)
      error.value = 'That change could not be saved.'
      return false
    }
  }

  async function remove(id: string): Promise<boolean> {
    const ref = await live.ref()
    const row = live.rows.value.find((e) => e.id === id)
    if (!ref || !row) return false
    clearTimeout(undoTimer)
    undoable.value = { expense: row, until: Date.now() + UNDO_MS }
    undoTimer = setTimeout(() => (undoable.value = null), UNDO_MS)
    try {
      await ownedDelete(ref, id)
      return true
    } catch (err) {
      console.error('[Astra] Expense delete failed:', err)
      undoable.value = null
      error.value = 'That expense could not be deleted.'
      return false
    }
  }

  async function undo(): Promise<boolean> {
    const held = undoable.value
    const ref = await live.ref()
    if (!held || !ref) return false
    undoable.value = null
    clearTimeout(undoTimer)
    await ownedSet(ref, held.expense.id, expenseDocument(held.expense, ref.fs))
    return true
  }

  onUnmounted(() => clearTimeout(undoTimer))

  return {
    expenses,
    recurring,
    loading: live.loading,
    listenerError: live.error,
    collection: live.collection,
    error,
    undoable,
    create,
    update,
    remove,
    undo,
  }
}
