// Firebase initialisation. Missing or invalid configuration keeps the workspace
// inaccessible; there is intentionally no local data or guest fallback.
//
// Firestore is loaded on demand rather than at startup (section 16e). The SDK
// and its dependencies are the single largest thing in the bundle, and nothing
// on the first paint — the sign-in card, the starfield, the shell — needs a
// database. `loadFirestore()` pulls it in the moment a signed-in workspace (or
// a share page) actually needs to read or write, and caches the handle, so the
// cost is paid once and after the first paint rather than before it.

import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const AUREON_COLLECTION = 'aureon-notes'
// Under the test runner Firebase stays OFF even when VITE_FIREBASE_* are set in
// the environment (they are on the deploy host). Otherwise a unit test that
// instantiates the store would attach a real auth listener and reset/persist
// through it — which is exactly what broke the build's `verify` step on the
// deploy host while passing locally, where those vars are absent.
const isTestRunner = import.meta.env.MODE === 'test'
export const firebaseEnabled =
  Boolean(config.apiKey && config.projectId && config.appId) && !isTestRunner
export const defaultLockMinutes = Math.max(
  1,
  Number.parseInt(import.meta.env.VITE_AUTO_LOCK_MINUTES || '50', 10) || 50,
)

let app: FirebaseApp | null = null
let auth: Auth | null = null

// 'persistent' = IndexedDB-backed offline cache (queued writes survive reloads
// and browser restarts, shared across tabs). 'memory' = this session only, the
// fallback when persistence cannot be enabled (private mode / unsupported
// browser). 'none' = Firestore not initialised at all. The app reads this to
// show a one-time "offline mode unavailable" toast.
export type PersistenceMode = 'persistent' | 'memory' | 'none'
let persistenceMode: PersistenceMode = 'none'

if (firebaseEnabled) {
  try {
    app = initializeApp(config)
    auth = getAuth(app)
  } catch (err) {
    console.error('[Aureon] Firebase initialisation failed:', err)
    app = null
    auth = null
  }
}

// The Firestore module namespace, obtained dynamically. Callers reach the query
// builders through the handle rather than importing them, because a static
// `from 'firebase/firestore'` anywhere would pull the SDK straight back into
// the initial chunk.
export type FirestoreModule = typeof import('firebase/firestore')
export interface FirestoreHandle {
  db: Firestore
  fs: FirestoreModule
}

let firestoreLoad: Promise<FirestoreHandle | null> | null = null

export function loadFirestore(): Promise<FirestoreHandle | null> {
  if (!firebaseEnabled || !app) return Promise.resolve(null)
  if (!firestoreLoad) firestoreLoad = initFirestore(app)
  return firestoreLoad
}

// The already-resolved handle, for the synchronous guards that only need to
// know whether Firestore is up (a debounced save, say, which must not await
// before deciding to do nothing).
let firestoreHandle: FirestoreHandle | null = null
export function firestoreReady(): FirestoreHandle | null {
  return firestoreHandle
}

async function initFirestore(fbApp: FirebaseApp): Promise<FirestoreHandle | null> {
  try {
    const fs = await import('firebase/firestore')
    let db: Firestore
    try {
      // Offline-first: multi-tab persistent cache so mutations buffer locally
      // and replay on reconnect, with no custom queue.
      db = fs.initializeFirestore(fbApp, {
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
      })
      setPersistence('persistent')
    } catch (persistErr) {
      // Private mode / unsupported / a second config call: fall back to an
      // in-memory cache so the app still works, just without offline durability.
      console.warn('[Aureon] Firestore persistence unavailable, using memory cache:', persistErr)
      db = fs.initializeFirestore(fbApp, {})
      setPersistence('memory')
    }
    firestoreHandle = { db, fs }
    return firestoreHandle
  } catch (err) {
    console.error('[Aureon] Firestore initialisation failed:', err)
    setPersistence('none')
    return null
  }
}

// Because Firestore now arrives after the first paint, the persistence mode is
// not known when the shell mounts. Anyone who wants to react to it (the
// "offline mode unavailable" notice) subscribes and is called once, whenever
// the answer exists — immediately if it already does.
type PersistenceListener = (mode: PersistenceMode) => void
const persistenceListeners = new Set<PersistenceListener>()
let persistenceResolved = false

function setPersistence(mode: PersistenceMode): void {
  persistenceMode = mode
  persistenceResolved = true
  for (const listener of persistenceListeners) listener(mode)
  persistenceListeners.clear()
}

export function onPersistenceResolved(listener: PersistenceListener): void {
  if (persistenceResolved) {
    listener(persistenceMode)
    return
  }
  persistenceListeners.add(listener)
}

export { app, auth }
