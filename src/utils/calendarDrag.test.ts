import { describe, expect, it } from 'vitest'
import {
  FINE_SNAP_MINUTES,
  MIN_DURATION_MINUTES,
  SNAP_MINUTES,
  currentDurationMins,
  dropPatch,
  isCopyDrag,
  moveAllDaySpan,
  resizeEndPatch,
  resizePatch,
  resizeStartPatch,
  schedulePatch,
  snapMinutesFor,
  snapTime,
  unschedulePatch,
} from './calendarDrag'
import { dayStart } from './calendarEvents'
import type { Schedulable } from '@/types'

const MIN = 60_000
const DAY = dayStart('2024-06-10')
const NINE = DAY + 9 * 60 * MIN
const TEN = DAY + 10 * 60 * MIN

const block = (over: Partial<Schedulable> = {}): Schedulable => ({
  startAt: NINE,
  endAt: TEN,
  allDay: false,
  durationMins: 60,
  ...over,
})

describe('snapTime', () => {
  it('snaps to the 15-minute grid by default', () => {
    expect(snapTime(NINE + 7 * MIN)).toBe(NINE)
    expect(snapTime(NINE + 8 * MIN)).toBe(NINE + 15 * MIN)
  })

  it('takes a finer grid when asked', () => {
    expect(snapTime(NINE + 4 * MIN, FINE_SNAP_MINUTES)).toBe(NINE + 5 * MIN)
  })

  it('reports which grid a modifier asks for', () => {
    expect(snapMinutesFor({ altKey: true })).toBe(FINE_SNAP_MINUTES)
    expect(snapMinutesFor({})).toBe(SNAP_MINUTES)
  })
})

describe('dropPatch — duration survives a move (acceptance 67)', () => {
  it('keeps the block the same length at the new time', () => {
    const patch = dropPatch(block(), DAY + 14 * 60 * MIN)
    expect(patch.startAt).toBe(DAY + 14 * 60 * MIN)
    expect(patch.durationMins).toBe(60)
    expect(patch.endAt - patch.startAt).toBe(60 * MIN)
  })

  it('snaps the drop to the grid', () => {
    expect(dropPatch(block(), DAY + 14 * 60 * MIN + 7 * MIN).startAt).toBe(DAY + 14 * 60 * MIN)
  })

  it('uses a stored duration when the item has no end', () => {
    const patch = dropPatch(block({ endAt: null, durationMins: 45 }), DAY + 60 * MIN)
    expect(patch.durationMins).toBe(45)
  })

  it('falls back to the default block when it has neither', () => {
    expect(dropPatch(block({ endAt: null, durationMins: null }), DAY).durationMins).toBe(30)
  })

  it('can flip an item to all-day', () => {
    const patch = dropPatch(block(), DAY, { allDay: true })
    expect(patch.allDay).toBe(true)
    expect(patch.durationMins).toBe(24 * 60)
  })
})

describe('resize (acceptance 68)', () => {
  it('bottom edge moves only the end', () => {
    const patch = resizeEndPatch(block(), TEN + 30 * MIN)
    expect(patch?.startAt).toBe(NINE)
    expect(patch?.endAt).toBe(TEN + 30 * MIN)
    expect(patch?.durationMins).toBe(90)
  })

  it('top edge moves only the start', () => {
    const patch = resizeStartPatch(block(), NINE - 30 * MIN)
    expect(patch?.startAt).toBe(NINE - 30 * MIN)
    expect(patch?.endAt).toBe(TEN)
    expect(patch?.durationMins).toBe(90)
  })

  it('never shrinks below the 15-minute floor from either edge', () => {
    expect(resizeEndPatch(block(), NINE)?.durationMins).toBe(MIN_DURATION_MINUTES)
    expect(resizeStartPatch(block(), TEN + 60 * MIN)?.durationMins).toBe(MIN_DURATION_MINUTES)
  })

  it('routes a resize to the edge that actually moved', () => {
    const item = block()
    expect(resizePatch(item, { start: NINE - 30 * MIN, end: TEN })?.startAt).toBe(NINE - 30 * MIN)
    expect(resizePatch(item, { start: NINE, end: TEN + 30 * MIN })?.endAt).toBe(TEN + 30 * MIN)
  })

  it('cannot resize an item that was never scheduled', () => {
    expect(resizeEndPatch(block({ startAt: null, endAt: null }), TEN)).toBeNull()
    expect(
      resizeStartPatch(block({ startAt: null, endAt: null, durationMins: null }), NINE),
    ).toBeNull()
  })
})

describe('scheduling and unscheduling', () => {
  it('gives an unscheduled item a default block at the drop slot (acceptance 70)', () => {
    const patch = schedulePatch(DAY + 10 * 60 * MIN, false)
    expect(patch).toMatchObject({ startAt: DAY + 10 * 60 * MIN, durationMins: 30, allDay: false })
  })

  it('drops onto a day as a full all-day span', () => {
    expect(schedulePatch(DAY, true).durationMins).toBe(24 * 60)
  })

  it('clears every scheduling field when dragged back to the panel', () => {
    expect(unschedulePatch()).toEqual({
      startAt: null,
      endAt: null,
      allDay: false,
      durationMins: null,
    })
  })
})

describe('all-day spans and copy-drag', () => {
  it('keeps a multi-day span the same number of days', () => {
    const span = block({ startAt: DAY, endAt: DAY + 3 * 24 * 60 * MIN, allDay: true })
    const moved = moveAllDaySpan(span, DAY + 7 * 24 * 60 * MIN)
    expect(moved.endAt - moved.startAt).toBe(3 * 24 * 60 * MIN)
  })

  it('treats a single day as one day', () => {
    const moved = moveAllDaySpan(block({ startAt: null, endAt: null }), DAY)
    expect(moved.endAt - moved.startAt).toBe(24 * 60 * MIN)
  })

  it('recognises Alt/Option as a copy-drag', () => {
    expect(isCopyDrag({ altKey: true })).toBe(true)
    expect(isCopyDrag({})).toBe(false)
  })
})

describe('currentDurationMins', () => {
  it('measures start to end, then falls back to stored, then to the default', () => {
    expect(currentDurationMins(block())).toBe(60)
    expect(currentDurationMins(block({ endAt: null, durationMins: 20 }))).toBe(20)
    expect(currentDurationMins(block({ endAt: null, durationMins: null }))).toBe(30)
    expect(currentDurationMins(block({ allDay: true }))).toBe(24 * 60)
  })
})
