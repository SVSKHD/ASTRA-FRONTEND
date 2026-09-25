import type { LinkRef, Task, Todo } from '@/types'
import { buildIndex } from '@/utils/taskTree'
import { linkKey } from '@/utils/links'

export type ShareTreeType = 'todo' | 'task'

export interface SharedTreeNode {
  id: number
  type: ShareTreeType
  title: string
  text?: string
  description?: string
  notes?: string
  tag: string
  status: string
  done: boolean
  deadline?: string
  repo?: string
  createdAt: number
  updatedAt: number
  completedAt?: number | null
  children?: SharedTreeNode[]
}

function refFor(type: ShareTreeType, id: number): LinkRef {
  return { collection: type === 'todo' ? 'todos' : 'tasks', id }
}

function typeFor(ref: LinkRef): ShareTreeType {
  return ref.collection === 'todos' ? 'todo' : 'task'
}

function sourceFor(
  ref: LinkRef,
  todosById: Map<number, Todo>,
  tasksById: Map<number, Task>,
): Todo | Task | undefined {
  return ref.collection === 'todos' ? todosById.get(ref.id) : tasksById.get(ref.id)
}

function sameCollectionChildren(ref: LinkRef, todos: Todo[], tasks: Task[]): LinkRef[] {
  const index = ref.collection === 'todos' ? buildIndex(todos) : buildIndex(tasks)
  return (index.children.get(ref.id) ?? []).map((child) => ({
    collection: ref.collection,
    id: child.id,
  }))
}

function childRefs(ref: LinkRef, todos: Todo[], tasks: Task[]): LinkRef[] {
  const todosById = new Map(todos.map((todo) => [todo.id, todo]))
  const tasksById = new Map(tasks.map((task) => [task.id, task]))
  const source = sourceFor(ref, todosById, tasksById)
  const refs = [...sameCollectionChildren(ref, todos, tasks), ...(source?.linked ?? [])]
  const seen = new Set<string>()
  return refs.filter((child) => {
    const key = linkKey(child)
    if (seen.has(key)) return false
    seen.add(key)
    return sourceFor(child, todosById, tasksById) != null
  })
}

function baseNode(source: Todo | Task, type: ShareTreeType): SharedTreeNode {
  if (type === 'todo') {
    const todo = source as Todo
    return {
      id: todo.id,
      type,
      title: todo.text,
      text: todo.text,
      description: todo.description,
      tag: todo.tag,
      status: todo.status,
      done: todo.done,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
      completedAt: todo.completedAt,
    }
  }
  const task = source as Task
  return {
    id: task.id,
    type,
    title: task.title,
    description: task.notes,
    notes: task.notes,
    tag: task.tag,
    status: task.status,
    done: task.done,
    deadline: task.deadline,
    repo: task.repo,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
  }
}

export function buildSharedItemSnapshot(
  type: ShareTreeType,
  itemId: number,
  todos: Todo[],
  tasks: Task[],
): SharedTreeNode | null {
  const todosById = new Map(todos.map((todo) => [todo.id, todo]))
  const tasksById = new Map(tasks.map((task) => [task.id, task]))

  const visit = (ref: LinkRef, seen: Set<string>): SharedTreeNode | null => {
    const key = linkKey(ref)
    if (seen.has(key)) return null
    const source = sourceFor(ref, todosById, tasksById)
    if (!source) return null
    const nextSeen = new Set(seen).add(key)
    const node = baseNode(source, typeFor(ref))
    const children = childRefs(ref, todos, tasks)
      .map((child) => visit(child, nextSeen))
      .filter((child): child is SharedTreeNode => child != null)
    if (children.length) node.children = children
    return node
  }

  return visit(refFor(type, itemId), new Set())
}

export function sharedTreeContains(
  root: LinkRef,
  target: LinkRef,
  todos: Todo[],
  tasks: Task[],
): boolean {
  const seen = new Set<string>()
  const walk = (ref: LinkRef): boolean => {
    const key = linkKey(ref)
    if (seen.has(key)) return false
    seen.add(key)
    if (ref.id === target.id && ref.collection === target.collection) return true
    return childRefs(ref, todos, tasks).some(walk)
  }
  return walk(root)
}
