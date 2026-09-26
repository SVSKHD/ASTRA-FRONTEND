import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { warningEntries } from '@/services/warnings'
import { SAMPLE_TASKS_JSON } from '@/utils/taskTransferHelp'
import type { Task, Todo } from '@/types'

function makeTask(id: number, over: Partial<Task> = {}): Task {
  return {
    id,
    title: 'task ' + id,
    tag: '',
    done: false,
    status: 'pending',
    deadline: '',
    notes: '',
    repo: '',
    rolledOverAt: null,
    rolloverCount: 0,
    completedAt: null,
    linked: [],
    parents: [],
    reminderIds: [],
    sourceRef: null,
    parentId: null,
    order: 0,
    depth: 0,
    rootId: id,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}
const byId = (app: ReturnType<typeof useAppStore>, id: number) =>
  app.tasks.find((t) => t.id === id) as Task

describe('moveTask — reparent + subtree recompute', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reparents a task, setting depth and rootId', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1), makeTask(2)]
    expect(app.moveTask(2, 1, 0)).toBe(true)
    expect(byId(app, 2).parentId).toBe(1)
    expect(byId(app, 2).depth).toBe(1)
    expect(byId(app, 2).rootId).toBe(1)
    expect(byId(app, 2).localRev).toBe(1)
  })

  it('drags the whole subtree, recomputing depth/rootId for descendants', () => {
    const app = useAppStore()
    // 1 → 2 → 3 ; promote 2 (with 3) to the root.
    app.tasks = [
      makeTask(1),
      makeTask(2, { parentId: 1, depth: 1, rootId: 1 }),
      makeTask(3, { parentId: 2, depth: 2, rootId: 1 }),
    ]
    expect(app.moveTask(2, null, 0)).toBe(true)
    expect(byId(app, 2)).toMatchObject({ parentId: null, depth: 0, rootId: 2 })
    expect(byId(app, 3)).toMatchObject({ parentId: 2, depth: 1, rootId: 2 })
  })
})

describe('moveTask — cycle guard', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('rejects dropping a task onto its own descendant and writes nothing', () => {
    const app = useAppStore()
    app.tasks = [
      makeTask(1),
      makeTask(2, { parentId: 1, depth: 1, rootId: 1 }),
      makeTask(3, { parentId: 2, depth: 2, rootId: 1 }),
    ]
    const before = JSON.stringify(app.tasks)
    expect(app.moveTask(1, 3, 0)).toBe(false)
    expect(JSON.stringify(app.tasks)).toBe(before) // untouched
  })

  it('rejects dropping onto self', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1)]
    expect(app.moveTask(1, 1, 0)).toBe(false)
  })
})

describe('moveTask — fractional reorder', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reorders within a sibling group by bisecting neighbours (one field)', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1, { order: 0 }), makeTask(2, { order: 10 }), makeTask(3, { order: 20 })]
    // Move 3 to slot 1 → between 1 (0) and 2 (10) → 5.
    expect(app.moveTask(3, null, 1)).toBe(true)
    expect(byId(app, 3).order).toBe(5)
    expect(byId(app, 3).parentId).toBe(null)
    // Neighbours were not rewritten.
    expect(byId(app, 1).order).toBe(0)
    expect(byId(app, 2).order).toBe(10)
  })

  it('renormalises a sibling group to integers when a gap gets too small', () => {
    const app = useAppStore()
    app.tasks = [
      makeTask(1, { order: 0 }),
      makeTask(2, { order: 0.00005 }),
      makeTask(3, { order: 1 }),
    ]
    // Any move into this group triggers a renormalise pass.
    app.moveTask(3, null, 3)
    const orders = app.tasks.map((t) => t.order).sort((a, b) => a - b)
    // All integers, evenly spaced.
    expect(orders.every((o) => Number.isInteger(o))).toBe(true)
  })
})

