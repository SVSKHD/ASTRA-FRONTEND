// The affordance-rich drag engine for the flat todo/task tree, shared as a single
// module-level session (one drag at a time) across both collections. It is
// pointer-driven (mouse/pen/touch/Pencil) and resolves, live, one of three
// visually distinct drop states from the pointer:
//
//   REORDER  — between two rows: a line at the projected indent. Horizontal
//              position sets depth (drag left to promote, right to nest), via the
//              pure projection in utils/treeProjection.
//   NEST     — over the middle of a row: becomes that row's child.
//   ROOT     — over the dedicated root strip: becomes top-level.
//
// A cycle (dropping onto own descendant) is INVALID: red indicator, no write,
// shake. Extras: touch long-press to start (so scroll still works), a lift +
// ghost on the source row, edge auto-scroll, dwell-to-expand a collapsed parent,
// Escape to cancel, and a keyboard drag mode driven from the handle.

import { reactive, readonly } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAccordionState } from '@/composables/useAccordionState'
import { autoScrollSpeed } from '@/utils/dragNest'
import { buildIndex, childrenOf, wouldCreateCycle } from '@/utils/taskTree'
import { projectReorder, type FlatRow } from '@/utils/treeProjection'
import type { Task, Todo } from '@/types'

export type TreeCollection = 'tasks' | 'todos'
export const INDENT_PX = 24
const LONG_PRESS_MS = 250
const TOUCH_MOVE_CANCEL = 8
const DWELL_EXPAND_MS = 600

export type DropMode = 'none' | 'reorder' | 'nest' | 'root'

interface DragState {
  active: boolean
  keyboard: boolean
  collection: TreeCollection
  id: number | null
  title: string
  x: number
  y: number
  startX: number
  // Live resolution the rows and strip read to draw indicators.
  mode: DropMode
  targetId: number | null
  side: 'above' | 'below'
  indentDepth: number
  valid: boolean
  // Resolved (parentId, position) to commit; kept off the reactive read path.
  reject: boolean
}

const state = reactive<DragState>({
  active: false,
  keyboard: false,
  collection: 'tasks',
  id: null,
  title: '',
  x: 0,
  y: 0,
  startX: 0,
  mode: 'none',
  targetId: null,
  side: 'below',
  indentDepth: 0,
  valid: false,
  reject: false,
})

// The committed drop plan resolved on the last move; consumed on release.
let plan: { parentId: number | null; position: number } | null = null
let scrollTimer: ReturnType<typeof setInterval> | undefined
let longPressTimer: ReturnType<typeof setTimeout> | undefined
let dwellTimer: ReturnType<typeof setTimeout> | undefined
let dwellId: number | null = null
let pendingStart: { collection: TreeCollection; id: number; title: string } | null = null
let announce: (msg: string) => void = () => {}

function items(collection: TreeCollection): (Task | Todo)[] {
  const app = useAppStore()
  return collection === 'tasks' ? app.tasks : app.todos
}
function move(collection: TreeCollection, id: number, parentId: number | null, position: number) {
  const app = useAppStore()
  return collection === 'tasks'
    ? app.moveTask(id, parentId, position)
    : app.moveTodo(id, parentId, position)
}
function treeKey(collection: TreeCollection, id: number): string {
  return (collection === 'tasks' ? 'tasktree:' : 'todotree:') + id
}
function titleOf(collection: TreeCollection, id: number): string {
  const it = items(collection).find((x) => x.id === id)
  if (!it) return '(untitled)'
  return (collection === 'tasks' ? (it as Task).title : (it as Todo).text) || '(untitled)'
}

// The on-screen rows for the active collection, in document (display) order, read
// from the data attributes each row bar carries. Matches exactly what is visible,
// so a collapsed subtree is naturally excluded.
function visibleRows(): FlatRow[] {
  if (typeof document === 'undefined') return []
  const els = document.querySelectorAll<HTMLElement>(
    `[data-tree-collection="${state.collection}"][data-tree-id]`,
  )
  return Array.from(els).map((el) => ({
    id: Number(el.dataset.treeId),
    parentId: el.dataset.treeParent ? Number(el.dataset.treeParent) : null,
    depth: Number(el.dataset.treeDepth) || 0,
  }))
}

function haptic() {
  try {
    navigator.vibrate?.(10)
  } catch {
    /* not supported */
  }
}

// --- target resolution ------------------------------------------------------
function clearTarget() {
  state.mode = 'none'
  state.targetId = null
  state.valid = false
  plan = null
}

