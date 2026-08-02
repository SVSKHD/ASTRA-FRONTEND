// The pointer-driven drag-to-nest engine, shared as a single module-level drag
// session (one drag at a time). Rows call startDrag() from a grip handle; the
// engine tracks the pointer, resolves the drop target + zone from the DOM, checks
// validity against the live link graph, auto-scrolls near the edges, and on drop
// calls the store's nestUnder / unnestFrom (which reuse the existing link model).
//
// Pointer events (not HTML5 drag) so it works with mouse, trackpad, touch and
// Pencil, and can be styled. Deliberately additive: it starts only from the grip,
// so it never fights the row's existing native day-drag.

import { reactive, readonly } from 'vue'
import { useAppStore } from '@/stores/app'
import { autoScrollSpeed, resolveZone, type DropZone } from '@/utils/dragNest'
import { linkKey } from '@/utils/links'
import type { LinkRef } from '@/types'

interface DragState {
  active: boolean
  refs: LinkRef[]
  title: string
  badge: string
  count: number
  x: number
  y: number
  targetKey: string | null // `collection:id` of the hovered row
  zone: DropZone
  valid: boolean
  reason: string
  // The parent each dragged child is being lifted out of, keyed `collection:id`.
  sourceParents: Record<string, LinkRef | null>
}

const state = reactive<DragState>({
  active: false,
  refs: [],
  title: '',
  badge: '',
  count: 0,
  x: 0,
  y: 0,
  targetKey: null,
  zone: 'nest',
  valid: false,
  reason: '',
  sourceParents: {},
})

let scrollTimer: ReturnType<typeof setInterval> | undefined
let announce: (msg: string) => void = () => {}

function reduceMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

// Find the row under the pointer and resolve target + zone + validity.
function updateTarget(app: ReturnType<typeof useAppStore>) {
  if (typeof document === 'undefined') return
  const el = document.elementFromPoint(state.x, state.y) as HTMLElement | null
  const row = el?.closest('[data-nest-id]') as HTMLElement | null
  if (!row) {
    state.targetKey = null
    state.valid = false
    state.reason = ''
    return
  }
  const id = Number(row.dataset.nestId)
  const collection = row.dataset.nestCollection as LinkRef['collection']
  const target: LinkRef = { id, collection }
  const rect = row.getBoundingClientRect()
  state.zone = resolveZone(state.y - rect.top, rect.height)
  const key = linkKey(target)
  state.targetKey = key
  // Only the nest zone links; above/below are (future) reorder and read as valid
  // no-ops here so the row still highlights without a nest.
  if (state.zone !== 'nest') {
    state.valid = false
    state.reason = ''
    return
  }
  // Valid if every dragged child may link under the target.
  let ok = state.refs.length > 0
  let reason = ''
  for (const child of state.refs) {
    const res = app.canLinkItems(target, child)
    if (!res.ok) {
      // A child that is already this target's child is fine to "skip" silently in
      // a batch, but for a single drag it means nothing to do → invalid.
      ok = false
      reason = res.reason ?? ''
      break
    }
  }
  state.valid = ok
  state.reason = reason
}

function onMove(e: PointerEvent) {
  state.x = e.clientX
  state.y = e.clientY
  updateTarget(useAppStore())
}

function tickAutoScroll() {
  if (typeof document === 'undefined' || !state.targetKey) return
  const row = document.querySelector(
    `[data-nest-id="${state.targetKey.split(':')[1]}"]`,
  ) as HTMLElement | null
  const scroller = findScrollable(row)
  if (!scroller) return
  const rect = scroller.getBoundingClientRect()
  const speed = autoScrollSpeed(state.y, rect.top, rect.bottom)
  if (speed) scroller.scrollTop += speed
}

function findScrollable(el: HTMLElement | null): HTMLElement | null {
  let cur = el?.parentElement || null
  while (cur) {
    const oy = getComputedStyle(cur).overflowY
    if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur
    cur = cur.parentElement
  }
  return null
}

function end(commit: boolean) {
  const app = useAppStore()
  if (commit && state.active) {
    if (state.targetKey && state.zone === 'nest' && state.valid) {
      const [collection, idStr] = state.targetKey.split(':')
      const target: LinkRef = { id: Number(idStr), collection: collection as LinkRef['collection'] }
      app.nestUnder(state.refs, target, state.sourceParents)
      announce('Linked')
    } else if (!state.targetKey) {
      // Dropped on empty space → unnest any child that had a source parent.
      let any = false
      for (const child of state.refs) {
        const parent = state.sourceParents[linkKey(child)]
        if (parent) {
          app.unnestFrom(child, parent)
          any = true
        }
      }
      if (any) announce('Moved to top level')
    }
  }
  cleanup()
}

function cleanup() {
  state.active = false
  state.refs = []
  state.targetKey = null
  state.valid = false
  state.reason = ''
  state.sourceParents = {}
  if (typeof window !== 'undefined') {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('keydown', onKey)
  }
  if (scrollTimer) {
    clearInterval(scrollTimer)
    scrollTimer = undefined
  }
}

function onUp() {
  end(true)
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    end(false)
  }
}

export interface StartDragOptions {
  title: string
  badge?: string
  count?: number
  sourceParent?: LinkRef | null
}

export function useDragNest() {
  function startDrag(refs: LinkRef[], e: PointerEvent, opts: StartDragOptions) {
    if (!refs.length || typeof window === 'undefined') return
    state.active = true
    state.refs = refs
    state.title = opts.title
    state.badge = opts.badge ?? ''
    state.count = opts.count ?? refs.length
    state.x = e.clientX
    state.y = e.clientY
    state.targetKey = null
    state.valid = false
    state.reason = ''
    state.sourceParents = {}
    if (opts.sourceParent) {
      for (const r of refs) state.sourceParents[linkKey(r)] = opts.sourceParent
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    if (!scrollTimer) scrollTimer = setInterval(tickAutoScroll, 16)
    announce('Picked up ' + opts.title)
  }

  // Rows use this to style the active drop target.
  function targetState(ref: LinkRef): { active: boolean; zone: DropZone; valid: boolean } {
    const active = state.active && state.targetKey === linkKey(ref)
    return { active, zone: state.zone, valid: state.valid }
  }

  function setAnnouncer(fn: (msg: string) => void) {
    announce = fn
  }

  return {
    drag: readonly(state),
    startDrag,
    targetState,
    cancel: () => end(false),
    setAnnouncer,
    reduceMotion,
  }
}
