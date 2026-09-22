// Identity and cloud-service bootstrap.
//
// Phase 1 of the Supabase migration keeps Firebase Authentication, Functions and
// Storage, but moves the app-owned document database to Supabase. The existing
// Firestore-shaped data API is retained temporarily so the migration can happen
// without rewriting every view/composable in the same change.
//
// A few function-owned mirrors (news, GitHub webhooks and device security rows)
// still live in Firestore until their server-side writers are migrated. The
// Supabase adapter delegates only those namespaces back to legacy Firestore.

import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

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

const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
}

export const AUREON_COLLECTION = 'aureon-notes'

const isTestRunner = import.meta.env.MODE === 'test'

export const firebaseEnabled =
  Boolean(config.apiKey && config.projectId && config.appId) && !isTestRunner

export const supabaseEnabled =
  Boolean(supabaseConfig.url && supabaseConfig.key) && firebaseEnabled && !isTestRunner

export const defaultLockMinutes = Math.max(
  1,
  Number.parseInt(import.meta.env.VITE_AUTO_LOCK_MINUTES || '50', 10) || 50,
)

let app: FirebaseApp | null = null
let auth: Auth | null = null

// 'persistent' = IndexedDB-backed Firestore fallback.
// 'memory' = connected cloud data without a durable browser write queue
// (Supabase primary, or Firestore's in-memory fallback).
// 'none' = no database initialised.
export type PersistenceMode = 'persistent' | 'memory' | 'none'
let persistenceMode: PersistenceMode = 'none'

if (firebaseEnabled) {
  try {
    app = initializeApp(config)
    auth = getAuth(app)
  } catch (err) {
    console.error('[Aureon] Firebase identity initialisation failed:', err)
    app = null
    auth = null
  }
}

// The compatibility handle deliberately exposes the small Firestore-shaped
// surface used by the app. In Supabase mode the implementation is
// src/supabaseFirestore.ts; in fallback mode it is the real Firestore SDK.
export type FirestoreModule = Record<string, any>

export interface FirestoreHandle {
  db: unknown
  fs: FirestoreModule
}

let firestoreLoad: Promise<FirestoreHandle | null> | null = null
let firestoreHandle: FirestoreHandle | null = null

export function loadFirestore(): Promise<FirestoreHandle | null> {
  // The screenshot fixture is still an in-memory implementation of the same
  // compatibility surface and never leaves the browser.
  if (import.meta.env.DEV && String(import.meta.env.VITE_FIXTURE ?? '') === '1') {
    return import('@/dev/fixture').then((m) => m.fixtureHandle(m.forcedState()))
  }
  if (!firebaseEnabled || !app || !auth) return Promise.resolve(null)
  if (!firestoreLoad) {
    firestoreLoad = supabaseEnabled ? initSupabaseData() : initFirebaseFirestore(app)
  }
  return firestoreLoad
}

export function firestoreReady(): FirestoreHandle | null {
  return firestoreHandle
}

async function initSupabaseData(): Promise<FirestoreHandle | null> {
  try {
    const { createSupabaseFirestoreHandle } = await import('@/supabaseFirestore')
    const handle = await createSupabaseFirestoreHandle(auth, loadLegacyFirestore)
    firestoreHandle = handle as FirestoreHandle
    // Supabase Realtime keeps devices current, but it does not provide
    // Firestore's IndexedDB-backed queued-write cache.
    setPersistence('memory')
    return firestoreHandle
  } catch (err) {
    console.error('[Aureon] Supabase data initialisation failed:', err)
    setPersistence('none')
    return null
  }
}

// Firestore is loaded lazily only for namespaces that existing Firebase
// Functions still own during the transition: forex, gh-* and users/**.
let legacyFirestoreLoad: Promise<FirestoreHandle | null> | null = null

async function loadLegacyFirestore(): Promise<FirestoreHandle | null> {
  if (!app) return null
  if (!legacyFirestoreLoad) {
    legacyFirestoreLoad = (async () => {
      try {
        const fs = await import('firebase/firestore')
        return { db: fs.getFirestore(app!), fs } as FirestoreHandle
      } catch (err) {
        console.error('[Aureon] Legacy Firestore mirror initialisation failed:', err)
        return null
      }
    })()
  }
  return legacyFirestoreLoad
}

// Safe fallback while Supabase environment values are being rolled out. Once
// VITE_SUPABASE_URL + a publishable/anon key are present, this path is not used
// for app-owned data.
async function initFirebaseFirestore(fbApp: FirebaseApp): Promise<FirestoreHandle | null> {
  try {
    const fs = await import('firebase/firestore')
    let db
    try {
      db = fs.initializeFirestore(fbApp, {
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
      })
      setPersistence('persistent')
    } catch (persistErr) {
      console.warn('[Aureon] Firestore persistence unavailable, using memory cache:', persistErr)
      db = fs.initializeFirestore(fbApp, {})
      setPersistence('memory')
    }
    firestoreHandle = { db, fs } as FirestoreHandle
    return firestoreHandle
  } catch (err) {
    console.error('[Aureon] Firestore fallback initialisation failed:', err)
    setPersistence('none')
    return null
  }
}

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

// ---- Cloud Functions -------------------------------------------------------
// Kept on Firebase in phase 1. Existing server-side GitHub/news/security jobs
// continue to run while their storage writers are migrated separately.
export type FunctionsModule = typeof import('firebase/functions')
export interface FunctionsHandle {
  functions: import('firebase/functions').Functions
  fx: FunctionsModule
}

let functionsLoad: Promise<FunctionsHandle | null> | null = null

export function loadFunctions(): Promise<FunctionsHandle | null> {
  if (!firebaseEnabled || !app) return Promise.resolve(null)
  if (!functionsLoad) {
    functionsLoad = (async () => {
      try {
        const fx = await import('firebase/functions')
        const region = import.meta.env.VITE_FUNCTIONS_REGION || 'us-central1'
        return { functions: fx.getFunctions(app!, region), fx }
      } catch (err) {
        console.error('[Aureon] Cloud Functions initialisation failed:', err)
        return null
      }
    })()
  }
  return functionsLoad
}

// ---- Storage ---------------------------------------------------------------
// Attachments remain on Firebase Storage in phase 1. Moving binary objects is a
// separate migration from moving Firestore documents.
export type StorageModule = typeof import('firebase/storage')
export interface StorageHandle {
  storage: import('firebase/storage').FirebaseStorage
  st: StorageModule
}

let storageLoad: Promise<StorageHandle | null> | null = null

export function loadStorage(): Promise<StorageHandle | null> {
  if (!firebaseEnabled || !app) return Promise.resolve(null)
  if (!storageLoad) {
    storageLoad = (async () => {
      try {
        const st = await import('firebase/storage')
        return { storage: st.getStorage(app!), st }
      } catch (err) {
        console.error('[Aureon] Storage initialisation failed:', err)
        return null
      }
    })()
  }
  return storageLoad
}

export { app, auth }
