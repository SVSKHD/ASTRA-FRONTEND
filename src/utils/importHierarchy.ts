import type { TaskTransferItem } from '@/utils/taskTransfer'

export function countImportHierarchy(
  items: readonly TaskTransferItem[],
  underParent = false,
  existingParents: ReadonlySet<string> = new Set(),
) {
  const byId = new Map(items.map((item) => [item.sourceId, item]))
  const depths = new Map<string, number>()
  function depth(item: TaskTransferItem, visiting = new Set<string>()): number {
    const known = depths.get(item.sourceId)
    if (known !== undefined) return known
    if (visiting.has(item.sourceId)) return underParent ? 1 : 0
    visiting.add(item.sourceId)
    const parent = item.parentSourceId == null ? undefined : byId.get(item.parentSourceId)
    const value = parent
      ? depth(parent, visiting) + 1
      : underParent || (item.parentSourceId != null && existingParents.has(item.parentSourceId))
        ? 1
        : 0
    visiting.delete(item.sourceId)
    depths.set(item.sourceId, value)
    return value
  }
  const counts = { parents: 0, subtasks: 0, nested: 0 }
  for (const item of items) {
    const level = depth(item)
    if (level === 0) counts.parents++
    else if (level === 1) counts.subtasks++
    else counts.nested++
  }
  return counts
}
