import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from './app'
import { sampleGroupedTaskTransferJson } from '@/utils/taskTransferHelp'
beforeEach(() => setActivePinia(createPinia()))
describe('JSON children of an existing task', () => {
  it('appends to an existing parent and preserves imported grandchildren', () => {
    const app = useAppStore()
    const parent = app.addTask('Parent', '')!
    const old = app.addTask('Already here', '')!
    app.moveTask(old, parent, 0)
    const result = app.importTaskTransferJson({
      collection: 'tasks',
      items: [
        { id: 'child', title: 'New child', parentId: parent },
        { id: 'grandchild', title: 'Grandchild', parentId: 'child' },
      ],
    })
    expect(result.count).toBe(2)
    const child = app.tasks.find((t) => t.title === 'New child')!
    const grandchild = app.tasks.find((t) => t.title === 'Grandchild')!
    expect(child.parentId).toBe(parent)
    expect(child.depth).toBe(1)
    expect(child.rootId).toBe(parent)
    expect(child.order).toBeGreaterThan(app.tasks.find((t) => t.id === old)!.order)
    expect(grandchild.parentId).toBe(child.id)
    expect(grandchild.depth).toBe(2)
    expect(grandchild.rootId).toBe(parent)
  })
  it('uses the opened parent for Add more, even if pasted IDs point elsewhere', () => {
    const app = useAppStore()
    const parent = app.addTask('Parent', '')!
    const other = app.addTask('Other', '')!
    app.addItemsUnder('tasks', parent, JSON.stringify([{ title: 'Child', parentId: other }]))
    expect(app.tasks.find((t) => t.title === 'Child')!.parentId).toBe(parent)
  })
  it('keeps missing parents at root and repairs cyclic input', () => {
    const app = useAppStore()
    app.importTaskTransferJson({
      items: [
        { id: 'a', title: 'A', parentId: 'b' },
        { id: 'b', title: 'B', parentId: 'a' },
        { title: 'Missing', parentId: 987654321 },
      ],
    })
    const a = app.tasks.find((t) => t.title === 'A')!
    const b = app.tasks.find((t) => t.title === 'B')!
    expect(a.parentId === b.id && b.parentId === a.id).toBe(false)
    expect(app.tasks.find((t) => t.title === 'Missing')!.parentId).toBeNull()
  })
})

describe('one-parent JSON imports', () => {
  it.each(['tasks', 'todos'] as const)(
    'attaches the whole %s document to one existing parent',
    (collection) => {
      const app = useAppStore()
      const parent = collection === 'tasks' ? app.addTask('Parent', '')! : app.addTodo('Parent')!
      const result = app.importTaskTransferJson({
        collection,
        parentId: parent,
        items: [
          { title: 'First', description: 'Keep details', subtasks: [{ title: 'Nested' }] },
          { title: 'Second', description: 'More details' },
        ],
      })
      expect(result.count).toBe(3)
      const list = app[collection]
      const title = (item: (typeof list)[number]) => ('title' in item ? item.title : item.text)
      const first = list.find((item) => title(item) === 'First')!
      expect(first.parentId).toBe(parent)
      expect(list.find((item) => title(item) === 'Second')!.parentId).toBe(parent)
      expect(list.find((item) => title(item) === 'Nested')!).toMatchObject({
        parentId: first.id,
        rootId: parent,
        depth: 2,
      })
      expect(list.filter((item) => item.parentId == null)).toHaveLength(1)
    },
  )
  it.each(['tasks', 'todos'] as const)(
    'creates one new %s parent from a nested JSON object',
    (collection) => {
      const app = useAppStore()
      const result = app.importTaskTransferJson({
        collection,
        title: 'Project',
        description: 'Parent details',
        subtasks: [{ title: 'First', description: 'Child details' }, { title: 'Second' }],
      })
      expect(result.count).toBe(3)
      const list = app[collection]
      const parent = list.find((item) => item.parentId == null)!
      expect(list.filter((item) => item.parentId == null)).toHaveLength(1)
      expect(list.filter((item) => item.parentId === parent.id)).toHaveLength(2)
    },
  )
  it('does not create orphan items when the document parent is missing', () => {
    const app = useAppStore()
    const result = app.importTaskTransferJson({
      collection: 'tasks',
      parentId: 999999,
      items: [{ title: 'Child' }],
    })
    expect(result.count).toBe(0)
    expect(result.error).toBeTruthy()
    expect(app.tasks).toHaveLength(0)
  })
})

it.each(['tasks', 'todos'] as const)(
  'imports the %s template as one parent with nested subtasks',
  (collection) => {
    const app = useAppStore()
    const result = app.importTaskTransferJson(sampleGroupedTaskTransferJson(collection), collection)
    expect(result.count).toBe(4)
    const items = collection === 'tasks' ? app.tasks : app.todos
    const roots = items.filter((item) => item.parentId == null)
    expect(roots).toHaveLength(1)
    const title = (item: (typeof items)[number]) => ('title' in item ? item.title : item.text)
    const child = items.find((item) => title(item) === 'First subtask')!
    const grandchild = items.find((item) => title(item) === 'Nested subtask')!
    expect(child.parentId).toBe(roots[0].id)
    expect(grandchild.parentId).toBe(child.id)
    expect(grandchild.depth).toBe(2)
    expect(grandchild.rootId).toBe(roots[0].id)
  },
)
