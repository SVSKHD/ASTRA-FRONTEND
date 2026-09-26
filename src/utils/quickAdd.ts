// Natural-language quick add for the Todo tab (Todo v2, 5a).
//
// "Call vendor fri 5pm #CRM !high every week" becomes a title ("Call vendor")
// plus the fields the tokens named. Each kind of token is consumed from the
// text at most once, first match wins, so a title that happens to contain a
// second "#" keeps it.
//
// The date and time grammar is the date picker's (utils/dateParse), not a second
// one: "tomorrow", "fri", "12 oct" and "5:30 pm" mean the same thing typed here
// as they do typed into a GlassDatePicker.
import { parseDateFragment, parseTimeFragment } from '@/utils/dateParse'
import type { IconName } from '@/components/ui/icons'
import type { Priority, RepeatType } from '@/types'

export type QuickChipKind = 'tag' | 'priority' | 'repeat' | 'date' | 'time'

export interface QuickChip {
  kind: QuickChipKind
  icon: IconName
  text: string
}

export interface QuickAdd {
  /** What is left once every recognised token is taken out. */
  title: string
  tag: string
  priority: Priority | null
  repeat: RepeatType | null
  /** 'YYYY-MM-DD' */
  date: string | null
  /** 'HH:mm' */
  time: string | null
  chips: QuickChip[]
}

const PRIORITY: Record<string, Priority> = { high: 'high', med: 'normal', low: 'low' }
const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High priority',
  normal: 'Medium priority',
  low: 'Low priority',
}
const REPEAT: Record<string, RepeatType> = {
  day: 'days',
  week: 'weeks',
  month: 'months',
  year: 'years',
}

const DAY_WORD =
  /(?:^|\s)(today|tonight|tomorrow|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)(?=\s|$)/i
const DAY_MONTH =
  /(?:^|\s)(\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)(?=\s|$)/i
const TIME = /(?:^|\s)(\d{1,2}(?::\d{2})?\s?(?:am|pm))(?=\s|$)/i

function titleCase(word: string): string {
  return word[0].toUpperCase() + word.slice(1).toLowerCase()
}

function prettyDate(ymd: string, now: Date): string {
  const d = new Date(ymd + 'T00:00:00')
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

function prettyTime(hm: string): string {
  const [h, m] = hm.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return hour + (m ? ':' + String(m).padStart(2, '0') : '') + suffix
}

export function parseQuickAdd(input: string, now: Date = new Date()): QuickAdd {
  let rest = ' ' + (input || '') + ' '
  const out: QuickAdd = {
    title: '',
    tag: '',
    priority: null,
    repeat: null,
    date: null,
    time: null,
    chips: [],
  }
  // Take the first match out of the text, leaving a space so the words either
  // side of it do not run together.
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = rest.match(re)
    if (m) rest = rest.replace(m[0], ' ')
    return m
  }

  const tag = take(/\s#([\p{L}\p{N}_-]+)/u)
  if (tag) {
    out.tag = tag[1]
    out.chips.push({ kind: 'tag', icon: 'tag', text: tag[1] })
  }

  const prio = take(/\s!(high|med|low)\b/i)
  if (prio) {
    out.priority = PRIORITY[prio[1].toLowerCase()]
    out.chips.push({ kind: 'priority', icon: 'flag', text: PRIORITY_LABEL[out.priority] })
  }

  const rep = take(/\severy (day|week|month|year)\b/i)
  if (rep) {
    out.repeat = REPEAT[rep[1].toLowerCase()]
    out.chips.push({ kind: 'repeat', icon: 'repeat', text: 'Every ' + rep[1].toLowerCase() })
  }

  // The time goes first so "5pm" is never mistaken for part of a date.
  const time = rest.match(TIME)
  const hm = time ? parseTimeFragment(time[1]) : null
  if (time && hm) {
    rest = rest.replace(time[0], ' ')
    out.time = hm
  }

  const day = rest.match(DAY_WORD) ?? rest.match(DAY_MONTH)
  if (day) {
    const word = day[1].toLowerCase()
    // "tonight" is today with an evening default; the date parser only knows
    // "today".
    const ymd = parseDateFragment(word === 'tonight' ? 'today' : word, now)
    if (ymd) {
      rest = rest.replace(day[0], ' ')
      out.date = ymd
      if (word === 'tonight' && !out.time) out.time = '20:00'
      const label = /^\d/.test(word) ? prettyDate(ymd, now) : titleCase(word)
      out.chips.push({ kind: 'date', icon: 'calendar', text: label })
    }
  }
  if (out.time) {
    out.chips.push({ kind: 'time', icon: 'clock', text: prettyTime(out.time) + ' reminder' })
  }

  out.title = rest.replace(/\s+/g, ' ').trim()
  return out
}

/**
 * When the reminder a quick add asks for should fire, as the local
 * 'YYYY-MM-DDTHH:mm' the reminders store keeps. A time with no date means
 * today (or tomorrow once that time has passed); a date with no time means
 * 9am that day. Null when the text named neither.
 */
export function quickAddReminderStart(q: QuickAdd, now: Date = new Date()): string | null {
  if (!q.date && !q.time) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = q.time ?? '09:00'
  let date = q.date
  if (!date) {
    const [h, m] = time.split(':').map(Number)
    const at = new Date(now)
    at.setHours(h, m, 0, 0)
    if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1)
    date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
  }
  return date + 'T' + time
}
