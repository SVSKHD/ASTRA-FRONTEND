// What the Reminders tab and its form show, as plain functions: which group a
// reminder sits in, how its next time reads, the one-tap times and repeats the
// form offers, and the form's values to and from the create dialog's draft.
// Kept out of the components so each rule is tested once, here.
import { occurrences } from '@/utils/reminders'
import type { Priority, Reminder, Repeat, RepeatType } from '@/types'

/** The list's groups, in the order they are shown. */
export type ReminderGroupKey = 'missed' | 'today' | 'tomorrow' | 'week' | 'later'

export const GROUP_LABEL: Record<ReminderGroupKey, string> = {
  missed: 'Missed',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
}
export const GROUP_ORDER: ReminderGroupKey[] = ['missed', 'today', 'tomorrow', 'week', 'later']

const DAY = 86_400_000

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Whether the reminder is finished: acknowledged or cancelled. */
export function isReminderDone(r: Reminder): boolean {
  return r.acknowledgedAt != null || r.cancelledAt != null
}

/**
 * Which group an open reminder belongs in, by its next time. A one-off whose
 * time has passed without being acknowledged has no next time: it is Missed.
 */
export function groupOf(r: Reminder, now: number): ReminderGroupKey {
  const next = occurrences(r, now).next
  if (next == null) return 'missed'
  const today = startOfDay(now)
  if (next < today + DAY) return 'today'
  if (next < today + 2 * DAY) return 'tomorrow'
  if (next < today + 7 * DAY) return 'week'
  return 'later'
}

/** The time a reminder last fired or will fire next, for sorting and labels. */
export function whenOf(r: Reminder, now: number): number | null {
  const occ = occurrences(r, now)
  return occ.next ?? occ.last ?? null
}

/** "Today 3:00 PM", "Tomorrow 9:00 AM", "Mon 12 Oct 9:00 AM". */
export function whenLabel(ms: number, now: number): string {
  const d = new Date(ms)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const day = startOfDay(ms)
  const today = startOfDay(now)
  if (day === today) return `Today ${time}`
  if (day === today + DAY) return `Tomorrow ${time}`
  if (day === today - DAY) return `Yesterday ${time}`
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  const date = d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  return `${date} ${time}`
}

const pad = (n: number) => String(n).padStart(2, '0')
/** A local 'YYYY-MM-DDTHH:mm', the shape the reminders store keeps. */
export function localStamp(ms: number): string {
  const d = new Date(ms)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

/** A new reminder's default time: the next whole hour at least 30 minutes away. */
export function defaultStart(now: number): string {
  const d = new Date(now + 30 * 60_000)
  if (d.getMinutes() > 0 || d.getSeconds() > 0) d.setHours(d.getHours() + 1, 0, 0, 0)
  return localStamp(d.getTime())
}

export interface TimePreset {
  label: string
  value: string
}

/** The one-tap times under the date picker. */
export function timePresets(now: number): TimePreset[] {
  const at = (days: number, h: number) => {
    const d = new Date(startOfDay(now) + days * DAY)
    d.setHours(h, 0, 0, 0)
    return d.getTime()
  }
  const out: TimePreset[] = [{ label: 'In 1 hour', value: localStamp(now + 3_600_000) }]
  if (at(0, 18) - now > 30 * 60_000)
    out.push({ label: 'This evening', value: localStamp(at(0, 18)) })
  out.push({ label: 'Tomorrow 9 AM', value: localStamp(at(1, 9)) })
  // The next Monday after today (a week on when today is Monday).
  const dow = new Date(now).getDay()
  const toMonday = (8 - dow) % 7 || 7
  out.push({ label: 'Next Monday', value: localStamp(at(toMonday, 9)) })
  return out
}

/** The repeat strip: four common choices and Custom for the rest. */
export type RepeatPreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom'

export const REPEAT_PRESETS: { value: RepeatPreset; label: string }[] = [
  { value: 'none', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
]

export function presetOf(rep: Repeat | undefined): RepeatPreset {
  if (!rep || rep.type === 'none') return 'none'
  const n = rep.n || 1
  if (rep.type === 'days' && n === 1) return 'daily'
  if (rep.type === 'weeks' && n === 1) return 'weekly'
  if (rep.type === 'months' && n === 1) return 'monthly'
  return 'custom'
}

/** The repeat a preset stands for. Custom starts from every 2 days. */
export function repeatOfPreset(p: RepeatPreset, current?: Repeat): Repeat {
  if (p === 'none') return { type: 'none' }
  if (p === 'daily') return { type: 'days', n: 1 }
  if (p === 'weekly') return { type: 'weeks', n: 1 }
  if (p === 'monthly') return { type: 'months', n: 1 }
  // Custom keeps a custom repeat that is already there.
  if (current && presetOf(current) === 'custom') return current
  return { type: 'days', n: 2 }
}

export const UNIT_OPTIONS: { value: RepeatType; label: string }[] = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
  { value: 'weekdays', label: 'On set days' },
]

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
]

/** Everything the reminder form edits. */
export interface ReminderFormValue {
  title: string
  note: string
  start: string
  repeat: Repeat
  priority: Priority
  addToCalendar: boolean
}

/** The create dialog keeps its values flat (store blankDraft / commitCreate). */
export function formFromDraft(d: Record<string, unknown>): ReminderFormValue {
  const type = (String(d.repeatType ?? 'none') || 'none') as RepeatType
  const repeat: Repeat =
    type === 'weekdays'
      ? { type, weekdays: Array.isArray(d.weekdays) ? (d.weekdays as number[]) : [] }
      : type === 'none'
        ? { type }
        : { type, n: Number(d.repeatN) || 1 }
  return {
    title: String(d.title ?? ''),
    note: String(d.note ?? ''),
    start: String(d.start ?? ''),
    repeat,
    priority: (String(d.priority ?? 'normal') || 'normal') as Priority,
    addToCalendar: d.addToCalendar === true,
  }
}

/** A form change, as the draft keys it touches. */
export function draftPatch(patch: Partial<ReminderFormValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (k !== 'repeat') {
      out[k] = v
      continue
    }
    const rep = v as Repeat
    out.repeatType = rep.type
    out.repeatN = rep.n ?? 1
    out.weekdays = rep.weekdays ?? []
  }
  return out
}

export function formFromReminder(r: Reminder): ReminderFormValue {
  return {
    title: r.title,
    note: r.note,
    start: r.start,
    repeat: r.repeat || { type: 'none' },
    priority: r.priority || 'normal',
    addToCalendar: !!r.calEventId,
  }
}

/** "from Todo" for a reminder made from an item, '' otherwise. */
export function sourceLabel(r: Reminder): string {
  const sr = r.sourceRef
  if (!sr) return ''
  const noun =
    sr.collection === 'todos'
      ? 'Todo'
      : sr.collection === 'tasks'
        ? 'Task'
        : sr.collection === 'ideas'
          ? 'Idea'
          : 'item'
  return 'from ' + noun
}
