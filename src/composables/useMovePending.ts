// "Move pending to today" for one collection ('todos' | 'tasks'), shared by the
// MovePendingButton wherever it is dropped. The collection key alone selects the
// eligibility rule, the store list and the field a move re-stamps — everything
// else (batching, progress, undo, idempotency, offline handling) is the same
// store code underneath, so the two collections behave identically and stay
// independent.
//
// Returns:
//   eligible   the exact overdue-and-not-done items a run would move
//   count      eligible.length (the badge)
//   isRunning  true for the whole operation (guards against double-fire)
//   progress   { done, total } as batches complete (real writes, not a timer)
//   run()      performs the move, resolving to { moved, failed }
//   undo()     restores the last run's items to their previous day

import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'

export type CollectionKey = 'todos' | 'tasks'

export function useMovePending(collectionKey: CollectionKey) {
  const app = useAppStore()
  const ui = useUiStore()
  const { now } = storeToRefs(ui)

  // Reading now.value re-files the list at midnight (the store resolves "today"
  // off the real clock, so the tick is what triggers recomputation).
  const eligible = computed(() => {
    void now.value
    return app.pendingOverdue(collectionKey)
  })
  const count = computed(() => eligible.value.length)

  const isRunning = ref(false)
  const progress = ref<{ done: number; total: number }>({ done: 0, total: 0 })
  let lastRestore: Awaited<ReturnType<typeof app.movePendingToToday>>['restore'] = []

  async function run() {
    if (isRunning.value || count.value === 0) return { moved: 0, failed: 0 }
    isRunning.value = true
    progress.value = { done: 0, total: count.value }
    try {
      const res = await app.movePendingToToday(collectionKey, (done, total) => {
        progress.value = { done, total }
      })
      lastRestore = res.restore
      return { moved: res.moved, failed: res.failed }
    } finally {
      isRunning.value = false
    }
  }

  function undo() {
    if (!lastRestore.length) return
    app.undoMovePending(collectionKey, lastRestore)
    lastRestore = []
  }

  return { eligible, count, isRunning, progress, run, undo }
}
