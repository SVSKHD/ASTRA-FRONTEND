// One timeline out of four sources (section 15). Tasks, todos, goal occurrences
// and reminders become a single event list; the calendar view is markup over
// this, and every decision about what appears, when, and in what colour is made
// here so it can be tested without mounting FullCalendar.
//
// Mapping to this app's existing model:
//   task.deadline (YYYY-MM-DD)   → the task's due date, unchanged
//   startAt + endAt              → a timed block spanning the duration
//   startAt only                 → a 30-minute block (the spec's default)
//   deadline, no startAt         → an all-day chip on that day
//   todo with neither            → NOT on the grid; it belongs in Unscheduled,
//                                  because a todo's createdAt is not a plan
//   goal occurrence              → an all-day chip, target/actual once entered
//   goal start/target dates      → milestone markers
//   reminder                     → a pill at its fire time

import { ymd } from '@/utils/dayGroups'
import type { Goal, GoalOccurrence, Reminder, Task, Todo } from '@/types'

export type EventSource = 'task' | 'todo' | 'goal' | 'reminder' | 'milestone'

export interface CalEvent {
  // Namespaced so an id collision across sources is impossible.
  id: string
  source: EventSource
  // The underlying record's numeric id, for opening / writing back.
  refId: number
  title: string
  // First line of the description, shown on a tall enough block.
  subtitle: string
  start: number
  end: number
  allDay: boolean
  // Rendered at 50% opacity with a struck-through title.
  completed: boolean
  // Left bar colour: the project/goal colour.
  barColor: string
  // Whether the item can be dragged/resized on the grid (milestones cannot).
  editable: boolean
  durationMins: number
}

// The FullCalendar view names this app uses, kept as a closed union so the
// persisted preference can be validated on read.
export type CalendarViewKey = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listMonth'

export const CALENDAR_VIEWS: { key: CalendarViewKey; label: string; short: string }[] = [
  { key: 'dayGridMonth', label: 'Month', short: 'M' },
  { key: 'timeGridWeek', label: 'Week', short: 'W' },
  { key: 'timeGridDay', label: 'Day', short: 'D' },
  { key: 'listMonth', label: 'Agenda', short: 'A' },
]

export function isCalendarView(v: unknown): v is CalendarViewKey {
  return CALENDAR_VIEWS.some((view) => view.key === v)
}

export interface CalendarFilters {
  tasks: boolean
  todos: boolean
  goals: boolean
  reminders: boolean
  // A project tag, or '' for every project.
  project: string
}

export function defaultFilters(): CalendarFilters {
  return { tasks: true, todos: true, goals: true, reminders: true, project: '' }
}

export const SOURCE_COLOR: Record<EventSource, string> = {
  task: 'oklch(0.65 0.16 260)',
  todo: 'oklch(0.68 0.14 200)',
  goal: 'oklch(0.72 0.15 150)',
  reminder: 'oklch(0.75 0.16 60)',
  milestone: 'oklch(0.68 0.19 320)',
}

export const DEFAULT_BLOCK_MINS = 30
const MIN = 60_000

export interface Range {
  start: number
  end: number
}

// A day range from a YYYY-MM-DD string, in local time — the app is single-user
// and single-timezone, and FullCalendar hands back local dates too.
export function dayStart(date: string): number {
  return new Date(date + 'T00:00:00').getTime()
}

function overlaps(start: number, end: number, range: Range): boolean {
  return end > range.start && start < range.end
}

