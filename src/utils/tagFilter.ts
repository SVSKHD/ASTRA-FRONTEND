// Filtering a list by tag (Todos, Tasks, Goals).
//
// One rule for all three, kept out of the views so it can be tested without
// mounting anything. The unit being filtered is a TOP-LEVEL row, and a row is
// described by every tag in it — its own and, for todos and tasks, every
// subtask's below it. That is what stops a tagged subtask from disappearing
// because the item it sits under was never tagged: filtering to "Trading" should
// find the trading work wherever in the tree it lives.

import { sameTag } from '@/utils/tags'

/**
 * The option that means "carries no tag at all". A value no normalised tag can
 * ever be — `normalizeTag` collapses whitespace and keeps what was typed, and
 * nobody types two underscores either side of a word into a tag field.
 */
export const UNTAGGED = '__untagged__'

export interface TagFilterOption {
  value: string
  label: string
}

/**
 * Whether a row, described by all the tags in it, passes the filter. An empty
 * filter passes everything; blank entries in `tags` are ignored, so a subtree of
 * untagged nodes reads as untagged rather than as tagged with ''.
 */
export function matchesTagFilter(tags: readonly string[], filter: string): boolean {
  if (!filter) return true
  if (filter === UNTAGGED) return !tags.some((t) => !!t)
  return tags.some((t) => !!t && sameTag(t, filter))
}

/**
 * The choices, each with how many rows it would leave.
 *
 * Only tags somebody actually used are offered: the vocabulary also holds tags
 * that nothing carries any more, and a filter that can only ever produce an
 * empty list is a trap. Vocabulary order is kept, because it is the order the
 * reader sees in every tag picker; a tag in use that the vocabulary has lost
 * follows, alphabetically.
 *
 * The current selection is always offered, even at zero — otherwise the control
 * would fall back to its placeholder and claim "All tags" while the list is
 * still filtered.
 */
export function tagFilterOptions(
  vocab: readonly string[],
  groups: readonly (readonly string[])[],
  current = '',
): TagFilterOption[] {
  const counts = new Map<string, { label: string; n: number }>()
  let untagged = 0
  for (const group of groups) {
    const seen = new Set<string>()
    for (const raw of group) {
      const tag = (raw ?? '').trim()
      if (!tag) continue
      const key = tag.toLowerCase()
      // Once per row, however many of its subtasks share the tag: the count is
      // rows the filter would leave, not tag occurrences.
      if (seen.has(key)) continue
      seen.add(key)
      const entry = counts.get(key)
      if (entry) entry.n++
      else counts.set(key, { label: vocab.find((v) => sameTag(v, tag)) ?? tag, n: 1 })
    }
    if (!seen.size) untagged++
  }

  const out: TagFilterOption[] = []
  const placed = new Set<string>()
  const push = (label: string, n: number) => {
    placed.add(label.toLowerCase())
    out.push({ value: label, label: `${label} · ${n}` })
  }
  for (const tag of vocab) {
    const entry = counts.get(tag.toLowerCase())
    if (entry && !placed.has(tag.toLowerCase())) push(entry.label, entry.n)
  }
  const strays = [...counts.values()]
    .filter((e) => !placed.has(e.label.toLowerCase()))
    .sort((a, b) => a.label.localeCompare(b.label))
  for (const entry of strays) push(entry.label, entry.n)

  if (current && current !== UNTAGGED && !placed.has(current.toLowerCase())) push(current, 0)
  if (untagged || current === UNTAGGED) {
    out.push({ value: UNTAGGED, label: `Untagged · ${untagged}` })
  }
  return out
}

/**
 * Whether a row passes a TYPED tag query (the input above the todo and task
 * lists). Case-insensitive; a query that names a tag in use exactly matches
 * only that tag, so picking "Work" does not also pull in "Workout" — anything
 * else is a substring match, which is what narrowing-as-you-type needs.
 */
export function matchesTagQuery(
  tags: readonly string[],
  query: string,
  inUse: readonly string[] = [],
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const exact = inUse.some((t) => t.trim().toLowerCase() === q)
  return tags.some((raw) => {
    const t = (raw ?? '').trim().toLowerCase()
    if (!t) return false
    return exact ? t === q : t.includes(q)
  })
}

/**
 * The suggestion chips under the tag input: tags in use whose name contains the
 * query, with row counts, in the same order the dropdown filter uses. A query
 * that already names one tag exactly suggests nothing — the question is answered.
 */
export function tagQuerySuggestions(
  vocab: readonly string[],
  groups: readonly (readonly string[])[],
  query: string,
): TagFilterOption[] {
  const q = query.trim().toLowerCase()
  const options = tagFilterOptions(vocab, groups).filter((o) => o.value !== UNTAGGED)
  if (!q) return options
  if (options.some((o) => o.value.toLowerCase() === q)) return []
  return options.filter((o) => o.value.toLowerCase().includes(q))
}

/** The sentence for a typed query that left nothing. */
export function emptyTagQueryMessage(query: string, noun: string): string {
  return `No ${noun} with a tag matching “${query.trim()}”.`
}

/** The sentence for a filter that left nothing, rather than an empty column. */
export function emptyTagMessage(filter: string, noun: string): string {
  return filter === UNTAGGED ? `No untagged ${noun}.` : `No ${noun} tagged “${filter}”.`
}
