// Horizontal-depth drop projection for the flat tree drag. Reorder drops resolve
// their target parent from BOTH the pointer's vertical insertion point and its
// horizontal offset: dragging right nests one level deeper, dragging left promotes
// (all the way to the root), the way an outliner does. This is the same algorithm
// dnd-kit's sortable-tree example uses, kept pure and store-free so it is testable
// and shared by the task and todo drag engines.

import { childrenOf, rootsOf, type TreeIndex, type TreeNode } from './taskTree'

// One visible row, in display order. depth 0 = top level.
export interface FlatRow {
  id: number
  parentId: number | null
  depth: number
}

// Flatten the visible tree to an ordered row list, skipping the children of any
// collapsed node (their subtree is not on screen, so it is not a drop context).
export function flattenVisible<T extends TreeNode>(
  index: TreeIndex<T>,
  collapsed: Set<number>,
): FlatRow[] {
  const out: FlatRow[] = []
  const walk = (nodes: T[], depth: number, parentId: number | null) => {
    for (const n of nodes) {
      out.push({ id: n.id, parentId, depth })
      if (!collapsed.has(n.id)) walk(childrenOf(index, n.id), depth + 1, n.id)
    }
  }
  walk(rootsOf(index), 0, null)
  return out
}

// The dragged row plus its whole visible subtree (the contiguous run of deeper
// rows right after it), so projection can remove it from the drop context.
function subtreeIds(rows: FlatRow[], rootId: number): Set<number> {
  const set = new Set<number>([rootId])
  const i = rows.findIndex((r) => r.id === rootId)
  if (i < 0) return set
  const baseDepth = rows[i].depth
  for (let j = i + 1; j < rows.length && rows[j].depth > baseDepth; j++) set.add(rows[j].id)
  return set
}

export interface ProjectResult {
  parentId: number | null
  // The resolved depth, for drawing the reorder line at the right indent.
  depth: number
  // 0-based slot within the resolved parent's children (dragged item excluded),
  // ready for the store's move(parentId, position).
  position: number
}

// Resolve a reorder drop into { parentId, depth, position }. `overId` is the row
// the pointer is over, `side` whether the insertion line is above or below it,
// and `dragDepthDelta` = round(horizontalDragPx / indentPx) — negative when
// dragging left (promote), positive when dragging right (nest). Returns null when
// the over-row is not a valid context (e.g. it is the dragged item itself).
export function projectReorder(
  visible: FlatRow[],
  draggedId: number,
  overId: number,
  side: 'above' | 'below',
  dragDepthDelta: number,
): ProjectResult | null {
  const dragged = subtreeIds(visible, draggedId)
  if (dragged.has(overId)) return null
  const reduced = visible.filter((r) => !dragged.has(r.id))
  const overIndex = reduced.findIndex((r) => r.id === overId)
  if (overIndex < 0) return null

  const insertIndex = side === 'below' ? overIndex + 1 : overIndex
  const prev = reduced[insertIndex - 1]
  const next = reduced[insertIndex]

  // Baseline is the row above the insertion line, so with no horizontal drag the
  // item lands as its sibling; each indent step right nests, each step left
  // promotes one level.
  const projectedDepth = (prev ? prev.depth : 0) + dragDepthDelta
  // Can nest one level under the row above; cannot be shallower than the row
  // below (that would orphan it), and cannot exceed one level under prev.
  const maxDepth = prev ? prev.depth + 1 : 0
  const minDepth = next ? next.depth : 0
  const depth = Math.max(minDepth, Math.min(projectedDepth, maxDepth))

  const parentId = resolveParent(reduced, insertIndex, prev, depth)
  const position = reduced.slice(0, insertIndex).filter((r) => r.parentId === parentId).length
  return { parentId, depth, position }
}

function resolveParent(
  reduced: FlatRow[],
  insertIndex: number,
  prev: FlatRow | undefined,
  depth: number,
): number | null {
  if (depth === 0 || !prev) return null
  if (depth === prev.depth) return prev.parentId
  if (depth > prev.depth) return prev.id
  // Shallower than prev: the nearest preceding row at exactly this depth shares
  // our new parent.
  for (let i = insertIndex - 1; i >= 0; i--) {
    if (reduced[i].depth === depth) return reduced[i].parentId
  }
  return null
}
