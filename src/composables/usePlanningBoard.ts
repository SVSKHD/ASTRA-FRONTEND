// The JointJS wrapper for a planning board. JointJS mutates the DOM directly, so
// it is kept entirely outside Vue's reactivity: the graph and paper live in
// shallowRef (never ref/reactive — a deep proxy would wreck Joint's internals),
// and Vue↔Joint communication is exclusively through explicit events. Store →
// graph goes through syncGraphFromStore() which diffs by id; graph → store goes
// through the paper/graph event handlers below (position, add link, remove).
//
// A node being dragged or text-edited is registered in the shared useSyncGuard so
// an incoming snapshot never yanks it out from under the pointer; position writes
// are debounced ~400ms per node and force-flushed on pointerup.

import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'
import { dia, shapes, elementTools, linkTools, util } from '@joint/core'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useSyncGuard } from '@/composables/useSyncGuard'
import { KIND_TOKEN } from '@/utils/planning'
import type { PlanningEdge, PlanningNode } from '@/types'

const ZOOM_MIN = 0.25
const ZOOM_MAX = 2.5
const POS_DEBOUNCE = 400

// A custom rounded-rect element: coloured left bar keyed to kind, a title, and an
// optional status pill — all fed from theme tokens so it follows dark/light.
const PlanNode = dia.Element.define(
  'plan.Node',
  {
    size: { width: 180, height: 64 },
    attrs: {
      body: {
        x: 0,
        y: 0,
        width: 'calc(w)',
        height: 'calc(h)',
        rx: 12,
        ry: 12,
        strokeWidth: 1.5,
      },
      bar: { x: 0, y: 0, width: 5, height: 'calc(h)', rx: 2.5 },
      label: {
        x: 16,
        y: 'calc(h/2)',
        textVerticalAnchor: 'middle',
        textAnchor: 'start',
        fontSize: 13,
        fontFamily: 'inherit',
      },
      status: {
        x: 'calc(w-14)',
        y: 14,
        textAnchor: 'end',
        fontSize: 10,
        opacity: 0.85,
      },
    },
  },
  {
    markup: util.svg`
      <rect @selector="body" />
      <rect @selector="bar" />
      <text @selector="label" />
      <text @selector="status" />
    `,
  },
)

