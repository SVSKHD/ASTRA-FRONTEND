// Edit-safe sync guard, shared as a single module-level session (like
// useDragNest / useAccordionState). It holds the state the store's snapshot
// handler consults so that LOCAL CHANGES ALWAYS WIN OVER INCOMING SNAPSHOTS:
// a field the user is editing is never overwritten, and the list behind an open
// dialog never reorders from remote data.
//
//   editingIds   tasks with an open dialog / focused input
//   dirtyIds     tasks with unsaved local mutations
//   buffer       incoming snapshots held back (per-id, for the dirty-but-closed
//                window) plus the whole held list while a dialog is open
//
// The guard is deliberately store-free (the store drives it) so it never forms a
// circular import with the store that consumes it. Pure decisions live in
// utils/syncGuard; this file is the stateful glue plus the reactive flags the UI
// reads (conflict badge, "view remote version").

import { computed, reactive, ref } from 'vue'
import { resolveConflict, shouldBuffer, type ConflictResult } from '@/utils/syncGuard'
import type { Task } from '@/types'

// Reactive sets so `editingIds.size` etc. track in templates and computeds.
const editingIds = reactive(new Set<number>())
const dirtyIds = reactive(new Set<number>())

// The base version each edit started from, and the fields the user has touched —
// the inputs to conflict resolution on close.
const base = new Map<number, Task>()
const touched = new Map<number, Set<string>>()

// Per-id remote docs held back while their item was dirty-but-closed.
const buffer = new Map<number, Task>()
// The entire incoming task list, held while any dialog is open so the list does
// not reflow underneath it (section g). Applied on close.
let heldTasks: Task[] | null = null

// Remote versions of items that ended in a conflict, so the badge can offer to
// show "the remote version".
const remoteVersions = reactive(new Map<number, Task>())

// True whenever an edit is open — the signal any periodic/background sync must
// check to pause itself (section b). This app persists on change rather than on
// an interval, so this is the single suppression point.
const syncSuppressed = computed(() => editingIds.size > 0)
// Bumped whenever the guard applies a batch of remote data, so callers can react.
const revision = ref(0)

function beginEdit(id: number, snapshot: Task) {
  editingIds.add(id)
  base.set(id, { ...snapshot })
  if (!touched.has(id)) touched.set(id, new Set())
}

// Record a touched field, marking the item dirty. Only meaningful while editing.
function markTouched(id: number, field: string) {
  if (!editingIds.has(id)) return
  dirtyIds.add(id)
  touched.get(id)?.add(field)
}

// Called from the store's snapshot handler with the current and freshly-built
// incoming task arrays. Returns the array the store should actually apply.
//   - a dialog is open  → freeze: stash the whole incoming list, keep current.
//   - only dirty items  → apply incoming but keep the local copy of each dirty
//     item and stash its remote for the flush.
//   - otherwise         → apply incoming unchanged.
function reconcileTasks(current: Task[], incoming: Task[]): Task[] {
  if (editingIds.size > 0) {
    heldTasks = incoming
    return current
  }
  if (dirtyIds.size === 0) return incoming
  const currentById = new Map(current.map((t) => [t.id, t]))
  return incoming.map((remote) => {
    if (shouldBuffer(remote.id, editingIds, dirtyIds)) {
      buffer.set(remote.id, remote)
      return currentById.get(remote.id) ?? remote
    }
    return remote
  })
}

export interface FlushResolution {
  // The remote doc to reconcile the edited item against (from the held list or
  // the per-id buffer), if any arrived during the edit.
  conflict: ConflictResult<Task> | null
  // The full remote list held while the dialog was open, to apply on close so the
  // list catches up once — with the edited item already merged in.
  heldTasks: Task[] | null
}

// Resolve the buffered remote against the local edit, and hand back the held list
// so the store can apply everything in one write. Clears this item's guard state.
function resolveOnClose(id: number, localCurrent: Task): FlushResolution {
  const remote = heldTasks?.find((t) => t.id === id) ?? buffer.get(id)
  const touchedFields = touched.get(id) ?? new Set<string>()
  const conflict =
    remote || base.has(id)
      ? resolveConflict(base.get(id), localCurrent, remote, touchedFields)
      : null
  if (conflict?.hasConflict && remote) remoteVersions.set(id, remote)
  // Clear this item's guard state.
  editingIds.delete(id)
  dirtyIds.delete(id)
  base.delete(id)
  touched.delete(id)
  buffer.delete(id)
  // The held list is handed back only by the LAST dialog out. Applying it while
  // another is still open is exactly the reflow the freeze exists to prevent —
  // the detail dialog's drill-in walks through that state on every step.
  const last = editingIds.size === 0
  const held = last ? heldTasks : null
  if (last) heldTasks = null
  revision.value++
  return { conflict, heldTasks: held }
}

// A hold with no edit to reconcile: the goal detail dialog (section 18e). A goal
// is not a Task, so there is nothing for resolveConflict to merge — but the list
// BEHIND the dialog is full of tasks, and freezing it is the whole point. The
// hold registers in the same set, so `syncSuppressed` and the list freeze in
// `reconcileTasks` cover a goal dialog exactly as they cover a task one.
function beginHold(id: number) {
  editingIds.add(id)
}

// Release a hold and, once the last dialog has gone, hand back the list held
// while it was open so the store can apply it in one write. Returns null while
// another dialog is still open — applying a held list underneath it is precisely
// the reflow the freeze exists to prevent.
function releaseHold(id: number): Task[] | null {
  editingIds.delete(id)
  if (editingIds.size > 0) return null
  const held = heldTasks
  heldTasks = null
  revision.value++
  return held
}

function clearConflict(id: number) {
  remoteVersions.delete(id)
}
function remoteVersionOf(id: number): Task | undefined {
  return remoteVersions.get(id)
}
function isEditing(id: number): boolean {
  return editingIds.has(id)
}

export function useSyncGuard() {
  return {
    editingIds,
    dirtyIds,
    syncSuppressed,
    revision,
    beginEdit,
    beginHold,
    releaseHold,
    markTouched,
    reconcileTasks,
    resolveOnClose,
    clearConflict,
    remoteVersionOf,
    isEditing,
  }
}
