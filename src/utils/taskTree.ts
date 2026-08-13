// Pure logic behind the flat, any-depth task hierarchy. Every task is stored as
// a flat record carrying parentId/order/depth/rootId; the tree is rebuilt in
// memory here (never persisted as nested data). Kept store-free so it is testable
// in isolation and reused by useTaskTree, the drag engine and the store's move.
//
//   parentId === null   → a top-level (root) node
//   order               → fractional sort key within a sibling group
//   depth               → 0 for roots, parent.depth + 1 downward (denormalised)
//   rootId              → id of the top-level ancestor (a root's own id)
//
// depth and rootId are denormalised for render/query speed; recomputeSubtree()
// re-derives them for a moved node and its whole subtree on every reparent.

// The minimal shape the tree logic needs; the full Task satisfies it.
export interface TreeNode {
  id: number
  parentId: number | null
  order: number
}

// The gap below which a sibling group's fractional orders are collapsed back to
// integers — see needsRenormalize / renormalize.
export const MIN_ORDER_GAP = 0.0001

// An index over a flat node list: children grouped by parentId (each group sorted
// by order, ties broken by id so the order is stable), plus a by-id lookup.
export interface TreeIndex<T extends TreeNode> {
  byId: Map<number, T>
  // Keyed by parentId; the root group lives under the `null` key.
  children: Map<number | null, T[]>
}

function compareNodes<T extends TreeNode>(a: T, b: T): number {
  return a.order - b.order || a.id - b.id
}

// Group a flat list into a parentId → sorted children index. A node whose
// parentId points at a missing item is treated as a root, so a dangling parent
// never hides a task.
export function buildIndex<T extends TreeNode>(nodes: T[]): TreeIndex<T> {
  const byId = new Map<number, T>()
  for (const n of nodes) byId.set(n.id, n)
  const children = new Map<number | null, T[]>()
  for (const n of nodes) {
    const key = n.parentId != null && byId.has(n.parentId) ? n.parentId : null
    const group = children.get(key)
    if (group) group.push(n)
    else children.set(key, [n])
  }
  for (const group of children.values()) group.sort(compareNodes)
  return { byId, children }
}

export function rootsOf<T extends TreeNode>(index: TreeIndex<T>): T[] {
  return index.children.get(null) ?? []
}

export function childrenOf<T extends TreeNode>(index: TreeIndex<T>, id: number): T[] {
  return index.children.get(id) ?? []
}

// Immediate parent first, up to the root. Cycle-safe: a corrupt parent loop
// stops at the first repeat rather than spinning.
export function ancestorsOf<T extends TreeNode>(index: TreeIndex<T>, id: number): T[] {
  const out: T[] = []
  const seen = new Set<number>([id])
  let cur = index.byId.get(id)
  while (cur && cur.parentId != null) {
    if (seen.has(cur.parentId)) break
    seen.add(cur.parentId)
    const parent = index.byId.get(cur.parentId)
    if (!parent) break
    out.push(parent)
    cur = parent
  }
  return out
}

// Every node below `id`, breadth-first (parents before their own children).
// Excludes `id` itself. Cycle-safe.
export function descendantsOf<T extends TreeNode>(index: TreeIndex<T>, id: number): T[] {
  const out: T[] = []
  const seen = new Set<number>([id])
  const queue: number[] = [id]
  while (queue.length) {
    const cur = queue.shift() as number
    for (const child of childrenOf(index, cur)) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      out.push(child)
      queue.push(child.id)
    }
  }
  return out
}

export interface Progress {
  done: number
  total: number
  pct: number
}

// Recursive progress for a node: completed descendants / total descendants over
// every level below it (a leaf has no descendants → 0/0). Derived on the client;
// never persisted.
export function progressOf<T extends TreeNode>(
  index: TreeIndex<T>,
  id: number,
  isDone: (node: T) => boolean,
): Progress {
  const kids = descendantsOf(index, id)
  const total = kids.length
  const done = kids.reduce((n, k) => n + (isDone(k) ? 1 : 0), 0)
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) }
}

// A drop is a cycle if the target is the dragged node itself or any of its
// descendants — moving a subtree under its own child would detach it into a loop.
export function wouldCreateCycle<T extends TreeNode>(
  index: TreeIndex<T>,
  draggedId: number,
  targetId: number | null,
): boolean {
  if (targetId == null) return false
  if (targetId === draggedId) return true
  return descendantsOf(index, draggedId).some((d) => d.id === targetId)
}

// --- fractional ordering ----------------------------------------------------
// A reparent/reorder writes only the moved node's `order` — the midpoint between
// its new neighbours — so siblings are never rewritten. When the gap between two
// neighbours would fall below MIN_ORDER_GAP the group is renormalised to integers.

// The order value to give a node inserted between two neighbours. `null` means
// "no neighbour on that side": at the start we step below the first, at the end
// above the last, and into an empty group we seed 0.
export function orderBetween(prev: number | null, next: number | null): number {
  if (prev == null && next == null) return 0
  if (prev == null) return (next as number) - 1
  if (next == null) return prev + 1
  return (prev + next) / 2
}

// Compute the order for dropping into `siblings` (already sorted, excluding the
// moved node) at slot `position` (0 = first, siblings.length = last).
export function orderForPosition<T extends TreeNode>(siblings: T[], position: number): number {
  const clamped = Math.max(0, Math.min(position, siblings.length))
  const prev = clamped > 0 ? siblings[clamped - 1].order : null
  const next = clamped < siblings.length ? siblings[clamped].order : null
  return orderBetween(prev, next)
}

