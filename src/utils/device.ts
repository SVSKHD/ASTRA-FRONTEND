// Naming this device, from the only thing the browser will tell us about it.
//
// There is no API that says "MacBook Pro". There is a user-agent string, which
// is a fossil record of thirty years of browsers pretending to be each other —
// every Chrome claims to be Safari, which claims to be Gecko, which claims to
// be Mozilla. So the order of the tests below is not arbitrary: each browser is
// checked BEFORE the one it impersonates, and the first match wins.
//
// This is deliberately not a UA-parsing library. A device list needs "Chrome on
// macOS" to be right; it does not need to distinguish Chromium 121 from 122, and
// the 200KB of regexes that would buy is 200KB on every page load.

export type DeviceType = 'desktop' | 'mobile' | 'tablet'

export interface DeviceInfo {
  deviceType: DeviceType
  os: string
  browser: string
  /** What the row says: "Chrome on macOS". */
  deviceLabel: string
}

/**
 * Tablet before mobile: an iPad's UA contains "Mobile", and an Android tablet is
 * an Android UA WITHOUT "Mobile" in it — the presence of the word means phone,
 * which is the opposite of what it reads like.
 */
export function deviceType(ua: string): DeviceType {
  if (/iPad/i.test(ua)) return 'tablet'
  if (/Tablet|PlayBook|Silk/i.test(ua)) return 'tablet'
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet'
  if (/Mobi|iPhone|iPod|Windows Phone|IEMobile/i.test(ua)) return 'mobile'
  return 'desktop'
}

export function osName(ua: string): string {
  // iPadOS 13+ reports itself as "Macintosh" to get desktop sites. Touch support
  // is what separates the two, and it is not in the UA — so an iPad on modern
  // Safari is honestly reported as macOS rather than guessed at wrongly.
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
  if (/Android/i.test(ua)) return 'Android'
  if (/CrOS/i.test(ua)) return 'ChromeOS'
  if (/Windows NT 10/i.test(ua)) return 'Windows'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Unknown'
}

export function browserName(ua: string): string {
  // Edge says "Chrome" and "Safari"; Chrome says "Safari"; Opera says both.
  // Hence: the impersonators first, the impersonated last.
  if (/Edg[A-Z]?\//i.test(ua)) return 'Edge'
  if (/OPR\/|Opera/i.test(ua)) return 'Opera'
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet'
  if (/Firefox\/|FxiOS/i.test(ua)) return 'Firefox'
  if (/Chrome\/|CriOS/i.test(ua)) return 'Chrome'
  if (/Safari\//i.test(ua)) return 'Safari'
  return 'Unknown'
}

export function describeDevice(ua: string): DeviceInfo {
  const os = osName(ua)
  const browser = browserName(ua)
  // "Unknown on Unknown" is noise. A label that admits it knows nothing is
  // more useful than one that pretends symmetry.
  const deviceLabel =
    browser === 'Unknown' && os === 'Unknown'
      ? 'Unknown device'
      : browser === 'Unknown'
        ? os
        : os === 'Unknown'
          ? browser
          : `${browser} on ${os}`
  return { deviceType: deviceType(ua), os, browser, deviceLabel }
}

/** The icon name (from the app's one sprite) for a device type. */
export function deviceIcon(type: DeviceType): string {
  return type === 'mobile' ? 'smartphone' : type === 'tablet' ? 'tablet' : 'monitor'
}

/** "Bengaluru, India" / "India" / "Unknown location" — never a dangling comma. */
export function locationLabel(city?: string | null, country?: string | null): string {
  const parts = [city, country].filter((p): p is string => Boolean(p && p.trim()))
  return parts.length ? parts.join(', ') : 'Unknown location'
}
