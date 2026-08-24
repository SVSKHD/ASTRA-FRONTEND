// Pure view logic for the Security page (section 27a).
//
// Kept out of the components so the two rules that are easy to get subtly wrong
// — which locations count as "distinct", and what each activity line says — are
// testable without mounting anything or reaching a network.

import type { ActivityEvent, ActivityKind, DeviceSession } from '@/types'
import { locationLabel } from '@/utils/device'

/** Spec: a map of the last 5 distinct locations. */
export const MAP_LOCATIONS = 5

export interface MapPoint {
  key: string
  label: string
  lat: number
  lng: number
  /** Epoch ms of the most recent session seen here — the map dims older pins. */
  seenAt: number
}

/**
 * The last N distinct places, most recent first.
 *
 * "Distinct" is by place NAME, not by coordinate. Two sessions from the same
 * city can differ in the last decimal of a geo-IP lookup, and five pins stacked
 * on Hyderabad is not a map of anywhere — it is the same answer five times,
 * crowding out the one sign-in from Frankfurt that the map exists to show.
 *
 * Sessions without coordinates are dropped rather than plotted at (0, 0), which
 * is in the Gulf of Guinea and has misled every engineer who has ever seen it.
 */
export function mapPoints(sessions: DeviceSession[], limit = MAP_LOCATIONS): MapPoint[] {
  const byPlace = new Map<string, MapPoint>()
  for (const s of sessions) {
    if (s.approxLat == null || s.approxLng == null) continue
    const key = `${s.city ?? ''}|${s.country ?? ''}`.toLowerCase()
    const existing = byPlace.get(key)
    if (existing && existing.seenAt >= s.lastActiveAt) continue
    byPlace.set(key, {
      key,
      label: locationLabel(s.city, s.country),
      lat: s.approxLat,
      lng: s.approxLng,
      seenAt: s.lastActiveAt,
    })
  }
  return [...byPlace.values()].sort((a, b) => b.seenAt - a.seenAt).slice(0, limit)
}

/**
 * Project a lat/lng onto a 0–1 box, equirectangular.
 *
 * Equirectangular rather than Mercator: this is a dot plot on a plain canvas,
 * not a navigational chart, and Mercator's distortion would put a Stockholm pin
 * noticeably north of where a reader expects on a rectangle with no coastlines
 * to calibrate against. Latitude is inverted because SVG y grows downward.
 */
export function project(lat: number, lng: number): { x: number; y: number } {
  const clampedLat = Math.max(-85, Math.min(85, lat))
  const clampedLng = Math.max(-180, Math.min(180, lng))
  return { x: (clampedLng + 180) / 360, y: (90 - clampedLat) / 180 }
}

const ACTIVITY_TITLES: Record<ActivityKind, string> = {
  login: 'Signed in',
  logout: 'Signed out',
  revoke: 'Device signed out',
  'password-change': 'Password changed',
  'new-device': 'New device',
  'new-country': 'Sign-in from a new country',
}

export function activityTitle(type: ActivityKind): string {
  return ACTIVITY_TITLES[type] ?? 'Activity'
}

/** Which activity kinds are worth an accent rather than a neutral row. */
export function activityIsNotable(type: ActivityKind): boolean {
  return type === 'new-country' || type === 'password-change'
}

export function activityIcon(type: ActivityKind): string {
  if (type === 'new-country') return 'map-pin'
  if (type === 'revoke' || type === 'logout') return 'log-out'
  if (type === 'password-change') return 'lock'
  return 'shield'
}

/**
 * The second line of an activity row: where it happened, and what it was.
 *
 * Returns '' rather than 'Unknown location' when there is nothing to add — an
 * empty second line is invisible, and a line that says nothing twice is worse
 * than no line.
 */
export function activityDetail(event: ActivityEvent): string {
  const place = event.city || event.country ? locationLabel(event.city, event.country) : ''
  return [event.detail, place].filter(Boolean).join(' · ')
}

/**
 * The new-country banner, or null.
 *
 * Only the most recent one, and only if it is recent: a banner about a sign-in
 * from three months ago is not actionable, and one that reappears every load
 * for an event the user already dismissed teaches them to dismiss it unread.
 */
export const BANNER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export function newCountryAlert(
  events: ActivityEvent[],
  now: number,
  dismissedAt: number | null,
): ActivityEvent | null {
  const latest = events
    .filter((e) => e.type === 'new-country')
    .sort((a, b) => b.at - a.at)
    .at(0)
  if (!latest) return null
  if (now - latest.at > BANNER_WINDOW_MS) return null
  if (dismissedAt != null && dismissedAt >= latest.at) return null
  return latest
}
