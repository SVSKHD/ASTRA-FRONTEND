// Per-item share documents.
//
// The workspace itself is a single Firestore document (aureon-notes/{uid})
// holding every list as an array. Firestore rules are per-document, so there is
// no way to expose one todo from inside that array while hiding the rest. A
// share therefore gets its own document, and the rules gate it on `isPublic`.
//
// Snapshots are frozen: the item is copied as it looked when shared, so later
// edits to the original never change what a recipient sees.

import { doc, collection, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/firebase'
import type { ItemType } from '@/types'

export const SHARES_COLLECTION = 'aureon-shares'

export interface ShareDoc {
  id: string
  ownerId: string
  type: ItemType
  item: Record<string, unknown>
  isPublic: boolean
  createdAt: number
}

export type ShareLoad =
  | { status: 'ready'; share: ShareDoc }
  | { status: 'not-found' }
  | { status: 'needs-auth' }
  | { status: 'unavailable' }

// Strip reactivity/undefined before handing the item to Firestore, which
// rejects undefined values outright.
function plain(item: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(item ?? {})) as Record<string, unknown>
}

export async function createShare(
  ownerId: string,
  type: ItemType,
  item: unknown,
  isPublic: boolean,
): Promise<string | null> {
  if (!db) return null
  const ref = doc(collection(db, SHARES_COLLECTION))
  await setDoc(ref, {
    ownerId,
    type,
    item: plain(item),
    isPublic,
    createdAt: Date.now(),
  })
  return ref.id
}

// A denied read is indistinguishable from a missing document at the client, so
// permission-denied is reported as needs-auth rather than not-found: for a
// private share the honest prompt is "sign in", not "this doesn't exist".
export async function fetchShare(shareId: string): Promise<ShareLoad> {
  if (!db) return { status: 'unavailable' }
  try {
    const snap = await getDoc(doc(db, SHARES_COLLECTION, shareId))
    if (!snap.exists()) return { status: 'not-found' }
    const data = snap.data()
    return {
      status: 'ready',
      share: {
        id: snap.id,
        ownerId: String(data.ownerId || ''),
        type: data.type as ItemType,
        item: (data.item || {}) as Record<string, unknown>,
        isPublic: data.isPublic === true,
        createdAt: Number(data.createdAt || 0),
      },
    }
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code.includes('permission-denied')) return { status: 'needs-auth' }
    console.error('[Aureon] Share load failed:', error)
    return { status: 'unavailable' }
  }
}

export async function setSharePublic(shareId: string, isPublic: boolean): Promise<void> {
  if (!db) return
  await updateDoc(doc(db, SHARES_COLLECTION, shareId), { isPublic })
}

export async function deleteShare(shareId: string): Promise<void> {
  if (!db) return
  await deleteDoc(doc(db, SHARES_COLLECTION, shareId))
}
