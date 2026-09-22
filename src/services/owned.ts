// The only place this app writes an owned document (section 32).
//
// The data backend is now a compatibility layer: Supabase for app-owned rows,
// with a temporary Firestore fallback only for server-owned mirror namespaces.
// Keeping ownership stamping here means every write reaches Postgres with the
// same uid that Row Level Security validates from the Firebase JWT.

import type { FirestoreModule } from '@/firebase'

export interface OwnedRef {
  db: unknown
  fs: FirestoreModule
  collection: string
  uid: string
}

/** The id a new document will have, minted client-side. */
export function newId({ db, fs, collection }: OwnedRef): string {
  return fs.doc(fs.collection(db, collection)).id
}

/**
 * Create or replace at an id the caller already knows.
 *
 * Client-minted ids make retries idempotent: a replay overwrites the same row
 * rather than creating a duplicate trade/expense.
 */
export function ownedSet(ref: OwnedRef, id: string, data: Record<string, unknown>): Promise<void> {
  const { db, fs, collection, uid } = ref
  return fs.setDoc(fs.doc(db, collection, id), { ...data, userId: uid })
}

/** Merge fields into an existing document while restating its owner. */
export function ownedMerge(
  ref: OwnedRef,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { db, fs, collection, uid } = ref
  return fs.setDoc(fs.doc(db, collection, id), { ...patch, userId: uid }, { merge: true })
}

export function ownedDelete(ref: OwnedRef, id: string): Promise<void> {
  const { db, fs, collection } = ref
  return fs.deleteDoc(fs.doc(db, collection, id))
}

/**
 * A month of one collection, owned by this uid.
 *
 * YYYY-MM-DD values remain strings so the same query shape works against the
 * Supabase JSONB compatibility table and the temporary Firestore fallback.
 */
export function ownedMonthQuery(ref: OwnedRef, field: string, from: string, to: string) {
  const { db, fs, collection, uid } = ref
  return fs.query(
    fs.collection(db, collection),
    fs.where('userId', '==', uid),
    fs.where(field, '>=', from),
    fs.where(field, '<=', to),
    fs.orderBy(field, 'asc'),
  )
}

/** Return a stable backend error code for existing UI diagnostics. */
export function errorCode(err: unknown): string {
  return typeof err === 'object' && err && 'code' in err
    ? String((err as { code: unknown }).code)
    : 'unknown'
}
