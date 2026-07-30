// "Move pending to today" — the pure logic behind rolling overdue tasks forward.
//
// A task is eligible when it is not done and carries a due date (deadline)
// strictly before today. Tasks with no deadline are deliberately left alone:
// they were never anchored to a day, so there is nothing to roll. Deadlines are
// stored as local YYYY-MM-DD strings, so a lexical `<` compares calendar days
// correctly without parsing.
//
// Everything here is timezone-local via ymd(): an evening in a positive-offset
// zone must still count "today" as today, not tomorrow.

import { ymd } from '@/utils/dayGroups'
import type { Task, Todo } from '@/types'

// Local start-of-today as a YYYY-MM-DD key.
export function todayKey(now: Date = new Date()): string {
  return ymd(now)
}

export function isOverdueTask(task: Task, today: string = todayKey()): boolean {
  return task.status !== 'done' && !!task.deadline && task.deadline < today
}

// The tasks a rollover would touch, in list order. Idempotent by construction:
// once a task's deadline is today it is no longer < today, so a second run
// finds nothing.
export function eligibleTasks(tasks: Task[], today: string = todayKey()): Task[] {
  return tasks.filter((t) => isOverdueTask(t, today))
}

// Todos have no due date; their "due day" is the day they were written
// (createdAt). Overdue = a not-done todo whose day is before today. Legacy
// todos with createdAt 0 (unknown day) are left alone, mirroring how the day
// list already treats them as undated.
export function isOverdueTodo(todo: Todo, today: string = todayKey()): boolean {
  return todo.status !== 'done' && todo.createdAt > 0 && ymd(new Date(todo.createdAt)) < today
}

export function eligibleTodos(todos: Todo[], today: string = todayKey()): Todo[] {
  return todos.filter((t) => isOverdueTodo(t, today))
}

// Split a list into fixed-size chunks. Mirrors the Firestore writeBatch cap so
// a very large rollover is committed in bounded pieces rather than one giant
// write, with progress reported after each piece.
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items.slice()]
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
