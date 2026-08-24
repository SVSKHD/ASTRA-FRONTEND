// Coarse location from an IP, resolved server-side.
//
// The browser is deliberately not involved. Calling a geo-IP API from the client
// would (a) put the user's raw IP in a third party's logs on every page load,
// (b) ship an API key to anyone who opens devtools, and (c) let the client
// simply lie about where it is — which defeats the only thing this field is for,
// namely noticing a sign-in from somewhere the user has never been.
//
// Two sources, in order of preference:
//
//  1. The edge headers. Behind Firebase Hosting, Google's load balancer has
//     already done the lookup and attached the answer. It is free, adds no
//     latency, involves no third party, and cannot be spoofed by the client
//     because the balancer overwrites whatever the client sent.
//  2. A configured HTTP lookup, if `GEOIP_ENDPOINT` is set. Only reached when
//     the headers are absent (local emulator, a non-Hosting entry point).
//
// Neither is required. A session with no location is a normal session — the
// devices list simply shows "Unknown location", which is a better outcome than
// a failed lookup blocking a sign-in.

import type { Request } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'

export interface CoarseLocation {
  city: string | null
  region: string | null
  country: string | null
  /** Rounded to ~1 decimal place — city-scale, never street-scale. */
  approxLat: number | null
  approxLng: number | null
}

export const UNKNOWN_LOCATION: CoarseLocation = {
  city: null,
  region: null,
  country: null,
  approxLat: null,
  approxLng: null,
}

// One decimal place is roughly 11km at the equator. That is enough to say "this
// login was in Hyderabad and the last one was in Berlin" and not enough to say
// which building. Storing the full precision a geo-IP service returns would
// imply an accuracy it does not have and expose more than the feature needs.
const PRECISION = 1

function coarse(n: number | null | undefined): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  const factor = 10 ** PRECISION
  return Math.round(n * factor) / factor
}

function header(req: Request, name: string): string | null {
  const raw = req.headers[name]
  const value = Array.isArray(raw) ? raw[0] : raw
  const trimmed = (value ?? '').trim()
  // The balancer sends the literal string "ZZ" for "could not determine", and
  // "?" for a city it has no name for. Both mean absent, not a place name.
  if (!trimmed || trimmed === 'ZZ' || trimmed === '?') return null
  return trimmed
}

/** Source 1: what Google's edge already worked out. */
export function locationFromHeaders(req: Request): CoarseLocation | null {
  const country = header(req, 'x-appengine-country')
  const city = header(req, 'x-appengine-city')
  if (!country && !city) return null

  // `x-appengine-citylatlong` is "17.385044,78.486671".
  const [latRaw, lngRaw] = (header(req, 'x-appengine-citylatlong') ?? '').split(',')
  return {
    city,
    region: header(req, 'x-appengine-region'),
    country,
    approxLat: coarse(Number(latRaw)),
    approxLng: coarse(Number(lngRaw)),
  }
}

interface GeoResponse {
  city?: string
  region?: string
  region_name?: string
  country?: string
  country_name?: string
  country_code?: string
  latitude?: number
  longitude?: number
  lat?: number
  lon?: number
}

/**
 * Source 2: a configured lookup service.
 *
 * `GEOIP_ENDPOINT` is a URL template containing `{ip}` — e.g.
 * `https://ipapi.co/{ip}/json/`. Left unset, this function is never called and
 * no third party sees anything.
 */
export async function locationFromService(ip: string): Promise<CoarseLocation | null> {
  const template = process.env.GEOIP_ENDPOINT
  if (!template || !ip) return null
  try {
    // A geo lookup must never be the reason a sign-in hangs. Two seconds, then
    // the session is written without a location.
    const res = await fetch(template.replace('{ip}', encodeURIComponent(ip)), {
      signal: AbortSignal.timeout(2000),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as GeoResponse
    return {
      city: body.city ?? null,
      region: body.region_name ?? body.region ?? null,
      country: body.country_name ?? body.country ?? body.country_code ?? null,
      approxLat: coarse(body.latitude ?? body.lat),
      approxLng: coarse(body.longitude ?? body.lon),
    }
  } catch (err) {
    logger.warn('geo-ip lookup failed; session stored without a location', err)
    return null
  }
}

export async function resolveLocation(req: Request, ip: string): Promise<CoarseLocation> {
  return locationFromHeaders(req) ?? (await locationFromService(ip)) ?? UNKNOWN_LOCATION
}
