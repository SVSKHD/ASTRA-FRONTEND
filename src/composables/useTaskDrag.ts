// Any-depth drag and drop for the flat task tree, shared as a single module-level
// drag session (one drag at a time), matching useDragNest's pointer-driven model
// so it works with mouse, trackpad, touch and Pencil and can be styled.
//
// A grip starts the drag; the engine tracks the pointer, resolves the row (or the
// root strip) under it and which third of the row (above / nest / below), checks
// the drop against the live tree for cycles, auto-scrolls near the edges, and on
// release commits through the store's moveTask — which drags the whole subtree,
// writes fractional order plus recomputed depth/rootId in one batch, and rolls
// back on failure. An illegal drop plays a reject (shake) animation and writes
// nothing.
//
// Touch begins on a long-press (~250ms) so a drag does not fight vertical scroll;
// mouse/pen begin immediately.

import { reactive, readonly } from 'vue'
import { useAppStore } from '@/stores/app'
import { autoScrollSpeed } from '@/utils/dragNest'
import {
  buildIndex,
  isValidDrop,
  resolveDrop,
  type DropTarget,
  type DropZone,
} from '@/utils/taskTree'

const LONG_PRESS_MS = 250
const TOUCH_MOVE_CANCEL = 8 // px of movement that cancels a pending long-press

interface DragState {
  active: boolean
  id: number | null
  title: string
  x: number
  y: number
  // The row under the pointer (`collection:id`-free — tasks only), or null.
  targetId: number | null
  onRoot: boolean
  zone: DropZone
  valid: boolean
  // Pulsed true briefly when an illegal drop is released, to drive a shake.
  reject: boolean
}

const state = reactive<DragState>({
  active: false,
  id: null,
  title: '',
  x: 0,
  y: 0,
  targetId: null,
  onRoot: false,
  zone: 'nest',
  valid: false,
  reject: false,
})

let scrollTimer: ReturnType<typeof setInterval> | undefined
let longPressTimer: ReturnType<typeof setTimeout> | undefined
let pendingStart: { id: number; title: string; startX: number; startY: number } | null = null

function currentTarget(): DropTarget | null {
  if (state.onRoot) return { kind: 'root' }
  if (state.targetId != null) return { kind: 'row', id: state.targetId, zone: state.zone }
  return null
}

function updateTarget() {
  if (typeof document === 'undefined' || state.id == null) return
  const el = document.elementFromPoint(state.x, state.y) as HTMLElement | null
  const root = el?.closest('[data-tasktree-root]') as HTMLElement | null
  const row = el?.closest('[data-tasktree-id]') as HTMLElement | null
  if (root && !row) {
    state.onRoot = true
    state.targetId = null
    state.valid = isValidDrop(index(), state.id, { parentId: null, position: 0 })
    return
  }
  state.onRoot = false
  if (!row) {
    state.targetId = null
    state.valid = false
    return
  }
  const id = Number(row.dataset.tasktreeId)
  const rect = row.getBoundingClientRect()
  state.zone = resolveZone(state.y - rect.top, rect.height)
  state.targetId = id
  const idx = index()
  const plan = resolveDrop(idx, state.id, { kind: 'row', id, zone: state.zone })
  state.valid = isValidDrop(idx, state.id, plan)
}

// Zone thresholds identical to the nest drag: top/bottom quarters reorder, the
// middle half nests. Kept local so a self-drop onto its own middle still reads as
// a (rejected) nest rather than silently doing nothing.
function resolveZone(offsetY: number, height: number): DropZone {
  if (height <= 0) return 'nest'
  const r = Math.max(0, Math.min(1, offsetY / height))
  if (r < 0.25) return 'above'
  if (r > 0.75) return 'below'
  return 'nest'
}

function index() {
  return buildIndex(useAppStore().tasks)
}

function onMove(e: PointerEvent) {
  if (pendingStart) {
    // Still waiting on the long-press: a real drag scroll cancels it.
    if (
      Math.abs(e.clientX - pendingStart.startX) > TOUCH_MOVE_CANCEL ||
      Math.abs(e.clientY - pendingStart.startY) > TOUCH_MOVE_CANCEL
    ) {
      cancelPending()
    }
    return
  }
  if (!state.active) return
  e.preventDefault()
  state.x = e.clientX
  state.y = e.clientY
  updateTarget()
}

function tickAutoScroll() {
  if (typeof document === 'undefined' || !state.active) return
  const scroller = findScrollable()
  if (!scroller) return
  const rect = scroller.getBoundingClientRect()
  const speed = autoScrollSpeed(state.y, rect.top, rect.bottom)
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

function commit() {
  const app = useAppStore()
  const target = currentTarget()
  if (state.id == null || !target) return cleanup()
  const idx = index()
  const plan = resolveDrop(idx, state.id, target)
  if (!plan || !isValidDrop(idx, state.id, plan)) {
    flashReject()
    return cleanup()
  }
  const ok = app.moveTask(state.id, plan.parentId, plan.position)
  if (!ok) flashReject()
  cleanup()
}

function flashReject() {
  state.reject = true
  setTimeout(() => {
    state.reject = false
  }, 400)
}

function begin() {
  if (!pendingStart) return
  state.active = true
  state.id = pendingStart.id
  state.title = pendingStart.title
  state.x = pendingStart.startX
  state.y = pendingStart.startY
  state.targetId = null
  state.onRoot = false
  state.valid = false
  pendingStart = null
  if (!scrollTimer) scrollTimer = setInterval(tickAutoScroll, 16)
  updateTarget()
}

function cancelPending() {
  clearTimeout(longPressTimer)
  longPressTimer = undefined
  pendingStart = null
  teardownListeners()
}

function cleanup() {
  state.active = false
  state.id = null
  state.targetId = null
  state.onRoot = false
  state.valid = false
  pendingStart = null
  clearTimeout(longPressTimer)
  longPressTimer = undefined
  teardownListeners()
  if (scrollTimer) {
    clearInterval(scrollTimer)
    scrollTimer = undefined
  }
}

function onUp() {
  if (pendingStart) return cancelPending()
  if (state.active) commit()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    cleanup()
  }
}
function teardownListeners() {
  if (typeof window === 'undefined') return
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onUp)
  window.removeEventListener('keydown', onKey)
}

export interface StartTaskDragOptions {
  title: string
}

export function useTaskDrag() {
  function startDrag(taskId: number, e: PointerEvent, opts: StartTaskDragOptions) {
    if (typeof window === 'undefined') return
    e.preventDefault()
    e.stopPropagation()
    pendingStart = { id: taskId, title: opts.title, startX: e.clientX, startY: e.clientY }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    if (e.pointerType === 'touch') {
      // Long-press so a drag does not hijack a vertical scroll gesture.
      longPressTimer = setTimeout(begin, LONG_PRESS_MS)
    } else {
      begin()
    }
  }

  // Row styling for the active drop target.
  function targetState(taskId: number): { active: boolean; zone: DropZone; valid: boolean } {
    return {
      active: state.active && !state.onRoot && state.targetId === taskId,
      zone: state.zone,
      valid: state.valid,
    }
  }

  function rootState(): { active: boolean; valid: boolean } {
    return { active: state.active && state.onRoot, valid: state.valid }
  }

  return {
    drag: readonly(state),
    startDrag,
    targetState,
    rootState,
    isDragging: () => state.active,
    cancel: cleanup,
  }
}
