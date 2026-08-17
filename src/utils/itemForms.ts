// What each item type's form looks like, as data. One dialog renders all of
// them, so adding a field is a line here rather than another bespoke form —
// and the tab views no longer have to carry an add-form at all.

import type { ItemType } from '@/types'
import { IDEA_TYPE_OPTIONS } from '@/types'

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'date'
  | 'datetime'
  | 'number'
  | 'select'
  | 'tag'
  | 'weekdays'
  | 'checkbox'
  // A picker over existing notes; the value is a number[] of attached note ids.
  | 'notes'

export interface FieldDef {
  key: string
  label: string
  kind: FieldKind
  placeholder?: string
  options?: { value: string; label: string }[]
  min?: number
  // A leading adornment for text/number inputs, e.g. a ₹ on a money field.
  prefix?: string
  // Shown only when this returns true — the reminder repeat fields depend on
  // which kind of repeat is selected.
  when?: (draft: Record<string, unknown>) => boolean
}

export interface FormDef {
  // Titles read as the action, since the same form both creates and edits.
  newTitle: string
  editTitle: string
  fields: FieldDef[]
}

const REPEAT_OPTIONS = [
  { value: 'none', label: 'One-off' },
  { value: 'minutes', label: 'Every N minutes' },
  { value: 'hours', label: 'Every N hours' },
  { value: 'days', label: 'Every N days' },
  { value: 'weeks', label: 'Every N weeks' },
  { value: 'months', label: 'Every N months' },
  { value: 'years', label: 'Every N years' },
  { value: 'weekdays', label: 'Specific weekdays' },
]

const isInterval = (d: Record<string, unknown>) => {
  const t = String(d.repeatType ?? 'none')
  return t !== 'none' && t !== 'weekdays'
}

export const ITEM_FORMS: Record<ItemType, FormDef> = {
  todo: {
    newTitle: 'New todo',
    editTitle: 'Edit todo',
    fields: [
      { key: 'text', label: 'Todo', kind: 'text', placeholder: 'What needs doing?' },
      {
        key: 'description',
        label: 'Description',
        kind: 'textarea',
        placeholder: 'Optional detail',
      },
      { key: 'tag', label: 'Tag', kind: 'tag' },
    ],
  },
  task: {
    newTitle: 'New task',
    editTitle: 'Edit task',
    fields: [
      { key: 'title', label: 'Task', kind: 'text', placeholder: 'Task title' },
      { key: 'deadline', label: 'Due', kind: 'date' },
      { key: 'tag', label: 'Project tag', kind: 'tag' },
      { key: 'notes', label: 'Notes', kind: 'textarea', placeholder: 'Optional notes' },
      { key: 'repo', label: 'Repo', kind: 'text', placeholder: 'owner/repo' },
    ],
  },
  deadline: {
    newTitle: 'New deadline',
    editTitle: 'Edit deadline',
    fields: [
      { key: 'title', label: 'Deadline', kind: 'text', placeholder: 'What is due?' },
      { key: 'due', label: 'Due', kind: 'date' },
    ],
  },
  finance: {
    newTitle: 'New entry',
    editTitle: 'Edit entry',
    fields: [
      { key: 'amount', label: 'Amount', kind: 'number', placeholder: '0', min: 0, prefix: '₹' },
      {
        key: 'category',
        label: 'Category',
        kind: 'select',
        options: ['Food', 'Transport', 'Bills', 'Fun', 'Other'].map((v) => ({
          value: v,
          label: v,
        })),
      },
      { key: 'note', label: 'Note', kind: 'text', placeholder: 'Optional note' },
      { key: 'date', label: 'Date', kind: 'date' },
    ],
  },
  trip: {
    newTitle: 'New trip',
    editTitle: 'Edit trip',
    fields: [
      { key: 'location', label: 'Location', kind: 'text', placeholder: 'Where to?' },
      { key: 'date', label: 'Day', kind: 'date' },
    ],
  },
  reminder: {
    newTitle: 'New reminder',
    editTitle: 'Edit reminder',
    fields: [
      { key: 'title', label: 'Reminder', kind: 'text', placeholder: 'Remind me to…' },
      { key: 'note', label: 'Note', kind: 'text', placeholder: 'Optional note' },
      { key: 'start', label: 'Starts', kind: 'datetime' },
      { key: 'repeatType', label: 'Repeat', kind: 'select', options: REPEAT_OPTIONS },
      { key: 'repeatN', label: 'Every', kind: 'number', min: 1, when: isInterval },
      {
        key: 'weekdays',
        label: 'On days',
        kind: 'weekdays',
        when: (d) => d.repeatType === 'weekdays',
      },
      {
        key: 'priority',
        label: 'Priority',
        kind: 'select',
        options: [
          { value: 'high', label: 'High' },
          { value: 'normal', label: 'Normal' },
          { value: 'low', label: 'Low' },
        ],
      },
      { key: 'addToCalendar', label: 'Add to Google Calendar', kind: 'checkbox' },
    ],
  },
  idea: {
    newTitle: 'New idea',
    editTitle: 'Edit idea',
    fields: [
      { key: 'title', label: 'Idea', kind: 'text', placeholder: 'The idea in a line' },
      { key: 'description', label: 'Description', kind: 'textarea', placeholder: 'Flesh it out' },
      { key: 'deadline', label: 'Deadline', kind: 'date' },
      { key: 'ideaType', label: 'Type', kind: 'select', options: IDEA_TYPE_OPTIONS },
      { key: 'tag', label: 'Tag', kind: 'tag' },
      { key: 'noteIds', label: 'Notes', kind: 'notes' },
    ],
  },
  stock: {
    newTitle: 'New stock',
    editTitle: 'Edit stock',
    fields: [
      { key: 'symbol', label: 'Symbol', kind: 'text', placeholder: 'AAPL' },
      { key: 'name', label: 'Name', kind: 'text', placeholder: 'Apple Inc.' },
      { key: 'why', label: 'Why tracking', kind: 'textarea', placeholder: 'Thesis / catalysts' },
      { key: 'targetPrice', label: 'Target price', kind: 'number', placeholder: '0.00', min: 0 },
      { key: 'watchPrice', label: 'Watch price', kind: 'number', placeholder: '0.00', min: 0 },
      { key: 'tag', label: 'Tag', kind: 'tag' },
      { key: 'noteIds', label: 'Notes', kind: 'notes' },
    ],
  },
  // Notes are written in the drawer's rich-text editor, not a field form.
  note: { newTitle: 'New note', editTitle: 'Edit note', fields: [] },
}
