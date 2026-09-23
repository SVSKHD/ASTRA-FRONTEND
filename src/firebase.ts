// Cloud-service bootstrap.
//
// Sign-in and the app's data are Supabase (src/supabase.ts; migration phases
// 1–3). What is left here is Firebase for the pieces that have not moved yet —
// Cloud Functions and Storage (phases 4–5) — plus the Firestore SDK as the
// fallback data path when Supabase is not configured.
//
// The Firestore-shaped data API is retained so views and composables did not
// have to be rewritten in the same change as the database underneath them.

import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'
import { supabase, supabaseEnabled } from '@/supabase'

export { supabaseEnabled }

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

const isTestRunner = import.meta.env.MODE === 'test'

export const firebaseEnabled =
  Boolean(config.apiKey && config.projectId && config.appId) && !isTestRunner

/** Whether the app has a cloud data store at all: Supabase, or the Firestore fallback. */
export const cloudEnabled = supabaseEnabled || firebaseEnabled

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
//
// THE TYPE IS THE FIRESTORE SDK'S, EVEN IN SUPABASE MODE. It is the contract
// every caller is written against, and the adapter is cast to it where it is
// built. It was loosened to `Record<string, any>` for the adapter's sake, which
// stripped the types from every snapshot callback in the app (41 `vue-tsc`
// errors). A type-only import, so nothing of the SDK reaches the bundle.
//
// The cost of the cast: nothing checks that the adapter implements every
// function a caller uses. Today it covers all of them (collection, doc, query,
// where, orderBy, limit, getDoc, getDocs, setDoc, deleteDoc, onSnapshot,
// serverTimestamp, Timestamp) — a new `fs.*` call needs adding there too.
export type FirestoreModule = typeof import('firebase/firestore')

export interface FirestoreHandle {
  db: Firestore
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
  if (!firestoreLoad) {
    // Supabase does not need Firebase at all any more — sign-in included.
    if (supabaseEnabled && supabase) firestoreLoad = initSupabaseData()
    else if (firebaseEnabled && app) firestoreLoad = initFirebaseFirestore(app)
    else return Promise.resolve(null)
  }
  return firestoreLoad
}

export function firestoreReady(): FirestoreHandle | null {
  return firestoreHandle
}

async function initSupabaseData(): Promise<FirestoreHandle | null> {
  try {
    const { createSupabaseFirestoreHandle } = await import('@/supabaseFirestore')
    // No legacy Firestore: its rules admit Firebase-signed-in users only, and
    // nobody signs in to Firebase now. The namespaces Firebase Functions still
    // write (news, the GitHub mirror, Dacoit signals) report themselves as
    // unavailable until those functions move (phase 4). This also means the
    // app sends Firestore no traffic at all.
    const handle = await createSupabaseFirestoreHandle(supabase!, async () => null)
    // The one deliberate cast in the migration: the adapter implements the
    // subset of the Firestore surface this app calls, not the whole SDK, so
    // TypeScript cannot see the overlap on its own. Everything downstream is
    // typed against the real SDK and checked as such.
    firestoreHandle = handle as unknown as FirestoreHandle
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
