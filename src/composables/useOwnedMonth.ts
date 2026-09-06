// A month of one flat, owned collection (section 32).
//
// Trades, signals, expenses and the secured ledger are four different things
// that are read the same way: `userId ==` this uid, a day-string range over the
// month on screen, ordered by that day. Written four times it would be four
// places to get the index shape wrong, and four listeners to forget to
// unsubscribe. Written once it is the only file that knows what a snapshot is.
//
// Three invariants it exists to hold:
//
//   1. Nothing queries before the collection NAMES have arrived. The name comes
//      from `Astra-users/{uid}`, so a listener opened before that document
//      resolves would query the default collection and then silently show the
//      wrong data to anyone who renamed theirs.
//   2. Every listener is scoped to one uid AND one month, both watched, and the
//      old subscription is torn down before the new one opens — so a snapshot
//      for August can never write into September's rows.
//   3. ONE LISTENER PER (uid, collection, month), SHARED, AND IT SURVIVES A TAB
//      CHANGE. Every caller used to get private refs and a private
//      subscription, so the Dashboard and the Trades tab each opened their own
//      listener on the same month, and switching tabs tore the listener down,
//      threw the rows away, and made the reader watch a skeleton while
//      Firestore re-sent bytes the app had just discarded. The rows now live in
//      a module-level cache keyed by what identifies them; a caller borrows an
//      entry and gives it back. Coming back to a tab renders what is already
//      known in the same tick, and re-attaches underneath.
//
// The cache is keyed by uid as well as by collection and month, so one account
// can never be shown another's rows; entries belonging to any other uid are
// dropped the moment the signed-in uid changes.

import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import type { DocumentData, Unsubscribe } from 'firebase/firestore'
import { loadFirestore } from '@/firebase'
import { useSettings } from '@/composables/useSettings'
import { errorCode, ownedMonthQuery, type OwnedRef } from '@/services/owned'
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

/**
 * How long a month with no readers keeps its listener open.
 *
 * Not zero, because the commonest thing a reader does after leaving the Trades
 * tab is come back to it, and a listener that is still attached makes that free
 * — no query, no round trip, no skeleton. Not forever either: a session that
 * pages through a year of months would otherwise hold twelve subscriptions open
 * for the rest of the day.
 */
export const IDLE_DETACH_MS = 5 * 60_000

/**
 * How many months are remembered at once, across every collection.
 *
 * The rows outlive the listener on purpose — a detached entry is still the
 * fastest possible first paint for the month it holds — so this bounds that
 * memory rather than the number of subscriptions.
 */
export const MAX_CACHED_MONTHS = 16

interface CacheEntry {
  key: string
  uid: string
  collection: string
  field: string
  month: string
  read: (id: string, data: DocumentData) => unknown
  rows: Ref<unknown[]>
  loading: Ref<boolean>
  error: Ref<string>
  pendingIds: Ref<string[]>
  /** True once a snapshot for this exact key has landed at least once. */
  fetched: Ref<boolean>
  /** How many mounted callers are reading it right now. */
  readers: number
  unsub: Unsubscribe | null
  /** Guards the await inside `attach`: a stale resolution loses to a newer one. */
  token: number
  idle: ReturnType<typeof setTimeout> | null
  /** For the LRU eviction below. */
  touched: number
}

const CACHE = new Map<string, CacheEntry>()

function cacheKey(uid: string, collection: string, field: string, month: string): string {
  return uid + '|' + collection + '|' + field + '|' + month
}

function detach(entry: CacheEntry): void {
  entry.unsub?.()
  entry.unsub = null
  // Bumped so a snapshot already in flight for the torn-down subscription
  // cannot write into the entry after it was let go.
  entry.token++
}

function drop(entry: CacheEntry): void {
  if (entry.idle) clearTimeout(entry.idle)
  entry.idle = null
  detach(entry)
  CACHE.delete(entry.key)
}

