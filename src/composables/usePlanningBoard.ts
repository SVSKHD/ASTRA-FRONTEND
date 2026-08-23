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
import { typePx } from '@/components/ui/type'
import type { PlanningEdge, PlanningNode } from '@/types'

const ZOOM_MIN = 0.25
const ZOOM_MAX = 2.5
const POS_DEBOUNCE = 400
// Grid cell in paper units. Nodes snap to this on release.
const GRID = 16
// Compact node geometry (task 6b). Height grows by one line only when the label
// wraps; the two-line cap keeps rows tight.
const NODE_W = 200
const NODE_H1 = 56
const NODE_H2 = 74
const LABEL_PAD = 12

// A custom rounded-rect element: coloured left bar keyed to kind, a title, and an
// optional status pill — all fed from theme tokens so it follows dark/light. A
// grab cursor on the whole body signals that the node itself is the drag surface.
const PlanNode = dia.Element.define(
  'plan.Node',
  {
    size: { width: NODE_W, height: NODE_H1 },
    attrs: {
      body: {
        x: 0,
        y: 0,
        width: 'calc(w)',
        height: 'calc(h)',
        rx: 8,
        ry: 8,
        strokeWidth: 1,
        cursor: 'grab',
      },
      bar: { x: 0, y: 0, width: 3, height: 'calc(h)', rx: 1.5 },
      label: {
        x: LABEL_PAD,
        y: 'calc(h/2)',
        textVerticalAnchor: 'middle',
        textAnchor: 'start',
        fontSize: typePx('sm'),
        fontFamily: 'inherit',
        cursor: 'grab',
      },
      status: {
        x: 'calc(w-12)',
        y: 12,
        textAnchor: 'end',
        fontSize: typePx('2xs'),
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

  // --- canvas palette (task 6b) ----------------------------------------------
  // Joint bakes colours into SVG at draw time and can't follow CSS variables, so
  // the grid (and, later, the opaque nodes) derive solid colours here from each
  // theme's opaque surface (bgSolid). Mixing off the surface means a bright theme
  // gets bright dots and a dark one faint dots — never a fixed grey.
  function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '')
    const f = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
    return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]
  }
  // Mix `hex` toward `target` by amount (0..1), returned as an opaque rgb() string.
  function mix(hex: string, target: [number, number, number], amt: number): string {
    const [r, g, b] = hexToRgb(hex)
    const m = (a: number, t: number) => Math.round(a + (t - a) * amt)
    return `rgb(${m(r, target[0])}, ${m(g, target[1])}, ${m(b, target[2])})`
  }
  function canvasPalette() {
    const t = theme.value
    const dark = t.group === 'dark'
    const toward: [number, number, number] = dark ? [255, 255, 255] : [0, 0, 0]
    return {
      // The canvas ground: the theme's opaque page surface.
      bg: t.bgSolid,
      // Dots sit ~12% off the surface (lighter on dark, darker on light); the
      // major every-5th dot is stronger.
      dot: mix(t.bgSolid, toward, 0.12),
      dotMajor: mix(t.bgSolid, toward, 0.26),
      // Node body: an elevated opaque surface a touch above the ground. Border is
      // a solid strong edge, not the translucent glass border.
      nodeBg: dark ? mix(t.bgSolid, [255, 255, 255], 0.08) : '#ffffff',
      borderStrong: mix(t.bgSolid, toward, 0.3),
    }
  }
  // Paint the canvas ground + dot grid from the current theme. Re-run on every
  // theme change since Joint bakes grid colours into an SVG pattern at draw time.
  // A minor dot every cell, a heavier dot every 5th.
  function applyCanvas(p: dia.Paper) {
    const pal = canvasPalette()
    p.drawBackground({ color: pal.bg })
    p.setGridSize(GRID)
    p.setGrid([
      { name: 'dot', args: { color: pal.dot, thickness: 1 } },
      // scaleFactor lives inside args — the grid renderer merges it into the
      // pattern layer, spacing the heavier dot every 5th cell.
      { name: 'dot', args: { color: pal.dotMajor, thickness: 2, scaleFactor: 5 } },
    ])
    updateGridVisibility()
  }
  // The grid scales with the paper transform; below 0.5x it collapses into noise,
  // so fade it out under that zoom.
  function updateGridVisibility() {
    const p = paper.value
    if (!p) return
    const gridEl = p.getLayerView('grid')?.el as SVGElement | undefined
    if (!gridEl) return
    const s = p.scale().sx
    gridEl.style.opacity = s < 0.5 ? '0' : s < 0.7 ? String((s - 0.5) / 0.2) : '1'
  }

  // --- store → graph ---------------------------------------------------------
  // Title text, wrapped to at most two lines with an ellipsis so a long label
  // never blows the node's height past the two-line cap.
  function nodeLabelText(title: string): string {
    return util.breakText(
      title,
      { width: NODE_W - LABEL_PAD * 2, height: NODE_H2 },
      { 'font-size': typePx('sm'), 'font-family': 'inherit' },
      { ellipsis: true, maxLineCount: 2 },
    )
  }
  // Node render size: fixed width, height grows one line only when the label wraps.
  function nodeSize(n: PlanningNode): { width: number; height: number } {
    const linked = linkedItem(n)
    const title = linked ? linkedTitle(linked) : n.label || '(untitled)'
    const twoLine = nodeLabelText(title).includes('\n')
    return { width: NODE_W, height: twoLine ? NODE_H2 : NODE_H1 }
  }
  function nodeAttrs(n: PlanningNode) {
    const linked = linkedItem(n)
    const title = linked ? linkedTitle(linked) : n.label || '(untitled)'
    const status = linked ? linkedStatus(linked) : ''
    const pal = canvasPalette()
    return {
      // Opaque body + strong border, opacity pinned to 1 so no entry animation can
      // strand it translucent.
      body: { fill: pal.nodeBg, stroke: pal.borderStrong, strokeWidth: 1, opacity: 1 },
      bar: { fill: n.color || color(KIND_TOKEN[n.kind]) },
      label: { text: nodeLabelText(title), fill: color('text') },
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
      const size = nodeSize(n)
      const cell = g.getCell(String(n.id)) as dia.Element | null
      if (cell) {
        cell.position(n.x, n.y)
        cell.resize(size.width, size.height)
        cell.attr(nodeAttrs(n))
      } else {
        g.addCell(
          new PlanNode({
            id: String(n.id),
            position: { x: n.x, y: n.y },
            size,
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
    const pal = canvasPalette()
    const link = new shapes.standard.Link({
      id: String(e.id),
      source: { id: String(e.source) },
      target: { id: String(e.target) },
      attrs: {
        line: {
          stroke: pal.borderStrong,
          strokeWidth: 1.5,
          // Filled solid arrowhead (fill defaults to the line stroke).
          targetMarker: { type: 'path', d: 'M 8 -4 0 0 8 4 z', fill: pal.borderStrong },
        },
      },
      labels: [linkLabel(e, pal)],
    })
    return link
  }
  // A solid chip behind the relation text so it reads at full contrast at any
  // zoom (the default translucent-white label chip was the wash-out bug). The
  // `rect` refs the text bbox; padding is 8px horizontal / 4px vertical.
  function linkLabel(e: PlanningEdge, pal = canvasPalette()) {
    return {
      attrs: {
        text: {
          text: e.relation,
          fill: color('text'),
          fontSize: typePx('xs'),
          textAnchor: 'middle',
          textVerticalAnchor: 'middle',
        },
        rect: {
          ref: 'text',
          fill: pal.nodeBg,
          stroke: pal.borderStrong,
          strokeWidth: 1,
          rx: 4,
          ry: 4,
          x: 'calc(x-8)',
          y: 'calc(y-4)',
          width: 'calc(w+16)',
          height: 'calc(h+8)',
        },
      },
    }
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
      const el = view.model as dia.Element
      const nid = Number(el.id)
      selectedId.value = nid
      guard.editingIds.add(nid)
      // The whole body is the drag surface (Joint translates on element
      // pointerdown, no threshold). Raise the node above its peers and lift it
      // with a shadow while it moves.
      el.toFront()
      el.attr('body/cursor', 'grabbing')
      el.attr('body/filter', {
        name: 'dropShadow',
        args: { dx: 0, dy: 4, blur: 12, opacity: 0.35, color: 'rgba(0,0,0,0.5)' },
      })
    })
    p.on('element:pointerup', (view: dia.ElementView, evt: dia.Event) => {
      const el = view.model as dia.Element
      const nid = Number(el.id)
      // Snap to the 16px grid on release; hold Alt to drop freely.
      if (!evt.altKey) {
        const pos = el.position()
        el.position(Math.round(pos.x / GRID) * GRID, Math.round(pos.y / GRID) * GRID)
      }
      el.removeAttr('body/filter')
      el.attr('body/cursor', 'grab')
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
      gridSize: GRID,
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
    applyCanvas(p)
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
    updateGridVisibility()
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
    updateGridVisibility()
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
  // Re-tint every existing cell when the theme changes. Node/link attrs are read
  // from theme tokens at creation time, so a theme switch alone (which doesn't
  // touch the store) would otherwise leave already-drawn cells on the old
  // palette until their next store-driven re-sync.
  watch(
    theme,
    () => {
      const g = graph.value
      const p = paper.value
      const id = boardId.value
      if (!g || !p || id == null) return
      // Repaint the ground + dot grid (Joint won't follow CSS vars), then re-tint
      // every node and relabel every link with the new palette.
      applyCanvas(p)
      const pal = canvasPalette()
      for (const n of app.nodesOfBoard(id)) {
        const cell = g.getCell(String(n.id)) as dia.Element | null
        if (cell) cell.attr(nodeAttrs(n))
      }
      for (const e of app.edgesOfBoard(id)) {
        const link = g.getCell(String(e.id)) as dia.Link | null
        if (!link) continue
        link.attr('line/stroke', pal.borderStrong)
        link.attr('line/targetMarker/fill', pal.borderStrong)
        link.label(0, linkLabel(e, pal))
      }
    },
    { flush: 'post' },
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
