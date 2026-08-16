// Drag-to-reschedule and resize-to-retime arithmetic (section 15, DRAG AND DROP
// / RESIZE). Pure, so the rules that matter — duration is preserved on a drag,
// the bottom edge moves only the end and the top edge only the start, nothing
// shrinks below 15 minutes — are tested without a pointer.
//
// Calendar interactions change TIME ONLY. Hierarchy, parenting and goal
// membership are never touched here; reparenting stays in the list view.

import { DEFAULT_BLOCK_MINS, minutesBetween } from '@/utils/calendarEvents'
import type { Schedulable } from '@/types'

const MIN = 60_000

export const SNAP_MINUTES = 15
// Holding Alt gives a finer grid, matching the drag language of section 2b.
export const FINE_SNAP_MINUTES = 5
export const MIN_DURATION_MINUTES = 15

export function snapTime(ms: number, minutes: number = SNAP_MINUTES): number {
  const step = Math.max(1, minutes) * MIN
  return Math.round(ms / step) * step
}

// The patch a schedulable item needs after a drag. Duration is preserved: an
// hour-long block dropped anywhere is still an hour long (acceptance 67).
export interface SchedulePatch {
  startAt: number
  endAt: number
  allDay: boolean
  durationMins: number
}

export function dropPatch(
  item: Schedulable,
  newStart: number,
  opts: { allDay?: boolean; snapMinutes?: number } = {},
): SchedulePatch {
  const allDay = opts.allDay ?? item.allDay ?? false
  const start = allDay ? newStart : snapTime(newStart, opts.snapMinutes ?? SNAP_MINUTES)
  // Dropping a timed block onto the all-day row makes it a day-long chip; a
  // block that stays timed keeps exactly the length it had.
  const minutes = allDay
    ? currentDurationMins({ ...item, allDay: true })
    : currentDurationMins(item)
  return {
    startAt: start,
    endAt: start + minutes * MIN,
    allDay,
    durationMins: minutes,
  }
}

// The duration an item currently occupies, falling back to the stored value and
// then to the default block.
export function currentDurationMins(item: Schedulable): number {
  if (item.allDay) return 24 * 60
  if (item.startAt != null && item.endAt != null) return minutesBetween(item.startAt, item.endAt)
  return item.durationMins ?? DEFAULT_BLOCK_MINS
}

// Bottom-edge resize: only the end moves. Never below the 15-minute floor
// (acceptance 68).
export function resizeEndPatch(item: Schedulable, newEnd: number): SchedulePatch | null {
  if (item.startAt == null) return null
  const end = Math.max(snapTime(newEnd), item.startAt + MIN_DURATION_MINUTES * MIN)
  return {
    startAt: item.startAt,
    endAt: end,
    allDay: item.allDay ?? false,
    durationMins: minutesBetween(item.startAt, end),
  }
}

// Top-edge resize: only the start moves, the end stays where it is.
export function resizeStartPatch(item: Schedulable, newStart: number): SchedulePatch | null {
  const end =
    item.endAt ?? (item.startAt != null ? item.startAt + currentDurationMins(item) * MIN : null)
  if (end == null) return null
  const start = Math.min(snapTime(newStart), end - MIN_DURATION_MINUTES * MIN)
  return {
    startAt: start,
    endAt: end,
    allDay: item.allDay ?? false,
    durationMins: minutesBetween(start, end),
  }
}

// FullCalendar hands back both edges after a resize; which one actually moved
// tells us which rule applies. Comparing against the pre-resize values is what
// keeps "bottom edge changes only the end" true rather than assumed.
export function resizePatch(
  item: Schedulable,
  next: { start: number; end: number },
): SchedulePatch | null {
  const startMoved = item.startAt != null && next.start !== item.startAt
  if (startMoved) return resizeStartPatch(item, next.start)
  return resizeEndPatch(item, next.end)
}

// Scheduling something that had no time at all: from the Unscheduled panel onto
// a slot (acceptance 70).
export function schedulePatch(
  dropAt: number,
  allDay: boolean,
  minutes = DEFAULT_BLOCK_MINS,
): SchedulePatch {
  const start = allDay ? dropAt : snapTime(dropAt)
  return {
    startAt: start,
    endAt: start + (allDay ? 24 * 60 : minutes) * MIN,
    allDay,
    durationMins: allDay ? 24 * 60 : minutes,
  }
}

// Dragging back to the panel clears the schedule without touching anything else.
export function unschedulePatch(): Schedulable {
  return { startAt: null, endAt: null, allDay: false, durationMins: null }
}

// A multi-day all-day span moved in month view keeps its length in days.
export function moveAllDaySpan(item: Schedulable, newStart: number): SchedulePatch {
  const days =
    item.startAt != null && item.endAt != null
      ? Math.max(1, Math.round((item.endAt - item.startAt) / (24 * 60 * MIN)))
      : 1
  return {
    startAt: newStart,
    endAt: newStart + days * 24 * 60 * MIN,
    allDay: true,
    durationMins: days * 24 * 60,
  }
}

// Alt/Option-drag duplicates rather than moves. The caller creates the copy;
// this decides whether the modifier asked for one.
export function isCopyDrag(event: { altKey?: boolean }): boolean {
  return event.altKey === true
}

export function snapMinutesFor(event: { altKey?: boolean }): number {
  return event.altKey ? FINE_SNAP_MINUTES : SNAP_MINUTES
}
