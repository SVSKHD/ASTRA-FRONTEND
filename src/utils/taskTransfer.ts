import type { ItemStatus, Task, Todo } from '@/types'
import { isStatus } from '@/types'

export const TASK_TRANSFER_VERSION = 1
export const MAX_TRANSFER_ITEMS = 500

export type TaskTransferCollection = 'todos' | 'tasks'

export interface TaskTransferItem {
  sourceId: string
  parentSourceId: string | null
  title: string
  description: string
  status: ItemStatus
  tag: string
  deadline?: string
  repo?: string
  priority?: 'low' | 'normal' | 'high'
  estimateMins?: number | null
}

export interface TaskTransferDocument {
  version: number
  collection: TaskTransferCollection
  exportedAt: string
  items: TaskTransferItem[]
  parseError?: string
}

type TransferSource = Todo | Task

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function str(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function clean(value: unknown): string {
  return str(value).replace(/\s+/g, ' ').trim()
}

function asSourceId(value: unknown, fallback: number): string {
  const s = str(value).trim()
  return s || String(fallback)
}

function asParentSourceId(value: unknown): string | null {
  if (value == null || value === '') return null
  return str(value)
}

function asStatus(value: unknown, done: unknown, progress: unknown): ItemStatus {
  if (isStatus(value)) return value
  const v = str(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (['not_started', 'todo', 'open', 'new'].includes(v)) return 'pending'
  if (['in_development', 'in_progress', 'ready_for_testing', 'testing', 'started'].includes(v)) {
    return 'progress'
  }
  if (['tested_complete', 'complete', 'completed', 'closed'].includes(v)) return 'done'
  if (done === true || done === 'true') return 'done'
  const n = typeof progress === 'number' ? progress : Number.parseFloat(str(progress))
  if (Number.isFinite(n)) {
    if (n >= 100) return 'done'
    if (n > 0) return 'progress'
  }
  return 'pending'
}

function asIsoDate(value: unknown): string {
  const s = str(value).trim()
  return ISO_DATE.test(s) ? s : ''
}

function asPriority(value: unknown): TaskTransferItem['priority'] | undefined {
  const v = str(value).trim().toLowerCase()
  if (v === 'low' || v === 'p2') return 'low'
  if (v === 'normal' || v === 'medium' || v === 'p1') return 'normal'
  if (v === 'high' || v === 'urgent' || v === 'critical' || v === 'p0') return 'high'
  return undefined
}

function asEstimate(value: unknown): number | null | undefined {
  if (value == null || value === '') return undefined
  const n = typeof value === 'number' ? value : Number.parseInt(str(value), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function criteriaLines(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => clean(item)).filter(Boolean)
  }
  const single = clean(value)
  return single ? [single] : []
}

function descriptionOf(raw: Record<string, unknown>): string {
  const base = str(raw.description ?? raw.notes ?? raw.note).trim()
  const criteria = criteriaLines(raw.testCriteria ?? raw.criteria ?? raw.acceptanceCriteria)
  if (!criteria.length) return base
  const section = ['Test criteria:', ...criteria.map((line) => '- ' + line)].join('\n')
  return base ? base + '\n\n' + section : section
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function queryText(input: string): string {
  const noHash = input.split('#')[0]
  return noHash.includes('?') ? noHash.slice(noHash.indexOf('?') + 1) : noHash
}

export function taskTransferCollectionOf(value: unknown): TaskTransferCollection | null {
  const v = str(value).trim().toLowerCase()
  if (v === 'todo' || v === 'todos') return 'todos'
  if (v === 'task' || v === 'tasks') return 'tasks'
  return null
}

export function tabForTaskTransferCollection(collection: TaskTransferCollection): 'todo' | 'tasks' {
  return collection === 'todos' ? 'todo' : 'tasks'
}

export function taskTransferFilename(
  collection: TaskTransferCollection,
  exportedAt = new Date().toISOString(),
): string {
  const day = exportedAt.slice(0, 10) || 'export'
  return `${collection}-${day}.json`
}

function sortTree<T extends { id: number; parentId: number | null; order: number }>(
  source: readonly T[],
): T[] {
  const ids = new Set(source.map((item) => item.id))
  const children = new Map<number | null, T[]>()
  for (const item of source) {
    const parentId = item.parentId != null && ids.has(item.parentId) ? item.parentId : null
    const group = children.get(parentId)
    if (group) group.push(item)
    else children.set(parentId, [item])
  }
  for (const group of children.values()) group.sort((a, b) => a.order - b.order || a.id - b.id)
  const out: T[] = []
  const visit = (parentId: number | null) => {
    for (const item of children.get(parentId) ?? []) {
      out.push(item)
      visit(item.id)
    }
  }
  visit(null)
  return out
}

function transferItem(collection: TaskTransferCollection, item: TransferSource): TaskTransferItem {
  const title = collection === 'todos' ? (item as Todo).text : (item as Task).title
  const description = collection === 'todos' ? (item as Todo).description : (item as Task).notes
  const parentSourceId = item.parentId == null ? null : String(item.parentId)
  const base: TaskTransferItem = {
    sourceId: String(item.id),
    parentSourceId,
    title,
    description,
    status: item.status,
    tag: item.tag,
  }
  if (collection === 'tasks') {
    const task = item as Task
    return {
      ...base,
      deadline: task.deadline || undefined,
      repo: task.repo || undefined,
      priority: task.priority,
      estimateMins: task.estimateMins ?? undefined,
    }
  }
  return base
}

export function taskTransferItems(
  collection: TaskTransferCollection,
  source: readonly TransferSource[],
): TaskTransferItem[] {
  return sortTree(source).map((item) => transferItem(collection, item))
}

export function exportTaskTransferJson(
  collection: TaskTransferCollection,
  source: readonly TransferSource[],
  exportedAt = new Date().toISOString(),
): string {
  const doc = {
    version: TASK_TRANSFER_VERSION,
    exportedAt,
    collection,
    items: taskTransferItems(collection, source),
  }
  return JSON.stringify(doc, null, 2)
}

function normalizeTransferItem(
  input: unknown,
  collection: TaskTransferCollection,
  index: number,
): TaskTransferItem | null {
  const raw =
    typeof input === 'string' ? { title: input } : ((input ?? {}) as Record<string, unknown>)
  const title = clean(raw.title ?? raw.text ?? raw.name)
  if (!title) return null
  const description = descriptionOf(raw)
  const item: TaskTransferItem = {
    sourceId: asSourceId(raw.sourceId ?? raw.id, index),
    parentSourceId: asParentSourceId(raw.parentSourceId ?? raw.parentId),
    title,
    description,
    status: asStatus(raw.status, raw.done, raw.progress),
    tag: clean(raw.tag ?? raw.area),
  }
  if (collection === 'tasks') {
    item.deadline = asIsoDate(raw.deadline ?? raw.due ?? raw.dueAt)
    item.repo = clean(raw.repo)
    item.priority = asPriority(raw.priority)
    item.estimateMins = asEstimate(raw.estimateMins)
  }
  return item
}

function normalizeItems(items: unknown[], collection: TaskTransferCollection): TaskTransferItem[] {
  return items
    .slice(0, MAX_TRANSFER_ITEMS)
    .map((item, i) => normalizeTransferItem(item, collection, i))
    .filter((item): item is TaskTransferItem => item !== null)
}

function rawItemsFromObject(
  obj: Record<string, unknown>,
  collection: TaskTransferCollection,
): unknown[] {
  if (Array.isArray(obj.items)) return obj.items
  if (collection === 'todos' && Array.isArray(obj.todos)) return obj.todos
  if (collection === 'tasks' && Array.isArray(obj.tasks)) return obj.tasks
  if (typeof obj.title === 'string' || typeof obj.text === 'string') return [obj]
  return []
}

function detectCollection(
  obj: Record<string, unknown>,
  hint?: TaskTransferCollection,
): TaskTransferCollection {
  return (
    taskTransferCollectionOf(obj.collection) ??
    taskTransferCollectionOf(obj.tab) ??
    taskTransferCollectionOf(obj.scope) ??
    (Array.isArray(obj.todos) ? 'todos' : null) ??
    (Array.isArray(obj.tasks) ? 'tasks' : null) ??
    hint ??
    'tasks'
  )
}

export function parseTaskTransferJson(
  input: string | unknown,
  hint?: TaskTransferCollection,
): TaskTransferDocument {
  let obj: unknown = input
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) {
      return {
        version: TASK_TRANSFER_VERSION,
        exportedAt: '',
        collection: hint ?? 'tasks',
        items: [],
      }
    }
    try {
      obj = JSON.parse(trimmed)
    } catch (error) {
      return {
        version: TASK_TRANSFER_VERSION,
        exportedAt: '',
        collection: hint ?? 'tasks',
        items: [],
        parseError: (error as Error).message || 'Invalid JSON',
      }
    }
  }
  if (Array.isArray(obj)) {
    const collection = hint ?? 'tasks'
    return {
      version: TASK_TRANSFER_VERSION,
      exportedAt: '',
      collection,
      items: normalizeItems(obj, collection),
    }
  }
  const record = (obj && typeof obj === 'object' ? obj : {}) as Record<string, unknown>
  const collection = detectCollection(record, hint)
  return {
    version:
      typeof record.version === 'number' && Number.isFinite(record.version)
        ? record.version
        : TASK_TRANSFER_VERSION,
    exportedAt: str(record.exportedAt),
    collection,
    items: normalizeItems(rawItemsFromObject(record, collection), collection),
  }
}

function splitPayload(payload: string): unknown[] {
  const decoded = safeDecode(payload).replace(/\\n/g, '\n').trim()
  if (!decoded) return []
  if (decoded.startsWith('[') || decoded.startsWith('{')) {
    try {
      const parsed = JSON.parse(decoded)
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>
        if (Array.isArray(record.items)) return record.items
        return [record]
      }
    } catch {
      /* fall through to delimiter splitting */
    }
  }
  const delimiter = decoded.includes('|')
    ? '|'
    : decoded.includes(';')
      ? ';'
      : decoded.includes('\n')
        ? '\n'
        : ','
  return decoded.split(delimiter).map((part) => part.trim())
}

