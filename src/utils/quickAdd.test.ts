import { describe, expect, it } from 'vitest'
import { parseQuickAdd, quickAddReminderStart } from '@/utils/quickAdd'

// A Wednesday, mid-morning, so "fri" and "tomorrow" land on known days.
const NOW = new Date(2026, 8, 23, 10, 0)

describe('parseQuickAdd', () => {
  it('takes every token out of the title', () => {
    const q = parseQuickAdd('Fix checkout bug tomorrow 5pm #Frontend !high', NOW)
    expect(q.title).toBe('Fix checkout bug')
    expect(q.tag).toBe('Frontend')
    expect(q.priority).toBe('high')
    expect(q.date).toBe('2026-09-24')
    expect(q.time).toBe('17:00')
    expect(q.chips.map((c) => c.kind)).toEqual(['tag', 'priority', 'date', 'time'])
  })

  it('reads weekdays, day + month and minutes', () => {
    expect(parseQuickAdd('Call vendor fri 5:30 pm', NOW)).toMatchObject({
      title: 'Call vendor',
      date: '2026-09-25',
      time: '17:30',
    })
    expect(parseQuickAdd('Renew AMC 12 oct', NOW)).toMatchObject({
      title: 'Renew AMC',
      date: '2026-10-12',
    })
  })

  it('maps recurrence onto the reminder repeat model', () => {
    const q = parseQuickAdd('Standup every day 9am', NOW)
    expect(q.repeat).toBe('days')
    expect(q.title).toBe('Standup')
  })

  it('only consumes the first match of a kind', () => {
    const q = parseQuickAdd('#a talk about #b', NOW)
    expect(q.tag).toBe('a')
    expect(q.title).toBe('talk about #b')
  })

  it('leaves a plain title alone', () => {
    const q = parseQuickAdd('Write the monthly report', NOW)
    expect(q.title).toBe('Write the monthly report')
    expect(q.chips).toEqual([])
  })

  it('does not eat a word that merely starts like a weekday', () => {
    expect(parseQuickAdd('Update Sundays menu', NOW).date).toBeNull()
  })
})

describe('quickAddReminderStart', () => {
  it('is null without a date or time', () => {
    expect(quickAddReminderStart(parseQuickAdd('x', NOW), NOW)).toBeNull()
  })
  it('defaults a bare date to 9am', () => {
    expect(quickAddReminderStart(parseQuickAdd('x tomorrow', NOW), NOW)).toBe('2026-09-24T09:00')
  })
  it('puts a passed bare time on tomorrow', () => {
    expect(quickAddReminderStart(parseQuickAdd('x 8am', NOW), NOW)).toBe('2026-09-24T08:00')
    expect(quickAddReminderStart(parseQuickAdd('x 5pm', NOW), NOW)).toBe('2026-09-23T17:00')
  })
})
