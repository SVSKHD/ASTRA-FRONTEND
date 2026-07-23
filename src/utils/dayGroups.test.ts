import { describe, expect, it } from 'vitest'
import { buildDayGroups, countByStatus, stampOnDay, ymd } from './dayGroups'
import type { ItemStatus } from '@/types'

const NOW = new Date(2026, 6, 22, 21, 30) // 22 Jul 2026, late enough to catch a UTC slip

function item(status: ItemStatus, date: string) {
  return { status, date }
}
const dateOf = (i: { date: string }) => i.date

describe('ymd', () => {
  it('uses the local calendar day, not UTC', () => {
    expect(ymd(NOW)).toBe('2026-07-22')
  })
})

describe('stampOnDay', () => {
  const yesterday = new Date(2026, 6, 21, 9, 14, 5, 250).getTime()

  it('moves a stamp to another day and keeps its time of day', () => {
    const moved = new Date(stampOnDay('2026-07-22', yesterday))
    expect(ymd(moved)).toBe('2026-07-22')
    expect([moved.getHours(), moved.getMinutes(), moved.getSeconds()]).toEqual([9, 14, 5])
  })

  it('lands in the day it was given, not a UTC-shifted one', () => {
    const lateEvening = new Date(2026, 6, 21, 23, 40).getTime()
    expect(ymd(new Date(stampOnDay('2026-07-22', lateEvening)))).toBe('2026-07-22')
  })

  it('uses the current clock when the source stamp is unknown', () => {
    const moved = new Date(stampOnDay('2026-07-22', 0, NOW))
    expect([moved.getHours(), moved.getMinutes()]).toEqual([21, 30])
  })

  it('maps the undated bucket back to the unknown sentinel', () => {
    expect(stampOnDay('', yesterday)).toBe(0)
  })
})

describe('countByStatus', () => {
  it('tallies each state', () => {
    const counts = countByStatus([
      item('pending', ''),
      item('pending', ''),
      item('progress', ''),
      item('done', ''),
    ])
    expect(counts).toEqual({ pending: 2, progress: 1, done: 1 })
  })

  it('counts an unrecognised state as pending rather than dropping it', () => {
    const counts = countByStatus([{ status: 'bogus' as ItemStatus }])
    expect(counts).toEqual({ pending: 1, progress: 0, done: 0 })
  })
})

describe('buildDayGroups — forward (tasks)', () => {
  const opts = {
    direction: 'future' as const,
    undatedLabel: 'No date',
    keepEmptyUndated: true,
    now: NOW,
  }

  it('always shows today, then tomorrow, then later days ascending, then undated', () => {
    const groups = buildDayGroups(
      [
        item('pending', '2026-07-25'),
        item('done', '2026-07-23'),
        item('progress', '2026-07-24'),
        item('pending', ''),
      ],
      dateOf,
      opts,
    )
    expect(groups.map((g) => g.label)).toEqual([
      'Today',
      'Tomorrow',
      'Fri, Jul 24',
      'Sat, Jul 25',
      'No date',
    ])
    expect(groups[0].total).toBe(0)
    expect(groups[1].counts).toEqual({ pending: 0, progress: 0, done: 1 })
  })

  it('keeps the undated bucket as a drop target even when empty', () => {
    const groups = buildDayGroups([], dateOf, opts)
    expect(groups.map((g) => g.key)).toEqual(['today', 'nodate'])
  })
})

describe('buildDayGroups — backward (todos)', () => {
  const opts = { direction: 'past' as const, undatedLabel: 'Undated', now: NOW }

  it('shows today, then yesterday, then older days descending', () => {
    const groups = buildDayGroups(
      [
        item('pending', '2026-07-20'),
        item('done', '2026-07-21'),
        item('progress', '2026-07-22'),
        item('pending', '2026-07-18'),
      ],
      dateOf,
      opts,
    )
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Mon, Jul 20', 'Sat, Jul 18'])
    expect(groups[0].counts).toEqual({ pending: 0, progress: 1, done: 0 })
  })

  it('drops the undated bucket when nothing is undated', () => {
    const groups = buildDayGroups([item('pending', '2026-07-22')], dateOf, opts)
    expect(groups.map((g) => g.key)).toEqual(['today'])
  })

  it('keeps the undated bucket when something lands in it', () => {
    const groups = buildDayGroups([item('pending', '')], dateOf, opts)
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Undated'])
  })
})