function firstParam(params: URLSearchParams, names: string[]): string | null {
  for (const name of names) {
    const value = params.get(name)
    if (value != null) return value
  }
  return null
}

function urlOf(input: string): URL {
  const raw = input.trim()
  try {
    return new URL(raw, 'https://aureon.local')
  } catch {
    return new URL('/?' + raw.replace(/^\?/, ''), 'https://aureon.local')
  }
}

function legacyQueryPayload(
  input: string,
): { collection: TaskTransferCollection; payload: string } | null {
  const decoded = safeDecode(queryText(input).trim())
  const match = decoded.match(/^=?(todo|todos|task|tasks)=([\s\S]+)$/i)
  const collection = taskTransferCollectionOf(match?.[1])
  return collection && match ? { collection, payload: match[2] } : null
}

export function collectionFromTaskTransferQuery(
  query: Record<string, unknown>,
): TaskTransferCollection | null {
  const direct =
    taskTransferCollectionOf(query.tab) ??
    taskTransferCollectionOf(query.collection) ??
    taskTransferCollectionOf(query.scope) ??
    taskTransferCollectionOf(query.type)
  if (direct) return direct
  if (Object.hasOwn(query, 'todo') || Object.hasOwn(query, 'todos')) return 'todos'
  if (Object.hasOwn(query, 'task') || Object.hasOwn(query, 'tasks')) return 'tasks'
  const empty = query['']
  const value = Array.isArray(empty) ? empty[0] : empty
  const match = typeof value === 'string' ? value.match(/^(todo|todos|task|tasks)=/i) : null
  return taskTransferCollectionOf(match?.[1])
}

