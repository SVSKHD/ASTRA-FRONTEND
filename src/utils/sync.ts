// Pure helpers behind the offline sync indicator.
//
// This app syncs one workspace document, not a document per item, so Firestore
// only exposes a single `metadata.hasPendingWrites` for the whole doc — it
// cannot say WHICH todo/expense/note is unsaved. We recover per-item pending
// state by diffing the live collections against a signature of the last
// server-acknowledged snapshot: anything that differs (or is new, or is gone)
// has an unsynced local change. This is what drives both the per-item "Offline"
// chip and the pill's pending count, without a custom write queue.

// Deterministic JSON: object keys sorted at every level, so two equal items
// always serialise identically regardless of key insertion order (local edits
// build objects via spreads; a hydrate rebuilds them field by field).
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

export interface Identified {
  id: number
}

// A signature map keyed `${type}:${id}` → stable JSON of the item. Built from
// the named collections so every syncable list contributes.
export function signatureOf(collections: Record<string, Identified[]>): Map<string, string> {
  const sig = new Map<string, string>()
  for (const type in collections) {
    for (const item of collections[type]) sig.set(type + ':' + item.id, stableStringify(item))
  }
  return sig
}

// Keys whose current signature differs from the acknowledged one: changed,
// newly created, or deleted locally since the last server ack. Deletions are
// included so the pending count is honest even though their card is already
// gone from the UI.
export function pendingKeysBetween(
  current: Map<string, string>,
  acked: Map<string, string>,
): Set<string> {
  const pending = new Set<string>()
  for (const [key, sig] of current) {
    if (acked.get(key) !== sig) pending.add(key)
  }
  for (const key of acked.keys()) {
    if (!current.has(key)) pending.add(key)
  }
  return pending
}

// Online means the browser reports connectivity AND the active Firestore
// snapshot is not being served purely from cache — a connected-but-dead network
// keeps serving `fromCache: true`, and must still read as offline.
export function deriveOnline(navigatorOnline: boolean, fromCache: boolean): boolean {
  return navigatorOnline && !fromCache
}

export function deriveSyncing(pendingCount: number, isOnline: boolean): boolean {
  return pendingCount > 0 && isOnline
}