function resolveTarget() {
  if (typeof document === 'undefined' || state.id == null) return
  const el = document.elementFromPoint(state.x, state.y) as HTMLElement | null
  const strip = el?.closest(`[data-tree-root="${state.collection}"]`) as HTMLElement | null
  const rowEl = el?.closest(
    `[data-tree-collection="${state.collection}"][data-tree-id]`,
  ) as HTMLElement | null

  if (strip && !rowEl) {
    state.mode = 'root'
    state.targetId = null
    state.indentDepth = 0
    state.valid = true
    plan = { parentId: null, position: rootCount() }
    return
  }
  if (!rowEl) return clearTarget()

  const overId = Number(rowEl.dataset.treeId)
  const rect = rowEl.getBoundingClientRect()
  const rel = rect.height > 0 ? (state.y - rect.top) / rect.height : 0.5
  const index = buildIndex(items(state.collection))

  if (rel >= 0.25 && rel <= 0.75) {
    // NEST — become a child of this row.
    maybeDwell(overId, index)
    state.mode = 'nest'
    state.targetId = overId
    state.side = 'below'
    state.indentDepth = (rowEl.dataset.treeDepth ? Number(rowEl.dataset.treeDepth) : 0) + 1
    const cyclic = wouldCreateCycle(index, state.id, overId)
    state.valid = !cyclic
    plan = cyclic
      ? null
      : {
          parentId: overId,
          position: childrenOf(index, overId).filter((c) => c.id !== state.id).length,
        }
    return
  }

  // REORDER — resolve parent/depth from vertical side + horizontal offset.
  clearDwell()
  const side: 'above' | 'below' = rel < 0.25 ? 'above' : 'below'
  const dragDepthDelta = Math.round((state.x - state.startX) / INDENT_PX)
  const projected = projectReorder(visibleRows(), state.id, overId, side, dragDepthDelta)
  state.mode = 'reorder'
  state.targetId = overId
  state.side = side
  if (!projected) {
    state.valid = false
    plan = null
    return
  }
  state.indentDepth = projected.depth
  const cyclic = wouldCreateCycle(index, state.id, projected.parentId)
  state.valid = !cyclic
  plan = cyclic ? null : { parentId: projected.parentId, position: projected.position }
}

function rootCount(): number {
  const index = buildIndex(items(state.collection))
  return (index.children.get(null) ?? []).filter((n) => n.id !== state.id).length
}

// --- dwell-to-expand a collapsed parent -------------------------------------
function maybeDwell(overId: number, index: ReturnType<typeof buildIndex>) {
  const accordion = useAccordionState()
  const hasKids = childrenOf(index, overId).length > 0
  const collapsed = hasKids && !accordion.isOpen(treeKey(state.collection, overId))
  if (!collapsed) return clearDwell()
  if (dwellId === overId) return
  clearDwell()
  dwellId = overId
  dwellTimer = setTimeout(() => {
    accordion.set(treeKey(state.collection, overId), true)
    announce('Expanded')
    dwellId = null
  }, DWELL_EXPAND_MS)
}
function clearDwell() {
  if (dwellTimer) clearTimeout(dwellTimer)
  dwellTimer = undefined
  dwellId = null
}

// --- pointer plumbing -------------------------------------------------------
function onMove(e: PointerEvent) {
  if (pendingStart) {
    if (
      Math.abs(e.clientX - state.startX) > TOUCH_MOVE_CANCEL ||
      Math.abs(e.clientY - state.y) > TOUCH_MOVE_CANCEL
    ) {
      cancelPending()
    }
    return
  }
  if (!state.active) return
  e.preventDefault()
  state.x = e.clientX
  state.y = e.clientY
  resolveTarget()
}

function tickAutoScroll() {
  if (typeof document === 'undefined' || !state.active) return
  const scroller = findScrollable()
  if (!scroller) return
  const rect = scroller.getBoundingClientRect()
  const speed = autoScrollSpeed(state.y, rect.top, rect.bottom, 60)
  if (speed) scroller.scrollTop += speed
}
function findScrollable(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  let cur = document.elementFromPoint(state.x, state.y) as HTMLElement | null
  while (cur) {
    const oy = getComputedStyle(cur).overflowY
    if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur
    cur = cur.parentElement
  }
  return null
}

function begin() {
  if (!pendingStart) return
  state.active = true
  state.collection = pendingStart.collection
  state.id = pendingStart.id
  state.title = pendingStart.title
  clearTarget()
  pendingStart = null
  haptic()
  if (!scrollTimer) scrollTimer = setInterval(tickAutoScroll, 16)
  announce('Picked up ' + state.title)
  resolveTarget()
}

function commit() {
  if (state.id != null && state.mode !== 'none' && state.valid && plan) {
    const ok = move(state.collection, state.id, plan.parentId, plan.position)
    if (ok) announce('Moved ' + state.title)
    else flashReject()
  } else if (state.mode !== 'none' && !state.valid) {
    flashReject()
  }
  cleanup()
}

function flashReject() {
  state.reject = true
  announce("Can't drop there")
  setTimeout(() => {
    state.reject = false
  }, 400)
}

function cancelPending() {
  clearTimeout(longPressTimer)
  longPressTimer = undefined
  pendingStart = null
  teardown()
}