/** Keep the cache bounded, oldest-untouched first, and never evict a live one. */
function evictIfNeeded(): void {
  if (CACHE.size <= MAX_CACHED_MONTHS) return
  const idle = [...CACHE.values()]
    .filter((e) => e.readers === 0)
    .sort((a, b) => a.touched - b.touched)
  for (const entry of idle) {
    if (CACHE.size <= MAX_CACHED_MONTHS) return
    drop(entry)
  }
}

/**
 * Everything that does not belong to this uid, gone.
 *
 * Called on every uid change, sign-out included. The key already makes another
 * account's rows unreachable — this is about not holding them in memory once
 * the account that owns them is no longer the one signed in.
 */
function purgeOtherUsers(uid: string): void {
  for (const entry of [...CACHE.values()]) if (entry.uid !== uid) drop(entry)
}

/** Test seam, and the sign-out path: forget every month and stop every listener. */
export function resetOwnedMonths(): void {
  for (const entry of [...CACHE.values()]) drop(entry)
}

/** What a listener failure actually means, per code. */
export function listenerMessage(collection: string, code: string): string {
  if (code === 'failed-precondition') {
    return (
      `${collection} needs a composite index for this query (userId + the day field). ` +
      'Open the browser console — Firestore prints the URL that creates it — or deploy ' +
      'firestore.indexes.json. Reloading will not help until the index exists.'
    )
  }
  if (code === 'permission-denied') {
    return (
      `The rules refused to read ${collection}. Every row must carry userId equal to the signed-in ` +
      'account; a row written without it cannot be read back, even by whoever wrote it.'
    )
  }
  if (code === 'unavailable') {
    return `${collection} is offline. Rows already cached are still shown, and it will catch up on reconnect.`
  }
  return `Live updates for ${collection} stopped (${code}). Reload to reconnect.`
}

async function attach(entry: CacheEntry): Promise<void> {
  detach(entry)
  const mine = entry.token
  // A month that has been fetched before is NOT "loading" while it re-attaches:
  // it has rows, they are on screen, and they are about to be confirmed.
  entry.loading.value = !entry.fetched.value
  const cloud = await loadFirestore()
  // The await is a window in which this entry can have been dropped or
  // re-attached. Without this guard the listener for what we were looking at
  // attaches after the one for what we are looking at, and wins.
  if (mine !== entry.token) return
  if (!cloud) {
    entry.error.value = 'Firestore is unreachable.'
    entry.loading.value = false
    return
  }
  const { from, to } = monthBounds(entry.month)
  const owned: OwnedRef = {
    db: cloud.db,
    fs: cloud.fs,
    collection: entry.collection,
    uid: entry.uid,
  }
  entry.unsub = cloud.fs.onSnapshot(
    ownedMonthQuery(owned, entry.field, from, to),
    // includeMetadataChanges, because the transition that matters — a row going
    // from held-locally to acknowledged — changes no data at all.
    { includeMetadataChanges: true },
    (snap) => {
      if (mine !== entry.token) return
      entry.rows.value = snap.docs.map((d) => entry.read(d.id, d.data()))
      entry.pendingIds.value = snap.docs.filter((d) => d.metadata.hasPendingWrites).map((d) => d.id)
      entry.fetched.value = true
      entry.loading.value = false
      entry.error.value = ''
    },
    (err) => {
      if (mine !== entry.token) return
      console.error('[Astra] ' + entry.collection + ' listener failed:', err)
      // The CODE, and what it means, not a shrug.
      //
      // This used to read "Live updates stopped. Reload to reconnect." for
      // every failure alike — which is actively misleading for the two that
      // actually happen. `failed-precondition` is a missing composite index and
      // reloading will never fix it; `permission-denied` is a row without a
      // `userId`, and reloading will not fix that either. Both are one-line
      // fixes once you know which one you have.
      entry.error.value = listenerMessage(entry.collection, errorCode(err))
      entry.loading.value = false
    },
  )
}

