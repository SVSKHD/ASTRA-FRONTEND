import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useOverdue } from '@/composables/useOverdue'

const DAY = 86400000
const ymd = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('the overdue list', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('gathers late tasks, passed deadlines and carried todos, latest first', () => {
    const app = useAppStore()
    const now = useUiStore().now
    app.addTask('Late task', '', { deadline: ymd(now - 2 * DAY) })
    app.addTask('Done late task', '', { deadline: ymd(now - 5 * DAY), status: 'done', done: true })
    app.addTask('Future task', '', { deadline: ymd(now + 3 * DAY) })
    app.deadlines = [
      { id: 900, title: 'Tax filing', due: ymd(now - 7 * DAY) } as (typeof app.deadlines)[number],
    ]
    // addTodo stamps its own createdAt, so the todo is backdated afterwards.
    const old = app.addTodo('Old todo') as number
    app.todos = app.todos.map((t) => (t.id === old ? { ...t, createdAt: now - 3 * DAY } : t))
    app.addTodo('Fresh todo')

    const { list } = useOverdue()
    expect(list.value.map((o) => [o.title, o.kind, o.days])).toEqual([
      ['Tax filing', 'Deadline', 7],
      ['Old todo', 'Todo', 3],
      ['Late task', 'Task', 2],
    ])
  })
})
