import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { doneFirst, type TreeNode } from '@/utils/taskTree'
import type { ItemStatus } from '@/types'
// Leave a just-checked row in place long enough to read the tick and strike.
export const SUBTASK_TICK_MS = 560
export function useSubtaskGroups<
  T extends TreeNode & { status: ItemStatus; completedAt?: number | null },
>(items: () => T[]) {
  const held = ref(new Set<number>())
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  const clear = (id: number) => {
    clearTimeout(timers.get(id))
    timers.delete(id)
    const next = new Set(held.value)
    next.delete(id)
    held.value = next
  }
  watch(
    () => items().map((item) => [item.id, item.status] as const),
    (current, previous) => {
      const before = new Map(previous)
      const live = new Set(current.map(([id]) => id))
      for (const id of timers.keys()) if (!live.has(id)) clear(id)
      for (const [id, status] of current) {
        if (status !== 'done') {
          clear(id)
          continue
        }
        if (
          before.has(id) &&
          before.get(id) !== 'done' &&
          !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ) {
          clear(id)
          held.value = new Set(held.value).add(id)
          timers.set(
            id,
            setTimeout(() => clear(id), SUBTASK_TICK_MS),
          )
        }
      }
    },
  )
  const groups = computed(() => {
    const list = items()
    if (!list.length) return []
    const open = list.filter((item) => item.status !== 'done' || held.value.has(item.id))
    const completed = doneFirst(
      list.filter((item) => item.status === 'done' && !held.value.has(item.id)),
    )
    return [
      { key: 'open', label: 'Open subtasks', items: open },
      ...(completed.length
        ? [{ key: 'completed', label: 'Completed subtasks', items: completed }]
        : []),
    ]
  })
  onBeforeUnmount(() => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  })
  return { groups }
}
