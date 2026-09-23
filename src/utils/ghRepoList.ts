// Every repository the token can see, for the Code tab's browse list.
//
// THE CODE TAB'S MAIN LIST IS A MIRROR, not a list of your repositories: it
// shows what the webhook and the sweep have written into Firestore, so a repo
// appears there only after it is tracked AND something has arrived for it. That
// is correct for "what is waiting on me" and useless for "which repositories do
// I have", which is the question you ask once, when deciding what to track.
//
// So this is the other half: the proxy's `installations` op returns GitHub's
// `/user/repos` verbatim, and these functions turn that into rows. Pure, because
// the shaping is the part worth testing and a network call is not.

export interface GhRepoRow {
  /** GitHub's numeric id, and the row key. */
  id: number
  fullName: string
  private: boolean
  /** '' when GitHub reports none, which it does for an empty repository. */
  language: string
  description: string
  /** Epoch ms; 0 when GitHub sent nothing usable. */
  pushedAt: number
  url: string
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** An ISO stamp in epoch ms, or 0 — a repo with an unreadable date still lists. */
function stamp(value: unknown): number {
  const parsed = Date.parse(str(value))
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * GitHub's repository array, as rows, newest push first.
 *
 * Tolerant on purpose: anything that is not an object, or carries no
 * `full_name`, is dropped rather than rendered as a blank row.
 */
export function parseRepoRows(raw: unknown): GhRepoRow[] {
  if (!Array.isArray(raw)) return []
  const rows: GhRepoRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const fullName = str(r.full_name) || str(r.fullName)
    if (!fullName) continue
    rows.push({
      id: typeof r.id === 'number' ? r.id : 0,
      fullName,
      private: r.private === true,
      language: str(r.language),
      description: str(r.description),
      pushedAt: stamp(r.pushed_at ?? r.pushedAt),
      url: str(r.html_url) || `https://github.com/${fullName}`,
    })
  }
  return rows.sort((a, b) => b.pushedAt - a.pushedAt)
}

/** Substring match on the name, case-insensitively. A blank query keeps all. */
export function filterRepoRows(rows: readonly GhRepoRow[], query: string): GhRepoRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...rows]
  return rows.filter((r) => r.fullName.toLowerCase().includes(q))
}

/**
 * Tracking compares lower-cased names, because that is what the webhook matches
 * on: a repo tracked as `SVSKHD/Astra` would otherwise never resolve to a uid.
 */
export function isTracked(tracked: readonly string[], fullName: string): boolean {
  const name = fullName.trim().toLowerCase()
  return tracked.some((t) => t.trim().toLowerCase() === name)
}

/** The tracked list with `fullName` added or removed, deduped and lower-cased. */
export function withTracked(tracked: readonly string[], fullName: string, on: boolean): string[] {
  const name = fullName.trim().toLowerCase()
  const without = tracked.map((t) => t.trim().toLowerCase()).filter((t) => t && t !== name)
  return on ? [...without, name] : without
}
