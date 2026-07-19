// Firebase initialisation with graceful degradation.
//
// If the VITE_FIREBASE_* env vars are present, real Firebase Auth + Firestore
// are initialised. If they are missing (e.g. a fresh clone with no .env.local),
// `firebaseEnabled` is false and the app runs in local-only mode — auth falls
// back to a demo profile and data lives only in memory.

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

export const firebaseEnabled = Boolean(config.apiKey && config.projectId && config.appId)

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

if (firebaseEnabled) {
  try {
    app = initializeApp(config)
    auth = getAuth(app)
    db = getFirestore(app)
  } catch (err) {
    // Bad config — degrade rather than crash the whole app.
    console.error('[Aureon] Firebase init failed, falling back to local mode:', err)
    app = null
    auth = null
    db = null
  }
}

export { app, auth, db }
