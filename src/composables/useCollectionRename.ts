// The rename, driven (section 32).
//
// Kept out of the view because it is a three-step operation with a state
// between each step, and a view that owns that state ends up owning the
// recovery from a half-finished copy too. The order is fixed and the last step
// is the only destructive-looking one — and even it destroys nothing:
//
//   1. warn, in terms of what will and will not happen;
//   2. copy every row and read the destination back to prove it arrived;
//   3. switch the name in settings — and only then.
//
// If step 2 comes back short, nothing is switched. The app keeps querying the
// old name, which still has every row in it, and the user is told exactly how
// many did not arrive.

import { ref } from 'vue'
import { loadFirestore } from '@/firebase'
import { useSettings } from '@/composables/useSettings'
import { copyVerifySwitch, renameWarning } from '@/services/collectionMove'
import { collectionNameError, type CollectionKey } from '@/utils/collections'

export function useCollectionRename() {
  const store = useSettings()
  const message = ref('')
  const busy = ref(false)
  const progress = ref({ copied: 0, total: 0 })

  async function start(key: CollectionKey, next: string): Promise<boolean> {
    const invalid = collectionNameError(next)
    if (invalid) {
      message.value = invalid
      return false
    }
    const from = store.settings.value[key]
    if (from === next) return false
    const cloud = await loadFirestore()
    if (!cloud || !store.uid.value) {
      message.value = 'Not signed in — nothing was changed.'
      return false
    }
    busy.value = true
    progress.value = { copied: 0, total: 0 }
    message.value = renameWarning(from, next)
    try {
      const result = await copyVerifySwitch(
        { db: cloud.db, fs: cloud.fs, collection: from, uid: store.uid.value },
        next,
        (p) => (progress.value = p),
      )
      message.value = result.message
      // The switch happens only on a clean verify. A partial copy that switched
      // would show a half-empty month and call it the data.
      if (result.ok) await store.save({ [key]: next })
      return result.ok
    } catch (err) {
      console.error('[Astra] Rename failed:', err)
      message.value = `The copy failed, so nothing was switched. ${from} is untouched.`
      return false
    } finally {
      busy.value = false
    }
  }

  return { message, busy, progress, start, dismiss: () => (message.value = '') }
}
