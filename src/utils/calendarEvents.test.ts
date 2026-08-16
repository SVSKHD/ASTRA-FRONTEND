import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BLOCK_MINS,
  busiestDayCount,
  groupByDay,
  overflowCount,
  blockFor,
  buildEvents,
  dayStart,
  defaultFilters,
  durationLabel,
  firstLine,
  milestoneEvents,
  minutesBetween,
  occurrenceEvent,
  reminderEvent,
  taskEvent,
  todoEvent,
  unscheduledItems,
} from './calendarEvents'
import type { Goal, GoalOccurrence, Reminder, Task, Todo } from '@/types'

const DAY = dayStart('2024-06-10')
const MIN = 60_000

function task(over: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Ship it',
    tag: 'work',
    done: false,
    status: 'pending',
    deadline: '',
    notes: '',
    repo: '',
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
    rootId: 1,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
    github: null,
    startAt: null,
    endAt: null,
    allDay: false,
    durationMins: null,
    ...over,
  }
}

function todo(over: Partial<Todo> = {}): Todo {
  return {
    id: 2,
    text: 'Water plants',
    done: false,
    status: 'pending',
    tag: 'home',
    description: '',
    completedAt: null,
    rolledOverAt: null,
    rolloverCount: 0,
    reminderIds: [],
    sourceRef: null,
    isPublic: false,
    shareId: null,
    sharedAt: null,
    linked: [],
    parents: [],
    parentId: null,
    order: 0,
    depth: 0,
    rootId: 2,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
    startAt: null,
    endAt: null,
    allDay: false,
    durationMins: null,
    ...over,
  }
}

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 5,
    title: 'Run 100km',
    description: '',
    status: 'active',
    targetDate: '',
    startDate: '',
    color: 'oklch(0.7 0.1 200)',
    icon: '',
    source: 'manual',
    sourceUrl: '',
    parentId: null,
    order: 0,
    depth: 0,
    rootId: 5,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

