import type { Task, Todo } from '@/types'

// A pinned child protects its whole tree, including legacy same-collection links.
export function pinnedTreeIds(
  items: readonly (Task | Todo)[],
  collection: 'tasks' | 'todos',
): Set<number> {
  const byId = new Map(items.map((item) => [item.id, item]))
  const edges = new Map<number, Set<number>>()
  const connect = (a: number, b: number) => {
    if (!byId.has(a) || !byId.has(b)) return
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      if (!edges.has(from)) edges.set(from, new Set())
      edges.get(from)!.add(to)
    }
  }
  for (const item of items) {
    if (item.parentId != null) connect(item.id, item.parentId)
    for (const link of item.linked) if (link.collection === collection) connect(item.id, link.id)
  }
  const protectedIds = new Set<number>()
  const pending = items.filter((item) => item.pinned).map((item) => item.id)
  while (pending.length) {
    const id = pending.pop()!
    if (protectedIds.has(id)) continue
    protectedIds.add(id)
    for (const neighbor of edges.get(id) ?? []) pending.push(neighbor)
  }
  return protectedIds
}