export function usePlanningBoard(elRef: Ref<HTMLElement | null>, boardId: Ref<number | null>) {
  const app = useAppStore()
  const ui = useUiStore()
  const { theme } = storeToRefs(ui)
  const guard = useSyncGuard()

  const graph = shallowRef<dia.Graph | null>(null)
  const paper = shallowRef<dia.Paper | null>(null)
  const selectedId = shallowRef<number | null>(null)

  // Ids the store is mutating from graph events, so syncGraphFromStore skips them
  // (prevents an event → store → sync → event feedback loop).
  const localMutating = new Set<number>()
  const posTimers = new Map<number, ReturnType<typeof setTimeout>>()

  function color(token: 'accent' | 'dim' | 'text' | 'card' | 'border' | 'text2'): string {
    const c = theme.value as unknown as Record<string, string>
    return c[token] ?? '#888'
  }

  // --- store → graph ---------------------------------------------------------
  function nodeAttrs(n: PlanningNode) {
    const linked = linkedItem(n)
    const title = linked ? linkedTitle(linked) : n.label || '(untitled)'
    const status = linked ? linkedStatus(linked) : ''
    return {
      body: { fill: color('card'), stroke: color('border') },
      bar: { fill: n.color || color(KIND_TOKEN[n.kind]) },
      label: { text: util.breakText(title, { width: 150 }, {}), fill: color('text') },
      status: { text: status, fill: color('dim') },
    }
  }
  function linkedItem(n: PlanningNode) {
    if (!n.linkedType || n.linkedId == null) return null
    return n.linkedType === 'task'
      ? app.tasks.find((t) => t.id === n.linkedId)
      : app.todos.find((t) => t.id === n.linkedId)
  }
  function linkedTitle(it: { title?: string; text?: string }): string {
    return (it.title ?? it.text ?? '') || '(untitled)'
  }
  function linkedStatus(it: { status?: string }): string {
    return it.status === 'done' ? '✓ done' : it.status === 'progress' ? 'in progress' : ''
  }

  // Diff the store's nodes/edges for the active board against the graph and
  // reconcile: add new cells, update changed ones (skipping locally-mutating and
  // guard-protected nodes), remove departed ones.
  function syncGraphFromStore() {
    const g = graph.value
    const id = boardId.value
    if (!g || id == null) return
    const nodes = app.nodesOfBoard(id)
    const edges = app.edgesOfBoard(id)
    const wantNodeIds = new Set(nodes.map((n) => n.id))
    const wantEdgeIds = new Set(edges.map((e) => e.id))

    for (const n of nodes) {
      if (localMutating.has(n.id) || guard.editingIds.has(n.id)) continue
      const cell = g.getCell(String(n.id)) as dia.Element | null
      if (cell) {
        cell.position(n.x, n.y)
        cell.resize(n.width, n.height)
        cell.attr(nodeAttrs(n))
      } else {
        g.addCell(
          new PlanNode({
            id: String(n.id),
            position: { x: n.x, y: n.y },
            size: { width: n.width, height: n.height },
            attrs: nodeAttrs(n),
          }),
        )
      }
    }
    for (const e of edges) {
      if (g.getCell(String(e.id))) continue
      g.addCell(makeLink(e))
    }
    // Remove cells no longer in the store.
    for (const cell of g.getCells()) {
      const cid = Number(cell.id)
      if (cell.isLink()) {
        if (!wantEdgeIds.has(cid)) cell.remove()
      } else if (!wantNodeIds.has(cid)) {
        cell.remove()
      }
    }
  }

  function makeLink(e: PlanningEdge) {
    const link = new shapes.standard.Link({
      id: String(e.id),
      source: { id: String(e.source) },
      target: { id: String(e.target) },
      attrs: {
        line: { stroke: color('dim'), strokeWidth: 1.6, targetMarker: { d: 'M 8 -4 0 0 8 4 z' } },
      },
      labels: [{ attrs: { text: { text: e.relation, fill: color('dim'), fontSize: 10 } } }],
    })
    return link
  }

  // --- graph → store ---------------------------------------------------------
  function schedulePos(nodeId: number, x: number, y: number) {
    guard.markTouched(nodeId, 'position')
    const prev = posTimers.get(nodeId)
    if (prev) clearTimeout(prev)
    posTimers.set(
      nodeId,
      setTimeout(() => {
        posTimers.delete(nodeId)
        commitPos(nodeId, x, y)
      }, POS_DEBOUNCE),
    )
  }
  function commitPos(nodeId: number, x: number, y: number) {
    localMutating.add(nodeId)
    app.moveNode(nodeId, Math.round(x), Math.round(y))
    queueMicrotask(() => localMutating.delete(nodeId))
  }
  function flushPos(nodeId: number) {
    const prev = posTimers.get(nodeId)
    if (prev) {
      clearTimeout(prev)
      posTimers.delete(nodeId)
      const cell = graph.value?.getCell(String(nodeId)) as dia.Element | null
      if (cell) commitPos(nodeId, cell.position().x, cell.position().y)
    }
  }

  function wireEvents(p: dia.Paper, g: dia.Graph) {
    // Position changes stream in during a drag; debounce per node.
    g.on('change:position', (cell: dia.Cell) => {
      if (cell.isLink()) return
      const el = cell as dia.Element
      schedulePos(Number(el.id), el.position().x, el.position().y)
    })
    // A node under the pointer is "editing": the shared guard's editingIds set
    // (reused for node ids — globally unique, so no collision with task ids) marks
    // it protected, so syncGraphFromStore skips it until the drag ends.
    p.on('element:pointerdown', (view: dia.ElementView) => {
      const nid = Number(view.model.id)
      selectedId.value = nid
      guard.editingIds.add(nid)
    })
    p.on('element:pointerup', (view: dia.ElementView) => {
      const nid = Number(view.model.id)
      flushPos(nid)
      guard.editingIds.delete(nid)
      guard.dirtyIds.delete(nid)
      syncGraphFromStore()
    })
    p.on('blank:pointerdown', () => {
      selectedId.value = null
    })
    // Link drawn by dragging from a port/element to another: persist it.
    p.on('link:connect', (linkView: dia.LinkView) => {
      const link = linkView.model
      const src = Number(link.getSourceElement()?.id)
      const tgt = Number(link.getTargetElement()?.id)
      link.remove() // remove the transient link; the store re-adds a persisted one
      if (Number.isNaN(src) || Number.isNaN(tgt) || boardId.value == null) return
      const res = app.addEdge(boardId.value, src, tgt, 'relates_to')
      if (!res.ok)
        app.showToastMsg(
          res.reason === 'cycle' ? 'That would loop the task tree' : 'Edge not added',
        )
      syncGraphFromStore()
    })
  }

  // --- lifecycle -------------------------------------------------------------
  function mount() {
    const el = elRef.value
    if (!el || graph.value) return
    const g = new dia.Graph({}, { cellNamespace: shapes })
    const p = new dia.Paper({
      el,
      model: g,
      width: '100%',
      height: '100%',
      gridSize: 10,
      async: true,
      cellViewNamespace: shapes,
      background: { color: 'transparent' },
      defaultLink: () => new shapes.standard.Link(),
      linkPinning: false,
      // Keep nodes within the canvas bounds while dragging.
      restrictTranslate: true,
    })
    graph.value = g
    paper.value = p
    wireEvents(p, g)
    wireTools(p)
    // Bulk load frozen, then a single unfreeze for a smooth first paint.
    p.freeze()
    syncGraphFromStore()
    p.unfreeze()
    fitToContent()
  }

  function wireTools(p: dia.Paper) {
    p.on('element:mouseenter', (view: dia.ElementView) => {
      view.addTools(
        new dia.ToolsView({
          tools: [
            new elementTools.Remove({ x: '100%', y: 0 }),
            new elementTools.Connect({ x: '100%', y: '50%' }),
          ],
        }),
      )
    })
    p.on('element:mouseleave', (view: dia.ElementView) => view.removeTools())
    p.on('link:mouseenter', (view: dia.LinkView) => {
      view.addTools(
        new dia.ToolsView({
          tools: [
            new linkTools.Vertices(),
            new linkTools.TargetArrowhead(),
            new linkTools.Remove(),
          ],
        }),
      )
    })
    p.on('link:mouseleave', (view: dia.LinkView) => view.removeTools())
    // Removing a link/element from the canvas removes the store record. Guard
    // with localMutating so a store-driven removal (which already updated the
    // graph) does not re-enter.
    p.model.on('remove', (cell: dia.Cell) => {
      const cid = Number(cell.id)
      if (Number.isNaN(cid) || localMutating.has(cid)) return
      if (cell.isLink()) {
        if (app.edgesOfBoard(boardId.value ?? -1).some((e) => e.id === cid)) app.removeEdge(cid)
      } else if (app.nodeById(cid)) {
        localMutating.add(cid)
        app.removeNode(cid)
        queueMicrotask(() => localMutating.delete(cid))
      }
    })
  }

  function teardown() {
    for (const t of posTimers.values()) clearTimeout(t)
    posTimers.clear()
    paper.value?.remove()
    graph.value?.clear()
    paper.value = null
    graph.value = null
  }

  // --- controls --------------------------------------------------------------
  function currentScale() {
    return paper.value?.scale().sx ?? 1
  }
  function setZoom(next: number) {
    const p = paper.value
    if (!p) return
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
    p.scale(clamped, clamped)
  }
  function zoomIn() {
    setZoom(currentScale() * 1.2)
  }
  function zoomOut() {
    setZoom(currentScale() / 1.2)
  }
  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setZoom(currentScale() * (e.deltaY < 0 ? 1.1 : 0.9))
  }
  function fitToContent() {
    const p = paper.value
    if (!p) return
    p.transformToFitContent({
      padding: 40,
      minScale: ZOOM_MIN,
      maxScale: ZOOM_MAX,
      useModelGeometry: true,
    })
  }

  // Run the tidy-tree layout in the store and let the snapshot flow back.
  function tidy() {
    if (boardId.value != null) {
      app.tidyBoard(boardId.value)
      paper.value?.freeze()
      syncGraphFromStore()
      paper.value?.unfreeze()
      fitToContent()
    }
  }

  function addNode(kind: PlanningNode['kind'] = 'idea') {
    if (boardId.value == null) return
    app.addNode(boardId.value, kind)
    syncGraphFromStore()
  }

  // Re-sync when the active board changes or the element mounts.
  watch(
    [elRef, boardId],
    () => {
      teardown()
      mount()
    },
    { flush: 'post' },
  )
  // Apply store changes that did not originate from the canvas.
  watch(
    () => [app.boardNodes, app.boardEdges, app.tasks, app.todos],
    () => syncGraphFromStore(),
    { deep: true, flush: 'post' },
  )

  onBeforeUnmount(teardown)

  return {
    graph,
    paper,
    selectedId,
    addNode,
    tidy,
    fitToContent,
    zoomIn,
    zoomOut,
    onWheel,
    syncGraphFromStore,
  }
}
