import { describe, expect, it } from 'vitest'
import {
  closeBlockers,
  deadlineFrom,
  deadlineLabel,
  durationDays,
  emptyConclusion,
  isoWithOffset,
  milestoneProgress,
  milestoneState,
  pointComplete,
  pointProgress,
  weightedProgress,
} from '@/utils/milestoneProgress'
import type { Subtask } from '@/types'

const subs = (...done: boolean[]): Subtask[] =>
  done.map((completed, i) => ({ id: i + 1, title: `s${i}`, completed, completedAt: null }))

describe('progress', () => {
  it('counts a point by its subtasks, or as one unit without any', () => {
    expect(pointProgress({ done: false, subtasks: subs(true, false, true) })).toEqual({
      done: 2,
      total: 3,
      ratio: 2 / 3,
    })
    expect(pointProgress({ done: true })).toEqual({ done: 1, total: 1, ratio: 1 })
    expect(pointProgress({ done: false, subtasks: [] })).toEqual({ done: 0, total: 1, ratio: 0 })
  })

  it('marks a point complete only when every unit is checked', () => {
    expect(pointComplete({ done: true, subtasks: subs(true, false) })).toBe(false)
    expect(pointComplete({ done: false, subtasks: subs(true, true) })).toBe(true)
  })

  it('sums units across points rather than averaging percentages', () => {
    // 1 of 1 and 1 of 4 is 2 of 5 (40%), not the 62.5% an average would give.
    const p = milestoneProgress([
      { done: true },
      { done: false, subtasks: subs(true, false, false, false) },
    ])
    expect(p).toEqual({ done: 2, total: 5, ratio: 0.4 })
    expect(milestoneProgress([])).toEqual({ done: 0, total: 0, ratio: 0 })
  })

  it('weights a goal by its milestones’ real sizes', () => {
    expect(
      weightedProgress([
        { done: 1, total: 1, ratio: 1 },
        { done: 0, total: 9, ratio: 0 },
      ]).ratio,
    ).toBe(0.1)
  })
})

describe('state', () => {
  const p = (done: number, total: number) => ({ done, total, ratio: total ? done / total : 0 })
  it('derives overdue from an open milestone past its deadline', () => {
    expect(
      milestoneState({ targetDate: '2026-10-20', status: 'active' }, p(1, 4), '2026-10-27'),
    ).toBe('overdue')
    expect(
      milestoneState({ targetDate: '2026-10-27', status: 'active' }, p(0, 4), '2026-10-27'),
    ).toBe('not_started')
    expect(milestoneState({ targetDate: '', status: 'active' }, p(1, 4), '2026-10-27')).toBe(
      'in_progress',
    )
  })
  it('reads a milestone marked done before conclusions existed as closed', () => {
    expect(
      milestoneState({ targetDate: '2026-01-01', status: 'done' }, p(1, 4), '2026-10-27'),
    ).toBe('completed')
  })
  it('never calls a closed milestone overdue', () => {
    const closed = { ...emptyConclusion(), status: 'completed' as const }
    expect(
      milestoneState(
        { targetDate: '2026-01-01', status: 'active', conclusion: closed },
        p(4, 4),
        '2026-10-27',
      ),
    ).toBe('completed')
  })
})

describe('dates', () => {
  it('counts duration inclusively and inverts it', () => {
    expect(durationDays('2026-10-01', '2026-10-21')).toBe(21)
    expect(durationDays('2026-10-01', '2026-10-01')).toBe(1)
    expect(durationDays('2026-10-21', '2026-10-01')).toBeNull()
    expect(durationDays('', '2026-10-01')).toBeNull()
    expect(deadlineFrom('2026-10-01', 21)).toBe('2026-10-21')
    // Across a month end and a DST change in many zones.
    expect(durationDays('2026-03-28', '2026-04-02')).toBe(6)
  })
  it('labels the deadline', () => {
    expect(deadlineLabel('2026-10-27', '2026-10-27')).toBe('Due today')
    expect(deadlineLabel('2026-10-28', '2026-10-27')).toBe('1 day left')
    expect(deadlineLabel('2026-10-24', '2026-10-27')).toBe('3 days overdue')
    expect(deadlineLabel('', '2026-10-27')).toBeNull()
  })
  it('writes timestamps with the local offset', () => {
    expect(isoWithOffset(new Date(2026, 9, 27, 9, 5, 7))).toMatch(
      /^2026-10-27T09:05:07[+-]\d{2}:\d{2}$/,
    )
  })
})

describe('closing', () => {
  const full = { done: 3, total: 3, ratio: 1 }
  it('lists every blocker in order', () => {
    expect(closeBlockers({ done: 0, total: 0, ratio: 0 }, undefined)).toEqual([
      'Add at least one point or subtask',
      'Write a conclusion summary',
    ])
    expect(
      closeBlockers(
        { done: 1, total: 3, ratio: 1 / 3 },
        {
          ...emptyConclusion(),
          summary: 'x',
          evidenceRequired: true,
          acceptance: [{ id: 1, text: 'a', checked: false }],
        },
      ),
    ).toEqual(['2 of 3 still unchecked', 'Add evidence', 'Confirm 1 acceptance check'])
  })
  it('allows closing at 100% with a summary, and evidence only when required', () => {
    expect(closeBlockers(full, { ...emptyConclusion(), summary: 'Done it' })).toEqual([])
    expect(
      closeBlockers(full, {
        ...emptyConclusion(),
        summary: 'Done',
        evidenceRequired: true,
        evidence: [' '],
      }),
    ).toEqual(['Add evidence'])
  })
})