function cleanup() {
  state.active = false
  state.keyboard = false
  state.id = null
  clearTarget()
  clearDwell()
  pendingStart = null
  if (longPressTimer) clearTimeout(longPressTimer)
  longPressTimer = undefined
  if (scrollTimer) {
    clearInterval(scrollTimer)
    scrollTimer = undefined
  }
  teardown()
}

function onUp() {
  if (pendingStart) return cancelPending()
  if (state.active) commit()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    announce('Cancelled')
    cleanup()
  }
}
function teardown() {
  if (typeof window === 'undefined') return
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onUp)
  window.removeEventListener('keydown', onKey)
}

// --- keyboard drag mode -----------------------------------------------------
// Space/Enter on the handle enters keyboard mode; arrows move/indent; Enter
// commits; Escape cancels. Position/parent are computed from the live tree so it
// shares the same move() as pointer drops.
function keyboardStart(collection: TreeCollection, id: number) {
  cleanup()
  state.active = true
  state.keyboard = true
  state.collection = collection
  state.id = id
  state.title = titleOf(collection, id)
  announce('Grabbed ' + state.title + '. Use arrow keys to move, Enter to drop, Escape to cancel.')
}
function keyboardMove(dy: number) {
  const index = buildIndex(items(state.collection))
  const id = state.id as number
  const node = index.byId.get(id)
  if (!node) return
  const siblings = (index.children.get(node.parentId) ?? []).filter((n) => n.id !== id)
  const cur = siblings.findIndex((n) => (n.order ?? 0) > (node.order ?? 0))
  const curPos = cur < 0 ? siblings.length : cur
  const next = Math.max(0, Math.min(curPos + dy, siblings.length))
  if (move(state.collection, id, node.parentId, next)) announce('Moved to position ' + (next + 1))
}
function keyboardIndent(dir: -1 | 1) {
  const index = buildIndex(items(state.collection))
  const id = state.id as number
  const node = index.byId.get(id)
  if (!node) return
  if (dir === 1) {
    // Nest under the previous sibling.
    const siblings = index.children.get(node.parentId) ?? []
    const i = siblings.findIndex((n) => n.id === id)
    const prev = i > 0 ? siblings[i - 1] : null
    if (prev && move(state.collection, id, prev.id, childrenOf(index, prev.id).length))
      announce('Nested under ' + titleOf(state.collection, prev.id))
  } else {
    // Promote: become a sibling of the current parent (Left at depth 1 → root).
    if (node.parentId == null) return
    const parent = index.byId.get(node.parentId)
    const grandParent = parent ? parent.parentId : null
    const gSiblings = (index.children.get(grandParent) ?? []).filter((n) => n.id !== id)
    const at = parent ? gSiblings.findIndex((n) => n.id === parent.id) : -1
    const pos = at < 0 ? gSiblings.length : at + 1
    if (move(state.collection, id, grandParent, pos))
      announce(grandParent == null ? 'Promoted to top level' : 'Promoted one level')
  }
}

export function useTreeDrag() {
  function startPointerDrag(
    collection: TreeCollection,
    id: number,
    e: PointerEvent,
    opts: { title: string },
  ) {
    if (typeof window === 'undefined') return
    e.preventDefault()
    e.stopPropagation()
    pendingStart = { collection, id, title: opts.title }
    state.startX = e.clientX
    state.x = e.clientX
    state.y = e.clientY
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    if (e.pointerType === 'touch') longPressTimer = setTimeout(begin, LONG_PRESS_MS)
    else begin()
  }

  // Keyboard entry + arrow handling from the focused handle.
  function onHandleKeydown(collection: TreeCollection, id: number, e: KeyboardEvent) {
    if (!state.keyboard) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        keyboardStart(collection, id)
      }
      return
    }
    // In keyboard-drag mode.
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      keyboardMove(-1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      keyboardMove(1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      keyboardIndent(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      keyboardIndent(1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      announce('Dropped ' + state.title)
      cleanup()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      announce('Cancelled')
      cleanup()
    }
  }

  // Row styling for the current drop target.
  function targetState(collection: TreeCollection, id: number) {
    const active = state.active && state.collection === collection && state.targetId === id
    return {
      active,
      mode: state.mode,
      side: state.side,
      indentDepth: state.indentDepth,
      valid: state.valid,
    }
  }
  function rootState(collection: TreeCollection) {
    return {
      dragging: state.active && state.collection === collection,
      active: state.active && state.collection === collection && state.mode === 'root',
      valid: state.valid,
    }
  }
  // Whether a given row is the source being dragged (for the lift/ghost styling).
  function isSource(collection: TreeCollection, id: number) {
    return state.active && state.collection === collection && state.id === id
  }

  function setAnnouncer(fn: (msg: string) => void) {
    announce = fn
  }

  return {
    drag: readonly(state),
    startPointerDrag,
    onHandleKeydown,
    targetState,
    rootState,
    isSource,
    isDragging: () => state.active,
    cancel: cleanup,
    setAnnouncer,
  }
}
