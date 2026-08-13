// useTaskTree — the flat task list read as an in-memory tree. Subscribes once to
// the store's tasks (the store owns the single Firestore subscription) and
// derives everything else: roots, per-node children/ancestors/descendants, and
// recursive progress. Nothing here is persisted — depth/rootId denormalised on
// the docs are just a cache; these queries recompute the live structure from
// parentId so a stale cache can never mislead the UI.

import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import {
  ancestorsOf,
  buildIndex,
  childrenOf,
  descendantsOf,
  progressOf,
  rootsOf,
  type Progress,
} from '@/utils/taskTree'
import type { Task } from '@/types'

export function useTaskTree(projectTag?: MaybeRefOrGetter<string | null | undefined>) {
  const app = useAppStore()
  const { tasks } = storeToRefs(app)

  // Optionally scope to one project tag; unscoped covers the whole workspace.
  const scoped = computed<Task[]>(() => {
    const tag = projectTag ? toValue(projectTag) : null
    return tag ? tasks.value.filter((t) => t.tag === tag) : tasks.value
  })

  const index = computed(() => buildIndex(scoped.value))
  const isDone = (t: Task) => t.status === 'done'

  const roots = computed<Task[]>(() => rootsOf(index.value))

  return {
    tasks: scoped,
    index,
    roots,
    isDone,
    childrenOf: (id: number): Task[] => childrenOf(index.value, id),
    ancestorsOf: (id: number): Task[] => ancestorsOf(index.value, id),
    descendantsOf: (id: number): Task[] => descendantsOf(index.value, id),
    progressOf: (id: number): Progress => progressOf(index.value, id, isDone),
    hasChildren: (id: number): boolean => childrenOf(index.value, id).length > 0,
    taskById: (id: number): Task | undefined => index.value.byId.get(id),
  }
}
