// Reactive monthly budget for a given month key, derived from the store's
// expenses + income settings. The FinancesView and any dashboard widget consume
// this so they always show the same income / spent / remaining numbers.
//
// monthKey is a MaybeRefOrGetter so a caller can pass a static key, a ref (the
// month switcher), or a getter — the summary tracks whichever it is.

import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { computeBudget } from '@/utils/budget'

export function useMonthlyBudget(monthKey: MaybeRefOrGetter<string>) {
  const app = useAppStore()
  const { finances, financeSettings } = storeToRefs(app)

  const summary = computed(() =>
    computeBudget(finances.value, financeSettings.value, toValue(monthKey)),
  )

  return {
    summary,
    income: computed(() => summary.value.income),
    spent: computed(() => summary.value.spent),
    remaining: computed(() => summary.value.remaining),
    percentUsed: computed(() => summary.value.percentUsed),
    byCategory: computed(() => summary.value.byCategory),
  }
}
