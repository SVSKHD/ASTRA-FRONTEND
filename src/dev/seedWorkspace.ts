// Workspace rows for the screenshot stage (section 44, item 10).
//
// The Firestore fixture covers the collections the trading tabs read — trades,
// signals, expenses, news, the GitHub mirror. It does not cover the workspace
// document, because the workspace document is not a collection: todos, tasks,
// deadlines, reminders and goals all live as arrays inside one record the app
// store loads whole.
//
// So they are seeded by assignment, straight onto the store. That is honest
// about what it is — this is a fixture, not a mock of the loader — and it is
// what lets the Todos tab and the Dashboard be photographed at all.
//
// THE LONG TITLES ARE THE POINT. Two of the reminders below are deliberately
// far too long for the pill that shows them. A truncation rule nobody ever
// photographs truncating is a rule that quietly stops working, and the reminder
// pill's whole job in section 44 is to not push the button beside it off the
// edge of the strip.

import { SEED_TODAY } from '@/dev/seed'
import type { Deadline, Idea, Reminder, Task, Todo } from '@/types'

const DAY = 86_400_000
const noon = (ymd: string) => Date.parse(`${ymd}T12:00:00+05:30`)
const shift = (days: number) => new Date(noon(SEED_TODAY) + days * DAY).toISOString().slice(0, 10)

function todo(id: number, text: string, over: Partial<Todo> = {}): Todo {
  return {
    id,
    text,
    tag: '',
    done: false,
    status: 'pending',
    notes: '',
    linked: [],
    parents: [],
    reminderIds: [],
    sourceRef: null,
    parentId: null,
    order: id,
    depth: 0,
    rootId: id,
    localRev: 0,
    updatedBy: '',
    completedAt: null,
    archivedAt: null,
    rolledOverAt: null,
    rolloverCount: 0,
    createdAt: noon(SEED_TODAY),
    updatedAt: noon(SEED_TODAY),
    ...over,
  } as Todo
}

function task(id: number, title: string, over: Partial<Task> = {}): Task {
  return {
    id,
    title,
    tag: '',
    done: false,
    status: 'pending',
    deadline: '',
    notes: '',
    repo: '',
    rolledOverAt: null,
    rolloverCount: 0,
    completedAt: null,
    linked: [],
    parents: [],
    reminderIds: [],
    sourceRef: null,
    parentId: null,
    order: id,
    depth: 0,
    rootId: id,
    localRev: 0,
    updatedBy: '',
    createdAt: noon(SEED_TODAY),
    updatedAt: noon(SEED_TODAY),
    ...over,
  } as Task
}

export function seedTodos(): Todo[] {
  return [
    // Two carried over from before today, which is what opens the "Carried
    // over" accordion.
    todo(1, 'Reconcile the August secured ledger', { createdAt: noon(shift(-6)) }),
    todo(2, 'Chase the broker about the London spread', { createdAt: noon(shift(-3)) }),
    todo(3, 'Size XAGUSD before the New York open'),
    todo(4, 'Write up the Tuesday drawdown'),
    todo(5, 'Renew the data subscription'),
    todo(6, 'Move the standing order to the 3rd'),
    todo(7, 'Book the dentist'),
    todo(8, 'Read the ECB statement properly', {
      status: 'done',
      done: true,
      completedAt: noon(SEED_TODAY),
    }),
    todo(9, 'Close the stale PR on astra-frontend', {
      status: 'done',
      done: true,
      completedAt: noon(SEED_TODAY),
    }),
  ]
}

export function seedTasks(): Task[] {
  return [
    task(101, 'Ship the shell rework', { deadline: shift(2) }),
    task(102, 'Audit the theme tokens', { deadline: shift(5) }),
    task(103, 'Replace the dead feeds', { status: 'progress' }),
    task(104, 'Wire the GitHub setup flow'),
  ]
}

export function seedDeadlines(): Deadline[] {
  return [
    { id: 201, title: 'Quarterly tax filing', due: shift(9), tag: 'money', notes: '' },
    { id: 202, title: 'Passport renewal window closes', due: shift(21), tag: '', notes: '' },
  ] as unknown as Deadline[]
}

export function seedReminders(): Reminder[] {
  return [
    {
      id: 301,
      // Deliberately long. This is the string the pill has to truncate rather
      // than grow into the button beside it.
      title:
        'Review the monthly target against the secured ledger and decide whether to raise the daily',
      at: new Date(noon(SEED_TODAY) + 3 * 3_600_000).toISOString(),
      repeat: 'none',
      enabled: true,
      linked: [],
      createdAt: noon(SEED_TODAY),
    },
    {
      id: 302,
      title: 'London open',
      at: new Date(noon(SEED_TODAY) + 18 * 3_600_000).toISOString(),
      repeat: 'daily',
      enabled: true,
      linked: [],
      createdAt: noon(SEED_TODAY),
    },
  ] as unknown as Reminder[]
}

export function seedIdeas(): Idea[] {
  return [
    { id: 401, title: 'Session heat map', deadline: '', notes: '', tag: '' },
  ] as unknown as Idea[]
}
