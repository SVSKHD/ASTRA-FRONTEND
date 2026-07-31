// Pure graph logic behind interlinked todos/tasks: identity, cycle detection,
// depth/limit guards. Kept store-free so it is testable in isolation; the store
// supplies resolvers that read the live workspace.

import type { LinkCollection, LinkRef } from '@/types'

export const MAX_DIRECT_LINKS = 20
export const MAX_LINK_DEPTH = 3

export function linkKey(ref: LinkRef): string {
  return ref.collection + ':' + ref.id
}
export function sameRef(a: LinkRef, b: LinkRef): boolean {
  return a.id === b.id && a.collection === b.collection
}
export function hasRef(list: LinkRef[], ref: LinkRef): boolean {
  return list.some((r) => sameRef(r, ref))
}

// Given a ref, return its direct child (linked) or parent refs. Missing items
// resolve to [] so a dangling ref (e.g. a deleted counterpart) is simply inert.
export type Resolver = (ref: LinkRef) => LinkRef[]
export interface Graph {
  children: Resolver
  parents: Resolver
}

// A cycle would form if `parent` is reachable downward from `child` (or they
// are the same node): linking child under parent would then close a loop.
export function wouldCycle(children: Resolver, parent: LinkRef, child: LinkRef): boolean {
  if (sameRef(parent, child)) return true
  const seen = new Set<string>()
  const stack: LinkRef[] = [child]
  while (stack.length) {
    const cur = stack.pop() as LinkRef
    const key = linkKey(cur)
    if (seen.has(key)) continue
    seen.add(key)
    if (sameRef(cur, parent)) return true
    for (const k of children(cur)) stack.push(k)
  }
  return false
}

// Longest chain from a root down to `ref`, counting `ref` itself (1 for a node
// with no parents). Cycle-safe via a visiting set.
export function ancestorHeight(parents: Resolver, ref: LinkRef): number {
  const visiting = new Set<string>()
  function up(r: LinkRef): number {
    const key = linkKey(r)
    if (visiting.has(key)) return 1
    visiting.add(key)
    let h = 1
    for (const p of parents(r)) h = Math.max(h, 1 + up(p))
    visiting.delete(key)
    return h
  }
  return up(ref)
}

// Depth of the subtree rooted at `ref` (1 for a leaf). Cycle-safe.
export function subtreeDepth(children: Resolver, ref: LinkRef): number {
  const visiting = new Set<string>()
  function down(r: LinkRef): number {
    const key = linkKey(r)
    if (visiting.has(key)) return 1
    visiting.add(key)
    let d = 1
    for (const k of children(r)) d = Math.max(d, 1 + down(k))
    visiting.delete(key)
    return d
  }
  return down(ref)
}

export type LinkRejection = 'self' | 'exists' | 'cycle' | 'max-direct' | 'max-depth'
export interface LinkCheck {
  ok: boolean
  reason?: LinkRejection
}

export const LINK_REJECTION_MESSAGE: Record<LinkRejection, string> = {
  self: "An item can't link to itself",
  exists: 'Already linked',
  cycle: 'That would create a loop',
  'max-direct': `Up to ${MAX_DIRECT_LINKS} links per item`,
  'max-depth': `Links can go at most ${MAX_LINK_DEPTH} levels deep`,
}

// The ids that should be hidden from the top level of a collection's list
// because they nest under another item present in the same list: an item is a
// nested child when one of its parents is the same collection AND present in
// the given (already view-filtered) set. Cross-collection parents, or parents
// filtered out of the view, do NOT nest it — it stays a top-level row (with a
// breadcrumb), so nothing silently disappears.
export function nestedChildIds(
  collection: LinkCollection,
  items: { id: number; parents: LinkRef[] }[],
): Set<number> {
  const present = new Set(items.map((i) => i.id))
  const nested = new Set<number>()
  for (const it of items) {
    if (it.parents.some((p) => p.collection === collection && present.has(p.id))) nested.add(it.id)
  }
  return nested
}

// Whether `parent` may link `child`. Order matters: self/exists/limit are cheap
// and specific; cycle and depth walk the graph.
export function checkLink(
  graph: Graph,
  parent: LinkRef,
  parentLinked: LinkRef[],
  child: LinkRef,
): LinkCheck {
  if (sameRef(parent, child)) return { ok: false, reason: 'self' }
  if (hasRef(parentLinked, child)) return { ok: false, reason: 'exists' }
  if (parentLinked.length >= MAX_DIRECT_LINKS) return { ok: false, reason: 'max-direct' }
  if (wouldCycle(graph.children, parent, child)) return { ok: false, reason: 'cycle' }
  // The new edge joins parent's upward chain to child's downward subtree; the
  // whole chain through it must stay within MAX_LINK_DEPTH.
  const chain = ancestorHeight(graph.parents, parent) + subtreeDepth(graph.children, child)
  if (chain > MAX_LINK_DEPTH) return { ok: false, reason: 'max-depth' }
  return { ok: true }
}
