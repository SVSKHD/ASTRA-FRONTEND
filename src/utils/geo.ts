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
