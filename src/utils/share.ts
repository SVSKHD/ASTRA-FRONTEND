import type { ItemType, SharedView } from '@/types'

// base64(JSON) encode/decode of a shared item, matching the design.
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

const PLURAL: Record<ItemType, string> = {
  todo: 'todos',
  task: 'tasks',
  deadline: 'deadlines',
  reminder: 'reminders',
  finance: 'finances',
  note: 'notes',
}

// Build a shareable URL of the form /<plural>/<slug>?d=<code>.
export function buildShareUrl(type: ItemType, item: { id: number }): string {
  const plural = PLURAL[type]
  const slug = item.id.toString(36)
  const code = encodeShare(type, item)
  const origin = typeof location !== 'undefined' ? location.origin : ''
  return origin + '/' + plural + '/' + slug + '?d=' + encodeURIComponent(code)
}

// Parse a shared-item URL out of the current location, if present.
export function parseSharedFromLocation(): SharedView | null {
  try {
    if (typeof location === 'undefined') return null
    const m = location.pathname.match(
      /^\/(todos|tasks|deadlines|reminders|finances|notes)\/([a-z0-9]+)$/i,
    )
    if (!m) return null
    const d = new URLSearchParams(location.search).get('d')
    const decoded = d ? decodeShare(d) : null
    return decoded || { notFound: true }
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
