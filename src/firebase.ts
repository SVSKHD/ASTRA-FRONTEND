// Firebase initialisation. Missing or invalid configuration keeps the workspace
// inaccessible; there is intentionally no local data or guest fallback.

import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'

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
export const firebaseEnabled = Boolean(config.apiKey && config.projectId && config.appId)
export const defaultLockMinutes = Math.max(
  1,
  Number.parseInt(import.meta.env.VITE_AUTO_LOCK_MINUTES || '50', 10) || 50,
)

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

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
    try {
      // Offline-first: multi-tab persistent cache so mutations buffer locally
      // and replay on reconnect, with no custom queue.
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      })
      persistenceMode = 'persistent'
    } catch (persistErr) {
      // Private mode / unsupported / a second config call: fall back to an
      // in-memory cache so the app still works, just without offline durability.
      console.warn('[Aureon] Firestore persistence unavailable, using memory cache:', persistErr)
      db = initializeFirestore(app, {})
      persistenceMode = 'memory'
    }
  } catch (err) {
    console.error('[Aureon] Firebase initialisation failed:', err)
    app = null
    auth = null
    db = null
    persistenceMode = 'none'
  }
}

export { app, auth, db, persistenceMode }
