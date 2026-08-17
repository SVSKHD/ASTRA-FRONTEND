import { describe, expect, it } from 'vitest'
import { hmOf, parseDateFragment, parseTimeFragment, parseTypedInput, ymdOf } from './dateParse'

// A Wednesday, so weekday arithmetic is checkable in both directions.
const NOW = new Date(2024, 5, 12, 9, 30) // 2024-06-12 09:30

describe('parseTimeFragment', () => {
  it('reads 12-hour times with and without minutes', () => {
    expect(parseTimeFragment('6pm')).toBe('18:00')
    expect(parseTimeFragment('6:30 pm')).toBe('18:30')
    expect(parseTimeFragment('12am')).toBe('00:00')
    expect(parseTimeFragment('12pm')).toBe('12:00')
  })

  it('reads 24-hour times, including a bare four-digit clock', () => {
    expect(parseTimeFragment('18:30')).toBe('18:30')
    expect(parseTimeFragment('9:05')).toBe('09:05')
    expect(parseTimeFragment('1830')).toBe('18:30')
  })

  it('leaves a bare day number alone rather than reading it as an hour', () => {
    expect(parseTimeFragment('25')).toBeNull()
    expect(parseTimeFragment('7')).toBeNull()
  })

  it('rejects impossible clock values', () => {
    expect(parseTimeFragment('25:00')).toBeNull()
    expect(parseTimeFragment('12:75')).toBeNull()
    expect(parseTimeFragment('13pm')).toBeNull()
    expect(parseTimeFragment('')).toBeNull()
  })
})

describe('parseDateFragment — relative', () => {
  it('reads today, tomorrow and their abbreviations', () => {
    expect(parseDateFragment('today', NOW)).toBe('2024-06-12')
    expect(parseDateFragment('tomorrow', NOW)).toBe('2024-06-13')
    expect(parseDateFragment('tmrw', NOW)).toBe('2024-06-13')
    expect(parseDateFragment('yesterday', NOW)).toBe('2024-06-11')
  })

  it('reads "in N days/weeks/months"', () => {
    expect(parseDateFragment('in 3 days', NOW)).toBe('2024-06-15')
    expect(parseDateFragment('in 2 weeks', NOW)).toBe('2024-06-26')
    expect(parseDateFragment('in a month', NOW)).toBe('2024-07-12')
  })

  it('reads next week and next month', () => {
    expect(parseDateFragment('next week', NOW)).toBe('2024-06-19')
    expect(parseDateFragment('next month', NOW)).toBe('2024-07-12')
  })

  it('reads a weekday as its next occurrence, never today', () => {
    // NOW is a Wednesday.
    expect(parseDateFragment('friday', NOW)).toBe('2024-06-14')
    expect(parseDateFragment('next mon', NOW)).toBe('2024-06-17')
    expect(parseDateFragment('wed', NOW)).toBe('2024-06-19')
  })
})

describe('parseDateFragment — explicit', () => {
  it('reads ISO exactly, with no day/month guessing', () => {
    expect(parseDateFragment('2026-12-25', NOW)).toBe('2026-12-25')
  })

  it('reads day-first numeric dates, inferring the year', () => {
    expect(parseDateFragment('25/12', NOW)).toBe('2024-12-25')
    expect(parseDateFragment('25.12.26', NOW)).toBe('2026-12-25')
    expect(parseDateFragment('1/3/2025', NOW)).toBe('2025-03-01')
  })

  it('recovers when the two numbers can only be one way round', () => {
    expect(parseDateFragment('12/25', NOW)).toBe('2024-12-25')
  })

  it('reads month names in either order', () => {
    expect(parseDateFragment('dec 25', NOW)).toBe('2024-12-25')
    expect(parseDateFragment('25 dec', NOW)).toBe('2024-12-25')
    expect(parseDateFragment('25 december 2026', NOW)).toBe('2026-12-25')
  })

  it('rejects a date that does not exist', () => {
    expect(parseDateFragment('31/02', NOW)).toBeNull()
    expect(parseDateFragment('2024-13-01', NOW)).toBeNull()
    expect(parseDateFragment('45/45', NOW)).toBeNull()
  })

  it('rejects noise rather than guessing', () => {
    expect(parseDateFragment('sometime soon', NOW)).toBeNull()
    expect(parseDateFragment('', NOW)).toBeNull()
  })
})

describe('parseTypedInput', () => {
  it('reads a date and a time together, in either order', () => {
    expect(parseTypedInput('tmrw 6pm', NOW)).toEqual({ date: '2024-06-13', time: '18:00' })
    expect(parseTypedInput('6pm tomorrow', NOW)).toEqual({ date: '2024-06-13', time: '18:00' })
    expect(parseTypedInput('25/12 18:30', NOW)).toEqual({ date: '2024-12-25', time: '18:30' })
  })

  it('reads a lone date or a lone time', () => {
    expect(parseTypedInput('in 3 days', NOW)).toEqual({ date: '2024-06-15', time: null })
    expect(parseTypedInput('6pm', NOW)).toEqual({ date: null, time: '18:00' })
  })

  it('keeps a multi-word relative phrase whole', () => {
    expect(parseTypedInput('next week', NOW)).toEqual({ date: '2024-06-19', time: null })
    expect(parseTypedInput('next monday 9am', NOW)).toEqual({
      date: '2024-06-17',
      time: '09:00',
    })
  })

  it('returns null for anything it does not confidently understand', () => {
    expect(parseTypedInput('whenever', NOW)).toBeNull()
    expect(parseTypedInput('   ', NOW)).toBeNull()
  })
})

describe('formatters', () => {
  it('formats a Date to the app’s stored strings', () => {
    expect(ymdOf(new Date(2024, 0, 5))).toBe('2024-01-05')
    expect(hmOf(new Date(2024, 0, 5, 7, 4))).toBe('07:04')
  })
})
