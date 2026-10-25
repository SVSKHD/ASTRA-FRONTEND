import { describe, expect, it } from 'vitest'
import {
  dayLabel,
  filterHistory,
  groupByDay,
  inHistory,
  toEntry,
  type HistorySource,
} from './historyItems'

const NOW = new Date(2026, 9, 21, 12).getTime()
const DAY = 86_400_000

const item = (over: Partial<HistorySource>): HistorySource => ({
  id: 1,
  status: 'done',
  tag: '',
  completedAt: NOW,
  archivedAt: null,
  ...over,
})

describe('inHistory', () => {
  it('takes done items and archived ones in any state', () => {
    expect(inHistory(item({}))).toBe(true)
    expect(inHistory(item({ status: 'pending', completedAt: null, archivedAt: NOW }))).toBe(true)
    expect(inHistory(item({ status: 'pending', completedAt: null }))).toBe(false)
  })
})

describe('filterHistory', () => {
  const entries = [
    toEntry(item({ id: 1, completedAt: NOW - DAY }), 'Write report'),
    toEntry(item({ id: 2, completedAt: NOW, archivedAt: NOW, tag: 'gold' }), 'Backtest EMA'),
    toEntry(
      item({ id: 3, status: 'pending', completedAt: null, archivedAt: NOW - 2 * DAY }),
      'Old idea',
    ),
  ]
  it('splits completed (still listed) from archived, newest first', () => {
    expect(filterHistory(entries, 'all', '').map((e) => e.id)).toEqual([2, 1, 3])
    expect(filterHistory(entries, 'completed', '').map((e) => e.id)).toEqual([1])
    expect(filterHistory(entries, 'archived', '').map((e) => e.id)).toEqual([2, 3])
  })
  it('searches titles and tags', () => {
    expect(filterHistory(entries, 'all', 'GOLD').map((e) => e.id)).toEqual([2])
    expect(filterHistory(entries, 'all', 'report').map((e) => e.id)).toEqual([1])
  })
})

describe('grouping', () => {
  it('labels today and yesterday and groups by day', () => {
    expect(dayLabel(NOW, NOW)).toBe('Today')
    expect(dayLabel(NOW - DAY, NOW)).toBe('Yesterday')
    const groups = groupByDay(
      [
        toEntry(item({ id: 1, completedAt: NOW }), 'a'),
        toEntry(item({ id: 2, completedAt: NOW - 1000 }), 'b'),
        toEntry(item({ id: 3, completedAt: NOW - DAY }), 'c'),
      ],
      NOW,
    )
    expect(groups.map((g) => [g.label, g.entries.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
    ])
  })
})
