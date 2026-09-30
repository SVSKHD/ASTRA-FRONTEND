// "Move to Todos / Tasks" on a goal, and the done state flowing back.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'

function seedGoal() {
  const app = useAppStore()
  const gid = app.addGoal({ title: 'Launch site', tag: 'Web', description: 'Ship v1' })
  const a = app.addChecklistItem(gid, 'Design')
  const b = app.addChecklistItem(gid, 'Build')
  return { app, gid, a: a as number, b: b as number }
}

describe('moving a goal to Todos', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('makes one todo for the goal with a subtask per checklist point', () => {
    const { app, gid } = seedGoal()
    const rootId = app.moveGoalTo('todos', gid) as number
    const root = app.todos.find((t) => t.id === rootId)!
    expect(root.text).toBe('Launch site')
    expect(root.tag).toBe('Web')
    expect(root.goalIds).toContain(gid)
    expect(root.sourceRef).toEqual({ collection: 'goals', id: gid })
    const kids = app.todos.filter((t) => t.parentId === rootId).sort((x, y) => x.order - y.order)
    expect(kids.map((k) => k.text)).toEqual(['Design', 'Build'])
    // The goal stays.
    expect(app.goals.some((g) => g.id === gid)).toBe(true)
  })

  it('ticking a subtask ticks its checklist point, and unticking unticks it', () => {
    const { app, gid, a } = seedGoal()
    const rootId = app.moveGoalTo('todos', gid) as number
    const kid = app.todos.find((t) => t.parentId === rootId && t.text === 'Design')!
    app.toggleTodo(kid.id)
    expect(app.goalChecklist.find((c) => c.id === a)!.done).toBe(true)
    app.toggleTodo(kid.id)
    expect(app.goalChecklist.find((c) => c.id === a)!.done).toBe(false)
  })

  it('finishing the todo finishes the goal, and reopening reopens it', () => {
    const { app, gid } = seedGoal()
    const rootId = app.moveGoalTo('todos', gid) as number
    app.setTodoStatus(rootId, 'done')
    expect(app.goals.find((g) => g.id === gid)!.status).toBe('done')
    app.setTodoStatus(rootId, 'pending')
    expect(app.goals.find((g) => g.id === gid)!.status).toBe('active')
  })

  it('does not make a second copy when sent again', () => {
    const { app, gid } = seedGoal()
    const first = app.moveGoalTo('todos', gid)
    const count = app.todos.length
    expect(app.moveGoalTo('todos', gid)).toBe(first)
    expect(app.todos.length).toBe(count)
  })
})

describe('a goal is moved once, to one place', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reports where it went, and refuses a second move to the other list', () => {
    const { app, gid } = seedGoal()
    expect(app.goalMovedTo(gid)).toBeNull()
    const todoId = app.moveGoalTo('todos', gid)
    expect(app.goalMovedTo(gid)).toEqual({ collection: 'todos', id: todoId })
    const tasksBefore = app.tasks.length
    expect(app.moveGoalTo('tasks', gid)).toBe(todoId)
    expect(app.tasks.length).toBe(tasksBefore)
  })
})

describe('moving a goal to Tasks', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('syncs a task subtask back to its point and the task back to the goal', () => {
    const { app, gid, b } = seedGoal()
    const rootId = app.moveGoalTo('tasks', gid) as number
    const kid = app.tasks.find((t) => t.parentId === rootId && t.title === 'Build')!
    app.setTaskStatus(kid.id, 'done')
    expect(app.goalChecklist.find((c) => c.id === b)!.done).toBe(true)
    app.setTaskStatus(rootId, 'done')
    expect(app.goals.find((g) => g.id === gid)!.status).toBe('done')
  })
})
