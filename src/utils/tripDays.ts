// Group a trip's places into day-by-day sections for the itinerary. Places are
// bucketed by the calendar date of their visited (or planned) date-time, sorted
// chronologically, and each day gets a number, a header label and the day's
// start → end time span. Places with no date fall into an "Unscheduled" bucket
// that renders last, so nothing is dropped. The same shape serves a To-Visit
// trip as a planned itinerary — it just reads planned dates.

import type { TripPlace } from '@/types'

export interface DayGroup {
  key: string // 'YYYY-MM-DD', or 'unscheduled'
  dayNumber: number // 1-based; 0 for the unscheduled bucket
  dateLabel: string // 'Sat, 12 Jul' (empty for unscheduled)
  places: TripPlace[] // in time order
  count: number
  startTime: string // 'HH:mm' of the first place, '' if none
  endTime: string // 'HH:mm' of the last place, '' if none
  unscheduled: boolean
}

// Local calendar date (YYYY-MM-DD) of a datetime-local value, or '' if unset.
function dayKeyOf(value: string): string {
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return ''
  const d = new Date(ms)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() + '-' + m + '-' + day
}

function timeOf(value: string): string {
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return ''
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function dateLabelOf(key: string): string {
  return new Date(key + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function groupPlacesByDay(places: TripPlace[]): DayGroup[] {
  const byDay = new Map<string, TripPlace[]>()
  const unscheduled: TripPlace[] = []
  for (const p of places) {
    const key = dayKeyOf(p.visitedAt)
    if (!key) {
      unscheduled.push(p)
      continue
    }
    const list = byDay.get(key) || []
    list.push(p)
    byDay.set(key, list)
  }
  const keys = [...byDay.keys()].sort()
  const groups: DayGroup[] = keys.map((key, i) => {
    const dayPlaces = (byDay.get(key) || []).slice().sort((a, b) => {
      const ta = Date.parse(a.visitedAt)
      const tb = Date.parse(b.visitedAt)
      return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb)
    })
    return {
      key,
      dayNumber: i + 1,
      dateLabel: dateLabelOf(key),
      places: dayPlaces,
      count: dayPlaces.length,
      startTime: timeOf(dayPlaces[0]?.visitedAt || ''),
      endTime: timeOf(dayPlaces[dayPlaces.length - 1]?.visitedAt || ''),
      unscheduled: false,
    }
  })
  if (unscheduled.length) {
    groups.push({
      key: 'unscheduled',
      dayNumber: 0,
      dateLabel: '',
      places: unscheduled,
      count: unscheduled.length,
      startTime: '',
      endTime: '',
      unscheduled: true,
    })
  }
  return groups
}

// Distinct, theme-agnostic hues so each day's pins and rail read apart. Cycles
// if a trip somehow runs longer than the palette.
const DAY_HUES = [255, 30, 145, 300, 190, 75, 0, 220, 340, 110]
export function dayColor(dayIndex: number): string {
  const hue = DAY_HUES[dayIndex % DAY_HUES.length]
  return 'oklch(0.68 0.16 ' + hue + ')'
}
