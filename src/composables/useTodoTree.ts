// useTodoTree — the flat todo list read as an in-memory tree, mirroring
// useTaskTree. Subscribes once to the store's todos and derives roots, per-node
// children/ancestors/descendants and recursive progress from parentId; nothing
// here is persisted (depth/rootId on the docs are just a cache).

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
import type { Todo } from '@/types'

export function useTodoTree(projectTag?: MaybeRefOrGetter<string | null | undefined>) {
  const app = useAppStore()
  const { todos } = storeToRefs(app)

  const scoped = computed<Todo[]>(() => {
    const tag = projectTag ? toValue(projectTag) : null
    return tag ? todos.value.filter((t) => t.tag === tag) : todos.value
  })

  const index = computed(() => buildIndex(scoped.value))
  const isDone = (t: Todo) => t.status === 'done'

  const roots = computed<Todo[]>(() => rootsOf(index.value))

  return {
    todos: scoped,
    index,
    roots,
    isDone,
    childrenOf: (id: number): Todo[] => childrenOf(index.value, id),
    ancestorsOf: (id: number): Todo[] => ancestorsOf(index.value, id),
    descendantsOf: (id: number): Todo[] => descendantsOf(index.value, id),
    progressOf: (id: number): Progress => progressOf(index.value, id, isDone),
    hasChildren: (id: number): boolean => childrenOf(index.value, id).length > 0,
    todoById: (id: number): Todo | undefined => index.value.byId.get(id),
  }
}
