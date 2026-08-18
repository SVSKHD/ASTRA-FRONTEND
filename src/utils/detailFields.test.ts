import { describe, expect, it } from 'vitest'
import {
  daysRemaining,
  formatMinutes,
  fromLocalInput,
  parseMinutes,
  relativeStamp,
  statusWord,
  toLocalInput,
} from '@/utils/detailFields'

describe('epoch times and the picker', () => {
  it('shows the local wall clock, not UTC', () => {
    const at = new Date(2026, 2, 14, 9, 30).getTime()
    expect(toLocalInput(at)).toBe('2026-03-14T09:30')
  })

  it('pads every part', () => {
    expect(toLocalInput(new Date(2026, 0, 5, 7, 5).getTime())).toBe('2026-01-05T07:05')
  })

  it('is empty for an unscheduled item', () => {
    expect(toLocalInput(null)).toBe('')
    expect(toLocalInput(undefined)).toBe('')
    expect(toLocalInput(Number.NaN)).toBe('')
  })

  it('round-trips', () => {
    const at = new Date(2026, 6, 1, 18, 45).getTime()
    expect(fromLocalInput(toLocalInput(at))).toBe(at)
  })

  it('accepts a date with no time as midnight', () => {
    expect(fromLocalInput('2026-07-01')).toBe(new Date(2026, 6, 1, 0, 0).getTime())
  })

  it('is null rather than an invented time for anything it cannot read', () => {
    expect(fromLocalInput('')).toBe(null)
    expect(fromLocalInput('next tuesday')).toBe(null)
    expect(fromLocalInput('2026-13-45T99:99')).toBe(null)
    // The Date constructor would roll these over into a different, plausible
    // date rather than rejecting them.
    expect(fromLocalInput('2026-02-31')).toBe(null)
    expect(fromLocalInput('2026-04-31')).toBe(null)
  })
})

describe('durations', () => {
  it('reads back the way people say them', () => {
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(120)).toBe('2h')
    expect(formatMinutes(150)).toBe('2h 30m')
  })

  it('treats no estimate as no time', () => {
    expect(formatMinutes(null)).toBe('0m')
    expect(formatMinutes(undefined)).toBe('0m')
  })

  it('takes a bare number as minutes', () => {
    expect(parseMinutes('90')).toBe(90)
  })

  it('takes the shapes people actually type', () => {
    expect(parseMinutes('1h30')).toBe(90)
    expect(parseMinutes('1h 30m')).toBe(90)
    expect(parseMinutes('2h')).toBe(120)
    expect(parseMinutes('45m')).toBe(45)
    expect(parseMinutes('1.5h')).toBe(90)
  })

  it('is null for empty and for nonsense, leaving the stored value alone', () => {
    expect(parseMinutes('')).toBe(null)
    expect(parseMinutes('   ')).toBe(null)
    expect(parseMinutes('soon')).toBe(null)
  })

  it('never returns a negative duration', () => {
    expect(parseMinutes('-30')).toBe(null)
  })
})

describe('activity stamps', () => {
  const now = new Date(2026, 4, 20, 12, 0).getTime()

  it('is relative while relative is useful', () => {
    expect(relativeStamp(now - 10_000, now)).toBe('just now')
    expect(relativeStamp(now - 5 * 60_000, now)).toBe('5 minutes ago')
    expect(relativeStamp(now - 60_000, now)).toBe('1 minute ago')
    expect(relativeStamp(now - 3 * 3_600_000, now)).toBe('3 hours ago')
    expect(relativeStamp(now - 2 * 86_400_000, now)).toBe('2 days ago')
  })

  it('becomes a date once relative stops meaning anything', () => {
    const stamp = relativeStamp(now - 400 * 86_400_000, now)
    expect(stamp).not.toContain('ago')
    expect(stamp).toContain('2025')
  })

  it('says so when there is no stamp at all', () => {
    // Items written before timestamps existed read as 0, and claiming they
    // changed at hydrate time would be a lie.
    expect(relativeStamp(0, now)).toBe('Unknown')
    expect(relativeStamp(undefined, now)).toBe('Unknown')
  })
})

describe('days remaining', () => {
  const now = new Date(2026, 4, 20, 23, 30)

  it('counts forward', () => {
    expect(daysRemaining('2026-05-25', now)).toEqual({ text: '5 days left', tone: 'ahead' })
    expect(daysRemaining('2026-05-21', now)).toEqual({ text: '1 day left', tone: 'ahead' })
  })

  it('says today all day, not overdue from midnight', () => {
    expect(daysRemaining('2026-05-20', now)).toEqual({ text: 'due today', tone: 'today' })
  })

  it('counts back', () => {
    expect(daysRemaining('2026-05-19', now)).toEqual({ text: '1 day overdue', tone: 'overdue' })
    expect(daysRemaining('2026-05-10', now)).toEqual({ text: '10 days overdue', tone: 'overdue' })
  })

  it('is nothing without a target', () => {
    expect(daysRemaining('', now)).toBe(null)
    expect(daysRemaining('someday', now)).toBe(null)
  })
})

describe('status words', () => {
  it('spells out the statuses in the cycle', () => {
    expect(statusWord('progress')).toBe('In progress')
    expect(statusWord('done')).toBe('Done')
  })

  it('falls back to whatever a stored history contains', () => {
    expect(statusWord('blocked')).toBe('blocked')
  })
})
