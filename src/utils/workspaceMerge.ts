// Joining the device copy of the workspace with the cloud copy on reconnect.
//
// While offline the device kept working on its own copy; meanwhile another
// device may have changed the cloud one. Writing either over the other loses
// work, so the two are merged item by item:
//
//   - an item in both keeps whichever copy was edited last (`updatedAt`);
//   - an item only on the device is kept if it was added or edited after the
//     last sync — otherwise it was there before and the cloud deleted it;
//   - an item only in the cloud is kept if it was added or edited after the
//     last sync — otherwise it was there before and this device deleted it.
//
// That works on any top-level array whose entries carry an `id`. Everything
// else (settings, preferences, the PIN) is one value per key; the device's
// copy wins, since its edits are the ones the cloud has not seen.

type Item = { id: unknown; updatedAt?: unknown; createdAt?: unknown }

const isItemList = (v: unknown): v is Item[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every((x) => x && typeof x === 'object' && 'id' in (x as object))

const stamp = (it: Item): number => {
  const u = typeof it.updatedAt === 'number' ? it.updatedAt : 0
  const c = typeof it.createdAt === 'number' ? it.createdAt : 0
  return Math.max(u, c)
}

/** One list, merged as described above. Keeps the device's order, then the cloud's newcomers. */
export function mergeList(local: Item[], remote: Item[], syncedAt: number): Item[] {
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const localIds = new Set(local.map((l) => l.id))
  const out: Item[] = []
  for (const l of local) {
    const r = remoteById.get(l.id)
    if (r) out.push(stamp(r) > stamp(l) ? r : l)
    else if (stamp(l) > syncedAt) out.push(l) // added or edited here since the sync
  }
  for (const r of remote) {
    if (localIds.has(r.id)) continue
    if (stamp(r) > syncedAt) out.push(r) // added or edited elsewhere since the sync
  }
  return out
}

/**
 * The workspace to keep after a reconnect: `local` (this device, with offline
 * edits) joined with `remote` (the cloud), given when they last matched.
 */
export function mergeWorkspace(
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
  syncedAt: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...remote }
  for (const [key, lv] of Object.entries(local)) {
    const rv = remote[key]
    if (Array.isArray(lv) && Array.isArray(rv) && (isItemList(lv) || isItemList(rv))) {
      out[key] = mergeList(lv as Item[], rv as Item[], syncedAt)
    } else if (lv !== undefined) {
      out[key] = lv
    }
  }
  return out
}
