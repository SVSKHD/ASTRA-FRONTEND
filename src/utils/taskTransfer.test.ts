import { describe, expect, it } from 'vitest'
import {
  buildTaskTransferUrl,
  collectionFromTaskTransferQuery,
  exportTaskTransferJson,
  parseTaskTransferJson,
  parseTaskTransferUrl,
  taskTransferItems,
  type TaskTransferItem,
} from '@/utils/taskTransfer'
import { SAMPLE_TASKS_JSON, SAMPLE_TODOS_JSON } from '@/utils/taskTransferHelp'
import type { Task, Todo } from '@/types'

function todo(fields: Partial<Todo>): Todo {
  return {
    id: 1,
    text: 'Read paper',
    done: false,
    status: 'pending',
    tag: 'research',
    description: 'Skim the abstract',
    createdAt: 1,
    updatedAt: 1,
    isPublic: false,
    shareId: null,
    sharedAt: null,
    rolledOverAt: null,
    rolloverCount: 0,
    completedAt: null,
    reminderIds: [],
    sourceRef: null,
    linked: [],
    parents: [],
    parentId: null,
    order: 0,
    depth: 0,
    rootId: 1,
    localRev: 0,
    updatedBy: '',
    ...fields,
  }
}

function task(fields: Partial<Task>): Task {
  return {
    id: 1,
    title: 'Ship export',
    tag: 'app',
    done: false,
    status: 'progress',
    deadline: '2026-10-02',
    notes: 'Include title and description',
    repo: 'owner/repo',
    rolledOverAt: null,
    rolloverCount: 0,
    completedAt: null,
    reminderIds: [],
    sourceRef: null,
    linked: [],
    parents: [],
    parentId: null,
    order: 0,
    depth: 0,
    rootId: 1,
    localRev: 0,
    updatedBy: '',
    createdAt: 1,
    updatedAt: 1,
    ...fields,
  }
}

describe('taskTransferItems', () => {
  it('exports parents before children and keeps parent source ids', () => {
    const items = taskTransferItems('todos', [
      todo({ id: 2, text: 'Child', parentId: 1, order: 0, rootId: 1, depth: 1 }),
      todo({ id: 1, text: 'Parent', order: 0 }),
    ])
    expect(items.map((item) => item.title)).toEqual(['Parent', 'Child'])
    expect(items[1].parentSourceId).toBe('1')
  })

  it('maps task notes to transfer descriptions', () => {
    const items = taskTransferItems('tasks', [task({})])
    expect(items[0]).toMatchObject({
      title: 'Ship export',
      description: 'Include title and description',
      deadline: '2026-10-02',
      repo: 'owner/repo',
    })
  })
})

describe('task transfer JSON', () => {
  it('round-trips an exported todo document', () => {
    const json = exportTaskTransferJson('todos', [todo({})], '2026-09-25T00:00:00Z')
    const parsed = parseTaskTransferJson(json)
    expect(parsed.collection).toBe('todos')
    expect(parsed.exportedAt).toBe('2026-09-25T00:00:00Z')
    expect(parsed.items[0]).toMatchObject({
      title: 'Read paper',
      description: 'Skim the abstract',
      tag: 'research',
    })
  })

  it('accepts a bare array with a collection hint', () => {
    const parsed = parseTaskTransferJson([{ title: 'A' }, { text: 'B', done: true }], 'tasks')
    expect(parsed.collection).toBe('tasks')
    expect(parsed.items.map((item) => item.title)).toEqual(['A', 'B'])
    expect(parsed.items[1].status).toBe('done')
  })

  it('returns parse errors instead of throwing', () => {
    expect(parseTaskTransferJson('{ nope', 'todos').parseError).toBeTruthy()
  })

  it('accepts the Aquakart-style sample shape', () => {
    const parsed = parseTaskTransferJson(SAMPLE_TASKS_JSON)
    expect(parsed.collection).toBe('tasks')
    expect(parsed.items[0]).toMatchObject({
      sourceId: 'AK-GROW-001',
      title: 'Real Lead Backend',
      status: 'pending',
      tag: 'CRM',
      priority: 'high',
    })
    expect(parsed.items[0].description).toContain('Test criteria:')
    expect(parsed.items[0].description).toContain('- Create a lead from CRM')
    expect(parsed.items[1]).toMatchObject({
      parentSourceId: 'AK-GROW-001',
      status: 'progress',
      priority: 'high',
    })
    expect(parsed.items[2]).toMatchObject({
      deadline: '2026-10-02',
      priority: 'normal',
    })
  })

  it('keeps the todo sample valid too', () => {
    const parsed = parseTaskTransferJson(SAMPLE_TODOS_JSON)
    expect(parsed.collection).toBe('todos')
    expect(parsed.items.map((item) => item.title)).toEqual([
      'Confirm launch owner',
      'Share launch notes',
    ])
    expect(parsed.items[1]).toMatchObject({ parentSourceId: 'TODO-001', status: 'done' })
  })
})

describe('task transfer URLs', () => {
  it('parses a single todo from tab, title and description params', () => {
    const parsed = parseTaskTransferUrl('/?tab=todo&title=Read&description=Paper')
    expect(parsed.collection).toBe('todos')
    expect(parsed.items[0]).toMatchObject({ title: 'Read', description: 'Paper' })
  })

  it('parses an item JSON payload from a tasks URL', () => {
    const items: TaskTransferItem[] = [
      {
        sourceId: 'a',
        parentSourceId: null,
        title: 'Parent',
        description: '',
        status: 'pending',
        tag: '',
      },
      {
        sourceId: 'b',
        parentSourceId: 'a',
        title: 'Child',
        description: 'nested',
        status: 'progress',
        tag: 'x',
      },
    ]
    const parsed = parseTaskTransferUrl(
      '/?tab=tasks&items=' + encodeURIComponent(JSON.stringify(items)),
    )
    expect(parsed.collection).toBe('tasks')
    expect(parsed.items[1]).toMatchObject({ title: 'Child', parentSourceId: 'a' })
  })

  it('parses the loose /tab?=todo=... form', () => {
    const parsed = parseTaskTransferUrl('/tab?=todo=one|two')
    expect(parsed.collection).toBe('todos')
    expect(parsed.items.map((item) => item.title)).toEqual(['one', 'two'])
  })

  it('builds a URL that parses back to the same collection and titles', () => {
    const url = buildTaskTransferUrl('tasks', [task({ title: 'A' }), task({ id: 2, title: 'B' })])
    const parsed = parseTaskTransferUrl(url)
    expect(parsed.collection).toBe('tasks')
    expect(parsed.items.map((item) => item.title)).toEqual(['A', 'B'])
  })

  it('detects transfer collection from router query objects', () => {
    expect(collectionFromTaskTransferQuery({ tab: 'todo' })).toBe('todos')
    expect(collectionFromTaskTransferQuery({ tasks: 'A|B' })).toBe('tasks')
    expect(collectionFromTaskTransferQuery({ '': 'todo=A' })).toBe('todos')
  })
})
