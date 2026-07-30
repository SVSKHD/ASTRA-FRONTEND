// Linked-items state + actions for one parent item, shared by the panel and the
// list-card indicators for both todos and tasks with no per-view branching.
//
//   links       resolved direct children (live title/status), missing refs dropped
//   progress    { done, total, pct } over those direct children (status 'done')
//   link/unlink write both directions through the store (offline-safe)
//   canLink     validation for the picker (self / exists / cycle / limits)
//   candidates  searchable todos+tasks, excluding self, existing links, cycles

import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { LINK_REJECTION_MESSAGE, sameRef, type LinkCheck } from '@/utils/links'
import type { ItemStatus, LinkCollection, LinkRef, Task, Todo } from '@/types'

export interface LinkedRow {
  ref: LinkRef
  title: string
  status: ItemStatus
  done: boolean
  collection: LinkCollection
  pending: boolean
}

const itemType = (c: LinkCollection): 'todo' | 'task' => (c === 'todos' ? 'todo' : 'task')
const titleOf = (item: Todo | Task): string => ('text' in item ? item.text : (item as Task).title)

export function useLinkedItems(
  collection: LinkCollection,
  docId: MaybeRefOrGetter<number | null | undefined>,
) {
  const app = useAppStore()
  const { todos, tasks } = storeToRefs(app)

  const parentRef = computed<LinkRef | null>(() => {
    const id = toValue(docId)
    return typeof id === 'number' ? { id, collection } : null
  })

  function rowFor(ref: LinkRef): LinkedRow | null {
    const item = app.linkableById(ref)
    if (!item) return null
    return {
      ref,
      title: titleOf(item) || '(untitled)',
      status: item.status,
      done: item.status === 'done',
      collection: ref.collection,
      pending: app.isItemPending(itemType(ref.collection), ref.id),
    }
  }

  // Depends on todos/tasks so it re-resolves as children change status.
  const links = computed<LinkedRow[]>(() => {
    void todos.value
    void tasks.value
    const parent = parentRef.value
    if (!parent) return []
    const self = app.linkableById(parent)
    return (self?.linked ?? []).map(rowFor).filter((r): r is LinkedRow => r !== null)
  })

  const progress = computed(() =>
    parentRef.value ? app.linkProgressOf(parentRef.value) : { done: 0, total: 0, pct: 0 },
  )

  function canLink(child: LinkRef): LinkCheck {
    const parent = parentRef.value
    if (!parent) return { ok: false, reason: 'self' }
    return app.canLinkItems(parent, child)
  }

  function link(child: LinkRef) {
    const parent = parentRef.value
    if (!parent) return
    const res = app.linkItems(parent, child)
    if (!res.ok && res.reason) app.showToastMsg(LINK_REJECTION_MESSAGE[res.reason])
  }
  function unlink(child: LinkRef) {
    const parent = parentRef.value
    if (parent) app.unlinkItems(parent, child)
  }

  // Search across both collections for link candidates. Excludes self and
  // anything that can't be linked (already linked, would cycle, over limits).
  function candidates(query: string): LinkedRow[] {
    const parent = parentRef.value
    if (!parent) return []
    const q = query.trim().toLowerCase()
    const pool: { item: Todo | Task; collection: LinkCollection }[] = [
      ...todos.value.map((item) => ({ item, collection: 'todos' as const })),
      ...tasks.value.map((item) => ({ item, collection: 'tasks' as const })),
    ]
    const out: LinkedRow[] = []
    for (const { item, collection: coll } of pool) {
      const ref: LinkRef = { id: item.id, collection: coll }
      if (sameRef(ref, parent)) continue
      const title = titleOf(item) || '(untitled)'
      if (q && !title.toLowerCase().includes(q)) continue
      if (!app.canLinkItems(parent, ref).ok) continue
      out.push({
        ref,
        title,
        status: item.status,
        done: item.status === 'done',
        collection: coll,
        pending: false,
      })
    }
    return out
  }

  return { parentRef, links, progress, canLink, link, unlink, candidates }
}
