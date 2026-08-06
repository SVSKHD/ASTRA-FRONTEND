import { describe, expect, it } from 'vitest'
import { splitList, ageChip, oldestFromLabel, localDayKey } from '@/utils/listSplit'

interface Row {
  id: number
  status: 'pending' | 'progress' | 'done'
  day: string // the row's own day key
  completedAt: number | null
}

const TODAY = '2026-08-06'

function row(
  id: number,
  status: Row['status'],
  day: string,
  completedAt: number | null = null,
): Row {
  return { id, status, day, completedAt }
}

function split(rows: Row[], extra: Partial<Parameters<typeof splitList<Row>>[1]> = {}) {
  return splitList(rows, {
    isDone: (r) => r.status === 'done',
    isCarried: (r) => r.status !== 'done' && !!r.day && r.day < TODAY,
    completedAt: (r) => r.completedAt,
    ...extra,
  })
}

describe('splitList', () => {
  it('separates carried-over, active and completed', () => {
    const rows = [
      row(1, 'pending', TODAY),
      row(2, 'pending', '2026-08-01'), // carried
      row(3, 'done', TODAY, 1000),
      row(4, 'progress', '2026-07-18'), // carried
      row(5, 'progress', TODAY),
    ]
    const r = split(rows)
    expect(r.carriedOver.map((x) => x.id)).toEqual([2, 4])
    expect(r.active.map((x) => x.id)).toEqual([1, 5])
    expect(r.completed.map((x) => x.id)).toEqual([3])
  })

  it('reports the progress tally as done/total with a rounded percent', () => {
    // 7 done out of 18 total → 39%.
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => row(i + 1, 'done', TODAY, i)),
      ...Array.from({ length: 11 }, (_, i) => row(100 + i, 'pending', TODAY)),
    ]
    const r = split(rows)
    expect(r.stats).toEqual({ done: 7, total: 18, pct: 39 })
  })

  it('percent is 0 when the list is empty', () => {
    expect(split([]).stats).toEqual({ done: 0, total: 0, pct: 0 })
  })

  it('collapses many past days into one carried-over run with no grouping', () => {
    const rows = [
      row(1, 'pending', '2026-08-05'),
      row(2, 'pending', '2026-07-30'),
      row(3, 'pending', '2026-08-02'),
      row(4, 'pending', '2026-07-18'),
      row(5, 'pending', '2026-08-04'),
    ]
    const r = split(rows)
    // All five land in the single carried run — no per-day sub-lists.
    expect(r.carriedOver).toHaveLength(5)
    expect(r.active).toHaveLength(0)
  })

  it('with a Today filter, Completed shows only what completed today', () => {
    const todayMs = new Date(TODAY + 'T09:00:00').getTime()
    const yesterdayMs = new Date('2026-08-05T09:00:00').getTime()
    const rows = [
      row(1, 'done', TODAY, todayMs),
      row(2, 'done', '2026-08-05', yesterdayMs),
      row(3, 'pending', TODAY),
    ]
    const r = split(rows, { completedOnDay: TODAY })
    expect(r.completed.map((x) => x.id)).toEqual([1])
    // The one not-shown completion still leaves the total counting today's scope.
    expect(r.stats.done).toBe(1)
  })

  it('excludes archived items from every region', () => {
    const rows = [row(1, 'done', TODAY, 1000), row(2, 'pending', TODAY)]
    const r = split(rows, { archivedAt: (x) => (x.id === 1 ? 5000 : null) })
    expect(r.completed).toHaveLength(0)
    expect(r.stats.total).toBe(1)
  })

  it('sorts Completed most-recent-first when asked', () => {
    const rows = [
      row(1, 'done', TODAY, 100),
      row(2, 'done', TODAY, 300),
      row(3, 'done', TODAY, 200),
    ]
    const r = split(rows, { completedSort: 'recent' })
    expect(r.completed.map((x) => x.id)).toEqual([2, 3, 1])
  })
})

describe('ageChip', () => {
  it('renders whole-day ages, floored at today', () => {
    expect(ageChip('2026-08-01', TODAY)).toBe('5d')
    expect(ageChip('2026-08-05', TODAY)).toBe('1d')
    expect(ageChip(TODAY, TODAY)).toBe('today')
    expect(ageChip('', TODAY)).toBe('')
  })
})

describe('oldestFromLabel', () => {
  it('names the oldest day present', () => {
    expect(oldestFromLabel(['2026-08-05', '2026-07-18', '2026-08-01'])).toBe('oldest from Jul 18')
    expect(oldestFromLabel([])).toBe('')
  })
})

describe('localDayKey', () => {
  it('is a local YYYY-MM-DD', () => {
    const ms = new Date('2026-08-06T13:30:00').getTime()
    expect(localDayKey(ms)).toBe('2026-08-06')
  })
})
