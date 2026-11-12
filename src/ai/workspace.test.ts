// What the chat sends Claude about the workspace, and how a suggestion becomes
// the "Add" dialog's prefill (nothing is created until the user presses Add).
import { describe, expect, it } from 'vitest'
import {
  describeSuggestion,
  draftFromSuggestion,
  isSuggestion,
  MAX_ITEMS,
  workspaceSummary,
  type WorkspaceSource,
} from '@/ai/workspace'
import { readEvent } from '@/ai/aureonChat'
import type { Note, Reminder, Task, Todo } from '@/types'

const NOW = new Date(2026, 10, 12, 10, 0).getTime() // 12 Nov 2026, 10:00 local

const todo = (id: number, text: string, extra: Partial<Todo> = {}) =>
  ({ id, text, done: false, status: 'todo', tag: '', archivedAt: null, ...extra }) as Todo
const task = (id: number, title: string, deadline = '', extra: Partial<Task> = {}) =>
  ({
    id,
    title,
    deadline,
    done: false,
    status: 'todo',
    tag: '',
    archivedAt: null,
    ...extra,
  }) as Task
const reminder = (id: number, title: string, start: string, extra: Partial<Reminder> = {}) =>
  ({ id, title, start, repeat: { type: 'none' }, cancelledAt: null, ...extra }) as Reminder
const note = (id: number, text: string, ts: number, title?: string) =>
  ({ id, text, ts, title }) as Note

function source(over: Partial<WorkspaceSource> = {}): WorkspaceSource {
  return { todos: [], tasks: [], reminders: [], notes: [], ...over }
}

describe('workspaceSummary', () => {
  it('sends open items only, soonest first', () => {
    const ws = workspaceSummary(
      source({
        todos: [todo(1, 'Renew insurance', { tag: 'home' }), todo(2, 'Done one', { done: true })],
        tasks: [
          task(1, 'No date'),
          task(2, 'GST filing', '2026-11-10'),
          task(3, 'Archived', '2026-11-01', { archivedAt: 1 }),
          task(4, 'Board deck', '2026-11-20'),
        ],
        reminders: [
          reminder(1, 'Past', '2026-11-01T09:00'),
          reminder(2, 'Dentist', '2026-11-14T09:30'),
          reminder(3, 'Weekly review', '2026-01-01T18:00', { repeat: { type: 'weeks', n: 1 } }),
          reminder(4, 'Cancelled', '2026-11-30T09:00', { cancelledAt: 1 }),
        ],
        notes: [note(1, 'old', 1, 'Old note'), note(2, 'First line\nmore', 2)],
      }),
      NOW,
    )
    expect(ws.todos).toEqual([{ text: 'Renew insurance', status: 'todo', tag: 'home' }])
    expect(ws.tasks?.map((t) => t.title)).toEqual(['GST filing', 'Board deck', 'No date'])
    expect(ws.reminders?.map((r) => r.title)).toEqual(['Weekly review', 'Dentist'])
    expect(ws.notes?.map((n) => n.title)).toEqual(['First line', 'Old note'])
    expect(ws.totals).toEqual({ todos: 1, tasks: 3, reminders: 2 })
  })

  it('caps what it sends', () => {
    const many = Array.from({ length: 80 }, (_, i) => todo(i, 'x'.repeat(500)))
    const ws = workspaceSummary(source({ todos: many }), NOW)
    expect(ws.todos).toHaveLength(MAX_ITEMS)
    expect(ws.todos![0].text).toHaveLength(200)
    expect(ws.totals?.todos).toBe(80)
  })
})

describe('suggestions', () => {
  it('reads a suggestion event and nothing malformed', () => {
    const raw = JSON.stringify({
      kind: 'reminder',
      fields: { title: 'Call Ravi', date: '2026-11-13' },
    })
    expect(readEvent('suggestion', raw)).toEqual({
      suggestion: { kind: 'reminder', fields: { title: 'Call Ravi', date: '2026-11-13' } },
    })
    expect(readEvent('suggestion', JSON.stringify({ kind: 'delete_everything', fields: {} }))).toBe(
      null,
    )
    expect(isSuggestion({ kind: 'todo' })).toBe(false)
  })

  it('prefills the Add dialog for each kind', () => {
    expect(draftFromSuggestion({ kind: 'todo', fields: { title: ' Buy filters ' } })).toEqual({
      kind: 'todo',
      title: 'Buy filters',
      when: '',
      mins: null,
      notes: '',
    })
    expect(
      draftFromSuggestion({ kind: 'task', fields: { title: 'GST', deadline: '2026-11-20' } }).when,
    ).toBe('2026-11-20')
    expect(
      draftFromSuggestion({
        kind: 'reminder',
        fields: { title: 'Call', date: '2026-11-13', time: '10:30' },
      }).when,
    ).toBe('2026-11-13T10:30')
    const ev = draftFromSuggestion({
      kind: 'calendar',
      fields: { title: 'Review', date: '2026-11-13', duration_minutes: 45 },
    })
    expect(ev).toMatchObject({ kind: 'event', when: '2026-11-13T09:00', mins: 45 })
    expect(
      draftFromSuggestion({ kind: 'note', fields: { title: 'Ideas', body: '# Q3' } }),
    ).toMatchObject({ kind: 'note', title: 'Ideas', notes: '# Q3' })
    expect(
      describeSuggestion({
        kind: 'reminder',
        fields: { title: 'Call', date: '2026-11-13', time: '10:30' },
      }),
    ).toBe('Reminder · Call · 2026-11-13, 10:30')
  })
})