function occurrence(over: Partial<GoalOccurrence> = {}): GoalOccurrence {
  return {
    id: 9,
    goalId: 5,
    date: '2024-06-10',
    status: 'pending',
    target: 5,
    actual: null,
    note: null,
    completedAt: null,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: 7,
    title: 'Standup',
    note: '',
    start: '2024-06-10T09:30',
    repeat: { type: 'none' },
    priority: 'normal',
    calSync: 'local',
    calEventId: null,
    lastFiredOcc: null,
    acknowledgedAt: null,
    sourceRef: null,
    cancelledAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

const RANGE = { start: DAY - 7 * 24 * 60 * MIN, end: DAY + 7 * 24 * 60 * MIN }
const sources = (over: Partial<Parameters<typeof buildEvents>[0]> = {}) => ({
  tasks: [],
  todos: [],
  goals: [],
  occurrences: [],
  reminders: [],
  colorOf: () => '#abc',
  ...over,
})

describe('blockFor', () => {
  it('spans start to end for a timed block', () => {
    const block = blockFor(task({ startAt: DAY + 9 * 60 * MIN, endAt: DAY + 10 * 60 * MIN }))
    expect(block).toEqual({ start: DAY + 9 * 60 * MIN, end: DAY + 10 * 60 * MIN, allDay: false })
  })

  it('gives a lone start the default 30-minute block', () => {
    const block = blockFor(task({ startAt: DAY }))
    expect(minutesBetween(block!.start, block!.end)).toBe(DEFAULT_BLOCK_MINS)
  })

  it('prefers a stored duration over the default', () => {
    const block = blockFor(task({ startAt: DAY, durationMins: 90 }))
    expect(minutesBetween(block!.start, block!.end)).toBe(90)
  })

  it('renders a deadline with no start time as an all-day chip', () => {
    const block = blockFor(task({ deadline: '2024-06-10' }))
    expect(block).toMatchObject({ start: DAY, allDay: true })
  })

  it('places nothing for an item with neither', () => {
    expect(blockFor(task())).toBeNull()
  })
})

describe('per-source events', () => {
  it('builds a task block with its description first line', () => {
    const event = taskEvent(task({ startAt: DAY, notes: 'why it matters\nmore detail' }), '#123')
    expect(event).toMatchObject({
      id: 'task:1',
      source: 'task',
      title: 'Ship it',
      subtitle: 'why it matters',
      barColor: '#123',
      editable: true,
    })
  })

  it('marks a done item completed so it renders struck through', () => {
    expect(taskEvent(task({ startAt: DAY, status: 'done' }), '#123')?.completed).toBe(true)
  })

  it('keeps an unscheduled todo off the grid entirely', () => {
    expect(todoEvent(todo(), '#123')).toBeNull()
    expect(todoEvent(todo({ startAt: DAY }), '#123')?.id).toBe('todo:2')
  })

  it('shows a goal occurrence target, and actual once entered', () => {
    expect(occurrenceEvent(occurrence(), goal())?.title).toBe('Run 100km · target 5')
    expect(occurrenceEvent(occurrence({ actual: 3 }), goal())?.title).toBe('Run 100km 3/5')
  })

  it('never lets a goal occurrence be dragged — its date is its identity', () => {
    expect(occurrenceEvent(occurrence(), goal())?.editable).toBe(false)
  })

  it('drops an occurrence whose goal is gone', () => {
    expect(occurrenceEvent(occurrence(), undefined)).toBeNull()
  })

  it('marks a goal timeline start and target', () => {
    const events = milestoneEvents(goal({ startDate: '2024-06-01', targetDate: '2024-06-30' }))
    expect(events.map((e) => e.title)).toEqual(['Start: Run 100km', 'Target: Run 100km'])
    expect(events.every((e) => e.allDay && !e.editable)).toBe(true)
  })

  it('emits no milestones for a goal with no dates', () => {
    expect(milestoneEvents(goal())).toEqual([])
  })

  it('places a reminder as a short pill at its fire time', () => {
    const event = reminderEvent(reminder())
    expect(event?.durationMins).toBe(15)
    expect(event?.allDay).toBe(false)
    expect(new Date(event!.start).getHours()).toBe(9)
  })

  it('treats an acknowledged or cancelled reminder as completed', () => {
    expect(reminderEvent(reminder({ acknowledgedAt: 1 }))?.completed).toBe(true)
    expect(reminderEvent(reminder({ cancelledAt: 1 }))?.completed).toBe(true)
  })

  it('ignores a reminder with no usable start', () => {
    expect(reminderEvent(reminder({ start: '' }))).toBeNull()
    expect(reminderEvent(reminder({ start: 'not a date' }))).toBeNull()
  })
})

describe('buildEvents (acceptance 66)', () => {
  const all = () =>
    sources({
      tasks: [task({ startAt: DAY + 9 * 60 * MIN })],
      todos: [todo({ startAt: DAY + 11 * 60 * MIN })],
      goals: [goal({ targetDate: '2024-06-12' })],
      occurrences: [occurrence()],
      reminders: [reminder()],
    })

  it('brings all four sources together', () => {
    const events = buildEvents(all(), RANGE)
    expect(new Set(events.map((e) => e.source))).toEqual(
      new Set(['task', 'todo', 'goal', 'reminder', 'milestone']),
    )
  })

  it('honours each filter chip', () => {
    const base = defaultFilters()
    expect(
      buildEvents(all(), RANGE, { ...base, tasks: false }).some((e) => e.source === 'task'),
    ).toBe(false)
    expect(
      buildEvents(all(), RANGE, { ...base, todos: false }).some((e) => e.source === 'todo'),
    ).toBe(false)
    expect(
      buildEvents(all(), RANGE, { ...base, reminders: false }).some((e) => e.source === 'reminder'),
    ).toBe(false)
    const noGoals = buildEvents(all(), RANGE, { ...base, goals: false })
    expect(noGoals.some((e) => e.source === 'goal' || e.source === 'milestone')).toBe(false)
  })

  it('filters by project tag across tasks and todos', () => {
    const events = buildEvents(all(), RANGE, { ...defaultFilters(), project: 'work' })
    expect(events.filter((e) => e.source === 'todo')).toEqual([])
    expect(events.filter((e) => e.source === 'task')).toHaveLength(1)
  })

  it('excludes anything outside the queried range (acceptance 72 scope)', () => {
    const far = { start: DAY + 60 * 24 * 60 * MIN, end: DAY + 90 * 24 * 60 * MIN }
    expect(buildEvents(all(), far)).toEqual([])
  })

  it('skips archived items', () => {
    const events = buildEvents(sources({ tasks: [task({ startAt: DAY, archivedAt: 123 })] }), RANGE)
    expect(events).toEqual([])
  })

  it('returns events in start order', () => {
    const events = buildEvents(all(), RANGE)
    const starts = events.map((e) => e.start)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
  })
})

describe('unscheduledItems', () => {
  it('lists only items with nowhere to sit on the grid', () => {
    const { tasks, todos } = unscheduledItems({
      tasks: [
        task({ id: 1 }),
        task({ id: 2, startAt: DAY }),
        task({ id: 3, deadline: '2024-06-10' }),
      ],
      todos: [todo({ id: 4 }), todo({ id: 5, startAt: DAY })],
    })
    expect(tasks.map((t) => t.id)).toEqual([1])
    expect(todos.map((t) => t.id)).toEqual([4])
  })

  it('does not offer completed or archived items for scheduling', () => {
    const { tasks } = unscheduledItems({
      tasks: [task({ id: 1, status: 'done' }), task({ id: 2, archivedAt: 5 })],
      todos: [],
    })
    expect(tasks).toEqual([])
  })
})

describe('display helpers', () => {
  it('formats a duration the way the resize tooltip reads', () => {
    expect(durationLabel(90)).toBe('1h 30m')
    expect(durationLabel(60)).toBe('1h')
    expect(durationLabel(15)).toBe('15m')
    expect(durationLabel(0)).toBe('0m')
  })

  it('takes the first non-empty line of a description, stripping markup', () => {
    expect(firstLine('<p>hello</p>\nsecond')).toBe('hello')
    expect(firstLine('\n\n  first real line')).toBe('first real line')
    expect(firstLine('')).toBe('')
  })

  it('truncates a very long first line', () => {
    expect(firstLine('x'.repeat(200))).toHaveLength(90)
  })
})

describe('overflow rendering (acceptance 72)', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      taskEvent(task({ id: i + 1, startAt: DAY + i * MIN }), '#123'),
    ).filter((e): e is NonNullable<typeof e> => e !== null)

  it('groups a day full of events under one key', () => {
    const groups = groupByDay(many(40))
    expect(groups.size).toBe(1)
    expect([...groups.values()][0]).toHaveLength(40)
  })

  it('reports what a capped cell is hiding', () => {
    expect(overflowCount(many(40), 3)).toBe(37)
  })

  it('hides nothing when everything fits', () => {
    expect(overflowCount(many(2), 3)).toBe(0)
    expect(overflowCount([], 3)).toBe(0)
  })

  it('finds the busiest day across the range', () => {
    const spread = [
      ...many(40),
      ...(taskEvent(task({ id: 99, startAt: DAY + 2 * 24 * 60 * MIN }), '#1')
        ? [taskEvent(task({ id: 99, startAt: DAY + 2 * 24 * 60 * MIN }), '#1')!]
        : []),
    ]
    expect(busiestDayCount(spread)).toBe(40)
  })
})
