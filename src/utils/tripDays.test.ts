import { describe, it, expect } from 'vitest'
import { groupPlacesByDay } from './tripDays'
import type { TripPlace } from '@/types'

function place(id: number, visitedAt: string): TripPlace {
  return { id, name: 'P' + id, address: '', lat: null, lng: null, visitedAt, notes: '', photos: [] }
}

describe('groupPlacesByDay', () => {
  it('buckets places by calendar day, numbered and time-ordered', () => {
    const groups = groupPlacesByDay([
      place(1, '2026-07-12T16:00'),
      place(2, '2026-07-12T09:30'),
      place(3, '2026-07-13T11:00'),
    ])
    expect(groups.map((g) => g.dayNumber)).toEqual([1, 2])
    // Day 1 sorted by time: 09:30 (id 2) then 16:00 (id 1).
    expect(groups[0].places.map((p) => p.id)).toEqual([2, 1])
    expect(groups[0].count).toBe(2)
    expect(groups[0].startTime).not.toBe('')
    expect(groups[0].endTime).not.toBe('')
    expect(groups[0].startTime).not.toBe(groups[0].endTime)
    expect(groups[1].places.map((p) => p.id)).toEqual([3])
  })

  it('collects undated places into a trailing unscheduled bucket', () => {
    const groups = groupPlacesByDay([place(1, '2026-07-12T10:00'), place(2, '')])
    expect(groups).toHaveLength(2)
    const last = groups[groups.length - 1]
    expect(last.unscheduled).toBe(true)
    expect(last.dayNumber).toBe(0)
    expect(last.places.map((p) => p.id)).toEqual([2])
  })

  it('returns nothing for no places', () => {
    expect(groupPlacesByDay([])).toEqual([])
  })
})
