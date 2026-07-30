// Reactive connectivity + sync state, shared by the status pill, the app shell
// and the share button. Consumed everywhere so they agree on one truth.
//
//   isOnline     navigator.onLine AND the workspace snapshot is not stuck on
//                cache (a connected-but-dead network still reads as offline).
//   isSyncing    true while there are pending writes and we are online.
//   pendingCount count of items with unsynced local changes.
//   lastSyncedAt when the pending count last drained to zero.
//
// The browser online/offline listeners are wired once at module scope so any
// number of consumers share a single source rather than each attaching their
// own.

import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { deriveOnline, deriveSyncing } from '@/utils/sync'

const navigatorOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine !== false : true)
let wired = false
function wireOnce() {
  if (wired || typeof window === 'undefined') return
  wired = true
  window.addEventListener('online', () => (navigatorOnline.value = true))
  window.addEventListener('offline', () => (navigatorOnline.value = false))
}

export function useConnectivity() {
  wireOnce()
  const app = useAppStore()
  const { syncFromCache, pendingCount, lastSyncedAt } = storeToRefs(app)

  const isOnline = computed(() => deriveOnline(navigatorOnline.value, syncFromCache.value))
  const isSyncing = computed(() => deriveSyncing(pendingCount.value, isOnline.value))

  return {
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncedAt,
    retry: () => app.retrySync(),
  }
}
