// Per-tab count badges for the top bar. Todos and tasks count what's still
// open (their lifecycle has a "done"); the rest count what they hold, since a
// deadline, idea or stock is "pending" until it is dealt with and removed.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import type { TabKey } from '@/types'

export function useTabCounts() {
  const app = useAppStore()
  const { todos, tasks, deadlines, reminders, finances, trips, ideas, stocks } = storeToRefs(app)

  return computed<Record<TabKey, number>>(() => ({
    todo: todos.value.filter((t) => !t.done).length,
    tasks: tasks.value.filter((t) => !t.done).length,
    deadlines: deadlines.value.length,
    reminders: reminders.value.length,
    finances: finances.value.length,
    trips: trips.value.length,
    ideas: ideas.value.length,
    stocks: stocks.value.length,
  }))
}
