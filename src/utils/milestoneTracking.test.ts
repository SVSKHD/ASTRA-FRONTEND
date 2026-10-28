import { describe, expect, it } from 'vitest'
import {
  formatKpiValue,
  kpiCurrent,
  kpiRatio,
  kpiTrend,
  kpisRatio,
  learningProgress,
  nextLocalId,
  normaliseKpis,
  normaliseLearnings,
} from '@/utils/milestoneTracking'
import type { GoalChecklistItem, Kpi } from '@/types'

function kpi(start: number, target: number, values: number[] = []): Kpi {
  return {
    id: 1,
    name: 'k',
    unit: '',
    start,
    target,
    entries: values.map((value, i) => ({ id: i + 1, at: i, value, note: '' })),
    createdAt: 0,
  }
}

describe('KPIs', () => {
  it('reads the latest entry as current, or the start with none', () => {
    expect(kpiCurrent(kpi(5, 10))).toBe(5)
    expect(kpiCurrent(kpi(0, 10, [3, 7]))).toBe(7)
  })

  it('measures progress from start to target', () => {
    expect(kpiRatio(kpi(0, 150, [42]))).toBeCloseTo(0.28)
    expect(kpiRatio(kpi(0, 10, [20]))).toBe(1)
    expect(kpiRatio(kpi(0, 10, [-5]))).toBe(0)
  })

  it('works for a KPI that should fall', () => {
    expect(kpiRatio(kpi(80, 70, [75]))).toBeCloseTo(0.5)
    // Falling is progress, so the trend is positive.
    expect(kpiTrend(kpi(80, 70, [78, 75]))).toBe(3)
  })

  it('treats a target equal to its start as met only when reached', () => {
    expect(kpiRatio(kpi(5, 5))).toBe(1)
    expect(kpiRatio(kpi(5, 5, [4]))).toBe(0)
  })

  it('has no trend without entries and averages a set', () => {
    expect(kpiTrend(kpi(0, 10))).toBeNull()
    expect(kpisRatio([])).toBeNull()
    expect(kpisRatio([kpi(0, 10, [10]), kpi(0, 10)])).toBe(0.5)
  })

  it('formats values short', () => {
    expect(formatKpiValue(42)).toBe('42')
    expect(formatKpiValue(0.256)).toBe('0.26')
    expect(formatKpiValue(15300)).toBe('15.3k')
  })

  it('sanitises stored KPIs, dropping junk entries and sorting by time', () => {
    const [k] = normaliseKpis([
      {
        id: 3,
        name: 'Solved',
        target: 150,
        entries: [{ at: 9, value: 2 }, { at: 1, value: 1 }, { value: 'x' }],
      },
    ])
    expect(k).toMatchObject({ id: 3, name: 'Solved', unit: '', start: 0, target: 150 })
    expect(k.entries.map((e) => e.value)).toEqual([1, 2])
    expect(normaliseKpis('nope')).toEqual([])
  })
})

describe('learnings', () => {
  const point = (learnings?: GoalChecklistItem['learnings']) =>
    ({ id: 1, learnings }) as GoalChecklistItem

  it('counts the points with something learnt', () => {
    const p = learningProgress([
      point([{ id: 1, text: 'a', createdAt: 0, examples: [{ id: 1, kind: 'code', body: 'x' }] }]),
      point([]),
      point(),
    ])
    expect(p).toEqual({ covered: 1, total: 3, ratio: 1 / 3, learnings: 1, examples: 1 })
    expect(learningProgress([]).ratio).toBe(0)
  })

  it('sanitises stored learnings', () => {
    const [l] = normaliseLearnings([
      { text: 'closures', examples: [{ kind: 'weird', body: 'b' }, 4] },
    ])
    expect(l).toEqual({
      id: 1,
      text: 'closures',
      createdAt: 0,
      examples: [{ id: 1, kind: 'text', body: 'b' }],
    })
  })

  it('hands out ids local to the list', () => {
    expect(nextLocalId([])).toBe(1)
    expect(nextLocalId([{ id: 4 }, { id: 2 }])).toBe(5)
  })
})
