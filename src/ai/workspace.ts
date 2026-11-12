// What Claude may see of the workspace, and how its suggestions come back.
//
// The workspace (todos, tasks, reminders, notes) lives in this account's
// Supabase document, readable only with the user's own login. The backend has
// no key to it, so with each chat message the app sends a short read-only
// summary (`workspace` in POST /api/ai/chat; backend app/ai/workspace.py):
// open items only, soonest first, at most 50 of each, strings capped. Done,
// archived and cancelled items are left out.
//
// Claude never writes here. Its suggest_* tools stream a `suggestion` event;
// the reply shows it as a card, and the item is created only when the user
// opens the card, checks it and presses Add (AiActionDialog → createFromDraft).

import type { components } from '@/api/client'
import type { Note, Reminder, Task, Todo } from '@/types'
import { nextSlot, type AiActionDraft } from '@/utils/ai'

export type WorkspaceIn = components['schemas']['WorkspaceIn']

export const MAX_ITEMS = 50
export const MAX_NOTES = 20
const MAX_TEXT = 200

const cut = (s: string | null | undefined, n = MAX_TEXT) => (s ?? '').trim().slice(0, n)
const label = (s: string | null | undefined) => cut(s, 40) || null
const DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

export interface WorkspaceSource {
  todos: Todo[]
  tasks: Task[]
  reminders: Reminder[]
  notes: Note[]
}

/** The read-only summary sent with a chat message. */
export function workspaceSummary(src: WorkspaceSource, now = Date.now()): WorkspaceIn {
  const todos = src.todos.filter((t) => !t.done && !t.archivedAt && cut(t.text))
  const tasks = src.tasks
    .filter((t) => !t.done && !t.archivedAt && cut(t.title))
    // With a deadline first, soonest first; then the rest as they are.
    .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'))
  const today = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  const nowLocal = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}T${pad(today.getHours())}:${pad(today.getMinutes())}`
  const reminders = src.reminders
    .filter((r) => !r.cancelledAt && cut(r.title))
    // Upcoming, or repeating (a repeating reminder is always ahead).
    .filter((r) => (r.repeat?.type && r.repeat.type !== 'none') || (r.start || '') >= nowLocal)
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
  const notes = src.notes.filter((n) => cut(n.title) || cut(n.text)).sort((a, b) => b.ts - a.ts)

  return {
    todos: todos.slice(0, MAX_ITEMS).map((t) => ({
      text: cut(t.text),
      status: label(t.status),
      tag: label(t.tag),
    })),
    tasks: tasks.slice(0, MAX_ITEMS).map((t) => ({
      title: cut(t.title),
      status: label(t.status),
      deadline: DAY.test(t.deadline) ? t.deadline : null,
      tag: label(t.tag),
    })),
    reminders: reminders.slice(0, MAX_ITEMS).map((r) => ({
      title: cut(r.title),
      start: DAY_TIME.test(r.start) ? r.start.slice(0, 16) : null,
      repeat: label(r.repeat?.type),
    })),
    notes: notes.slice(0, MAX_NOTES).map((n) => ({
      // A note without a title: its first line.
      title: cut(n.title) || cut(n.text.split('\n')[0], 80),
    })),
    totals: {
      todos: todos.length,
      tasks: tasks.length,
      reminders: reminders.length,
    },
  }
}

// --- suggestions ---------------------------------------------------------------------------

export type SuggestionKind = 'todo' | 'task' | 'reminder' | 'calendar' | 'note'
export interface Suggestion {
  kind: SuggestionKind
  fields: Record<string, unknown>
}

const KINDS: SuggestionKind[] = ['todo', 'task', 'reminder', 'calendar', 'note']
export function isSuggestion(v: unknown): v is Suggestion {
  const s = v as Suggestion
  return (
    !!s &&
    typeof s === 'object' &&
    KINDS.includes(s.kind) &&
    !!s.fields &&
    typeof s.fields === 'object'
  )
}

const text = (v: unknown, n = 2000) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

/** A suggestion as the "Add" dialog's prefill: nothing is created until Add is pressed. */
export function draftFromSuggestion(s: Suggestion, now = Date.now()): AiActionDraft {
  const f = s.fields
  const title = text(f.title, 200)
  const notes = text(f.notes)
  const date = DAY.test(text(f.date)) ? text(f.date) : ''
  const time = /^\d{2}:\d{2}$/.test(text(f.time)) ? text(f.time) : ''
  const at = date ? `${date}T${time || '09:00'}` : nextSlot(now)
  switch (s.kind) {
    case 'task':
      return {
        kind: 'task',
        title,
        when: DAY.test(text(f.deadline)) ? text(f.deadline) : '',
        mins: null,
        notes,
      }
    case 'reminder':
      return { kind: 'reminder', title, when: at, mins: null, notes }
    case 'calendar': {
      const mins = typeof f.duration_minutes === 'number' ? f.duration_minutes : 30
      return { kind: 'event', title, when: at, mins: Math.min(1440, Math.max(5, mins)), notes }
    }
    case 'note':
      return { kind: 'note', title, when: '', mins: null, notes: text(f.body, 8000) }
    default:
      return { kind: 'todo', title, when: '', mins: null, notes }
  }
}

/** One line for the card: "Reminder · Call Ravi · 13 Nov, 10:00". */
export function describeSuggestion(s: Suggestion): string {
  const d = draftFromSuggestion(s)
  const name = {
    todo: 'Todo',
    task: 'Task',
    reminder: 'Reminder',
    calendar: 'Event',
    note: 'Note',
  }[s.kind]
  const when = d.when ? d.when.replace('T', ', ') : ''
  return [name, d.title || 'Untitled', when].filter(Boolean).join(' · ')
}
