import { describe, expect, it } from 'vitest'
import {
  ancestorsOf,
  buildIndex,
  childrenOf,
  depthOf,
  descendantsOf,
  isValidDrop,
  needsRenormalize,
  orderBetween,
  orderForPosition,
  placeUnder,
  progressOf,
  recomputeSubtree,
  renormalize,
  resolveDrop,
  rootIdOf,
  rootsOf,
  wouldCreateCycle,
  type TreeNode,
} from '@/utils/taskTree'

interface T extends TreeNode {
  id: number
  parentId: number | null
  order: number
  done?: boolean
}
const n = (id: number, parentId: number | null, order: number, done = false): T => ({
  id,
  parentId,
  order,
  done,
})

// A small tree:  1 ─ 2 ─ 4
//                │   └ 5
//                └ 3
//                6 (root)
const nodes: T[] = [n(1, null, 0), n(3, 1, 1), n(2, 1, 0), n(5, 2, 1), n(4, 2, 0), n(6, null, 1)]

describe('buildIndex / roots / children', () => {
  it('groups children by parent, sorted by order', () => {
    const idx = buildIndex(nodes)
    expect(rootsOf(idx).map((x) => x.id)).toEqual([1, 6])
    expect(childrenOf(idx, 1).map((x) => x.id)).toEqual([2, 3]) // order 0,1
    expect(childrenOf(idx, 2).map((x) => x.id)).toEqual([4, 5])
    expect(childrenOf(idx, 4)).toEqual([])
  })

  it('treats a dangling parentId as a root', () => {
    const idx = buildIndex([n(9, 999, 0)])
    expect(rootsOf(idx).map((x) => x.id)).toEqual([9])
  })
})

describe('ancestorsOf / descendantsOf', () => {
  const idx = buildIndex(nodes)
  it('walks parents immediate-first up to the root', () => {
    expect(ancestorsOf(idx, 4).map((x) => x.id)).toEqual([2, 1])
    expect(ancestorsOf(idx, 1)).toEqual([])
  })
  it('collects every descendant breadth-first', () => {
    expect(
      descendantsOf(idx, 1)
        .map((x) => x.id)
        .sort(),
    ).toEqual([2, 3, 4, 5])
    expect(
      descendantsOf(idx, 2)
        .map((x) => x.id)
        .sort(),
    ).toEqual([4, 5])
    expect(descendantsOf(idx, 4)).toEqual([])
  })
  it('is cycle-safe on a corrupt parent loop', () => {
    const loop = buildIndex([n(1, 2, 0), n(2, 1, 0)])
    expect(ancestorsOf(loop, 1).length).toBeLessThanOrEqual(2)
    expect(descendantsOf(loop, 1).length).toBeLessThanOrEqual(2)
  })
})

describe('depthOf / rootIdOf / placeUnder', () => {
  const idx = buildIndex(nodes)
  it('derives depth and rootId from the live chain', () => {
    expect(depthOf(idx, 1)).toBe(0)
    expect(depthOf(idx, 2)).toBe(1)
    expect(depthOf(idx, 4)).toBe(2)
    expect(rootIdOf(idx, 4)).toBe(1)
    expect(rootIdOf(idx, 6)).toBe(6)
  })
  it('places a node under a parent (or at root)', () => {
    expect(placeUnder(idx, 5, null)).toEqual({ depth: 0, rootId: 5 })
    expect(placeUnder(idx, 5, 1)).toEqual({ depth: 1, rootId: 1 })
    expect(placeUnder(idx, 6, 2)).toEqual({ depth: 2, rootId: 1 })
  })
})

describe('progressOf (recursive descendants)', () => {
  it('counts completed over total descendants at every level', () => {
    const idx = buildIndex([n(1, null, 0), n(2, 1, 0, true), n(3, 1, 1, false), n(4, 2, 0, true)])
    // 1 has descendants 2,3,4 → 2 done of 3
    expect(progressOf(idx, 1, (x) => !!x.done)).toEqual({ done: 2, total: 3, pct: 67 })
    // a leaf has no descendants → 0/0
    expect(progressOf(idx, 4, (x) => !!x.done)).toEqual({ done: 0, total: 0, pct: 0 })
  })
})

describe('wouldCreateCycle', () => {
  const idx = buildIndex(nodes)
  it('rejects dropping onto self or a descendant', () => {
    expect(wouldCreateCycle(idx, 1, 1)).toBe(true) // self
    expect(wouldCreateCycle(idx, 1, 4)).toBe(true) // descendant
    expect(wouldCreateCycle(idx, 2, 5)).toBe(true)
  })
  it('allows dropping onto a non-descendant or the root', () => {
    expect(wouldCreateCycle(idx, 2, 6)).toBe(false)
    expect(wouldCreateCycle(idx, 4, 3)).toBe(false)
    expect(wouldCreateCycle(idx, 1, null)).toBe(false) // to root
  })
})

