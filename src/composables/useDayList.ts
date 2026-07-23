// The shared wiring behind the day accordion in the todo and task tabs: which
// day cards are open, which status is being filtered for, and the rows a given
// day should actually render. Both views drive the same behaviour through this,
// so the two lists cannot drift apart.
import { computed, type Ref } from 'vue'
import { useUiStore, type StatusFilter } from '@/stores/ui'
import type { DayGroup } from '@/utils/dayGroups'
import type { ItemStatus, TabKey } from '@/types'

export function useDayList<T extends { status: ItemStatus }>(
  tab: TabKey,
  groups: Ref<DayGroup<T>[]>,
) {
  const ui = useUiStore()

  // Today is the day you are working in, so it is the one card that starts
  // open. Everything else folds away until asked for.
  const defaultOpen = (key: string) => key === 'today'

  const filter = computed<StatusFilter>(() => ui.getFilter(tab))
  function setFilter(v: StatusFilter) {
    ui.setFilter(tab, v)
  }

  function isOpen(g: DayGroup<T>) {
    return ui.isDayOpen(tab, g.key, defaultOpen(g.key))
  }
  function toggle(g: DayGroup<T>) {
    ui.toggleDay(tab, g.key, defaultOpen(g.key))
  }
  // A drag heading for a folded day should not have to be aborted to open it.
  function openForDrop(g: DayGroup<T>) {
    if (!isOpen(g)) ui.setDayOpen(tab, g.key, true)
  }

  const allOpen = computed(() => groups.value.every(isOpen))
  function foldAll() {
    ui.setAllDays(
      tab,
      groups.value.map((g) => g.key),
      !allOpen.value,
    )
  }

  // Rows the filter lets through, in list order — drag defines that order, so
  // nothing is re-sorted underneath it.
  function visible(g: DayGroup<T>): T[] {
    return filter.value === 'all' ? g.items : g.items.filter((i) => i.status === filter.value)
  }
  // Distinguishes "this day is empty" from "the filter hid everything here",
  // which otherwise look identical and read as a bug.
  function hiddenBy(g: DayGroup<T>): number {
    return g.total - visible(g).length
  }

  return { filter, setFilter, isOpen, toggle, openForDrop, allOpen, foldAll, visible, hiddenBy }
}