function makeTodo(id: number, over: Partial<Todo> = {}): Todo {
  return {
    id,
    text: 'todo ' + id,
    done: false,
    status: 'pending',
    tag: '',
    description: '',
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
    rootId: id,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe('moveTodo — flat hierarchy parity with tasks', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reparents a todo with its subtree and rejects cycles', () => {
    const app = useAppStore()
    app.todos = [
      makeTodo(1),
      makeTodo(2, { parentId: 1, depth: 1, rootId: 1 }),
      makeTodo(3, { parentId: 2, depth: 2, rootId: 1 }),
    ]
    // Promote 2 (with 3) to the root.
    expect(app.moveTodo(2, null, 0)).toBe(true)
    expect(app.todos.find((t) => t.id === 2)).toMatchObject({ parentId: null, depth: 0, rootId: 2 })
    expect(app.todos.find((t) => t.id === 3)).toMatchObject({ parentId: 2, depth: 1, rootId: 2 })
    // Cycle: dropping 2 back under its own child 3 is rejected.
    expect(app.moveTodo(2, 3, 0)).toBe(false)
  })
})

describe('convertTodoToTask', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('moves a todo subtree into tasks and keeps linked task children under it', () => {
    const app = useAppStore()
    app.todos = [
      makeTodo(1, {
        text: 'Launch checklist',
        description: 'Ship the thing',
        tag: 'ship',
        linked: [{ id: 9, collection: 'tasks' }],
      }),
      makeTodo(2, { text: 'QA pass', parentId: 1, depth: 1, rootId: 1, tag: 'ship' }),
    ]
    app.tasks = [makeTask(9, { title: 'Build API', tag: 'ship' })]

    const rootTaskId = app.convertTodoToTask(1)

    expect(rootTaskId).toBeTypeOf('number')
    const root = app.tasks.find((task) => task.id === rootTaskId) as Task
    const child = app.tasks.find((task) => task.title === 'QA pass') as Task
    expect(root).toMatchObject({
      title: 'Launch checklist',
      notes: 'Ship the thing',
      tag: 'ship',
      parentId: null,
      rootId: root.id,
    })
    expect(child).toMatchObject({ parentId: root.id, depth: 1, rootId: root.id })
    expect(app.tasks.find((task) => task.id === 9)).toMatchObject({
      parentId: root.id,
      depth: 1,
      rootId: root.id,
    })
    expect(app.todos).toEqual([])
  })

  it('bulk moves selected todo roots once when a child is also selected', () => {
    const app = useAppStore()
    app.todos = [
      makeTodo(1, { text: 'Parent' }),
      makeTodo(2, { text: 'Child', parentId: 1, depth: 1, rootId: 1 }),
    ]

    const created = app.convertTodosToTasks([1, 2])

    expect(created).toHaveLength(1)
    expect(app.tasks.map((task) => task.title).sort()).toEqual(['Child', 'Parent'])
    const root = app.tasks.find((task) => task.title === 'Parent') as Task
    expect(app.tasks.find((task) => task.title === 'Child')).toMatchObject({
      parentId: root.id,
      rootId: root.id,
      depth: 1,
    })
    expect(app.todos).toEqual([])
  })
})

describe('convertTaskToTodo', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('moves a task subtree into todos and keeps linked todo children under it', () => {
    const app = useAppStore()
    app.tasks = [
      makeTask(1, {
        title: 'Launch plan',
        notes: 'Coordinate the launch.',
        tag: 'ship',
        deadline: '2026-10-02',
        linked: [{ id: 9, collection: 'todos' }],
      }),
      makeTask(2, { title: 'Write copy', parentId: 1, depth: 1, rootId: 1, tag: 'ship' }),
    ]
    app.todos = [makeTodo(9, { text: 'Existing checklist', tag: 'ship' })]

    const rootTodoId = app.convertTaskToTodo(1)

    expect(rootTodoId).toBeTypeOf('number')
    const root = app.todos.find((todo) => todo.id === rootTodoId) as Todo
    const child = app.todos.find((todo) => todo.text === 'Write copy') as Todo
    expect(root).toMatchObject({
      text: 'Launch plan',
      tag: 'ship',
      parentId: null,
      rootId: root.id,
    })
    expect(root.description).toContain('Coordinate the launch.')
    expect(root.description).toContain('Due: 2026-10-02')
    expect(child).toMatchObject({ parentId: root.id, depth: 1, rootId: root.id })
    expect(app.todos.find((todo) => todo.id === 9)).toMatchObject({
      parentId: root.id,
      depth: 1,
      rootId: root.id,
    })
    expect(app.tasks).toEqual([])
  })

  it('bulk moves selected task roots once when a subtask is also selected', () => {
    const app = useAppStore()
    app.tasks = [
      makeTask(1, { title: 'Parent' }),
      makeTask(2, { title: 'Child', parentId: 1, depth: 1, rootId: 1 }),
    ]

    const created = app.convertTasksToTodos([1, 2])

    expect(created).toHaveLength(1)
    expect(app.todos.map((todo) => todo.text).sort()).toEqual(['Child', 'Parent'])
    const root = app.todos.find((todo) => todo.text === 'Parent') as Todo
    expect(app.todos.find((todo) => todo.text === 'Child')).toMatchObject({
      parentId: root.id,
      rootId: root.id,
      depth: 1,
    })
    expect(app.tasks).toEqual([])
  })
})

