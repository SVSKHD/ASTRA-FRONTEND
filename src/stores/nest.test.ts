// Drag-to-nest store action: it reuses the existing link model, re-parents on
// drop, skips invalid children (loops), and its Undo restores the prior parent.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import type { LinkRef } from '@/types'

const todo = (id: number): LinkRef => ({ id, collection: 'todos' })
const task = (id: number): LinkRef => ({ id, collection: 'tasks' })

describe('nestUnder', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const app = useAppStore()
    app.addTodo('A')
    app.addTodo('B')
    app.addTask('T', '')
    // ids are assigned from the store's counter; grab them back by title.
  })

  function ids() {
    const app = useAppStore()
    return {
      A: app.todos.find((t) => t.text === 'A')!.id,
      B: app.todos.find((t) => t.text === 'B')!.id,
      T: app.tasks.find((t) => t.title === 'T')!.id,
    }
  }

  it('nests a todo under a task (cross-collection), updating both sides', () => {
    const app = useAppStore()
    const { A, T } = ids()
    app.nestUnder([todo(A)], task(T))
    expect(app.linkableById(task(T))!.linked).toContainEqual(todo(A))
    expect(app.linkableById(todo(A))!.parents).toContainEqual(task(T))
    expect(app.linkProgressOf(task(T)).total).toBe(1)
  })

  it('re-parents out of the old parent and Undo restores it', () => {
    const app = useAppStore()
    const { A, B, T } = ids()
    // A starts nested under B.
    app.nestUnder([todo(A)], todo(B))
    expect(app.linkableById(todo(B))!.linked).toContainEqual(todo(A))

    // Drag A from B onto T.
    app.nestUnder([todo(A)], task(T), { ['todos:' + A]: todo(B) })
    expect(app.linkableById(todo(B))!.linked).not.toContainEqual(todo(A))
    expect(app.linkableById(task(T))!.linked).toContainEqual(todo(A))

    // Undo → back under B.
    app.performUndo()
    expect(app.linkableById(task(T))!.linked).not.toContainEqual(todo(A))
    expect(app.linkableById(todo(B))!.linked).toContainEqual(todo(A))
  })

  it('skips a child that would create a loop', () => {
    const app = useAppStore()
    const { A, B } = ids()
    app.nestUnder([todo(B)], todo(A)) // B under A
    // Now try to nest A under B → would loop.
    const plan = app.nestUnder([todo(A)], todo(B))
    expect(plan.valid).toHaveLength(0)
    expect(plan.skipped[0].reason).toBe('cycle')
    expect(app.linkableById(todo(B))!.linked).not.toContainEqual(todo(A))
  })

  it('unnestFrom lifts a child back to the top level', () => {
    const app = useAppStore()
    const { A, T } = ids()
    app.nestUnder([todo(A)], task(T))
    app.unnestFrom(todo(A), task(T))
    expect(app.linkableById(task(T))!.linked).not.toContainEqual(todo(A))
    expect(app.linkableById(todo(A))!.parents).not.toContainEqual(task(T))
  })
})
