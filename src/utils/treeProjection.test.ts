import { describe, expect, it } from 'vitest'
import { buildIndex, type TreeNode } from '@/utils/taskTree'
import { flattenVisible, projectReorder } from '@/utils/treeProjection'

const n = (id: number, parentId: number | null, order: number): TreeNode => ({
  id,
  parentId,
  order,
})

// Tree:  1 ─ 2 ─ 4
//        │   └ 3
//        6
const nodes: TreeNode[] = [n(1, null, 0), n(2, 1, 0), n(4, 2, 0), n(3, 1, 1), n(6, null, 1)]

describe('flattenVisible', () => {
  it('emits rows in display order with depth, skipping collapsed subtrees', () => {
    const idx = buildIndex(nodes)
    expect(flattenVisible(idx, new Set()).map((r) => [r.id, r.depth])).toEqual([
      [1, 0],
      [2, 1],
      [4, 2],
      [3, 1],
      [6, 0],
    ])
    // Collapsing 2 hides 4.
    expect(flattenVisible(idx, new Set([2])).map((r) => r.id)).toEqual([1, 2, 3, 6])
  })
})

describe('projectReorder', () => {
  const visible = flattenVisible(buildIndex(nodes), new Set())

  it('keeps the same level as a sibling with no horizontal drag', () => {
    // Drop 6 below 3 (both would be children of 1), no horizontal move.
    const p = projectReorder(visible, 6, 3, 'below', 0)
    expect(p).toEqual({ parentId: 1, depth: 1, position: 2 })
  })

  it('nests one level deeper when dragged right', () => {
    // Drop 6 below 2 dragging right → becomes a child of 2.
    const p = projectReorder(visible, 6, 2, 'below', 1)
    expect(p?.parentId).toBe(2)
    expect(p?.depth).toBe(2)
  })

  it('promotes a nested item to the top level when dragged left past the indent', () => {
    // 4 is at depth 2 under 2. Drop it below 3 (depth 1) dragging one step left
    // → promotes to the top level.
    const p = projectReorder(visible, 4, 3, 'below', -1)
    expect(p).toEqual({ parentId: null, depth: 0, position: 1 })
  })

  it('clamps depth so it never orphans the row below', () => {
    // Inserting above 4 (a depth-2 child of 2): even with no drag the depth is
    // forced to at least 4's depth so 4 keeps a parent.
    const p = projectReorder(visible, 6, 4, 'above', 0)
    expect(p?.depth).toBe(2)
    expect(p?.parentId).toBe(2)
  })

  it('returns null when the over-row is inside the dragged subtree', () => {
    // 4 is a descendant of 2 — dropping 2 onto 4 is not a valid reorder context.
    expect(projectReorder(visible, 2, 4, 'below', 0)).toBeNull()
  })

  it('places at the very top when dropped above the first row', () => {
    const p = projectReorder(visible, 6, 1, 'above', 0)
    expect(p).toEqual({ parentId: null, depth: 0, position: 0 })
  })
})
