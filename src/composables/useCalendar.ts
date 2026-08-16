// The calendar's data layer (section 15). It turns the store's lists into
// events for the visible range, caches the ranges it has already visited, and
// owns the write-back for a drag or a resize — optimistically, through the
// section-3 sync guard, with rollback on failure.
//
// Kept out of the view so the rules are testable and the view stays markup.

import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useSyncGuard } from '@/composables/useSyncGuard'
import { tagColor } from '@/utils/tags'
import {
  buildEvents,
  unscheduledItems,
  type CalEvent,
  type CalendarFilters,
  type Range,
} from '@/utils/calendarEvents'

// A week of padding either side of the visible window, so a small navigation
// step usually lands inside a range that is already loaded.
export const RANGE_PADDING_MS = 7 * 24 * 60 * 60_000

export function paddedRange(start: number, end: number): Range {
  return { start: start - RANGE_PADDING_MS, end: end + RANGE_PADDING_MS }
}

// Whether a range is already covered by one we have built.
export function coveredBy(range: Range, visited: Range[]): boolean {
  return visited.some((v) => v.start <= range.start && v.end >= range.end)
}

// Merge a new range into the visited set, collapsing overlaps so the list stays
// short however much the user navigates.
export function mergeRanges(visited: Range[], range: Range): Range[] {
  const all = [...visited, range].sort((a, b) => a.start - b.start)
  const out: Range[] = []
  for (const r of all) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

export function useCalendar(dark: () => boolean, mono: () => boolean = () => false) {
  const app = useAppStore()
  const guard = useSyncGuard()
  const { tasks, todos, goals, goalOccurrences, reminders, calendarFilters } = storeToRefs(app)

  // The window currently being rendered, padded. Set by the view on every
  // navigation; nothing outside it is ever built.
  const range = ref<Range>(paddedRange(Date.now(), Date.now()))
  // Ranges already asked for, so a navigation back to last month does not look
  // like new work. The lists themselves are already in memory — this records
  // what has been *rendered*, which is what the perf note is really about.
  const visited = ref<Range[]>([])

  function setRange(start: number, end: number) {
    const next = paddedRange(start, end)
    range.value = next
    if (!coveredBy(next, visited.value)) visited.value = mergeRanges(visited.value, next)
  }

  const colorOf = (tag: string) => tagColor(tag, dark(), mono())

  // Built events, memoised per (range, filters, data revision). Navigating back
  // to a range already visited re-uses the last build instead of walking every
  // list again; any edit to the underlying data changes the key, so the cache
  // can never serve something stale.
  let cache: { key: string; events: CalEvent[] } | null = null

  const dataRevision = computed(
    () =>
      `${tasks.value.length}:${todos.value.length}:${goals.value.length}:` +
      `${goalOccurrences.value.length}:${reminders.value.length}:` +
      // Cheap change detector: the newest updatedAt across the lists that can be
      // edited from the grid.
      `${Math.max(
        0,
        ...tasks.value.map((t) => t.updatedAt),
        ...todos.value.map((t) => t.updatedAt),
        ...reminders.value.map((r) => r.updatedAt),
      )}`,
  )

  const events = computed<CalEvent[]>(() => {
    const key = `${range.value.start}:${range.value.end}:${JSON.stringify(calendarFilters.value)}:${dataRevision.value}`
    if (cache && cache.key === key) return cache.events
    const built = buildEvents(
      {
        tasks: tasks.value,
        todos: todos.value,
        goals: goals.value,
        occurrences: goalOccurrences.value,
        reminders: reminders.value,
        colorOf,
      },
      range.value,
      calendarFilters.value,
    )
    cache = { key, events: built }
    return built
  })

  const unscheduled = computed(() => unscheduledItems({ tasks: tasks.value, todos: todos.value }))

  function setFilters(patch: Partial<CalendarFilters>) {
    app.setCalendarFilters(patch)
  }

  return {
    range,
    visited,
    setRange,
    events,
    unscheduled,
    filters: calendarFilters,
    setFilters,
    guard,
  }
}
