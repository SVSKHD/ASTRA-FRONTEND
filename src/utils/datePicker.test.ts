import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  announce,
  clampDate,
  formatDisplay,
  isDateDisabled,
  joinValue,
  monthMatrix,
  nearestTimeOption,
  nextEnabled,
  nextRange,
  normalizeRange,
  rangeContains,
  shiftFocus,
  splitValue,
  timeOptions,
  weekdayLabels,
} from './datePicker'

describe('date arithmetic', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('clamps a month step into the target month rather than rolling over', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29')
    expect(addMonths('2024-06-15', 2)).toBe('2024-08-15')
  })

  it('leaves a malformed value alone', () => {
    expect(addDays('not-a-date', 1)).toBe('not-a-date')
  })
})

describe('value shapes', () => {
  it('splits and rejoins every mode losslessly', () => {
    expect(splitValue('date', '2024-06-12')).toEqual({ date: '2024-06-12', time: null })
    expect(splitValue('datetime', '2024-06-12T18:30')).toEqual({
      date: '2024-06-12',
      time: '18:30',
    })
    expect(splitValue('time', '18:30')).toEqual({ date: null, time: '18:30' })
    expect(splitValue('month', '2024-06')).toEqual({ date: '2024-06-01', time: null })

    expect(joinValue('date', '2024-06-12', null)).toBe('2024-06-12')
    expect(joinValue('datetime', '2024-06-12', '18:30')).toBe('2024-06-12T18:30')
    expect(joinValue('time', null, '18:30')).toBe('18:30')
    expect(joinValue('month', '2024-06-01', null)).toBe('2024-06')
  })

  it('defaults a datetime with no time to a working hour', () => {
    expect(joinValue('datetime', '2024-06-12', null)).toBe('2024-06-12T09:00')
  })

  it('reads an empty or malformed value as nothing selected', () => {
    expect(splitValue('date', '')).toEqual({ date: null, time: null })
    expect(splitValue('date', 'garbage')).toEqual({ date: null, time: null })
    expect(joinValue('date', null, null)).toBe('')
  })

  it('tolerates a datetime carrying seconds', () => {
    expect(splitValue('datetime', '2024-06-12T18:30:45').time).toBe('18:30')
  })
})

describe('monthMatrix', () => {
  const weeks = monthMatrix('2024-06-12', 1, '2024-06-12')

  it('is always six weeks of seven days, so the grid never changes height', () => {
    expect(weeks).toHaveLength(6)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
  })

  it('starts on the configured first day of the week', () => {
    // 2024-06-01 is a Saturday; a Monday-first grid starts on 27 May.
    expect(weeks[0][0].ymd).toBe('2024-05-27')
    expect(monthMatrix('2024-06-12', 0, '2024-06-12')[0][0].ymd).toBe('2024-05-26')
  })

  it('marks in-month, today and weekend cells', () => {
    const all = weeks.flat()
    expect(all.find((c) => c.ymd === '2024-05-27')?.inMonth).toBe(false)
    expect(all.find((c) => c.ymd === '2024-06-12')?.inMonth).toBe(true)
    expect(all.find((c) => c.ymd === '2024-06-12')?.isToday).toBe(true)
    expect(all.find((c) => c.ymd === '2024-06-15')?.weekend).toBe(true)
  })

  it('labels weekdays from the configured start', () => {
    expect(weekdayLabels(1)[0]).toBe('Mon')
    expect(weekdayLabels(0)[0]).toBe('Sun')
  })
})

describe('keyboard navigation', () => {
  it('moves by day and by week with the arrows', () => {
    expect(shiftFocus('2024-06-12', 'ArrowLeft')).toBe('2024-06-11')
    expect(shiftFocus('2024-06-12', 'ArrowRight')).toBe('2024-06-13')
    expect(shiftFocus('2024-06-12', 'ArrowUp')).toBe('2024-06-05')
    expect(shiftFocus('2024-06-12', 'ArrowDown')).toBe('2024-06-19')
  })

  it('moves by month with PageUp and PageDown', () => {
    expect(shiftFocus('2024-06-12', 'PageUp')).toBe('2024-05-12')
    expect(shiftFocus('2024-06-12', 'PageDown')).toBe('2024-07-12')
  })

  it('jumps to the start and end of the week', () => {
    // Wednesday, Monday-first week.
    expect(shiftFocus('2024-06-12', 'Home', 1)).toBe('2024-06-10')
    expect(shiftFocus('2024-06-12', 'End', 1)).toBe('2024-06-16')
    expect(shiftFocus('2024-06-12', 'Home', 0)).toBe('2024-06-09')
  })

  it('ignores a key it does not own', () => {
    expect(shiftFocus('2024-06-12', 'a')).toBe('2024-06-12')
  })
})

