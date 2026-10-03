// Ticks the server has not confirmed yet. Ticking todos or tasks to done (or
// back) is recorded here as well as on the item, and every snapshot that
// hydrates the lists is laid back over with these before anything renders. So
// a read that is older than the ticks — a stale tab or device writing its copy
// of the lists, a realtime echo racing the save, a GitHub issue still open —
// cannot spring a ticked row back to not done. An entry is dropped once the
// server shows the same status (confirmed), the item is gone, or someone made
// a newer edit to that item elsewhere (theirs wins, so two devices never fight).
import type { ItemStatus } from '@/types'

export type StatusCollection = 'todos' | 'tasks'

export interface LocalStatus {
  status: ItemStatus
  done: boolean
  completedAt: number | null
  // When the tick was made, against the incoming item's updatedAt.
  at: number
}

interface StatusItem {
  id: number
  status: ItemStatus
  done: boolean
  completedAt: number | null
  updatedAt: number
}

export function statusKey(collection: StatusCollection, id: number): string {
  return collection + ':' + id
}

// Lay the unconfirmed ticks of one collection over incoming items. Mutates
// `pending` (confirmed and superseded entries are removed) and returns the
// list — the same array when nothing needed restoring — and whether any tick
// was restored, which means the server copy is behind and needs writing again.
export function overlayStatus<T extends StatusItem>(
  items: T[],
  collection: StatusCollection,
  pending: Map<string, LocalStatus>,
): { items: T[]; restored: boolean } {
  const prefix = collection + ':'
  const mine = [...pending.keys()].filter((k) => k.startsWith(prefix))
  if (!mine.length) return { items, restored: false }
  const byId = new Map(items.map((it) => [it.id, it]))
  const restore = new Map<number, LocalStatus>()
  for (const key of mine) {
    const local = pending.get(key)!
    const item = byId.get(Number(key.slice(prefix.length)))
    if (!item || item.status === local.status || item.updatedAt > local.at) {
      pending.delete(key)
      continue
    }
    restore.set(item.id, local)
  }
  if (!restore.size) return { items, restored: false }
  return {
    items: items.map((it) => {
      const local = restore.get(it.id)
      return local
        ? { ...it, status: local.status, done: local.done, completedAt: local.completedAt }
        : it
    }),
    restored: true,
  }
}

// ---- The progress meter -----------------------------------------------------

export type StatusSyncPhase = 'idle' | 'queued' | 'saving' | 'saved' | 'error'

export interface StatusSyncState {
  phase: StatusSyncPhase
  // This burst's items, by where they ended up.
  done: number
  reopened: number
  total: number
  // How many of them the server has.
  saved: number
  // When the queued burst will be written, for the countdown.
  syncAt: number
}

export function idleStatusSync(): StatusSyncState {
  return { phase: 'idle', done: 0, reopened: 0, total: 0, saved: 0, syncAt: 0 }
}

export function burstCounts(
  burst: Map<string, ItemStatus>,
  unsent: Set<string>,
): Pick<StatusSyncState, 'done' | 'reopened' | 'total' | 'saved'> {
  let done = 0
  let saved = 0
  for (const [key, status] of burst) {
    if (status === 'done') done++
    if (!unsent.has(key)) saved++
  }
  return { done, reopened: burst.size - done, total: burst.size, saved }
}
