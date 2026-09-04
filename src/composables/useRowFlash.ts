// What changed, said once and quietly (section 40).
//
// A live list has a problem the static one does not: when a row updates, the
// reader was looking somewhere else. The obvious fixes are both wrong — a
// transition on the list re-animates forty rows because one moved, and a
// permanent "new" badge is a badge that is on everything by Thursday.
//
// So the row that changed is ringed for a moment and then is not. It does not
// move, nothing reflows, and a reader who happened to be looking at it sees the
// ring; one who was not sees a list that is simply correct.

import { onUnmounted, ref, watch, type Ref } from 'vue'

/** Long enough to catch the eye, short enough not to become the design. */
export const FLASH_MS = 1_400

export function useRowFlash(touched: Ref<string[]>, ms = FLASH_MS) {
  const flashing = ref<Set<string>>(new Set())
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  watch(touched, (ids) => {
    if (!ids.length) return
    const next = new Set(flashing.value)
    for (const id of ids) {
      next.add(id)
      // Re-touched while still ringed: the timer restarts rather than stacking,
      // so a row updated three times in a second rings once for a second.
      clearTimeout(timers.get(id))
      timers.set(
        id,
        setTimeout(() => {
          const after = new Set(flashing.value)
          after.delete(id)
          flashing.value = after
          timers.delete(id)
        }, ms),
      )
    }
    flashing.value = next
  })

  onUnmounted(() => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  })

  return { flashing }
}
