// Reactive monthly overview for a given month key, plus the previous month for
// the comparison row. Derived from the store's in-memory collections (this app
// syncs one workspace doc, so there are no month-bounded Firestore queries — the
// filtering is the same shape, done in computeMonthlyOverview). A single
// monthKey ref drives the selector, all four cards and the comparison row.

import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { computeMonthlyOverview, type OverviewInput } from '@/utils/overview'
import { shiftMonth } from '@/utils/budget'

export function useMonthlyOverview(monthKey: MaybeRefOrGetter<string>) {
  const app = useAppStore()
  const { todos, tasks, reminders, finances, financeSettings } = storeToRefs(app)

  const input = computed<OverviewInput>(() => ({
    todos: todos.value,
    tasks: tasks.value,
    reminders: reminders.value,
    finances: finances.value,
    settings: financeSettings.value,
  }))

  const overview = computed(() => computeMonthlyOverview(input.value, toValue(monthKey)))
  const previous = computed(() =>
    computeMonthlyOverview(input.value, shiftMonth(toValue(monthKey), -1)),
  )

  return { overview, previous }
}
