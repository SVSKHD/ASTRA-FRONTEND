import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'

// parent ─┬─ a
//         └─ b ── b1
function todoTree() {
  const app = useAppStore()
  const parent = app.addTodo('Parent')!
  const a = app.addTodo('A')!
  const b = app.addTodo('B')!
  const b1 = app.addTodo('B1')!
  app.moveTodo(a, parent, 0)
  app.moveTodo(b, parent, 1)
  app.moveTodo(b1, b, 0)
  const status = (id: number) => app.todos.find((t) => t.id === id)!.status
  return { app, parent, a, b, b1, status }
}

describe('completing a parent completes its subtree', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('ticking a parent todo ticks every subtask at every depth', () => {
    const { app, parent, a, b, b1, status } = todoTree()
    app.setTodoStatus(parent, 'done')
    expect([parent, a, b, b1].map(status)).toEqual(['done', 'done', 'done', 'done'])
  })

  it('unticking the parent reopens only what the tick closed', () => {
    const { app, parent, a, b, b1, status } = todoTree()
    app.setTodoStatus(a, 'done') // finished by hand, before the parent
    app.setTodoStatus(parent, 'done')
    app.setTodoStatus(parent, 'pending')
    expect(status(parent)).toBe('pending')
    expect(status(a)).toBe('done')
    expect([b, b1].map(status)).toEqual(['pending', 'pending'])
  })

  it('ticking a subtask does not tick its parent or siblings', () => {
    const { app, parent, a, b, b1, status } = todoTree()
    app.setTodoStatus(b, 'done')
    expect(status(b1)).toBe('done')
    expect([parent, a].map(status)).toEqual(['pending', 'pending'])
  })

  it('cancels the reminders of the subtasks it closes', () => {
    const { app, parent, b1 } = todoTree()
    const soon = new Date(Date.now() + 3600000).toISOString().slice(0, 16)
    const rid = app.createReminderFromItem('todos', b1, { start: soon })!
    app.setTodoStatus(parent, 'done')
    expect(app.reminders.find((r) => r.id === rid)!.cancelledAt).not.toBeNull()
  })

  it('works the same for tasks, including cycling back out of done', () => {
    const app = useAppStore()
    const parent = app.addTask('Parent', '')!
    const child = app.addTask('Child', '')!
    app.moveTask(child, parent, 0)
    const status = (id: number) => app.tasks.find((t) => t.id === id)!.status
    app.setTaskStatus(parent, 'done')
    expect(status(child)).toBe('done')
    app.cycleTaskStatus(parent) // done → pending
    expect(status(child)).toBe('pending')
  })

  it('works the same for ideas', () => {
    const app = useAppStore()
    const parent = app.addIdea('Parent', '')!
    const child = app.addIdea('Child', '')!
    app.moveIdea(child, parent, 0)
    app.toggleIdea(parent)
    expect(app.ideas.find((i) => i.id === child)!.status).toBe('done')
    app.toggleIdea(parent)
    expect(app.ideas.find((i) => i.id === child)!.status).toBe('pending')
  })
})