// True when any adjacent gap in a sorted sibling group is too small to safely
// bisect again — the trigger to renormalise.
export function needsRenormalize<T extends TreeNode>(sortedSiblings: T[]): boolean {
  for (let i = 1; i < sortedSiblings.length; i++) {
    if (sortedSiblings[i].order - sortedSiblings[i - 1].order < MIN_ORDER_GAP) return true
  }
  return false
}

// Reassign a sibling group to evenly spaced integers (0,1,2,…), preserving the
// current visual order. Returns only the ids whose order actually changed, so
// the caller writes the minimum.
export function renormalize<T extends TreeNode>(sortedSiblings: T[]): Map<number, number> {
  const out = new Map<number, number>()
  sortedSiblings.forEach((node, i) => {
    if (node.order !== i) out.set(node.id, i)
  })
  return out
}

// --- reparent recompute -----------------------------------------------------
export interface DepthRoot {
  depth: number
  rootId: number
}

// The depth/rootId a node acquires under a given parent. A null parent makes it
// a root (depth 0, rootId = its own id).
export function placeUnder<T extends TreeNode>(
  index: TreeIndex<T>,
  nodeId: number,
  parentId: number | null,
): DepthRoot {
  if (parentId == null) return { depth: 0, rootId: nodeId }
  const parent = index.byId.get(parentId)
  const parentDepth = parent ? depthOf(index, parentId) : 0
  const parentRoot = parent ? rootIdOf(index, parentId) : parentId
  return { depth: parentDepth + 1, rootId: parentRoot }
}

// Live depth of a node from its parent chain (cycle-safe), independent of any
// stale denormalised field.
export function depthOf<T extends TreeNode>(index: TreeIndex<T>, id: number): number {
  return ancestorsOf(index, id).length
}

// Live rootId: the top-most ancestor's id, or the node's own id when top-level.
export function rootIdOf<T extends TreeNode>(index: TreeIndex<T>, id: number): number {
  const ancestors = ancestorsOf(index, id)
  return ancestors.length ? ancestors[ancestors.length - 1].id : id
}

// --- drop resolution --------------------------------------------------------
// The three vertical zones of a row (top quarter / middle / bottom quarter),
// mirrored from utils/dragNest so the tree drag reads the same way as the
// existing nest drag.
export type DropZone = 'above' | 'nest' | 'below'

// Where a drop landed: on a row (with a zone) or on the root strip.
export type DropTarget = { kind: 'row'; id: number; zone: DropZone } | { kind: 'root' }

export interface DropPlan {
  parentId: number | null
  position: number
}

// Translate a drop target into the concrete (parentId, position) a move needs,
// with the dragged node removed from the sibling maths so indices are stable:
//   - root strip       → top level, appended after the current roots
//   - nest zone on T   → child of T, appended after T's current children
//   - above/below on T → sibling of T under T's parent, before/after T
// Returns null when the target row no longer exists.
export function resolveDrop<T extends TreeNode>(
  index: TreeIndex<T>,
  draggedId: number,
  target: DropTarget,
): DropPlan | null {
  const siblingsUnder = (parentId: number | null): T[] =>
    (parentId == null ? rootsOf(index) : childrenOf(index, parentId)).filter(
      (t) => t.id !== draggedId,
    )
  if (target.kind === 'root') {
    return { parentId: null, position: siblingsUnder(null).length }
  }
  const row = index.byId.get(target.id)
  if (!row) return null
  if (target.zone === 'nest') {
    return { parentId: target.id, position: siblingsUnder(target.id).length }
  }
  const parentId = row.parentId != null && index.byId.has(row.parentId) ? row.parentId : null
  const sibs = siblingsUnder(parentId)
  const at = sibs.findIndex((t) => t.id === target.id)
  const base = at < 0 ? sibs.length : at
  return { parentId, position: target.zone === 'below' ? base + 1 : base }
}

// Whether a resolved drop is legal (no cycle: never under the node itself or a
// descendant).
export function isValidDrop<T extends TreeNode>(
  index: TreeIndex<T>,
  draggedId: number,
  plan: DropPlan | null,
): boolean {
  if (!plan) return false
  return !wouldCreateCycle(index, draggedId, plan.parentId)
}

// The full set of depth/rootId updates when `movedId` is reparented under
// `newParentId`: the moved node plus every descendant, each re-derived from the
// new position. Returned as id → {depth, rootId} so the store writes exactly
// these fields in one batch.
export function recomputeSubtree<T extends TreeNode>(
  index: TreeIndex<T>,
  movedId: number,
  newParentId: number | null,
): Map<number, DepthRoot> {
  const updates = new Map<number, DepthRoot>()
  const moved = placeUnder(index, movedId, newParentId)
  updates.set(movedId, moved)
  // Walk the existing subtree top-down, offsetting each node from the moved
  // node's new depth. rootId becomes the moved node's new root throughout.
  const oldMovedDepth = depthOf(index, movedId)
  const depthShift = moved.depth - oldMovedDepth
  for (const desc of descendantsOf(index, movedId)) {
    updates.set(desc.id, {
      depth: depthOf(index, desc.id) + depthShift,
      rootId: moved.rootId,
    })
  }
  return updates
}
