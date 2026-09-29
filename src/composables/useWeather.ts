// The weather where the reader is, for the greeting card.
//
// Three steps, each one free and keyless:
//   1. Where: the browser's own geolocation. Asked for only once the reader has
//      said yes — or silently, if the browser already has that permission — so
//      the app never opens a location prompt on page load.
//   2. What: Open-Meteo's current conditions (temperature, WMO weather code,
//      day or night) for those coordinates.
//   3. Which place: BigDataCloud's client reverse-geocode, for a town name.
//
// The last reading is kept in localStorage for REFRESH_MS, so a reload shows it
// at once and does not refetch; the coordinates are kept too, so a later visit
// can refresh without asking again. Module-level state: the card can remount
// (a tab switch) without starting over.
import { reactive, readonly } from 'vue'
import type { IconName } from '@/components/ui/icons'

const REFRESH_MS = 30 * 60 * 1000
const STORE_KEY = 'aureon:weather'

export type WeatherStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'error' | 'unsupported'

interface Reading {
  temp: number
  code: number
  isDay: boolean
  place: string
  lat: number
  lon: number
  at: number
}

const state = reactive<{ status: WeatherStatus; reading: Reading | null }>({
  status: 'idle',
  reading: null,
})

function loadCache(): Reading | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as Reading) : null
  } catch {
    return null
  }
}
function saveCache(r: Reading) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(r))
  } catch {
    /* private mode / quota: the card just refetches next time */
  }
}

/** WMO weather code → words and one of the app's icons. */
export function describe(code: number, isDay: boolean): { label: string; icon: IconName } {
  if (code === 0) return { label: 'Clear', icon: isDay ? 'sun' : 'moon' }
  if (code <= 2)
    return {
      label: code === 1 ? 'Mostly clear' : 'Partly cloudy',
      icon: isDay ? 'cloud-sun' : 'cloud',
    }
  if (code === 3) return { label: 'Overcast', icon: 'cloud' }
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'cloud-fog' }
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'cloud-rain' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { label: 'Rain', icon: 'cloud-rain' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { label: 'Snow', icon: 'cloud-snow' }
  if (code >= 95) return { label: 'Thunderstorm', icon: 'cloud-lightning' }
  return { label: 'Cloudy', icon: 'cloud' }
}

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: REFRESH_MS,
      timeout: 15000,
    }),
  )
}

async function fetchReading(lat: number, lon: number, knownPlace = ''): Promise<Reading> {
  const w = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,weather_code,is_day&timezone=auto',
  ).then((r) => {
    if (!r.ok) throw new Error('weather ' + r.status)
    return r.json()
  })
  let place = knownPlace
  if (!place) {
    try {
      const g = await fetch(
        `https://api-bdc.io/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      ).then((r) => r.json())
      place = g.city || g.locality || g.principalSubdivision || g.countryName || ''
    } catch {
      place = ''
    }
  }
  return {
    temp: Math.round(w.current.temperature_2m),
    code: Number(w.current.weather_code),
    isDay: w.current.is_day === 1,
    place,
    lat,
    lon,
    at: Date.now(),
  }
}

let inflight: Promise<void> | null = null

/**
 * Get a fresh reading. `ask` is true only when the reader pressed the button:
 * it is the one path allowed to raise the browser's location prompt.
 */
function refresh(ask: boolean): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    const cached = state.reading ?? loadCache()
    try {
      if (!('geolocation' in navigator)) {
        state.status = 'unsupported'
        return
      }
      // Without a yes on record, only a press may ask.
      if (!ask && !cached) {
        const perm = await navigator.permissions
          ?.query({ name: 'geolocation' as PermissionName })
          .catch(() => null)
        if (perm?.state !== 'granted') {
          state.status = perm?.state === 'denied' ? 'denied' : 'idle'
          return
        }
      }
      state.status = state.reading ? 'ready' : 'loading'
      let lat = cached?.lat
      let lon = cached?.lon
      let place = cached?.place ?? ''
      if (ask || lat == null || lon == null) {
        const pos = await position()
        const moved =
          lat == null ||
          lon == null ||
          Math.abs(pos.coords.latitude - lat) > 0.05 ||
          Math.abs(pos.coords.longitude - lon) > 0.05
        lat = pos.coords.latitude
        lon = pos.coords.longitude
        if (moved) place = ''
      }
      const r = await fetchReading(lat, lon, place)
      state.reading = r
      state.status = 'ready'
      saveCache(r)
    } catch (err) {
      const denied = (err as GeolocationPositionError)?.code === 1
      state.status = denied ? 'denied' : state.reading ? 'ready' : 'error'
    } finally {
      inflight = null
    }
  })()
  return inflight
}

let timer: ReturnType<typeof setInterval> | undefined

export function useWeather() {
  function start() {
    if (!state.reading) {
      const cached = loadCache()
      if (cached) {
        state.reading = cached
        state.status = 'ready'
      }
    }
    const stale = !state.reading || Date.now() - state.reading.at > REFRESH_MS
    if (stale) void refresh(false)
    if (!timer) timer = setInterval(() => void refresh(false), REFRESH_MS)
  }
  function stop() {
    clearInterval(timer)
    timer = undefined
  }
  return { weather: readonly(state), start, stop, allow: () => refresh(true) }
}