export function hasTaskTransferUrlPayload(input: string): boolean {
  const legacy = legacyQueryPayload(input)
  if (legacy) return true
  const params = urlOf(input).searchParams
  return ['items', 'json', 'list', 'title', 'text', 'todo', 'todos', 'task', 'tasks'].some((key) =>
    params.has(key),
  )
}

export function parseTaskTransferUrl(input: string): TaskTransferDocument {
  const legacy = legacyQueryPayload(input)
  if (legacy) {
    return {
      version: TASK_TRANSFER_VERSION,
      exportedAt: '',
      collection: legacy.collection,
      items: normalizeItems(splitPayload(legacy.payload), legacy.collection),
    }
  }

  const params = urlOf(input).searchParams
  let collection =
    taskTransferCollectionOf(params.get('tab')) ??
    taskTransferCollectionOf(params.get('collection')) ??
    taskTransferCollectionOf(params.get('scope')) ??
    taskTransferCollectionOf(params.get('type'))

  const jsonPayload = firstParam(params, ['json'])
  if (jsonPayload) return parseTaskTransferJson(jsonPayload, collection ?? undefined)

  let rawItems: unknown[] = []
  const itemsPayload = firstParam(params, ['items', 'list'])
  if (itemsPayload) rawItems = splitPayload(itemsPayload)

  const todoPayload = firstParam(params, ['todo', 'todos'])
  const taskPayload = firstParam(params, ['task', 'tasks'])
  if (!rawItems.length && todoPayload != null) {
    collection = 'todos'
    rawItems = splitPayload(todoPayload)
  }
  if (!rawItems.length && taskPayload != null) {
    collection = 'tasks'
    rawItems = splitPayload(taskPayload)
  }

  if (!rawItems.length) {
    const titles = [...params.getAll('title'), ...params.getAll('text')]
    const descriptions = [...params.getAll('description'), ...params.getAll('notes')]
    if (titles.length) {
      rawItems = titles.map((title, i) => ({
        title,
        description: descriptions[i] ?? descriptions[0] ?? '',
        tag: params.get('tag') ?? '',
        status: params.get('status') ?? '',
        deadline: params.get('deadline') ?? params.get('due') ?? '',
      }))
    }
  }

  const finalCollection = collection ?? 'tasks'
  return {
    version: TASK_TRANSFER_VERSION,
    exportedAt: '',
    collection: finalCollection,
    items: normalizeItems(rawItems, finalCollection),
  }
}

