// The only place this app writes an owned document (section 32).
//
// Under the deployed catch-all rule the owner field is not metadata, it is the
// document's reachability: `create` requires `userId == request.auth.uid` on
// the incoming data, and `update` requires it on the stored data AND on the
// incoming data. A row written without it cannot afterwards be read, updated or
// even deleted by the account that wrote it — there is no field to prove
// ownership with, and no rule that lets anybody add one. It is gone.
//
// That failure is silent at the call site and permanent in the database, so
// stamping is not left to callers. Every write goes through here, `userId` is
// applied by the function rather than passed by the caller, and an update
// re-states it so a merge cannot drop it.

import type { Firestore } from 'firebase/firestore'
import type { FirestoreModule } from '@/firebase'

export interface OwnedRef {
  db: Firestore
  fs: FirestoreModule
  collection: string
  uid: string
}

/** The id a new document will have, minted client-side. */
export function newId({ db, fs, collection }: OwnedRef): string {
  return fs.doc(fs.collection(db, collection)).id
}

/**
 * Create or replace, at an id the caller already knows.
 *
 * `setDoc` on a minted id rather than `addDoc`: the optimistic row on screen,
 * the document that lands, and any later replay of the same payload are then
 * one row with one id. `addDoc` would make a replay a second trade.
 */
export function ownedSet(ref: OwnedRef, id: string, data: Record<string, unknown>): Promise<void> {
  const { db, fs, collection, uid } = ref
  return fs.setDoc(fs.doc(db, collection, id), { ...data, userId: uid })
}

/**
 * Merge fields into an existing document, restating the owner.
 *
 * The restatement is not redundant. `ownsIncoming()` reads the owner off the
 * post-merge document, and a payload that omits it relies on the merge to carry
 * it — which it does today and would not if the field were ever renamed or the
 * document were written by something that dropped it. One key is cheaper than
 * that class of bug.
 */
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
 * `userId` first and then the day range, which is the order the composite index
 * declares: an equality before a range is the only shape Firestore will serve
 * from one index. The field name differs per collection — `istDate` on trades,
 * `date` on expenses — so it is a parameter rather than a constant.
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
