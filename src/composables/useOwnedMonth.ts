// A month of one flat, owned collection (section 32).
//
// Trades, signals and expenses are three different things that are read the
// same way: `userId ==` this uid, a day-string range over the month on screen,
// ordered by that day. Written three times it would be three places to get the
// index shape wrong, and three listeners to forget to unsubscribe. Written once
// it is the only file that knows what a snapshot is.
//
// Two invariants it exists to hold:
//
//   1. Nothing queries before the collection NAMES have arrived. The name comes
//      from `Astra-users/{uid}`, so a listener opened before that document
//      resolves would query the default collection and then silently show the
//      wrong data to anyone who renamed theirs.
//   2. Every listener is scoped to one uid AND one month, both watched, and the
//      old subscription is torn down before the new one opens — so a snapshot
//      for August can never write into September's rows.

import { computed, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { DocumentData, Unsubscribe } from 'firebase/firestore'
import { loadFirestore } from '@/firebase'
import { useSettings } from '@/composables/useSettings'
import { ownedMonthQuery, type OwnedRef } from '@/services/owned'
import { monthBounds } from '@/utils/tradeMath'
import type { CollectionKey } from '@/utils/collections'

export interface OwnedMonthOptions<T> {
  /** Which configurable collection this reads. */
  key: CollectionKey
  /** The day field the month range is taken over — 'istDate' or 'date'. */
  field: string
  /** One document to one row. */
  read: (id: string, data: DocumentData) => T
  month: MaybeRefOrGetter<string>
}

export function useOwnedMonth<T extends { id: string }>(options: OwnedMonthOptions<T>) {
  const { uid, settings, ready } = useSettings()
  const monthKey = computed(() => toValue(options.month))
  const collection = computed(() => settings.value[options.key])

  const rows = ref<T[]>([]) as { value: T[] }
  const loading = ref(true)
  const error = ref('')
  /** Ids the server holds but has not acknowledged yet (section 30). */
  const pendingIds = ref<string[]>([])

  let unsub: Unsubscribe | null = null
  let token = 0

  function detach(): void {
    unsub?.()
    unsub = null
  }

  /** The handle every write in the owning composable is built from. */
  async function ref_(): Promise<OwnedRef | null> {
    const cloud = await loadFirestore()
    if (!cloud || !uid.value) return null
    return { db: cloud.db, fs: cloud.fs, collection: collection.value, uid: uid.value }
  }

  async function attach(): Promise<void> {
    detach()
    const mine = ++token
    const owner = uid.value
    const month = monthKey.value
    // Cleared before the await, not after the first snapshot: keeping the old
    // month's rows during the round trip shows August under September's heading
    // and folds it into September's totals for as long as it takes.
    rows.value = []
    pendingIds.value = []
    if (!ready.value || !owner || !month) {
      loading.value = !ready.value && Boolean(owner)
      return
    }
    loading.value = true
    const cloud = await loadFirestore()
    // The await is a window in which the uid, the month or the collection name
    // can all have changed. Without this guard the listener for what we were
    // looking at attaches after the one for what we are looking at, and wins.
    if (!cloud || mine !== token) {
      if (!cloud) {
        error.value = 'Firestore is unreachable.'
        loading.value = false
      }
      return
    }
    const { from, to } = monthBounds(month)
    const owned: OwnedRef = {
      db: cloud.db,
      fs: cloud.fs,
      collection: collection.value,
      uid: owner,
    }
    unsub = cloud.fs.onSnapshot(
      ownedMonthQuery(owned, options.field, from, to),
      // includeMetadataChanges, because the transition that matters — a row
      // going from held-locally to acknowledged — changes no data at all.
      { includeMetadataChanges: true },
      (snap) => {
        if (mine !== token) return
        rows.value = snap.docs.map((d) => options.read(d.id, d.data()))
        pendingIds.value = snap.docs.filter((d) => d.metadata.hasPendingWrites).map((d) => d.id)
        loading.value = false
      },
      (err) => {
        console.error(`[Astra] ${collection.value} listener failed:`, err)
        error.value = `Live updates for ${collection.value} stopped. Reload to reconnect.`
        loading.value = false
      },
    )
  }

  watch([uid, monthKey, collection, ready], () => void attach(), { immediate: true })
  onUnmounted(detach)

  return { rows, loading, error, pendingIds, collection, uid, settings, ready, ref: ref_, attach }
}
