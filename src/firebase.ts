// Firebase initialisation. Missing or invalid configuration keeps the workspace
// inaccessible; there is intentionally no local data or guest fallback.

import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAvTW0LWeAtzvaC_fAEJmd7akXmIc8Wwrw',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'spasta-personal-finance.firebaseapp.com',
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ||
    'https://spasta-personal-finance-default-rtdb.firebaseio.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'spasta-personal-finance',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'spasta-personal-finance.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '616298926621',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:616298926621:web:fb000c48b4f7dac325ecf4',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-0MBNYMETF9',
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
