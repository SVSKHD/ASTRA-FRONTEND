import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from './app'
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
