// The detail dialog's address (section 18a). A dialog that is only component
// state cannot be linked to, reloaded into, or dismissed with the back button —
// so which dialog is open lives in the query string and everything else follows
// from it.
//
// Kept pure and router-free: the composable that owns the router reads the
// current query through `detailFromQuery` and writes the next one through
// `queryWithDetail`, so the round trip is unit-testable without a router.

export type DetailKind = 'task' | 'goal'

export interface DetailTarget {
  kind: DetailKind
  id: number
}

// The query key each kind occupies. Two keys rather than one `detail=task:4`
// pair, because `?task=4` is the link someone would type by hand.
export const DETAIL_KEYS: Record<DetailKind, string> = { task: 'task', goal: 'goal' }
const KINDS = Object.keys(DETAIL_KEYS) as DetailKind[]

// vue-router hands back `string | string[] | null` per key; a repeated key
// (`?task=1&task=2`) resolves to the first value rather than throwing.
function firstValue(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

// Which dialog the current URL asks for, or null for none. An id that is not a
// positive integer is treated as no dialog at all: a hand-mangled `?task=abc`
// should land on the plain list, not on a dialog wired to NaN.
export function detailFromQuery(query: Record<string, unknown>): DetailTarget | null {
  for (const kind of KINDS) {
    const raw = firstValue(query[DETAIL_KEYS[kind]])
    if (!raw) continue
    // Rejects '1.5', '1e3', ' 1' and '01x' — only a plain positive integer is an id.
    if (!/^[0-9]+$/.test(raw)) continue
    const id = Number(raw)
    if (id > 0 && Number.isSafeInteger(id)) return { kind, id }
  }
  return null
}

// The query for a given dialog, preserving every unrelated key (a tab, a search
// term) and clearing the other kind's key so the two can never both be set.
export function queryWithDetail(
  query: Record<string, unknown>,
  target: DetailTarget | null,
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (KINDS.some((kind) => DETAIL_KEYS[kind] === key)) continue
    const single = firstValue(value)
    if (single) next[key] = single
  }
  if (target) next[DETAIL_KEYS[target.kind]] = String(target.id)
  return next
}

export function sameTarget(a: DetailTarget | null, b: DetailTarget | null): boolean {
  if (!a || !b) return a === b
  return a.kind === b.kind && a.id === b.id
}