export function firstLine(text: string | null | undefined): string {
  const line = (text || '')
    .replace(/<[^>]*>/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
  return line ? (line.length > 90 ? line.slice(0, 89) + '…' : line) : ''
}

export function minutesBetween(start: number, end: number): number {
  return Math.max(1, Math.round((end - start) / MIN))
}

// The block a schedulable item occupies. Start/end win; a lone start gets the
// default block; a due date with no time is an all-day chip.
export function blockFor(item: {
  startAt?: number | null
  endAt?: number | null
  allDay?: boolean
  durationMins?: number | null
  deadline?: string
}): { start: number; end: number; allDay: boolean } | null {
  if (item.startAt !== null && item.startAt !== undefined) {
    if (item.allDay) {
      const start = item.startAt
      return { start, end: item.endAt ?? start + 24 * 60 * MIN, allDay: true }
    }
    const minutes = item.endAt
      ? minutesBetween(item.startAt, item.endAt)
      : (item.durationMins ?? DEFAULT_BLOCK_MINS)
    return { start: item.startAt, end: item.startAt + minutes * MIN, allDay: false }
  }
  if (item.deadline) {
    const start = dayStart(item.deadline)
    return { start, end: start + 24 * 60 * MIN, allDay: true }
  }
  return null
}

function projectMatches(tag: string, filter: string): boolean {
  return !filter || tag === filter
}

export function taskEvent(task: Task, color: string): CalEvent | null {
  const block = blockFor(task)
  if (!block) return null
  return {
    id: `task:${task.id}`,
    source: 'task',
    refId: task.id,
    title: task.title,
    subtitle: firstLine(task.notes),
    start: block.start,
    end: block.end,
    allDay: block.allDay,
    completed: task.status === 'done',
    barColor: color,
    editable: true,
    durationMins: minutesBetween(block.start, block.end),
  }
}

export function todoEvent(todo: Todo, color: string): CalEvent | null {
  // A todo only appears once it has been scheduled — an unscheduled one lives in
  // the Unscheduled panel, not smeared across the day it happened to be created.
  const block = blockFor(todo)
  if (!block) return null
  return {
    id: `todo:${todo.id}`,
    source: 'todo',
    refId: todo.id,
    title: todo.text,
    subtitle: firstLine(todo.description),
    start: block.start,
    end: block.end,
    allDay: block.allDay,
    completed: todo.status === 'done',
    barColor: color,
    editable: true,
    durationMins: minutesBetween(block.start, block.end),
  }
}

// A recurring goal's dated occurrence: an all-day chip showing the target, and
// the actual once it has been entered.
export function occurrenceEvent(
  occurrence: GoalOccurrence,
  goal: Goal | undefined,
): CalEvent | null {
  if (!goal) return null
  const start = dayStart(occurrence.date)
  const target = occurrence.target
  const actual = occurrence.actual
  const suffix =
    target != null && actual != null
      ? ` ${actual}/${target}`
      : target != null
        ? ` · target ${target}`
        : ''
  return {
    id: `goal:${goal.id}:${occurrence.date}`,
    source: 'goal',
    refId: goal.id,
    title: goal.title + suffix,
    subtitle: '',
    start,
    end: start + 24 * 60 * MIN,
    allDay: true,
    completed: occurrence.status === 'done',
    barColor: goal.color || SOURCE_COLOR.goal,
    // A goal occurrence belongs to its date by definition; dragging it would be
    // rewriting history rather than rescheduling anything.
    editable: false,
    durationMins: 24 * 60,
  }
}

// A goal's timeline endpoints, as milestone markers.
export function milestoneEvents(goal: Goal): CalEvent[] {
  const out: CalEvent[] = []
  const add = (date: string, label: string) => {
    const start = dayStart(date)
    out.push({
      id: `milestone:${goal.id}:${label}`,
      source: 'milestone',
      refId: goal.id,
      title: `${label}: ${goal.title}`,
      subtitle: '',
      start,
      end: start + 24 * 60 * MIN,
      allDay: true,
      completed: goal.status === 'done',
      barColor: goal.color || SOURCE_COLOR.milestone,
      editable: false,
      durationMins: 24 * 60,
    })
  }
  if (goal.startDate) add(goal.startDate, 'Start')
  if (goal.targetDate) add(goal.targetDate, 'Target')
  return out
}

export function reminderEvent(reminder: Reminder): CalEvent | null {
  if (!reminder.start) return null
  const start = new Date(reminder.start).getTime()
  if (!Number.isFinite(start)) return null
  return {
    id: `reminder:${reminder.id}`,
    source: 'reminder',
    refId: reminder.id,
    title: reminder.title,
    subtitle: firstLine(reminder.note),
    start,
    // A reminder is an instant; a short pill reads better than a zero-width mark.
    end: start + 15 * MIN,
    allDay: false,
    completed: reminder.acknowledgedAt !== null || reminder.cancelledAt !== null,
    barColor: SOURCE_COLOR.reminder,
    editable: true,
    durationMins: 15,
  }
}

export interface EventSources {
  tasks: Task[]
  todos: Todo[]
  goals: Goal[]
  occurrences: GoalOccurrence[]
  reminders: Reminder[]
  // Project/tag colour lookup, so the left bar matches the rest of the app.
  colorOf: (tag: string) => string
}

// Build every event overlapping the range, honouring the filter chips. The range
// is what keeps this cheap: nothing outside the visible window (plus its
// padding) is ever built.
export function buildEvents(
  sources: EventSources,
  range: Range,
  filters: CalendarFilters = defaultFilters(),
): CalEvent[] {
  const out: CalEvent[] = []
  const push = (event: CalEvent | null) => {
    if (event && overlaps(event.start, event.end, range)) out.push(event)
  }

  if (filters.tasks) {
    for (const task of sources.tasks) {
      if (task.archivedAt) continue
      if (!projectMatches(task.tag, filters.project)) continue
      push(taskEvent(task, sources.colorOf(task.tag)))
    }
  }
  if (filters.todos) {
    for (const todo of sources.todos) {
      if (todo.archivedAt) continue
      if (!projectMatches(todo.tag, filters.project)) continue
      push(todoEvent(todo, sources.colorOf(todo.tag)))
    }
  }
  if (filters.goals) {
    const byId = new Map(sources.goals.map((g) => [g.id, g]))
    for (const occurrence of sources.occurrences) {
      push(occurrenceEvent(occurrence, byId.get(occurrence.goalId)))
    }
    for (const goal of sources.goals) {
      if (goal.status === 'archived') continue
      for (const milestone of milestoneEvents(goal)) push(milestone)
    }
  }
  if (filters.reminders) {
    for (const reminder of sources.reminders) push(reminderEvent(reminder))
  }

  return out.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title))
}

// Items with nothing to place them on the grid — the Unscheduled panel's
// contents. Completed and archived items are not offered for scheduling.
export function unscheduledItems(sources: Pick<EventSources, 'tasks' | 'todos'>): {
  tasks: Task[]
  todos: Todo[]
} {
  return {
    tasks: sources.tasks.filter(
      (t) => !t.archivedAt && t.status !== 'done' && t.startAt == null && !t.deadline,
    ),
    todos: sources.todos.filter((t) => !t.archivedAt && t.status !== 'done' && t.startAt == null),
  }
}

// "1h 30m" — the live tooltip while resizing, and the duration line on a hover
// card.
export function durationLabel(minutes: number): string {
  const mins = Math.max(0, Math.round(minutes))
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  if (!hours) return `${rest}m`
  if (!rest) return `${hours}h`
  return `${hours}h ${rest}m`
}

// The day key an event belongs to, for the "+N more" overflow grouping.
export function dayKeyOf(event: CalEvent): string {
  return ymd(new Date(event.start))
}
