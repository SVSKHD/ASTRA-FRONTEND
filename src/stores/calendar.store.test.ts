import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useSyncGuard } from '@/composables/useSyncGuard'
import { dayStart } from '@/utils/calendarEvents'
import { dropPatch, resizePatch } from '@/utils/calendarDrag'
import type { Task } from '@/types'

const MIN = 60_000
const DAY = dayStart('2024-06-10')
const NINE = DAY + 9 * 60 * MIN
const TEN = DAY + 10 * 60 * MIN

function seedTask(app: ReturnType<typeof useAppStore>): number {
  const id = app.addTask('Ship it', 'work') as number
  void app.rescheduleItem('task', id, {
    startAt: NINE,
    endAt: TEN,
    allDay: false,
    durationMins: 60,
  })
  return id
}
const taskOf = (app: ReturnType<typeof useAppStore>, id: number) =>
  app.tasks.find((t) => t.id === id) as Task

describe('rescheduleItem (acceptance 67)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('writes the new time and preserves the duration', async () => {
    const app = useAppStore()
    const id = seedTask(app)
    const patch = dropPatch(taskOf(app, id), DAY + 14 * 60 * MIN)
    await app.rescheduleItem('task', id, patch)
    const task = taskOf(app, id)
    expect(task.startAt).toBe(DAY + 14 * 60 * MIN)
    expect(task.durationMins).toBe(60)
    expect((task.endAt as number) - (task.startAt as number)).toBe(60 * MIN)
  })

  it('reschedules a todo the same way', async () => {
    const app = useAppStore()
    const id = app.addTodo('Water plants') as number
    await app.rescheduleItem('todo', id, {
      startAt: NINE,
      endAt: TEN,
      allDay: false,
      durationMins: 60,
    })
    expect(app.todos.find((t) => t.id === id)?.startAt).toBe(NINE)
  })

  it('reports failure for an item that is not there', async () => {
    const app = useAppStore()
    expect(
      await app.rescheduleItem('task', 999, {
        startAt: NINE,
        endAt: TEN,
        allDay: false,
        durationMins: 60,
      }),
    ).toBe(false)
  })

  it('resizing from the bottom changes only the end (acceptance 68)', async () => {
    const app = useAppStore()
    const id = seedTask(app)
    const patch = resizePatch(taskOf(app, id), { start: NINE, end: TEN + 30 * MIN })
    await app.rescheduleItem('task', id, patch!)
    expect(taskOf(app, id).startAt).toBe(NINE)
    expect(taskOf(app, id).endAt).toBe(TEN + 30 * MIN)
  })

  it('resizing from the top changes only the start', async () => {
    const app = useAppStore()
    const id = seedTask(app)
    const patch = resizePatch(taskOf(app, id), { start: NINE - 30 * MIN, end: TEN })
    await app.rescheduleItem('task', id, patch!)
    expect(taskOf(app, id).startAt).toBe(NINE - 30 * MIN)
    expect(taskOf(app, id).endAt).toBe(TEN)
  })

  it('moves several selected events in one write', async () => {
    const app = useAppStore()
    const a = seedTask(app)
    const b = app.addTodo('Second') as number
    await app.rescheduleMany([
      {
        type: 'task',
        id: a,
        patch: { startAt: DAY, endAt: DAY + 30 * MIN, allDay: false, durationMins: 30 },
      },
      {
        type: 'todo',
        id: b,
        patch: { startAt: DAY, endAt: DAY + 30 * MIN, allDay: false, durationMins: 30 },
      },
    ])
    expect(taskOf(app, a).startAt).toBe(DAY)
    expect(app.todos.find((t) => t.id === b)?.startAt).toBe(DAY)
  })

  it('is a no-op for an empty batch', async () => {
    const app = useAppStore()
    expect(await app.rescheduleMany([])).toBe(true)
  })
})

describe('a sync tick during a drag never snaps the event back (acceptance 69)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('holds the dragged task in the sync guard until the drag ends', async () => {
    const app = useAppStore()
    const guard = useSyncGuard()
    const id = seedTask(app)

    app.beginCalendarDrag('task', id)
    expect(guard.isEditing(id)).toBe(true)
    // A remote snapshot arriving now is buffered, not applied.
    const incoming = app.tasks.map((t) =>
      t.id === id ? { ...t, startAt: DAY, title: 'Remote' } : t,
    )
    app.tasks = guard.reconcileTasks(app.tasks, incoming)
    expect(taskOf(app, id).title).toBe('Ship it')
    expect(taskOf(app, id).startAt).toBe(NINE)

    await app.rescheduleItem('task', id, dropPatch(taskOf(app, id), DAY + 14 * 60 * MIN))
    app.endCalendarDrag('task', id)
    // The drag's own write survives the flush.
    expect(taskOf(app, id).startAt).toBe(DAY + 14 * 60 * MIN)
    expect(guard.isEditing(id)).toBe(false)
  })
})

