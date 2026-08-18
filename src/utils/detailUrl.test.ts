import { describe, expect, it } from 'vitest'
import { detailFromQuery, queryWithDetail, sameTarget } from '@/utils/detailUrl'

describe('reading the dialog out of the URL', () => {
  it('opens the task the query names', () => {
    expect(detailFromQuery({ task: '42' })).toEqual({ kind: 'task', id: 42 })
  })

  it('opens the goal the query names', () => {
    expect(detailFromQuery({ goal: '7' })).toEqual({ kind: 'goal', id: 7 })
  })

  it('is nothing when no dialog is addressed', () => {
    expect(detailFromQuery({})).toBe(null)
    expect(detailFromQuery({ tab: 'tasks' })).toBe(null)
  })

  it('ignores an id that is not a plain positive integer', () => {
    // A hand-mangled URL should land on the list, not a dialog wired to NaN.
    for (const bad of ['abc', '1.5', '-3', '0', '1e3', ' 4', '']) {
      expect(detailFromQuery({ task: bad })).toBe(null)
    }
  })

  it('takes the first value when a key repeats', () => {
    expect(detailFromQuery({ task: ['9', '10'] })).toEqual({ kind: 'task', id: 9 })
  })
})

describe('writing the dialog into the URL', () => {
  it('adds the key without disturbing the rest of the query', () => {
    expect(queryWithDetail({ tab: 'tasks', q: 'plan' }, { kind: 'task', id: 3 })).toEqual({
      tab: 'tasks',
      q: 'plan',
      task: '3',
    })
  })

  it('removes the key when nothing is open', () => {
    expect(queryWithDetail({ tab: 'goals', goal: '5' }, null)).toEqual({ tab: 'goals' })
  })

  it('never leaves both kinds addressed at once', () => {
    expect(queryWithDetail({ task: '1' }, { kind: 'goal', id: 2 })).toEqual({ goal: '2' })
  })

  it('round-trips', () => {
    const target = { kind: 'goal', id: 12 } as const
    expect(detailFromQuery(queryWithDetail({ tab: 'goals' }, target))).toEqual(target)
  })
})

describe('comparing targets', () => {
  it('matches on kind and id together', () => {
    expect(sameTarget({ kind: 'task', id: 1 }, { kind: 'task', id: 1 })).toBe(true)
    expect(sameTarget({ kind: 'task', id: 1 }, { kind: 'goal', id: 1 })).toBe(false)
    expect(sameTarget(null, null)).toBe(true)
    expect(sameTarget(null, { kind: 'task', id: 1 })).toBe(false)
  })
})