describe('deleteManyWithProgress', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    warningEntries.splice(0)
  })

  it('deletes a selected todo tree once when a child is also selected', async () => {
    const app = useAppStore()
    app.todos = [
      makeTodo(1, { text: 'Parent' }),
      makeTodo(2, { text: 'Child', parentId: 1, depth: 1, rootId: 1 }),
      makeTodo(3, { text: 'Keep' }),
    ]

    const deleted = await app.deleteManyWithProgress('todos', [1, 2])

    expect(deleted).toBe(2)
    expect(app.todos.map((todo) => todo.id)).toEqual([3])
    expect(warningEntries.at(-1)).toMatchObject({
      tone: 'success',
      title: 'Deleted 2 todos',
    })
  })

  it('includes same-collection linked task children under a selected task', async () => {
    const app = useAppStore()
    app.tasks = [
      makeTask(1, { title: 'Parent', linked: [{ id: 2, collection: 'tasks' }] }),
      makeTask(2, { title: 'Linked child', parents: [{ id: 1, collection: 'tasks' }] }),
      makeTask(3, { title: 'Keep' }),
    ]

    const deleted = await app.deleteManyWithProgress('tasks', [1])

    expect(deleted).toBe(2)
    expect(app.tasks.map((task) => task.id)).toEqual([3])
    expect(warningEntries.at(-1)).toMatchObject({
      tone: 'success',
      title: 'Deleted 2 tasks',
    })
  })
})

describe('move — subtasks inherit the parent tag', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('stamps a tagged parent tag onto the moved task and its whole subtree', () => {
    const app = useAppStore()
    app.tasks = [
      makeTask(1, { tag: 'work' }),
      makeTask(2, { tag: 'home' }),
      makeTask(3, { parentId: 2, depth: 1, rootId: 2, tag: '' }),
    ]
    expect(app.moveTask(2, 1, 0)).toBe(true)
    expect(byId(app, 2).tag).toBe('work')
    expect(byId(app, 3).tag).toBe('work')
  })

  it('does the same for todos', () => {
    const app = useAppStore()
    app.todos = [makeTodo(1, { tag: 'errands' }), makeTodo(2)]
    expect(app.moveTodo(2, 1, 0)).toBe(true)
    expect(app.todos.find((t) => t.id === 2)?.tag).toBe('errands')
  })

  it('keeps existing tags when the new parent has no tag', () => {
    const app = useAppStore()
    app.tasks = [makeTask(1), makeTask(2, { tag: 'home' })]
    app.moveTask(2, 1, 0)
    expect(byId(app, 2).tag).toBe('home')
  })

  it('leaves a changed subtask tag alone on a reorder within the same parent', () => {
    const app = useAppStore()
    app.tasks = [
      makeTask(1, { tag: 'work' }),
      makeTask(2, { parentId: 1, depth: 1, rootId: 1, order: 0, tag: 'custom' }),
      makeTask(3, { parentId: 1, depth: 1, rootId: 1, order: 1, tag: 'work' }),
    ]
    app.moveTask(2, 1, 2)
    expect(byId(app, 2).tag).toBe('custom')
  })
})