describe('fractional ordering', () => {
  it('bisects between neighbours and steps past the ends', () => {
    expect(orderBetween(0, 1)).toBe(0.5)
    expect(orderBetween(null, 1)).toBe(0)
    expect(orderBetween(4, null)).toBe(5)
    expect(orderBetween(null, null)).toBe(0)
  })
  it('computes an order for a drop position within a sibling group', () => {
    const sibs = [n(1, null, 0), n(2, null, 10), n(3, null, 20)]
    expect(orderForPosition(sibs, 0)).toBe(-1) // before first
    expect(orderForPosition(sibs, 1)).toBe(5) // between 0 and 10
    expect(orderForPosition(sibs, 3)).toBe(21) // after last
  })
  it('flags a group that needs renormalising and rewrites it to integers', () => {
    const tight = [n(1, null, 0), n(2, null, 0.00005), n(3, null, 1)]
    expect(needsRenormalize(tight)).toBe(true)
    const remap = renormalize(tight)
    expect(remap.get(2)).toBe(1)
    expect(remap.get(3)).toBe(2)
    expect(remap.has(1)).toBe(false) // 0 already correct
  })
  it('does not flag a comfortably spaced group', () => {
    expect(needsRenormalize([n(1, null, 0), n(2, null, 1), n(3, null, 2)])).toBe(false)
  })
})

describe('resolveDrop / isValidDrop', () => {
  const idx = buildIndex(nodes)
  it('drops onto the root strip as a top-level append', () => {
    // roots are 1 and 6; dragging 2 to root appends after both → position 2
    expect(resolveDrop(idx, 2, { kind: 'root' })).toEqual({ parentId: null, position: 2 })
  })
  it('nests under a row as the last child', () => {
    // node 1 has children 2,3; nesting 6 under 1 → position 2
    expect(resolveDrop(idx, 6, { kind: 'row', id: 1, zone: 'nest' })).toEqual({
      parentId: 1,
      position: 2,
    })
  })
  it('reorders above/below a sibling under the same parent', () => {
    // children of 1 are [2,3]; dragging 6 above 3 → parent 1, position 1
    expect(resolveDrop(idx, 6, { kind: 'row', id: 3, zone: 'above' })).toEqual({
      parentId: 1,
      position: 1,
    })
    expect(resolveDrop(idx, 6, { kind: 'row', id: 3, zone: 'below' })).toEqual({
      parentId: 1,
      position: 2,
    })
  })
  it('excludes the dragged node from the sibling maths', () => {
    // dragging 2 below its own sibling 3 (both children of 1); after removing 2,
    // sibs are [3], target 3 at index 0, below → position 1
    expect(resolveDrop(idx, 2, { kind: 'row', id: 3, zone: 'below' })).toEqual({
      parentId: 1,
      position: 1,
    })
  })
  it('rejects a cyclic drop and accepts a legal one', () => {
    expect(isValidDrop(idx, 1, resolveDrop(idx, 1, { kind: 'row', id: 4, zone: 'nest' }))).toBe(
      false,
    ) // 4 is a descendant of 1
    expect(isValidDrop(idx, 2, resolveDrop(idx, 2, { kind: 'root' }))).toBe(true)
    expect(isValidDrop(idx, 2, null)).toBe(false)
  })
})

describe('recomputeSubtree', () => {
  it('re-derives depth/rootId for the moved node and its whole subtree', () => {
    // Move subtree rooted at 2 (2→4,5) under root 6.
    const idx = buildIndex(nodes)
    const updates = recomputeSubtree(idx, 2, 6)
    expect(updates.get(2)).toEqual({ depth: 1, rootId: 6 })
    expect(updates.get(4)).toEqual({ depth: 2, rootId: 6 })
    expect(updates.get(5)).toEqual({ depth: 2, rootId: 6 })
  })
  it('promotes a subtree to the top level', () => {
    const idx = buildIndex(nodes)
    const updates = recomputeSubtree(idx, 2, null)
    expect(updates.get(2)).toEqual({ depth: 0, rootId: 2 })
    expect(updates.get(4)).toEqual({ depth: 1, rootId: 2 })
    expect(updates.get(5)).toEqual({ depth: 1, rootId: 2 })
  })
})
