// A five-field cron expression (minute hour day-of-month month day-of-week), read
// back in plain English for the Settings page: "Every day at 08:30 IST". The
// backend's schedules run in Asia/Kolkata (docs/26), so the words say IST.
//
// Only the shapes Aureon's schedules use are put into words; anything else is
// still accepted when it is well formed, and is shown as "Custom schedule". An
// empty value means the job is off.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const FIELD = /^(\*|\d+(-\d+)?(,\d+(-\d+)?)*)(\/\d+)?$/
const RANGES: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
]

/** Every number in a field (lists and ranges), or null for `*` or a step. */
function values(field: string): number[] | null {
  if (field === '*' || field.includes('/')) return null
  const out: number[] = []
  for (const part of field.split(',')) {
    const [a, b] = part.split('-').map(Number)
    if (b === undefined) out.push(a)
    else for (let i = a; i <= b; i++) out.push(i)
  }
  return out
}

/** Why the expression is not a valid five-field cron, or null when it is (or empty = off). */
export function cronError(expr: string): string | null {
  const parts = expr.trim().split(/\s+/)
  if (!expr.trim()) return null
  if (parts.length !== 5) return 'A schedule has five parts: minute hour day month weekday.'
  for (let i = 0; i < 5; i++) {
    if (!FIELD.test(parts[i])) return `Part ${i + 1} (“${parts[i]}”) is not a cron field.`
    const v = values(parts[i]) ?? []
    const [lo, hi] = RANGES[i]
    if (v.some((n) => n < lo || n > hi)) return `Part ${i + 1} must be between ${lo} and ${hi}.`
  }
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

function dayList(dow: number[]): string {
  const names = [...new Set(dow.map((d) => DAYS[d % 7]))]
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  if (names.length === 5 && weekdays.every((d) => names.includes(d))) return 'weekdays'
  if (names.length === 1) return names[0] + 's'
  return names.slice(0, -1).join(', ') + ' and ' + names.at(-1)
}

/** "Every day at 08:30 IST", "Sundays at 10:00 IST", "Off" for blank, "" when invalid. */
export function cronToWords(expr: string): string {
  if (!expr.trim()) return 'Off'
  if (cronError(expr)) return ''
  const [min, hour, dom, mon, dow] = expr.trim().split(/\s+/)
  const minutes = values(min)
  const hours = values(hour)
  // "*/15 * * * *" and friends.
  if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Every ${min.slice(2)} minutes`
  }
  if (min !== '*' && minutes?.length === 1 && hour === '*' && dom === '*' && mon === '*') {
    return dow === '*'
      ? `Every hour at :${pad(minutes[0])}`
      : `Every hour at :${pad(minutes[0])} on ${dayList(values(dow) ?? [])}`
  }
  if (!minutes || minutes.length !== 1 || !hours) return 'Custom schedule (IST)'
  const times = hours.map((h) => `${pad(h)}:${pad(minutes[0])}`).join(', ')
  if (mon !== '*') return `Custom schedule (IST)`
  if (dom === '*' && dow === '*') return `Every day at ${times} IST`
  if (dom === '*')
    return `${dayList(values(dow) ?? [])} at ${times} IST`.replace(/^./, (c) => c.toUpperCase())
  const days = values(dom)
  if (days?.length === 1 && dow === '*') return `Day ${days[0]} of each month at ${times} IST`
  return 'Custom schedule (IST)'
}