describe('backfillSubtaskTags — existing untagged subtasks', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('tags untagged task and todo subtasks from their parent, leaving tagged ones', () => {
    const app = useAppStore()
    app.tasks = [
      makeTask(1, { tag: 'work' }),
      makeTask(2, { parentId: 1, depth: 1, rootId: 1 }),
      makeTask(3, { parentId: 2, depth: 2, rootId: 1 }),
      makeTask(4, { parentId: 1, depth: 1, rootId: 1, tag: 'custom' }),
    ]
    app.todos = [
      makeTodo(10, { tag: 'errands' }),
      makeTodo(11, { parentId: 10, depth: 1, rootId: 10 }),
    ]
    expect(app.backfillSubtaskTags()).toBe(3)
    expect(byId(app, 2).tag).toBe('work')
    expect(byId(app, 3).tag).toBe('work')
    expect(byId(app, 4).tag).toBe('custom')
    expect(app.todos.find((t) => t.id === 11)?.tag).toBe('errands')
    // Idempotent: a second run finds nothing to fill.
    expect(app.backfillSubtaskTags()).toBe(0)
  })
})

describe('task/todo transfer import', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('imports a nested task JSON document into real task rows', () => {
    const app = useAppStore()
    const result = app.importTaskTransferJson({
      collection: 'tasks',
      items: [
        {
          sourceId: 'a',
          parentSourceId: null,
          title: 'Parent task',
          description: 'Parent notes',
          status: 'progress',
          tag: 'ship',
          deadline: '2026-10-02',
        },
        {
          sourceId: 'b',
          parentSourceId: 'a',
          title: 'Child task',
          description: 'Child notes',
          status: 'done',
          tag: 'ship',
        },
      ],
    })

    expect(result).toMatchObject({ collection: 'tasks', count: 2 })
    const parent = app.tasks.find((t) => t.title === 'Parent task') as Task
    const child = app.tasks.find((t) => t.title === 'Child task') as Task
    expect(parent).toMatchObject({
      notes: 'Parent notes',
      status: 'progress',
      done: false,
      deadline: '2026-10-02',
    })
    expect(child).toMatchObject({
      parentId: parent.id,
      depth: 1,
      rootId: parent.id,
      notes: 'Child notes',
      status: 'done',
      done: true,
    })
  })

  it('imports todos from a URL with title and description params', () => {
    const app = useAppStore()
    const result = app.importTaskTransferUrl('/?tab=todo&title=Read&description=Paper')
    expect(result).toMatchObject({ collection: 'todos', count: 1 })
    expect(app.todos[0]).toMatchObject({ text: 'Read', description: 'Paper' })
  })

  it('imports the documented Aquakart-style sample into app task fields', () => {
    const app = useAppStore()
    const result = app.importTaskTransferJson(SAMPLE_TASKS_JSON, 'tasks')
    expect(result).toMatchObject({ collection: 'tasks', count: 3 })

    const lead = app.tasks.find((t) => t.title === 'Real Lead Backend') as Task
    const activities = app.tasks.find((t) => t.title === 'Sales Activities Backend') as Task
    expect(lead).toMatchObject({
      tag: 'CRM',
      priority: 'high',
      status: 'pending',
      done: false,
    })
    expect(lead.notes).toContain('Test criteria:')
    expect(activities).toMatchObject({
      parentId: lead.id,
      rootId: lead.id,
      depth: 1,
      status: 'progress',
      priority: 'high',
    })
  })
})

describe('edit-safe flush — dialog close bumps localRev', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('writes the local edit (localRev++) when the task dialog closes', () => {
    const app = useAppStore()
    app.tasks = [makeTask(5, { localRev: 2 })]
    // A task row now opens the section-18 detail dialog, which owns the flush.
    app.openTaskDialog(5)
    app.updateTask(5, 'title', 'edited')
    app.closeDetail()
    expect(byId(app, 5).title).toBe('edited')
    expect(byId(app, 5).localRev).toBe(3)
  })
})
