import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useTodoCompletion, LEAVE_MS } from './useTodoCompletion'
describe('task and todo completion animation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })
  it('keeps task completion in place until saved, then leaves and offers Undo', async () => {
    const app = useAppStore()
    app.addTask('Ship project', '')
    const id = app.tasks[0].id
    vi.spyOn(app, 'whenSaved').mockResolvedValue(undefined)
    const completion = useTodoCompletion('tasks')
    completion.toggle(id)
    expect(app.tasks[0].status).toBe('done')
    expect(completion.isHeld(id)).toBe(true)
    await vi.advanceTimersByTimeAsync(700)
    expect(completion.isLeaving(id)).toBe(true)
    await vi.advanceTimersByTimeAsync(LEAVE_MS)
    expect(completion.isHeld(id)).toBe(false)
    app.performUndo()
    expect(app.tasks[0].status).toBe('pending')
  })
  it('keeps task and todo holds isolated even when ids match', () => {
    const app = useAppStore()
    app.addTask('Task', '')
    app.addTodo('Todo')
    app.todos[0].id = app.tasks[0].id
    const taskCompletion = useTodoCompletion('tasks')
    const todoCompletion = useTodoCompletion()
    taskCompletion.toggle(app.tasks[0].id)
    expect(todoCompletion.isHeld(app.todos[0].id)).toBe(false)
    expect(app.todos[0].status).toBe('pending')
    expect(useTodoCompletion('tasks').isHeld(app.tasks[0].id)).toBe(true)
  })
})
