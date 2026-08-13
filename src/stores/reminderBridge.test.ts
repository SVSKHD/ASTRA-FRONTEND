import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import type { Todo } from '@/types'

function makeTodo(over: Partial<Todo>): Todo {
  return {
    id: 1,
    text: 'File GST return',
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
    linked: [],
    parents: [],
    reminderIds: [],
    sourceRef: null,
    parentId: null,
    order: 0,
    depth: 0,
    rootId: 0,
    localRev: 0,
    updatedBy: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  }
}

const SOON = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 16)

describe('todo ↔ reminder bridge', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('creates exactly one reminder pointing back, indexed on the todo, no duplicate todo', () => {
    const app = useAppStore()
    app.todos = [makeTodo({ id: 5 })]
    const rid = app.createReminderFromItem('todos', 5, { start: SOON })
    expect(rid).toBeTypeOf('number')
    expect(app.reminders).toHaveLength(1)
    expect(app.todos).toHaveLength(1) // not duplicated
    const rem = app.reminders[0]
    expect(rem.title).toBe('File GST return') // inherited
    expect(rem.sourceRef).toEqual({ collection: 'todos', id: 5 })
    expect(app.todos[0].reminderIds).toEqual([rid])
  })

  it('completing the todo cancels its pending reminder', () => {
    const app = useAppStore()
    app.todos = [makeTodo({ id: 5 })]
    app.createReminderFromItem('todos', 5, { start: SOON })
    expect(app.reminders[0].cancelledAt).toBeNull()
    app.toggleTodo(5)
    expect(app.todos[0].done).toBe(true)
    expect(app.reminders[0].cancelledAt).not.toBeNull()
    expect(app.reminders[0].acknowledgedAt).not.toBeNull()
  })

  it('acknowledging the reminder does NOT complete the todo', () => {
    const app = useAppStore()
    app.todos = [makeTodo({ id: 5 })]
    const rid = app.createReminderFromItem('todos', 5, { start: SOON })!
    app.acknowledgeReminder(rid)
    expect(app.todos[0].done).toBe(false)
    expect(app.reminders[0].acknowledgedAt).not.toBeNull()
  })

  it('"Mark todo done too" completes the source and cancels the reminder', () => {
    const app = useAppStore()
    app.todos = [makeTodo({ id: 5 })]
    const rid = app.createReminderFromItem('todos', 5, { start: SOON })!
    app.completeReminderSource(rid)
    expect(app.todos[0].done).toBe(true)
    expect(app.reminders[0].cancelledAt).not.toBeNull()
  })

  it('deleting the todo deletes its linked reminders in the same batch', () => {
    const app = useAppStore()
    app.todos = [makeTodo({ id: 5 })]
    app.createReminderFromItem('todos', 5, { start: SOON })
    expect(app.reminders).toHaveLength(1)
    app.deleteWithUndo('todos', 'todo', 5)
    expect(app.todos).toHaveLength(0)
    expect(app.reminders).toHaveLength(0)
  })

  it('bulk "Remind me" applies one schedule to many todos', () => {
    const app = useAppStore()
    app.todos = [makeTodo({ id: 1 }), makeTodo({ id: 2 }), makeTodo({ id: 3 })]
    const made = app.createRemindersForItems('todos', [1, 2, 3], { start: SOON })
    expect(made).toBe(3)
    expect(app.reminders).toHaveLength(3)
    expect(app.todos.every((t) => t.reminderIds.length === 1)).toBe(true)
  })

  it('reverse: create a todo from a reminder sets the back-pointer', () => {
    const app = useAppStore()
    const rid = app.addReminder({
      title: 'Pay rent',
      note: '',
      start: SOON,
      repeat: { type: 'none' },
    })!
    const tid = app.createTodoFromReminder(rid)!
    const todo = app.todos.find((t) => t.id === tid)!
    expect(todo.text).toBe('Pay rent')
    expect(todo.sourceRef).toEqual({ collection: 'reminders', id: rid })
  })

  it('skip cancels a one-off reminder but only acknowledges a repeat', () => {
    const app = useAppStore()
    const oneOff = app.addReminder({ title: 'A', note: '', start: SOON, repeat: { type: 'none' } })!
    const repeat = app.addReminder({
      title: 'B',
      note: '',
      start: SOON,
      repeat: { type: 'days', n: 1 },
    })!
    app.skipReminder(oneOff)
    app.skipReminder(repeat)
    expect(app.reminders.find((r) => r.id === oneOff)!.cancelledAt).not.toBeNull()
    expect(app.reminders.find((r) => r.id === repeat)!.cancelledAt).toBeNull()
    expect(app.reminders.find((r) => r.id === repeat)!.acknowledgedAt).not.toBeNull()
  })
})

describe('archiveCompleted', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('archives only done todos, leaving pending ones live', () => {
    const app = useAppStore()
    app.todos = [
      makeTodo({ id: 1, status: 'done', done: true, completedAt: Date.now() }),
      makeTodo({ id: 2, status: 'pending' }),
    ]
    app.archiveCompleted('todos')
    expect(app.todos.find((t) => t.id === 1)!.archivedAt).toBeTypeOf('number')
    expect(app.todos.find((t) => t.id === 2)!.archivedAt ?? null).toBeNull()
  })
})