describe('availability', () => {
  const rules = { min: '2024-06-10', max: '2024-06-20', disabledDates: ['2024-06-15'] }

  it('blocks outside the bounds and on a listed date', () => {
    expect(isDateDisabled('2024-06-09', rules)).toBe(true)
    expect(isDateDisabled('2024-06-21', rules)).toBe(true)
    expect(isDateDisabled('2024-06-15', rules)).toBe(true)
    expect(isDateDisabled('2024-06-12', rules)).toBe(false)
  })

  it('allows everything when no rules are given', () => {
    expect(isDateDisabled('1999-01-01')).toBe(false)
  })

  it('clamps a candidate into the bounds', () => {
    expect(clampDate('2024-06-01', rules)).toBe('2024-06-10')
    expect(clampDate('2024-06-30', rules)).toBe('2024-06-20')
    expect(clampDate('2024-06-12', rules)).toBe('2024-06-12')
  })

  it('steps over blocked days to the next allowed one', () => {
    expect(nextEnabled('2024-06-15', 1, rules)).toBe('2024-06-16')
    expect(nextEnabled('2024-06-12', 1, rules)).toBe('2024-06-12')
  })

  it('gives up rather than spinning when everything is blocked', () => {
    expect(nextEnabled('2024-06-12', 1, { max: '2024-06-01' }, 10)).toBeNull()
  })
})

describe('presets and time steps', () => {
  it('offers quarter-hour steps across the whole day', () => {
    const options = timeOptions(15)
    expect(options).toHaveLength(96)
    expect(options[0]).toBe('00:00')
    expect(options[options.length - 1]).toBe('23:45')
  })

  it('snaps a time to the nearest step', () => {
    expect(nearestTimeOption('18:37')).toBe('18:30')
    expect(nearestTimeOption('18:38')).toBe('18:45')
    expect(nearestTimeOption(null)).toBe('09:00')
  })

  it('never snaps past the end of the day', () => {
    expect(nearestTimeOption('23:59')).toBe('23:45')
  })
})

describe('ranges', () => {
  it('stores a backwards selection start-first', () => {
    expect(normalizeRange({ start: '2024-06-20', end: '2024-06-10' })).toEqual({
      start: '2024-06-10',
      end: '2024-06-20',
    })
  })

  it('reports containment inclusively', () => {
    const range = { start: '2024-06-10', end: '2024-06-12' }
    expect(rangeContains(range, '2024-06-10')).toBe(true)
    expect(rangeContains(range, '2024-06-11')).toBe(true)
    expect(rangeContains(range, '2024-06-13')).toBe(false)
    expect(rangeContains({ start: '2024-06-10', end: null }, '2024-06-10')).toBe(false)
  })

  it('walks start → end → restart across clicks', () => {
    let range = nextRange({ start: null, end: null }, '2024-06-10')
    expect(range).toEqual({ start: '2024-06-10', end: null })
    range = nextRange(range, '2024-06-12')
    expect(range).toEqual({ start: '2024-06-10', end: '2024-06-12' })
    range = nextRange(range, '2024-06-20')
    expect(range).toEqual({ start: '2024-06-20', end: null })
  })
})

describe('display', () => {
  it('shows nothing for an empty value', () => {
    expect(formatDisplay('date', null)).toBe('')
    expect(formatDisplay('range', { start: null, end: null })).toBe('')
  })

  it('appends the time in datetime mode', () => {
    expect(formatDisplay('datetime', '2024-06-12T18:30')).toContain('18:30')
  })

  it('shows a range as from – to, and a half-range as just the start', () => {
    expect(formatDisplay('range', { start: '2024-06-10', end: '2024-06-12' })).toContain('–')
    expect(formatDisplay('range', { start: '2024-06-10', end: null })).not.toContain('–')
  })

  it('passes a time through unchanged', () => {
    expect(formatDisplay('time', '18:30')).toBe('18:30')
  })

  it('announces the focused date, and says when it is unavailable', () => {
    expect(announce('2024-06-12', false)).toContain('June')
    expect(announce('2024-06-12', true)).toContain('unavailable')
    expect(announce('nope', false)).toBe('')
  })
})
