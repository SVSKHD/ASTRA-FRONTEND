// The shared tag vocabulary. Todos and tasks both carry a single free-text
// tag; this keeps the set of tags anyone has actually used in one list, so the
// pickers can offer them instead of asking people to retype "Office" exactly.
// Tags are the axis we intend to slice both lists by later, so they are stored
// as their own list rather than being re-derived from the items each time — a
// tag survives deleting the last item that used it.

// What a fresh workspace starts with. Deliberately short: the point is that you
// add your own, not that we guess your life.
export const DEFAULT_TAGS = ['Office', 'Personal', 'Home', 'Errands']

// Display form: trimmed, inner whitespace collapsed. Case is preserved as
// typed — "Office" and "office" are the same tag, and the first spelling wins.
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 32)
}

export function sameTag(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

export function hasTag(list: readonly string[], tag: string): boolean {
  return list.some((t) => sameTag(t, tag))
}

// Add a tag to the vocabulary, case-insensitively deduped. Returns the same
// array reference when nothing changed so callers can skip a write.
export function withTag(list: readonly string[], raw: string): string[] {
  const tag = normalizeTag(raw)
  if (!tag || hasTag(list, tag)) return list as string[]
  return [...list, tag]
}

export function withoutTag(list: readonly string[], raw: string): string[] {
  const tag = normalizeTag(raw)
  return list.filter((t) => !sameTag(t, tag))
}

// Read a stored tag list back, dropping anything that is not a usable string
// and collapsing duplicates that older writes may have let through.
export function sanitizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const v of value) {
    if (typeof v !== 'string') continue
    const tag = normalizeTag(v)
    if (tag && !hasTag(out, tag)) out.push(tag)
  }
  return out
}

// A stable colour per tag, so the same tag looks the same everywhere without
// anyone having to pick one. Hue only — lightness and chroma stay fixed so no
// tag can turn unreadable on either theme.
export function tagColor(tag: string, dark: boolean): string {
  let h = 0
  const key = tag.toLowerCase()
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360
  return dark ? 'oklch(0.78 0.13 ' + h + ')' : 'oklch(0.55 0.14 ' + h + ')'
}
