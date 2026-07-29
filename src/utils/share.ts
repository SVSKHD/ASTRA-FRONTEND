import type { ItemType, SharedView } from '@/types'

// base64(JSON) encode/decode of a shared item.
//
// This is the LEGACY link format: the whole item travelled inside the URL as
// `?d=<code>`. It is kept so links already handed out keep resolving, but new
// shares go through utils/shares.ts, because a payload carried in the URL can
// never be access-controlled — the data is the link.
export function encodeShare(type: ItemType, item: unknown): string {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify({ type, item }))))
  } catch {
    return ''
  }
}

export function decodeShare(code: string): SharedView | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(code)))) as SharedView
  } catch {
    return null
  }
}

export const PLURAL: Record<ItemType, string> = {
  todo: 'todos',
  task: 'tasks',
  deadline: 'deadlines',
  reminder: 'reminders',
  finance: 'finances',
  note: 'notes',
  trip: 'trips',
  idea: 'ideas',
  stock: 'stocks',
}

// Reverse of PLURAL, for turning a route segment back into an item type.
export const TYPE_BY_PLURAL: Record<string, ItemType> = Object.fromEntries(
  Object.entries(PLURAL).map(([type, plural]) => [plural, type as ItemType]),
) as Record<string, ItemType>

export function pathForShare(type: ItemType, shareId: string): string {
  return '/' + PLURAL[type] + '/' + shareId
}

// Absolute URL for a Firestore-backed share.
export function buildShareUrl(type: ItemType, shareId: string): string {
  const origin = typeof location !== 'undefined' ? location.origin : ''
  return origin + pathForShare(type, shareId)
}

// Path for the public-share route used by the per-item globe toggle:
// /share/<type>/<shareId>. Singular and namespaced under /share so a public
// link reads as one, and so the composable/component reuse for notes, ideas and
// trips later needs no per-type wiring — only the type segment changes.
export function pathForPublicShare(type: ItemType, shareId: string): string {
  return '/share/' + type + '/' + shareId
}

export function buildPublicShareUrl(type: ItemType, shareId: string): string {
  const origin = typeof location !== 'undefined' ? location.origin : ''
  return origin + pathForPublicShare(type, shareId)
}

// Legacy URL builder, retained so the old format stays testable and so a share
// can still be produced when Firebase is unavailable.
export function buildLegacyShareUrl(type: ItemType, item: { id: number }): string {
  const origin = typeof location !== 'undefined' ? location.origin : ''
  return (
    origin +
    '/' +
    PLURAL[type] +
    '/' +
    item.id.toString(36) +
    '?d=' +
    encodeURIComponent(encodeShare(type, item))
  )
}

// Parse a legacy share URL out of the current location, if present. Returns
// null when the path is not a legacy share link at all, so the router can take
// over for the new format.
export function parseSharedFromLocation(): SharedView | null {
  try {
    if (typeof location === 'undefined') return null
    const m = location.pathname.match(
      /^\/(todos|tasks|deadlines|reminders|finances|notes|trips|ideas|stocks)\/([a-z0-9]+)$/i,
    )
    if (!m) return null
    const d = new URLSearchParams(location.search).get('d')
    if (!d) return null
    return decodeShare(d) || { notFound: true }
  } catch {
    return null
  }
}

export function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text)
  }
  return Promise.resolve()
}
