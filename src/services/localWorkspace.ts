// The workspace, kept on this device too (offline mode).
//
// The cloud copy is one Supabase document per account; until this existed the
// app held it only in memory, so with no connection it could not open at all —
// not even to unlock, since the PIN hash lives inside that document. Now every
// change is also written here, and when the cloud cannot be reached the app
// opens from this copy: unlock, add and edit as usual. `dirty` marks edits the
// cloud has not received yet; `syncedAt` is when this copy last matched the
// cloud, which the merge on reconnect uses to tell a deletion from an addition
// (utils/workspaceMerge).
//
// IndexedDB rather than localStorage: a workspace easily outgrows the ~5 MB
// localStorage limit, and IndexedDB writes do not block the page. Every call
// swallows a missing or failing IndexedDB (a private window, a test runner):
// the app then simply works online-only, as it did before.

const DB = 'aureon-local'
const STORE = 'workspaces'

export interface LocalWorkspace {
  uid: string
  data: Record<string, unknown>
  /** Holds edits the cloud has not received yet. */
  dirty: boolean
  /** When this copy was last written. */
  savedAt: number
  /** When this copy last matched the cloud; 0 = never. */
  syncedAt: number
}

let opening: Promise<IDBDatabase | null> | null = null

function open(): Promise<IDBDatabase | null> {
  if (opening) return opening
  opening = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE))
          req.result.createObjectStore(STORE, { keyPath: 'uid' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return opening
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null)
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE))
          req.onsuccess = () => resolve(req.result ?? null)
          req.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

export function readLocalWorkspace(uid: string): Promise<LocalWorkspace | null> {
  return run<LocalWorkspace>('readonly', (s) => s.get(uid))
}

export async function writeLocalWorkspace(entry: LocalWorkspace): Promise<void> {
  // A structured clone of reactive data: strip proxies first, so IndexedDB
  // never throws DataCloneError on a Vue ref.
  const plain = JSON.parse(JSON.stringify(entry)) as LocalWorkspace
  await run('readwrite', (s) => s.put(plain))
}

/** Signing out takes the device copy with it. */
export async function clearLocalWorkspace(uid?: string): Promise<void> {
  await run('readwrite', (s) => (uid ? s.delete(uid) : s.clear()))
}
