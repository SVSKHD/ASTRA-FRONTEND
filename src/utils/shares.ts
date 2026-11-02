// Per-item share documents.
//
// The workspace itself is a single Firestore document (aureon-notes/{uid})
// holding every list as an array. Firestore rules are per-document, so there is
// no way to expose one todo from inside that array while hiding the rest. A
// share therefore gets its own document, and the rules gate it on `isPublic`.
//
// Snapshots are frozen: the item is copied as it looked when shared, so later
// edits to the original never change what a recipient sees.

// The Firestore SDK is loaded on demand (see @/firebase) — a share page that
// never opens a share should not pay for it, and no module may import the query
// builders statically without pulling the SDK back into the initial chunk.
import { loadFirestore } from '@/firebase'
import { aureon } from '@/api/client'
import { authProvider } from '@/auth/provider'
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

/**
 * A new share id. On Aureon a UUID: anyone holding the id can read a public
 * share through GET /api/public/shares/{id}, so it has to be unguessable, and
 * the documents API takes it as the doc id as it is.
 */
export function mintShareId(fallback: () => string): string {
  if (authProvider() === 'aureon' && typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return crypto.randomUUID()
  return fallback()
}

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
  const cloud = await loadFirestore()
  if (!cloud) return null
  const { db, fs } = cloud
  const ref = fs.doc(fs.collection(db, SHARES_COLLECTION))
  await fs.setDoc(ref, {
    ownerId,
    type,
    item: plain(item),
    isPublic,
    createdAt: Date.now(),
  })
  return ref.id
}

// Write the mirror doc for the per-item share toggle under a caller-supplied
// id (a nanoid, so the id is the reusable share handle rather than a random
// Firestore id). `refPath` records where the private item lives; a public
// reader never follows it (the frozen `item` snapshot is what they render) but
// it keeps the mirror traceable back to its source. This is a full write, used
// on enable — a fresh mint after "Stop sharing" is a create, a reused id that
// still exists is fully rewritten, both allowed by the aureon-shares rule since
// ownerId is always the caller's uid.
export async function writeShareDoc(
  shareId: string,
  ownerId: string,
  type: ItemType,
  item: unknown,
  isPublic: boolean,
  refPath: string,
): Promise<void> {
  const cloud = await loadFirestore()
  if (!cloud) throw new Error('Supabase is not configured')
  const { db, fs } = cloud
  const now = Date.now()
  await fs.setDoc(fs.doc(db, SHARES_COLLECTION, shareId), {
    ownerId,
    type,
    refPath,
    item: plain(item),
    isPublic,
    createdAt: now,
    sharedAt: now,
  })
}

// Refresh only the frozen snapshot on an already-published share, so edits made
// to a shared item while it is public flow through to what a recipient sees.
// Merges rather than overwrites, so createdAt/sharedAt survive; ownerId rides
// along because the update rule reads it off the incoming write.
export async function updateShareItem(
  shareId: string,
  ownerId: string,
  item: unknown,
): Promise<void> {
  const cloud = await loadFirestore()
  if (!cloud) return
  const { db, fs } = cloud
  await fs.setDoc(
    fs.doc(db, SHARES_COLLECTION, shareId),
    { ownerId, item: plain(item), isPublic: true },
    { merge: true },
  )
}

// A denied read is indistinguishable from a missing document at the client, so
// permission-denied is reported as needs-auth rather than not-found: for a
// private share the honest prompt is "sign in", not "this doesn't exist".
export async function fetchShare(shareId: string): Promise<ShareLoad> {
  if (authProvider() === 'aureon') return fetchAureonShare(shareId)
  const cloud = await loadFirestore()
  if (!cloud) return { status: 'unavailable' }
  const { db, fs } = cloud
  try {
    const snap = await fs.getDoc(fs.doc(db, SHARES_COLLECTION, shareId))
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

export async function deleteShare(shareId: string): Promise<void> {
  const cloud = await loadFirestore()
  if (!cloud) return
  await cloud.fs.deleteDoc(cloud.fs.doc(cloud.db, SHARES_COLLECTION, shareId))
}

/**
 * Aureon: the public read needs no session. The owner publishes through the
 * documents API (namespace `aureon-shares`, `isPublic: true`); this endpoint
 * answers only a public share, with the owner's ids stripped. A private share
 * is a 404 there, so it is then asked for as the signed-in owner's own document.
 */
async function fetchAureonShare(shareId: string): Promise<ShareLoad> {
  try {
    const { data, response } = await aureon.GET('/api/public/shares/{doc_id}', {
      params: { path: { doc_id: shareId } },
    })
    if (data) return readyShare(data.doc_id, data.data)
    if (response.status !== 404) return { status: 'unavailable' }
    // Not public: the owner can still open it through their own documents.
    const own = await aureon.GET('/api/finance/documents/{namespace}/{doc_id}', {
      params: { path: { namespace: SHARES_COLLECTION, doc_id: shareId } },
    })
    if (own.data) return readyShare(own.data.doc_id, own.data.data)
    if (own.response.status === 401) return { status: 'needs-auth' }
    return { status: 'not-found' }
  } catch (error) {
    console.error('[Aureon] Share load failed:', error)
    return { status: 'unavailable' }
  }
}

function readyShare(id: string, doc: Record<string, unknown>): ShareLoad {
  return {
    status: 'ready',
    share: {
      id,
      ownerId: '',
      type: doc.type as ItemType,
      item: (doc.item || {}) as Record<string, unknown>,
      isPublic: doc.isPublic === true,
      createdAt: Number(doc.createdAt || 0),
    },
  }
}
