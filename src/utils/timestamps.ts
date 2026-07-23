// Rendering for the createdAt/updatedAt stamps every item carries.
//
// 0 is the "written before timestamps existed" sentinel that applyData()
// backfills with. It is deliberately not formatted as 1 Jan 1970: an unknown
// age should read as unknown, not as an absurd one.

const UNKNOWN = 'Unknown'

export function isStamped(ms: number | undefined | null): boolean {
  return typeof ms === 'number' && ms > 0
}

const absFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

// "21 Jul 2026, 14:32" — the exact stamp, for dialog footers.
export function formatAbsolute(ms: number | undefined | null): string {
  if (!isStamped(ms)) return UNKNOWN
  return absFmt.format(new Date(ms as number))
}

const MINUTE = 60000
const HOUR = 3600000
const DAY = 86400000
const WEEK = 604800000

// "just now" / "5m ago" / "3h ago" / "2d ago" / "6w ago" / a date past ~a year.
// Compact on purpose: this rides along in list rows where space is tight.
export function formatRelative(ms: number | undefined | null, now: number): string {
  if (!isStamped(ms)) return UNKNOWN
  const diff = now - (ms as number)
  // A clock skew or an edit landing in the same tick should not read "-0m ago".
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return Math.floor(diff / MINUTE) + 'm ago'
  if (diff < DAY) return Math.floor(diff / HOUR) + 'h ago'
  if (diff < WEEK) return Math.floor(diff / DAY) + 'd ago'
  if (diff < 365 * DAY) return Math.floor(diff / WEEK) + 'w ago'
  return absFmt.format(new Date(ms as number))
}

// Dialog footer line: both stamps, with the relative age of the more useful one.
export function stampSummary(
  item: { createdAt?: number; updatedAt?: number } | null | undefined,
  now: number,
): { created: string; updated: string; updatedAgo: string } {
  return {
    created: formatAbsolute(item?.createdAt),
    updated: formatAbsolute(item?.updatedAt),
    updatedAgo: formatRelative(item?.updatedAt, now),
  }
}
