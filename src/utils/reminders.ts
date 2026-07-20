import type { Reminder, Repeat } from '@/types'

export interface Occurrences {
  last: number | null
  next: number | null
}

// Compute the last (<= now) and next (> now) occurrence of a reminder.
// Ported from the design's occurrences().
export function occurrences(r: Reminder, now: number, maxSteps = 2000): Occurrences {
  let cursor = new Date(r.start).getTime()
  if (isNaN(cursor)) return { last: null, next: null }
  const rep: Repeat = r.repeat || { type: 'none' }
  if (rep.type === 'none') {
    return { last: cursor <= now ? cursor : null, next: cursor > now ? cursor : null }
  }
  let last: number | null = null
  let next: number | null = null
  let steps = 0
  while (steps++ < maxSteps) {
    if (rep.type === 'weekdays') {
      const d = new Date(cursor)
      if ((rep.weekdays || []).indexOf(d.getDay()) !== -1) {
        if (cursor <= now) last = cursor
        else {
          next = cursor
          break
        }
      }
      cursor += 86400000
    } else {
      if (cursor <= now) last = cursor
      else {
        next = cursor
        break
      }
      const n = rep.n || 1
      if (rep.type === 'minutes') cursor += 60000 * n
      else if (rep.type === 'hours') cursor += 3600000 * n
      else if (rep.type === 'days') cursor += 86400000 * n
      else if (rep.type === 'weeks') cursor += 604800000 * n
      else if (rep.type === 'months') {
        const dt = new Date(cursor)
        dt.setMonth(dt.getMonth() + n)
        cursor = dt.getTime()
      } else if (rep.type === 'years') {
        const dt = new Date(cursor)
        dt.setFullYear(dt.getFullYear() + n)
        cursor = dt.getTime()
      } else break
    }
  }
  return { last, next }
}

// Fixed-width repeat units, in ms. months/years are absent on purpose: they are
// calendar steps, not fixed durations.
const FIXED_STEP_MS: Partial<Record<Repeat['type'], number>> = {
  minutes: 60000,
  hours: 3600000,
  days: 86400000,
  weeks: 604800000,
}

// Every occurrence of `r` falling in [from, to], oldest first.
//
// `occurrences()` above answers "last and next"; this answers "the whole
// series", which is what the reminders timeline renders. For fixed-width
// repeats the first in-window occurrence is computed arithmetically rather than
// stepped to, so a minutes-repeat starting years ago stays cheap instead of
// burning through the step budget before reaching the window.
//
// Note: day/week stepping adds fixed milliseconds, so an occurrence crossing a
// DST boundary shifts by an hour in local time. That matches how occurrences()
// has always behaved; changing it would move existing reminders.
export function occurrencesBetween(
  r: Reminder,
  from: number,
  to: number,
  maxResults = 400,
  maxSteps = 20000,
): number[] {
  const startMs = new Date(r.start).getTime()
  if (isNaN(startMs) || to < from) return []
  const rep: Repeat = r.repeat || { type: 'none' }
  const out: number[] = []

  if (rep.type === 'none') {
    if (startMs >= from && startMs <= to) out.push(startMs)
    return out
  }

  const n = Math.max(1, rep.n || 1)
  let cursor = startMs

  const unit = FIXED_STEP_MS[rep.type]
  if (unit) {
    const stepMs = unit * n
    if (cursor < from) cursor += Math.ceil((from - cursor) / stepMs) * stepMs
    while (cursor <= to && out.length < maxResults) {
      out.push(cursor)
      cursor += stepMs
    }
    return out
  }

  if (rep.type === 'weekdays') {
    const days = rep.weekdays || []
    if (!days.length) return []
    // Skip whole days at a time to reach the window, then test each day.
    if (cursor < from) cursor += Math.floor((from - cursor) / 86400000) * 86400000
    for (let i = 0; i < maxSteps && cursor <= to && out.length < maxResults; i++) {
      if (cursor >= from && days.indexOf(new Date(cursor).getDay()) !== -1) out.push(cursor)
      cursor += 86400000
    }
    return out
  }

  // months / years: calendar arithmetic, few enough steps to walk directly.
  for (let i = 0; i < maxSteps && out.length < maxResults; i++) {
    if (cursor > to) break
    if (cursor >= from) out.push(cursor)
    const dt = new Date(cursor)
    if (rep.type === 'months') dt.setMonth(dt.getMonth() + n)
    else if (rep.type === 'years') dt.setFullYear(dt.getFullYear() + n)
    else break
    cursor = dt.getTime()
  }
  return out
}

