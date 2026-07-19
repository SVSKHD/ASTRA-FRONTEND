// Firebase initialisation. Missing or invalid configuration keeps the workspace
// inaccessible; there is intentionally no local data or guest fallback.

import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
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

if (firebaseEnabled) {
  try {
    app = initializeApp(config)
    auth = getAuth(app)
    db = getFirestore(app)
  } catch (err) {
    console.error('[Aureon] Firebase initialisation failed:', err)
    app = null
    auth = null
    db = null
  }
}

export { app, auth, db }