export function buildTaskTransferUrl(
  collection: TaskTransferCollection,
  source: readonly TransferSource[],
  baseHref?: string,
): string {
  const base =
    baseHref ??
    (typeof location !== 'undefined' && location.origin
      ? location.origin + '/'
      : 'https://aureon.local/')
  const url = new URL('/', base)
  url.searchParams.set('tab', tabForTaskTransferCollection(collection))
  url.searchParams.set('items', JSON.stringify(taskTransferItems(collection, source)))
  return url.toString()
}

// ---- pasting more subtasks under one parent ----------------------------------
// "Add more" in a task's (or todo's) detail: whatever is pasted becomes
// subtasks of that item. Pastes are messy, so this is forgiving where the
// import box is strict:
//   • code fences, smart quotes, trailing commas and stray whitespace are
//     tidied before JSON is tried;
//   • JSON may be an export document, a bare array, or items that carry their
//     own `subtasks` / `children` / `items` arrays (flattened, nesting kept);
//   • anything that is not JSON is read as one subtask per non-empty line,
//     with bullets ("- ", "* ", "• ", "1. ") and checkboxes ("[ ]", "[x]")
//     taken off — "[x]" marks it done.
export interface ParentPasteResult {
  items: TaskTransferItem[]
  /** 'json' or 'lines': how the paste was read, for the dialog to say. */
  as: 'json' | 'lines'
  error?: string
}

function tidyPaste(input: string): string {
  return input
    .replace(/^\uFEFF/, '')
    .replace(/^\s*```[a-zA-Z]*\s*/, '')
    .replace(/\s*```\s*$/, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,(\s*[}\]])/g, '$1')
    .trim()
}

const NESTED_KEYS = ['subtasks', 'children', 'items', 'todos', 'tasks'] as const

// Nested items → a flat list with parent links, the shape the import expects.
function flattenNested(list: unknown[], parentId: string | null, out: unknown[], path: string) {
  list.forEach((raw, i) => {
    const id = path + '.' + i
    if (typeof raw === 'string') {
      out.push({ title: raw, sourceId: id, parentSourceId: parentId })
      return
    }
    if (!raw || typeof raw !== 'object') return
    const rec = { ...(raw as Record<string, unknown>) }
    const kids = NESTED_KEYS.map((k) => rec[k]).find((v) => Array.isArray(v)) as
      unknown[] | undefined
    for (const k of NESTED_KEYS) if (Array.isArray(rec[k])) delete rec[k]
    // Keep a parent link the item already states; otherwise hang it off the
    // item it was nested in.
    const ownId = rec.sourceId ?? rec.id
    const sourceId = ownId != null ? String(ownId) : id
    out.push({
      ...rec,
      sourceId,
      parentSourceId: rec.parentSourceId ?? rec.parentId ?? parentId,
    })
    if (kids?.length) flattenNested(kids, sourceId, out, id)
  })
}

export function parseItemsForParent(
  input: string,
  collection: TaskTransferCollection,
): ParentPasteResult {
  const tidied = tidyPaste(input)
  if (!tidied) return { items: [], as: 'lines', error: 'Nothing to add.' }

  if (tidied.startsWith('[') || tidied.startsWith('{')) {
    try {
      const parsed = JSON.parse(tidied) as unknown
      const record =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null
      // An export document (items already flat, with parent links) goes
      // through the ordinary parser; anything else is flattened first.
      const top = Array.isArray(parsed)
        ? parsed
        : record &&
            NESTED_KEYS.some((k) => Array.isArray(record[k])) &&
            !record.title &&
            !record.text
          ? (NESTED_KEYS.map((k) => record[k]).find((v) => Array.isArray(v)) as unknown[])
          : [parsed]
      const flat: unknown[] = []
      flattenNested(top, null, flat, 'p')
      const items = normalizeItems(flat, collection)
      return items.length
        ? { items, as: 'json' }
        : { items: [], as: 'json', error: 'That JSON has no items with a title.' }
    } catch {
      /* not JSON after all — read it as lines */
    }
  }

  const lines = tidied
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      let text = l.replace(/^(?:[-*•–]|\d+[.)])\s+/, '')
      let done = false
      const box = text.match(/^\[( |x|X)\]\s*/)
      if (box) {
        done = box[1].toLowerCase() === 'x'
        text = text.slice(box[0].length)
      }
      return { title: text.trim(), status: done ? 'done' : 'pending', sourceId: 'l' + i }
    })
    .filter((l) => l.title)
  const items = normalizeItems(lines, collection)
  return items.length
    ? { items, as: 'lines' }
    : { items: [], as: 'lines', error: 'Nothing to add.' }
}