// The next `count` occurrences at or after `from`, oldest first.
//
// occurrencesBetween() answers "what falls inside this window", which on an
// individual reminder page yields however many happen to land before the end of
// the year — one, for a slow repeat started late in December. This answers the
// question that page actually asks: "when does this fire next, and the eleven
// times after that", so the count is stable regardless of where in the calendar
// the reminder starts.
export function upcomingOccurrences(
  r: Reminder,
  from: number,
  count = 12,
  maxSteps = 20000,
): number[] {
  const startMs = new Date(r.start).getTime()
  if (isNaN(startMs) || count <= 0) return []
  const rep: Repeat = r.repeat || { type: 'none' }
  const out: number[] = []

  if (rep.type === 'none') return startMs >= from ? [startMs] : []

  const n = Math.max(1, rep.n || 1)
  let cursor = startMs

  const unit = FIXED_STEP_MS[rep.type]
  if (unit) {
    const stepMs = unit * n
    if (cursor < from) cursor += Math.ceil((from - cursor) / stepMs) * stepMs
    while (out.length < count) {
      out.push(cursor)
      cursor += stepMs
    }
    return out
  }

  if (rep.type === 'weekdays') {
    const days = rep.weekdays || []
    if (!days.length) return []
    if (cursor < from) cursor += Math.floor((from - cursor) / 86400000) * 86400000
    for (let i = 0; i < maxSteps && out.length < count; i++) {
      if (cursor >= from && days.indexOf(new Date(cursor).getDay()) !== -1) out.push(cursor)
      cursor += 86400000
    }
    return out
  }

  for (let i = 0; i < maxSteps && out.length < count; i++) {
    if (cursor >= from) out.push(cursor)
    const dt = new Date(cursor)
    if (rep.type === 'months') dt.setMonth(dt.getMonth() + n)
    else if (rep.type === 'years') dt.setFullYear(dt.getFullYear() + n)
    else break
    cursor = dt.getTime()
  }
  return out
}

export function repFreqLabel(rep: Repeat | undefined): string {
  if (!rep || rep.type === 'none') return 'One-off'
  if (rep.type === 'weekdays') {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return (rep.weekdays || []).length
      ? (rep.weekdays || []).map((d) => names[d]).join(', ')
      : 'Weekdays'
  }
  const unit =
    (
      {
        minutes: 'min',
        hours: 'hr',
        days: 'day',
        weeks: 'wk',
        months: 'mo',
        years: 'yr',
      } as Record<string, string>
    )[rep.type] || rep.type
  const n = rep.n || 1
  return 'Every ' + n + ' ' + unit + (n > 1 ? 's' : '')
}

// Build a Google Calendar "add event" URL with an optional RRULE.
export function buildGCalUrl(r: Reminder): string {
  const start = new Date(r.start)
  const end = new Date(start.getTime() + 30 * 60000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const rep: Repeat = r.repeat || { type: 'none' }
  const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
  let recur = ''
  const n = rep.n || 1
  if (rep.type === 'minutes') recur = 'RRULE:FREQ=MINUTELY;INTERVAL=' + n
  else if (rep.type === 'hours') recur = 'RRULE:FREQ=HOURLY;INTERVAL=' + n
  else if (rep.type === 'days') recur = 'RRULE:FREQ=DAILY;INTERVAL=' + n
  else if (rep.type === 'weeks') recur = 'RRULE:FREQ=WEEKLY;INTERVAL=' + n
  else if (rep.type === 'months') recur = 'RRULE:FREQ=MONTHLY;INTERVAL=' + n
  else if (rep.type === 'years') recur = 'RRULE:FREQ=YEARLY;INTERVAL=' + n
  else if (rep.type === 'weekdays')
    recur = 'RRULE:FREQ=WEEKLY;BYDAY=' + (rep.weekdays || []).map((d) => days[d]).join(',')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: r.title,
    dates: fmt(start) + '/' + fmt(end),
    details: r.note || '',
  })
  let url = 'https://calendar.google.com/calendar/render?' + params.toString()
  if (recur) url += '&recur=' + encodeURIComponent(recur)
  return url
}
