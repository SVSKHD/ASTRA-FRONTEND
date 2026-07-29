// Geocoding + map helpers for Trips. We use OpenStreetMap's Nominatim for the
// location search (no API key, no billing) and Leaflet for the maps. Nominatim
// asks callers to identify themselves and to keep to ~1 request/second; the
// browser sends a Referer automatically and the search input is debounced, so a
// personal workspace stays well inside the usage policy.

export interface GeoResult {
  name: string
  address: string
  lat: number
  lng: number
}

interface NominatimRow {
  display_name?: string
  name?: string
  lat?: string
  lon?: string
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const url = NOMINATIM + '?format=jsonv2&addressdetails=0&limit=6&q=' + encodeURIComponent(q)
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal })
    if (!res.ok) return []
    const rows = (await res.json()) as NominatimRow[]
    return rows
      .map((r) => {
        const lat = Number.parseFloat(r.lat || '')
        const lng = Number.parseFloat(r.lon || '')
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null
        const display = r.display_name || r.name || ''
        return {
          name: r.name || display.split(',')[0] || display,
          address: display,
          lat,
          lng,
        } as GeoResult
      })
      .filter((r): r is GeoResult => r !== null)
  } catch {
    // A network error or an aborted request just yields no suggestions; the
    // caller keeps whatever the user has typed.
    return []
  }
}

// "+2h 15m" style gap between two datetime-local values, for the timeline. An
// empty or unparseable pair yields '' so the node simply omits the gap.
export function formatGap(fromValue: string, toValue: string): string {
  const from = Date.parse(fromValue)
  const to = Date.parse(toValue)
  if (Number.isNaN(from) || Number.isNaN(to)) return ''
  let ms = to - from
  const sign = ms < 0 ? '−' : '+'
  ms = Math.abs(ms)
  const mins = Math.round(ms / 60000)
  if (mins < 1) return sign + '0m'
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const rem = mins % 60
  const parts: string[] = []
  if (days) parts.push(days + 'd')
  if (hours) parts.push(hours + 'h')
  if (rem && !days) parts.push(rem + 'm')
  if (!parts.length) parts.push('0m')
  return sign + parts.join(' ')
}

// A short "Fri, 3 Jul · 14:30" label from a datetime-local value.
export function formatWhen(value: string): string {
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return ''
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Great-circle distance between two points in kilometres (haversine).
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

// Total distance covered along a route: the sum of the legs between each
// consecutive point (points already ordered by visit). Points without
// coordinates are skipped, so a gap does not break the sum.
export function routeDistanceKm(points: { lat: number | null; lng: number | null }[]): number {
  const pts = points.filter(
    (p): p is { lat: number; lng: number } => p.lat != null && p.lng != null,
  )
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    total += haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng)
  }
  return total
}

// A compact distance label: "820 m", "3.4 km", "128 km".
export function formatDistance(km: number): string {
  if (km <= 0) return '0 km'
  if (km < 1) return Math.round(km * 1000) + ' m'
  if (km < 10) return km.toFixed(1) + ' km'
  return Math.round(km) + ' km'
}
