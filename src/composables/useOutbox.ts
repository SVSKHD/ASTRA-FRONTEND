// Replaying what the server refused (section 30, kept through section 32).
//
// The distinction this rests on has not changed: with `persistentLocalCache`, a
// write made with no network is durable in IndexedDB, replays itself and never
// rejects — so it needs nothing from us. A write the server actively REFUSES is
// the opposite: rules that have not been deployed, an index that does not exist
// yet, a payload it will not take. Those are fixable out of band, and while
// somebody fixes them the trade must not evaporate.
//
// Replay is automatic — on `online`, on mount, and on a 30-second sweep while
// anything is parked. Never a button: a queue somebody has to remember to flush
// is a queue that does not get flushed.

import { onMounted, onUnmounted, ref } from 'vue'
import { loadFirestore } from '@/firebase'
import { useSettings } from '@/composables/useSettings'
import {
  MAX_ATTEMPTS,
  discardOutbox,
  isDue,
  listOutbox,
  queueFailure,
  removeOutbox,
  type OutboxEntry,
} from '@/services/outbox'

/** Long enough not to hammer, short enough that a fix is noticed. */
const SWEEP_MS = 30_000

export function useOutbox() {
  const { uid } = useSettings()
  const entries = ref<OutboxEntry[]>([])
  const message = ref('')
  let timer: ReturnType<typeof setInterval> | undefined

  async function refresh(): Promise<void> {
    entries.value = (await listOutbox()).filter((e) => e.uid === uid.value)
  }

  async function flush(): Promise<void> {
    if (!uid.value) return
    const cloud = await loadFirestore()
    if (!cloud) return
    const { db, fs } = cloud
    for (const entry of await listOutbox()) {
      if (entry.uid !== uid.value || !isDue(entry)) continue
      try {
        // `setDoc` at the entry's own id: a replay of something that did land is
        // an overwrite with identical content, not a second trade.
        await fs.setDoc(fs.doc(db, entry.collection, entry.id), entry.payload)
        // Removed only after the acknowledgement, never before.
        await removeOutbox(entry.id)
      } catch (err) {
        const code =
          typeof err === 'object' && err && 'code' in err
            ? String((err as { code: unknown }).code)
            : 'unknown'
        const stored = await queueFailure(entry, code)
        message.value = stored.blocked
          ? `A write was refused ${MAX_ATTEMPTS} times (${code}). It is held below — discard it once you have dealt with the cause.`
          : `Firestore refused a write (${code}). It is queued and will be retried.`
      }
    }
    await refresh()
  }

  async function discard(id: string): Promise<void> {
    await discardOutbox(id)
    await refresh()
  }

  function onOnline(): void {
    void flush()
  }

  onMounted(() => {
    void refresh().then(() => flush())
    globalThis.window?.addEventListener('online', onOnline)
    // Costs nothing when the outbox is empty, which is the normal case.
    timer = setInterval(() => {
      if (entries.value.length) void flush()
    }, SWEEP_MS)
  })

  onUnmounted(() => {
    clearInterval(timer)
    globalThis.window?.removeEventListener('online', onOnline)
  })

  return { entries, message, refresh, flush, discard }
}
