// Pure helpers behind the planning boards (JointJS graphs). Store-free so the
// board logic is unit-testable and the store/composable can share it: type
// guards for sanitising stored data, the kind→colour-token map, edge identity /
// duplicate detection, and a cycle check for a 'parent' edge that reuses the flat
// task-tree guard.

import type { EdgeRelation, NodeKind, PlanningEdge, PlanningNode } from '@/types'

export const NODE_KINDS: readonly NodeKind[] = ['idea', 'milestone', 'task', 'todo', 'group']
export const EDGE_RELATIONS: readonly EdgeRelation[] = [
  'parent',
  'depends_on',
  'blocks',
  'relates_to',
]

export function isNodeKind(v: unknown): v is NodeKind {
  return typeof v === 'string' && (NODE_KINDS as readonly string[]).includes(v)
}
export function isEdgeRelation(v: unknown): v is EdgeRelation {
  return typeof v === 'string' && (EDGE_RELATIONS as readonly string[]).includes(v)
}

// The kind → colour-token key on the theme. The store/UI resolve the actual
// colour from the live theme so a board follows dark/light like everything else.
export const KIND_TOKEN: Record<NodeKind, 'accent' | 'dim' | 'text'> = {
  idea: 'accent',
  milestone: 'text',
  task: 'accent',
  todo: 'accent',
  group: 'dim',
}

export const DEFAULT_NODE = { width: 200, height: 56 }

// Where to drop a freshly-added node so it does not land on top of an existing
// one: step down-right from the lowest node in the board.
export function nextNodePosition(nodes: PlanningNode[]): { x: number; y: number } {
  if (!nodes.length) return { x: 80, y: 80 }
  const lowest = nodes.reduce((a, b) => (b.y > a.y ? b : a))
  return { x: lowest.x + 24, y: lowest.y + lowest.height + 28 }
}

// An undirected identity for a source/target pair, so duplicate edges between the
// same two nodes can be detected regardless of direction.
export function edgeKey(source: number, target: number): string {
  return source < target ? `${source}:${target}` : `${target}:${source}`
}
export function edgeExists(edges: PlanningEdge[], source: number, target: number): boolean {
  const key = edgeKey(source, target)
  return edges.some((e) => edgeKey(e.source, e.target) === key)
}

// Whether a directed edge is a self-loop (never allowed).
export function isSelfLoop(source: number, target: number): boolean {
  return source === target
}

// --- tidy tree layout -------------------------------------------------------
// A deterministic top-to-bottom tree layout over the 'parent' edges: rank nodes
// by depth from their roots (BFS, cycle-safe), then place each rank as a row.
// Returns id → {x, y} for every node, so the caller writes them in one batch. A
// lightweight stand-in for dagre that stays pure and testable; freeform boards
// simply don't call it.
export interface TidyOptions {
  nodeSep: number // horizontal gap between siblings in a rank
  rankSep: number // vertical gap between ranks
  nodeWidth: number
  nodeHeight: number
}
export const DEFAULT_TIDY: TidyOptions = {
  nodeSep: 24,
  rankSep: 48,
  nodeWidth: 200,
  nodeHeight: 56,
}

export function tidyTreeLayout(
  nodes: PlanningNode[],
  edges: PlanningEdge[],
  opts: TidyOptions = DEFAULT_TIDY,
): Map<number, { x: number; y: number }> {
  const ids = new Set(nodes.map((n) => n.id))
  // parent → children and child → hasParent, from 'parent' edges only.
  const children = new Map<number, number[]>()
  const hasParent = new Set<number>()
  for (const e of edges) {
    if (e.relation !== 'parent' || !ids.has(e.source) || !ids.has(e.target)) continue
    if (!children.has(e.source)) children.set(e.source, [])
    children.get(e.source)!.push(e.target)
    hasParent.add(e.target)
  }
  // Roots: nodes with no incoming parent edge, in stable id order.
  const roots = nodes.map((n) => n.id).filter((id) => !hasParent.has(id))

  // Rank each node by BFS depth (cycle-safe via a seen set).
  const rank = new Map<number, number>()
  const queue: number[] = roots.map((id) => {
    rank.set(id, 0)
    return id
  })
  const seen = new Set<number>(roots)
  while (queue.length) {
    const cur = queue.shift()!
    const d = rank.get(cur)!
    for (const ch of children.get(cur) ?? []) {
      if (seen.has(ch)) continue
      seen.add(ch)
      rank.set(ch, d + 1)
      queue.push(ch)
    }
  }
  // Any node the BFS never reached (part of a cycle or disconnected) ranks 0.
  for (const n of nodes) if (!rank.has(n.id)) rank.set(n.id, 0)

  // Group by rank, then lay each rank out as a centered row.
  const byRank = new Map<number, number[]>()
  for (const n of nodes) {
    const r = rank.get(n.id)!
    if (!byRank.has(r)) byRank.set(r, [])
    byRank.get(r)!.push(n.id)
  }
  const step = opts.nodeWidth + opts.nodeSep
  const widest = Math.max(1, ...[...byRank.values()].map((row) => row.length))
  const totalWidth = widest * step
  const out = new Map<number, { x: number; y: number }>()
  for (const [r, row] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) {
    const rowWidth = row.length * step
    const startX = (totalWidth - rowWidth) / 2
    row.forEach((id, i) => {
      out.set(id, {
        x: Math.round(startX + i * step),
        y: r * (opts.nodeHeight + opts.rankSep),
      })
    })
  }
  return out
}
