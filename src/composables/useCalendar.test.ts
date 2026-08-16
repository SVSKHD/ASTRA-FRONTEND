import { describe, expect, it } from 'vitest'
import { RANGE_PADDING_MS, coveredBy, mergeRanges, paddedRange } from './useCalendar'

const DAY = 24 * 60 * 60_000
const T = 1_700_000_000_000

describe('paddedRange', () => {
  it('pads a week either side, so a small step lands inside what is loaded', () => {
    const range = paddedRange(T, T + DAY)
    expect(range.start).toBe(T - RANGE_PADDING_MS)
    expect(range.end).toBe(T + DAY + RANGE_PADDING_MS)
  })
})

describe('coveredBy', () => {
  it('recognises a range already inside one that was built', () => {
    const visited = [{ start: T, end: T + 30 * DAY }]
    expect(coveredBy({ start: T + DAY, end: T + 2 * DAY }, visited)).toBe(true)
  })

  it('does not claim partial coverage', () => {
    const visited = [{ start: T, end: T + 10 * DAY }]
    expect(coveredBy({ start: T + 5 * DAY, end: T + 20 * DAY }, visited)).toBe(false)
    expect(coveredBy({ start: T, end: T + DAY }, [])).toBe(false)
  })
})

describe('mergeRanges', () => {
  it('collapses overlapping ranges so the list stays short', () => {
    const merged = mergeRanges(
      [
        { start: T, end: T + 10 * DAY },
        { start: T + 8 * DAY, end: T + 20 * DAY },
      ],
      { start: T + 15 * DAY, end: T + 25 * DAY },
    )
    expect(merged).toEqual([{ start: T, end: T + 25 * DAY }])
  })

  it('keeps disjoint ranges apart', () => {
    const merged = mergeRanges([{ start: T, end: T + DAY }], {
      start: T + 10 * DAY,
      end: T + 11 * DAY,
    })
    expect(merged).toHaveLength(2)
  })

  it('does not mutate the ranges it was given', () => {
    const visited = [{ start: T, end: T + DAY }]
    mergeRanges(visited, { start: T, end: T + 5 * DAY })
    expect(visited[0].end).toBe(T + DAY)
  })
})
