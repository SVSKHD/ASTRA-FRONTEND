// The outbox (section 30).
//
// What this is NOT: a retry queue in front of Firestore. Firestore already has
// one. With `persistentLocalCache` enabled (see firebase.ts) a write made with
// no network is durable in IndexedDB, survives a reload, and replays itself on
// reconnect — and, crucially, its promise does not reject: it simply does not
// settle until the server acknowledges it. Putting a queue in front of that
// would be a second queue for the same job, and the two would disagree.
//
// What this IS: somewhere for a write the server actively REFUSED to go. A
// rejection from Firestore with persistence on is not a network problem, it is
// the server saying no — rules that have not been deployed, an index that does
// not exist yet, a payload it will not take. Those are fixable out of band, and
// while somebody fixes them the trade must not evaporate. So the payload is
// parked here, replayed on a backoff, and after eight refusals marked `blocked`
// and shown to the user with the reason. Nothing is ever dropped silently.
//
// IndexedDB rather than localStorage, for three reasons that all matter here: a
// trade is an object and localStorage stores strings; localStorage is
// synchronous and this runs on the submit path; and a year of refused trades
// would not fit in 5MB.

export const OUTBOX_DB = 'aureon-outbox'
export const OUTBOX_STORE = 'writes'
const DB_VERSION = 1

/** Eight strikes, then it stops trying and starts asking. */
export const MAX_ATTEMPTS = 8

/** 2s, 4s, 8s … capped at five minutes. */
export const BACKOFF_BASE_MS = 2_000
export const BACKOFF_CAP_MS = 5 * 60_000

export interface OutboxEntry {
  /** The Firestore document id, minted client-side. Replay overwrites, so this
   *  is also what makes a repeat safe rather than a duplicate. */
  id: string
  /** Which of the user's collections it belongs in. */
  collection: 'trades' | 'secured'
  uid: string
  payload: Record<string, unknown>
  attempts: number
  lastError: string
  firstQueuedAt: number
  /** When the next attempt becomes due, from the backoff below. */
  nextAttemptAt: number
  /** Out of attempts. Shown to the user; never retried again. */
  blocked: boolean
}

/** How long to wait before attempt n+1. Doubling, capped, never zero. */
export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1))
}

export function isDue(entry: OutboxEntry, now = Date.now()): boolean {
  return !entry.blocked && entry.nextAttemptAt <= now
}

function idb(): IDBFactory | null {
  return globalThis.indexedDB ?? null
}

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  const factory = idb()
  if (!factory) return Promise.reject(new Error('IndexedDB is unavailable'))
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(OUTBOX_DB, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    }).catch((err) => {
      // A failed open must not poison every later call: the next one tries
      // again, which is what happens after a private-mode prompt is answered.
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(OUTBOX_STORE, mode)
        const request = work(tx.objectStore(OUTBOX_STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
      }),
  )
}

/** Every parked write, oldest first — which is the order they are replayed in. */
export async function listOutbox(): Promise<OutboxEntry[]> {
  try {
    const all = await run<OutboxEntry[]>(
      'readonly',
      (store) => store.getAll() as IDBRequest<OutboxEntry[]>,
    )
    return all.sort((a, b) => a.firstQueuedAt - b.firstQueuedAt)
  } catch {
    // No IndexedDB (a private window, a locked-down browser) means no outbox.
    // The app still works; a refused write is reported and lost rather than
    // parked, which is strictly better than crashing the submit path.
    return []
  }
}

export async function putOutbox(entry: OutboxEntry): Promise<void> {
  try {
    await run('readwrite', (store) => store.put(entry))
  } catch {
    /* see listOutbox */
  }
}

/**
 * Park a refused write, or record another refusal of one already parked.
 * Returns the stored entry so a caller can show its state without re-reading.
 */
export async function queueFailure(
  seed: Pick<OutboxEntry, 'id' | 'collection' | 'uid' | 'payload'>,
  error: string,
  now = Date.now(),
): Promise<OutboxEntry> {
  const existing = (await listOutbox()).find((e) => e.id === seed.id)
  const attempts = (existing?.attempts ?? 0) + 1
  const entry: OutboxEntry = {
    ...seed,
    attempts,
    lastError: error,
    firstQueuedAt: existing?.firstQueuedAt ?? now,
    nextAttemptAt: now + backoffMs(attempts),
    blocked: attempts >= MAX_ATTEMPTS,
  }
  await putOutbox(entry)
  return entry
}

/** Only ever called after the server has acknowledged the write. */
export async function removeOutbox(id: string): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(id))
  } catch {
    /* see listOutbox */
  }
}

/** The user discarding a blocked entry — the one manual action there is. */
export const discardOutbox = removeOutbox

/** Test seam: drops the cached handle so a fake IndexedDB can be swapped in. */
export function resetOutboxConnection(): void {
  dbPromise = null
}
