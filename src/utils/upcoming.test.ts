import { describe, expect, it } from 'vitest'
import {
  upcomingReminders,
  nextBeyondWindow,
  relevantOccurrence,
  countdownClock,
  relLabel,
  ticksBySecond,
  bellChipLabel,
  soonestFireAmong,
  HOUR_MS,
  DAY_MS,
} from '@/utils/upcoming'
import type { Reminder, Repeat } from '@/types'

const NOW = new Date('2026-08-06T12:00:00').getTime()

function reminder(id: number, start: string, extra: Partial<Reminder> = {}): Reminder {
  return {
    id,
    title: 'R' + id,
    note: '',
    start,
    repeat: { type: 'none' } as Repeat,
    priority: 'normal',
    calSync: 'local',
    calEventId: null,
    lastFiredOcc: null,
    acknowledgedAt: null,
    sourceRef: null,
    cancelledAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }
}

// A `datetime-local` string N minutes from NOW — in LOCAL time, which is what
// that format means and what `upcoming.ts` parses it back as.
//
// This used to be `toISOString().slice(0, 16)`, which is UTC. The two agree
// only on a machine whose offset is zero, so these tests passed on CI and
// failed on any developer machine east or west of it — by exactly the offset.
// In IST that is five and a half hours, which turned "fires in 40 minutes"
// into "fired 4h50m ago" and read as a bug in the code under test.
function inMin(mins: number): string {
  const d = new Date(NOW + mins * 60000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

describe('upcomingReminders', () => {
  it('includes a reminder firing in 40 minutes and orders soonest first', () => {
    const list = upcomingReminders([reminder(1, inMin(40)), reminder(2, inMin(10))], NOW)
    expect(list.map((u) => u.reminder.id)).toEqual([2, 1])
    expect(list[1].ms).toBeGreaterThan(0)
    expect(list[1].overdue).toBe(false)
  })

  it('excludes reminders beyond the 24h window', () => {
    const list = upcomingReminders([reminder(1, inMin(60 * 25))], NOW)
    expect(list).toHaveLength(0)
  })

  it('keeps overdue-unacknowledged reminders pinned, ahead of upcoming ones', () => {
    const list = upcomingReminders([reminder(1, inMin(30)), reminder(2, inMin(-180))], NOW)
    expect(list[0].reminder.id).toBe(2)
    expect(list[0].overdue).toBe(true)
    expect(list[0].ms).toBeLessThan(0)
  })

  it('drops an overdue reminder once acknowledged for that occurrence', () => {
    const fired = reminder(2, inMin(-180), { acknowledgedAt: NOW - 60000 })
    expect(upcomingReminders([fired], NOW)).toHaveLength(0)
  })

  it('ignores cancelled reminders', () => {
    expect(upcomingReminders([reminder(1, inMin(30), { cancelledAt: NOW })], NOW)).toHaveLength(0)
  })

  it('caps the upcoming list at the limit but keeps all overdue', () => {
    const rems = [
      reminder(1, inMin(-10)),
      reminder(2, inMin(-20)),
      reminder(3, inMin(10)),
      reminder(4, inMin(20)),
      reminder(5, inMin(30)),
      reminder(6, inMin(40)),
    ]
    const list = upcomingReminders(rems, NOW, { limit: 3 })
    // 2 overdue (always) + 3 upcoming = 5.
    expect(list).toHaveLength(5)
    expect(list.filter((u) => u.overdue)).toHaveLength(2)
  })
})

describe('nextBeyondWindow', () => {
  it('finds the soonest fire strictly outside the window', () => {
    const at = nextBeyondWindow([reminder(1, inMin(30)), reminder(2, inMin(60 * 30))], NOW)
    expect(at).toBe(NOW + 60 * 30 * 60000)
  })
})

describe('relevantOccurrence', () => {
  it('prefers an overdue unacknowledged fire over the next occurrence', () => {
    const rep = reminder(1, inMin(-30), { repeat: { type: 'hours', n: 1 } })
    const rel = relevantOccurrence(rep, NOW)
    expect(rel?.overdue).toBe(true)
  })
})

describe('countdownClock', () => {
  it('shows MM:SS under an hour', () => {
    expect(countdownClock(40 * 60000 + 12000)).toBe('40:12')
    expect(countdownClock(9 * 1000)).toBe('0:09')
  })
  it('shows H/M under a day and D/H beyond', () => {
    expect(countdownClock(3 * HOUR_MS + 20 * 60000)).toBe('3h 20m')
    expect(countdownClock(2 * DAY_MS + 5 * HOUR_MS)).toBe('2d 5h')
  })
})

describe('relLabel', () => {
  it('renders coarse future and past labels', () => {
    expect(relLabel(3 * HOUR_MS)).toBe('in 3h')
    expect(relLabel(40 * 60000)).toBe('in 40m')
    expect(relLabel(-3 * HOUR_MS)).toBe('3h ago')
    expect(relLabel(30000)).toBe('now')
    expect(relLabel(-30000)).toBe('just now')
  })
})

describe('ticksBySecond', () => {
  it('is true only under an hour out', () => {
    expect(ticksBySecond(30 * 60000)).toBe(true)
    expect(ticksBySecond(2 * HOUR_MS)).toBe(false)
    expect(ticksBySecond(-5)).toBe(false)
  })
})

describe('bellChipLabel / soonestFireAmong', () => {
  it('labels the soonest reminder among ids', () => {
    const rems = [reminder(1, inMin(180)), reminder(2, inMin(60))]
    expect(bellChipLabel(rems, [1, 2], NOW)).toBe('in 1h')
    expect(soonestFireAmong(rems, [1, 2], NOW)).toBe(NOW + 60 * 60000)
  })
  it('returns null when no ids match', () => {
    expect(bellChipLabel([reminder(1, inMin(60))], [], NOW)).toBeNull()
  })
})
