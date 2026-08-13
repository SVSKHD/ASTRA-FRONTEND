import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIDY,
  edgeExists,
  edgeKey,
  isEdgeRelation,
  isNodeKind,
  isSelfLoop,
  nextNodePosition,
  tidyTreeLayout,
} from '@/utils/planning'
import type { PlanningEdge, PlanningNode } from '@/types'

const node = (id: number, over: Partial<PlanningNode> = {}): PlanningNode => ({
  id,
  boardId: 1,
  label: 'n' + id,
  notes: '',
  kind: 'idea',
  x: 0,
  y: 0,
  width: 180,
  height: 64,
  color: '',
  linkedType: null,
  linkedId: null,
  localRev: 0,
  updatedBy: '',
  createdAt: 0,
  updatedAt: 0,
  ...over,
})
const edge = (
  id: number,
  source: number,
  target: number,
  relation: PlanningEdge['relation'] = 'parent',
): PlanningEdge => ({
  id,
  boardId: 1,
  source,
  target,
  relation,
  label: '',
  createdAt: 0,
  updatedAt: 0,
})

describe('type guards', () => {
  it('validates node kinds and edge relations', () => {
    expect(isNodeKind('task')).toBe(true)
    expect(isNodeKind('nope')).toBe(false)
    expect(isEdgeRelation('parent')).toBe(true)
    expect(isEdgeRelation('x')).toBe(false)
  })
})

describe('edge identity', () => {
  it('is direction-independent and detects duplicates + self-loops', () => {
    expect(edgeKey(1, 2)).toBe(edgeKey(2, 1))
    expect(isSelfLoop(3, 3)).toBe(true)
    const edges = [edge(10, 1, 2)]
    expect(edgeExists(edges, 2, 1)).toBe(true)
    expect(edgeExists(edges, 1, 3)).toBe(false)
  })
})

describe('nextNodePosition', () => {
  it('seeds the first node and steps below the lowest thereafter', () => {
    expect(nextNodePosition([])).toEqual({ x: 80, y: 80 })
    const p = nextNodePosition([node(1, { x: 40, y: 200, height: 64 })])
    expect(p).toEqual({ x: 64, y: 292 })
  })
})

describe('tidyTreeLayout', () => {
  it('ranks nodes by parent depth top-to-bottom', () => {
    // 1 → {2, 3}; 2 → 4
    const nodes = [node(1), node(2), node(3), node(4)]
    const edges = [edge(10, 1, 2), edge(11, 1, 3), edge(12, 2, 4)]
    const pos = tidyTreeLayout(nodes, edges)
    // Root at rank 0, its children at rank 1, grandchild at rank 2.
    const rankY = (d: number) => d * (DEFAULT_TIDY.nodeHeight + DEFAULT_TIDY.rankSep)
    expect(pos.get(1)!.y).toBe(rankY(0))
    expect(pos.get(2)!.y).toBe(rankY(1))
    expect(pos.get(3)!.y).toBe(rankY(1))
    expect(pos.get(4)!.y).toBe(rankY(2))
    // Every node placed.
    expect(pos.size).toBe(4)
  })

  it('is cycle-safe (a corrupt parent loop still lays out)', () => {
    const nodes = [node(1), node(2)]
    const edges = [edge(10, 1, 2), edge(11, 2, 1)]
    expect(() => tidyTreeLayout(nodes, edges)).not.toThrow()
    expect(tidyTreeLayout(nodes, edges).size).toBe(2)
  })
})
