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

export function repFreqLabel(rep: Repeat | undefined): string {
  if (!rep || rep.type === 'none') return 'One-off'
  if (rep.type === 'weekdays') {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return (rep.weekdays || []).length
      ? (rep.weekdays || []).map((d) => names[d]).join(', ')
      : 'Weekdays'
  }
  const unit =
    ({ minutes: 'min', hours: 'hr', days: 'day', weeks: 'wk', months: 'mo', years: 'yr' } as Record<
      string,
      string
    >)[rep.type] || rep.type
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