function acquire(
  uid: string,
  collection: string,
  field: string,
  month: string,
  read: (id: string, data: DocumentData) => unknown,
): CacheEntry {
  const key = cacheKey(uid, collection, field, month)
  let entry = CACHE.get(key)
  if (!entry) {
    entry = {
      key,
      uid,
      collection,
      field,
      month,
      read,
      rows: ref<unknown[]>([]) as Ref<unknown[]>,
      loading: ref(true),
      error: ref(''),
      pendingIds: ref<string[]>([]),
      fetched: ref(false),
      readers: 0,
      unsub: null,
      token: 0,
      idle: null,
      touched: Date.now(),
    }
    CACHE.set(key, entry)
  }
  entry.readers++
  entry.touched = Date.now()
  // A reader arriving cancels the pending teardown: the month is in use again.
  if (entry.idle) {
    clearTimeout(entry.idle)
    entry.idle = null
  }
  // Already listening — the rows on screen are live, and there is nothing to
  // do. Otherwise re-attach WITHOUT clearing what is cached, so a month that
  // has been fetched before paints its known rows in this tick and corrects
  // them when the snapshot lands. That is what makes returning to a tab
  // instant instead of a skeleton.
  if (!entry.unsub) void attach(entry)
  evictIfNeeded()
  return entry
}

function release(entry: CacheEntry): void {
  entry.readers = Math.max(0, entry.readers - 1)
  entry.touched = Date.now()
  if (entry.readers > 0 || entry.idle) return
  entry.idle = setTimeout(() => {
    entry.idle = null
    if (entry.readers === 0) detach(entry)
  }, IDLE_DETACH_MS)
}

export function useOwnedMonth<T extends { id: string }>(options: OwnedMonthOptions<T>) {
  const { uid, settings, ready } = useSettings()
  const monthKey = computed(() => toValue(options.month))
  const collection = computed(() => settings.value[options.key])

  // Which cache entry this caller is currently borrowing. `shallowRef` because
  // the entry is a plain object of refs — deep reactivity over it would be
  // watching the same refs twice.
  const current = shallowRef<CacheEntry | null>(null)

  function bindTo(entry: CacheEntry | null): void {
    const previous = current.value
    if (previous === entry) return
    current.value = entry
    if (previous) release(previous)
  }

  /** The handle every write in the owning composable is built from. */
  async function ref_(): Promise<OwnedRef | null> {
    const cloud = await loadFirestore()
    if (!cloud || !uid.value) return null
    return { db: cloud.db, fs: cloud.fs, collection: collection.value, uid: uid.value }
  }

  function bind(): void {
    const owner = uid.value
    purgeOtherUsers(owner)
    // Nothing to read yet: no account, no month, or the collection names have
    // not arrived. Binding to nothing is what keeps a listener from ever
    // opening against the DEFAULT collection name while the real one is still
    // in flight.
    if (!ready.value || !owner || !monthKey.value || !collection.value) {
      bindTo(null)
      return
    }
    const read = options.read as (id: string, data: DocumentData) => unknown
    bindTo(acquire(owner, collection.value, options.field, monthKey.value, read))
  }

  watch([uid, monthKey, collection, ready], bind, { immediate: true })
  onScopeDispose(() => bindTo(null))

  const rows = computed<T[]>(() => (current.value?.rows.value ?? []) as T[])
  const pendingIds = computed<string[]>(() => current.value?.pendingIds.value ?? [])
  /**
   * Loading means "there is nothing to show yet AND something is coming".
   *
   * With no entry bound it is true only while signed in and waiting on the
   * settings document — signed out there is no query to wait for, and a
   * permanent skeleton would be a lie about a screen that is simply empty.
   */
  const loading = computed(() =>
    current.value ? current.value.loading.value : !ready.value && Boolean(uid.value),
  )
  /** Writable: the views offer a dismiss on the listener alert. */
  const error = computed<string>({
    get: () => current.value?.error.value ?? '',
    set: (value) => {
      if (current.value) current.value.error.value = value
    },
  })
  /** Whether this month has ever come back from Firestore. */
  const fetched = computed(() => current.value?.fetched.value ?? false)

  return {
    rows,
    loading,
    error,
    fetched,
    pendingIds,
    collection,
    uid,
    settings,
    ready,
    ref: ref_,
  }
}
