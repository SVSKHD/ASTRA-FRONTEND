// The "why is this empty" button, wired up.
//
// On demand, never on mount. It is a handful of extra reads and it exists for
// the moment somebody is staring at a blank month wondering whether the app is
// broken — not for every load of the tab.

import { ref } from 'vue'
import { loadFirestore } from '@/firebase'
import { useSettings } from '@/composables/useSettings'
import { probeCollection, type ProbeReport } from '@/services/collectionProbe'
import type { CollectionKey } from '@/utils/collections'

export interface ProbeInput {
  key: CollectionKey
  /** The day field the month ranges over — 'istDate' on trades, 'date' elsewhere. */
  field: string
  from: () => string
  to: () => string
}

export function useCollectionProbe(input: ProbeInput) {
  const store = useSettings()
  const report = ref<ProbeReport | null>(null)
  const busy = ref(false)
  const error = ref('')

  async function run(): Promise<void> {
    busy.value = true
    error.value = ''
    report.value = null
    try {
      const cloud = await loadFirestore()
      if (!cloud) {
        error.value = 'Firestore is not available in this build — check the VITE_FIREBASE_* values.'
        return
      }
      if (!store.uid.value) {
        error.value = 'Not signed in, so there is nothing to query for.'
        return
      }
      if (!store.ready.value) {
        error.value =
          'The collection names have not arrived from Astra-users yet, so nothing has been queried. ' +
          'If this persists, the settings document is the thing to look at.'
        return
      }
      report.value = await probeCollection({
        ref: {
          db: cloud.db,
          fs: cloud.fs,
          collection: store.settings.value[input.key],
          uid: store.uid.value,
        },
        key: input.key,
        field: input.field,
        from: input.from(),
        to: input.to(),
      })
    } catch (err) {
      console.error('[Astra] Collection probe failed:', err)
      error.value = 'The check itself failed. The browser console has the error.'
    } finally {
      busy.value = false
    }
  }

  function clear(): void {
    report.value = null
    error.value = ''
  }

  return { report, busy, error, run, clear }
}
