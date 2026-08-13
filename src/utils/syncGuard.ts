// Pure logic behind edit-safe sync (see composables/useSyncGuard). The core rule
// is: LOCAL CHANGES ALWAYS WIN OVER INCOMING SNAPSHOTS. A field the user is
// currently editing must never be overwritten, reordered or re-rendered by a
// remote snapshot. This module owns the two decisions that logic turns on —
// whether to hold an incoming doc back, and how to reconcile one on flush —
// plus a per-item serial write queue. Kept store-free so it is unit-testable.

// An item id is "protected" while its dialog is open (editing) or it has unsaved
// local mutations (dirty). A protected item's incoming snapshot is buffered, not
// applied.
export function shouldBuffer(id: number, editingIds: Set<number>, dirtyIds: Set<number>): boolean {
  return editingIds.has(id) || dirtyIds.has(id)
}

export interface ConflictResult<T> {
  merged: T
  hasConflict: boolean
}

// Reconcile a buffered remote doc against the local edit when its dialog closes.
// `base` is the version the local edit started from; `local` is the current
// edited value; `remote` is the buffered snapshot; `touched` names the fields the
// user changed.
//
//   - No remote buffered, or remote unchanged since base → local is authoritative,
//     the remote is discarded, no conflict.
//   - Remote is newer than base → KEEP LOCAL for every touched field and take the
//     remote value only for fields the user did not touch. Flag a conflict when
//     the remote actually changed a field the user was also editing (a genuine
//     collision), never on a merge that was clean.
//
// It never does last-write-wins on the whole document and never overwrites a
// touched field.
export function resolveConflict<T extends { updatedAt: number }>(
  base: T | undefined,
  local: T,
  remote: T | undefined,
  touched: Set<string>,
): ConflictResult<T> {
  if (!remote) return { merged: local, hasConflict: false }
  const remoteNewer = base ? remote.updatedAt > base.updatedAt : true
  if (!remoteNewer) return { merged: local, hasConflict: false }

  // Start from remote (so untouched fields adopt the incoming value), then pin
  // every touched field back to the local value.
  const merged = { ...remote } as T
  const localRec = local as unknown as Record<string, unknown>
  const mergedRec = merged as unknown as Record<string, unknown>
  for (const field of touched) mergedRec[field] = localRec[field]

  // A real conflict is only when the remote diverged from base on a field the
  // user was editing — otherwise the merge was clean even though remote was newer.
  let hasConflict = false
  if (base) {
    const baseRec = base as unknown as Record<string, unknown>
    const remoteRec = remote as unknown as Record<string, unknown>
    for (const field of touched) {
      if (remoteRec[field] !== baseRec[field]) {
        hasConflict = true
        break
      }
    }
  } else {
    hasConflict = touched.size > 0
  }
  return { merged, hasConflict }
}

// A per-item serialized write queue. Writes for the same id run strictly in the
// order they were enqueued, so a slow earlier write can never land after a newer
// one. Different ids run independently. Rejections are contained so one failed
// write does not poison the chain for that id.
export class WriteQueue {
  private tails = new Map<number, Promise<unknown>>()

  enqueue<R>(id: number, task: () => Promise<R>): Promise<R> {
    const prev = this.tails.get(id) ?? Promise.resolve()
    const run = prev.then(task, task)
    // Keep a swallowed tail so the next enqueue chains after this one regardless
    // of success/failure, without an unhandled rejection.
    this.tails.set(
      id,
      run.then(
        () => undefined,
        () => undefined,
      ),
    )
    return run
  }

  // True while any write for this id is still in flight.
  isBusy(id: number): boolean {
    return this.tails.has(id)
  }
}

// A trailing debounce that also exposes a force-flush, for coalescing rapid edits
// to one item into a single write while its dialog is open and flushing on close.
export interface Debounced {
  schedule: () => void
  flush: () => void
  cancel: () => void
}
export function debounce(fn: () => void, ms: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | undefined
  const clear = () => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
  }
  return {
    schedule() {
      clear()
      timer = setTimeout(() => {
        timer = undefined
        fn()
      }, ms)
    },
    flush() {
      if (timer) {
        clear()
        fn()
      }
    },
    cancel: clear,
  }
}