describe('copy-drag', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('duplicates a task at the new time, leaving the original alone', () => {
    const app = useAppStore()
    const id = seedTask(app)
    const copyId = app.duplicateScheduled('task', id, {
      startAt: DAY + 16 * 60 * MIN,
      endAt: DAY + 17 * 60 * MIN,
      allDay: false,
      durationMins: 60,
    })
    expect(copyId).not.toBeNull()
    expect(taskOf(app, id).startAt).toBe(NINE)
    expect(taskOf(app, copyId as number).startAt).toBe(DAY + 16 * 60 * MIN)
    expect(taskOf(app, copyId as number).title).toBe('Ship it')
  })

  it('duplicates a todo too', () => {
    const app = useAppStore()
    const id = app.addTodo('Water plants', 'home', 'the big one') as number
    const copyId = app.duplicateScheduled('todo', id, {
      startAt: DAY,
      endAt: DAY + 30 * MIN,
      allDay: false,
      durationMins: 30,
    })
    const copy = app.todos.find((t) => t.id === copyId)
    expect(copy?.text).toBe('Water plants')
    expect(copy?.description).toBe('the big one')
    expect(copy?.startAt).toBe(DAY)
  })

  it('returns null for something that is not there', () => {
    const app = useAppStore()
    expect(
      app.duplicateScheduled('task', 999, {
        startAt: DAY,
        endAt: DAY,
        allDay: false,
        durationMins: 0,
      }),
    ).toBeNull()
  })
})

describe('reminder rescheduling', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('moves the fire time to the dropped slot', async () => {
    const app = useAppStore()
    const id = app.addReminder({
      title: 'Standup',
      note: '',
      start: '2024-06-10T09:30',
      repeat: { type: 'none' },
    }) as number
    await app.rescheduleReminder(id, DAY + 11 * 60 * MIN)
    expect(app.reminders.find((r) => r.id === id)?.start).toBe('2024-06-10T11:00')
  })

  it('reports failure for a reminder that is not there', async () => {
    const app = useAppStore()
    expect(await app.rescheduleReminder(999, DAY)).toBe(false)
  })
})

describe('unscheduled panel and quick create', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('scheduling an unscheduled task removes it from the panel (acceptance 70)', async () => {
    const app = useAppStore()
    const id = app.addTask('Later', 'work') as number
    expect(app.tasks.find((t) => t.id === id)?.startAt ?? null).toBeNull()

    const tuesdayTen = DAY + 10 * 60 * MIN
    await app.rescheduleItem('task', id, {
      startAt: tuesdayTen,
      endAt: tuesdayTen + 30 * MIN,
      allDay: false,
      durationMins: 30,
    })
    expect(taskOf(app, id).startAt).toBe(tuesdayTen)
  })

  it('dragging back to the panel clears every scheduling field', async () => {
    const app = useAppStore()
    const id = seedTask(app)
    await app.unscheduleItem('task', id)
    const task = taskOf(app, id)
    expect(task.startAt).toBeNull()
    expect(task.endAt).toBeNull()
    expect(task.durationMins).toBeNull()
    expect(task.allDay).toBe(false)
  })

  it('quick-creates a task at the dragged range', () => {
    const app = useAppStore()
    const id = app.createScheduledItem('task', 'New block', 'work', {
      startAt: NINE,
      endAt: TEN,
      allDay: false,
      durationMins: 60,
    }) as number
    const task = taskOf(app, id)
    expect(task.title).toBe('New block')
    expect(task.tag).toBe('work')
    expect(task.startAt).toBe(NINE)
  })

  it('quick-creates a todo and a reminder from the same call', () => {
    const app = useAppStore()
    const todoId = app.createScheduledItem('todo', 'A todo', '', {
      startAt: NINE,
      endAt: TEN,
      allDay: false,
      durationMins: 60,
    })
    expect(app.todos.find((t) => t.id === todoId)?.startAt).toBe(NINE)

    const reminderId = app.createScheduledItem('reminder', 'A reminder', '', {
      startAt: NINE,
      endAt: TEN,
      allDay: false,
      durationMins: 60,
    })
    expect(app.reminders.find((r) => r.id === reminderId)?.start).toBe('2024-06-10T09:00')
  })

  it('an all-day quick-create doubles as a due date', () => {
    const app = useAppStore()
    const id = app.createScheduledItem('task', 'All day thing', '', {
      startAt: DAY,
      endAt: DAY + 24 * 60 * MIN,
      allDay: true,
      durationMins: 24 * 60,
    }) as number
    expect(taskOf(app, id).deadline).toBe('2024-06-10')
  })

  it('creates nothing from an empty title', () => {
    const app = useAppStore()
    expect(
      app.createScheduledItem('task', '   ', '', {
        startAt: NINE,
        endAt: TEN,
        allDay: false,
        durationMins: 60,
      }),
    ).toBeNull()
    expect(app.tasks).toEqual([])
  })
})
