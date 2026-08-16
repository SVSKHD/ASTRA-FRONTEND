// The GitHub domain model (section 13b–13c): stable ids, the issue-body
// round-trip marker, normalisation of GitHub API payloads, and the deliberately
// narrow two-way sync rules.
//
// Everything here is pure. The store owns the writes; this file owns the
// decisions — which is what keeps "GitHub wins for issue fields, Spasta wins for
// task-only fields" a single, testable rule rather than scattered ifs.
//
// Storage note: this app is one workspace document per user rather than the
// spec's /projects/{id}/repos and /projects/{id}/issues subcollections, so repos
// and issues live as flat arrays keyed by the same composite ids the spec names
// (`owner__name`, `owner__name__number`). The ids are identical, so a later move
// to subcollections is a transport change, not a model change.

import { emptyGithubIntegration } from '@/types'
import type {
  GithubIntegration,
  GithubIssue,
  GithubLink,
  ItemStatus,
  LinkedRepo,
  RepoCommit,
  RepoPull,
  Task,
} from '@/types'

// ---- ids -------------------------------------------------------------------

export function repoKey(owner: string, name: string): string {
  return `${owner}__${name}`
}

export function issueKey(owner: string, name: string, number: number): string {
  return `${owner}__${name}__${number}`
}

export function parseRepoKey(id: string): { owner: string; name: string } | null {
  const parts = id.split('__')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { owner: parts[0], name: parts[1] }
}

export function parseIssueKey(id: string): { owner: string; name: string; number: number } | null {
  const parts = id.split('__')
  if (parts.length !== 3) return null
  const number = Number(parts[2])
  if (!parts[0] || !parts[1] || !Number.isFinite(number)) return null
  return { owner: parts[0], name: parts[1], number }
}

export function fullName(repoId: string): string {
  const parsed = parseRepoKey(repoId)
  return parsed ? `${parsed.owner}/${parsed.name}` : repoId
}

// ---- the round-trip marker --------------------------------------------------

// An HTML comment, so GitHub renders nothing, and machine-readable, so pulling
// the issue back in can tell "already a task here" from "new". This is what stops
// a bulk import duplicating on the next sync (acceptance 58).
export function taskMarker(taskId: number): string {
  return `<!-- spasta:taskId:${taskId} -->`
}

const MARKER_RE = /<!--\s*spasta:taskId:(\d+)\s*-->/

export function parseTaskMarker(body: string | null | undefined): number | null {
  const m = MARKER_RE.exec(body || '')
  if (!m) return null
  const id = Number(m[1])
  return Number.isFinite(id) ? id : null
}

// The body written to GitHub: the task's own description, a human backlink, and
// the marker. Composed in one place so the footer is always recognisable.
export function buildIssueBody(description: string, taskUrl: string, taskId: number): string {
  const desc = (description || '').trim()
  const footer = [`[Open in Spasta](${taskUrl})`, taskMarker(taskId)].join('\n')
  return desc ? `${desc}\n\n---\n${footer}` : footer
}

// The inverse: the description GitHub is showing, minus the footer we appended.
// Used when pulling an issue in as a task so the task does not inherit its own
// backlink.
export function stripSpastaFooter(body: string | null | undefined): string {
  const raw = (body || '').replace(MARKER_RE, '')
  // The footer is the trailing `---` rule plus the backlink line we wrote.
  const cleaned = raw.replace(/\n*---\n+\[Open in Spasta\]\([^)]*\)\s*$/, '')
  return cleaned.trim()
}

// The URL a task's backlink points at. The workspace is a single page, so the
// deep link is the existing /tasks/:id/view route.
export function taskUrl(origin: string, taskId: number): string {
  return `${origin.replace(/\/$/, '')}/tasks/${taskId}/view`
}

// ---- normalisation ----------------------------------------------------------

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function ms(v: unknown): number | null {
  if (typeof v !== 'string' || !v) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

// GitHub labels are objects; the app keeps the names.
function labelNames(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((l) => (typeof l === 'string' ? l : str((l as { name?: unknown } | null)?.name)))
    .filter(Boolean)
}
function logins(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((a) => str((a as { login?: unknown } | null)?.login)).filter(Boolean)
}

export function repoFromApi(raw: Record<string, unknown>, linkedAt: number): LinkedRepo | null {
  const owner = str((raw.owner as { login?: unknown } | null)?.login) || str(raw.ownerLogin)
  const name = str(raw.name)
  if (!owner || !name) return null
  return {
    id: repoKey(owner, name),
    owner,
    name,
    fullName: str(raw.full_name) || `${owner}/${name}`,
    defaultBranch: str(raw.default_branch, 'main'),
    private: raw.private === true,
    htmlUrl: str(raw.html_url),
    stars: num(raw.stargazers_count),
    openIssuesCount: num(raw.open_issues_count),
    language: str(raw.language),
    pushedAt: ms(raw.pushed_at) ?? 0,
    linkedAt,
    syncEnabled: true,
    labelFilter: [],
    lastSyncAt: 0,
    etag: '',
  }
}

export function issueFromApi(raw: Record<string, unknown>, repoId: string): GithubIssue | null {
  const parsed = parseRepoKey(repoId)
  const number = num(raw.number, -1)
  if (!parsed || number < 0) return null
  const body = str(raw.body)
  return {
    id: issueKey(parsed.owner, parsed.name, number),
    repoId,
    number,
    title: str(raw.title),
    body,
    state: raw.state === 'closed' ? 'closed' : 'open',
    labels: labelNames(raw.labels),
    assignees: logins(raw.assignees),
    author: str((raw.user as { login?: unknown } | null)?.login),
    htmlUrl: str(raw.html_url),
    createdAt: ms(raw.created_at) ?? 0,
    updatedAt: ms(raw.updated_at) ?? 0,
    closedAt: ms(raw.closed_at),
    commentsCount: num(raw.comments),
    // The marker is the source of truth for "already pulled in": an issue
    // created from a task carries the task id in its body, so a re-sync links
    // rather than duplicates.
    linkedTaskId: parseTaskMarker(body),
    etag: '',
  }
}

// Recent commits on the default branch and open PRs, for the repo cards (13e).
// Read-only and never persisted, so these are plain normalisers with no merge
// rules attached.
export function commitFromApi(raw: Record<string, unknown>): RepoCommit | null {
  const sha = str(raw.sha)
  if (!sha) return null
  const commit = (raw.commit ?? {}) as Record<string, unknown>
  const author = (commit.author ?? {}) as Record<string, unknown>
  return {
    sha,
    // A commit message's first line is the subject; the body is not shown.
    message: str(commit.message).split('\n')[0],
    author: str((raw.author as { login?: unknown } | null)?.login) || str(author.name),
    committedAt: ms(author.date) ?? 0,
    htmlUrl: str(raw.html_url),
  }
}

// GitHub reports CI through the combined status / check-runs conclusion; the
// proxy flattens it to one word, and anything unrecognised reads as 'none'
// rather than pretending a PR is green.
export function pullFromApi(raw: Record<string, unknown>): RepoPull | null {
  const number = num(raw.number, -1)
  if (number < 0) return null
  const ci = str(raw.ci)
  return {
    number,
    title: str(raw.title),
    author: str((raw.user as { login?: unknown } | null)?.login),
    htmlUrl: str(raw.html_url),
    draft: raw.draft === true,
    ci: ci === 'passing' || ci === 'failing' || ci === 'pending' ? ci : 'none',
  }
}

// ---- ingestion --------------------------------------------------------------

// Merge one incoming issue into the stored list. GitHub wins for every issue
// field; `linkedTaskId` is a Spasta-only field, so a stored link survives an
// incoming payload that has no marker (the user may have linked an existing
// issue, which never rewrites the body). A stale delivery — older updatedAt than
// what we hold — is dropped rather than applied.
export function mergeIssue(existing: GithubIssue | undefined, incoming: GithubIssue): GithubIssue {
  if (!existing) return incoming
  if (incoming.updatedAt && existing.updatedAt && incoming.updatedAt < existing.updatedAt) {
    return existing
  }
  return {
    ...incoming,
    linkedTaskId: incoming.linkedTaskId ?? existing.linkedTaskId,
    etag: incoming.etag || existing.etag,
  }
}

// Fold a batch of incoming issues into the list, replacing by id and keeping the
// rest untouched. Order is stable: existing entries stay in place, new ones are
// appended.
export function ingestIssues(list: GithubIssue[], incoming: GithubIssue[]): GithubIssue[] {
  if (!incoming.length) return list
  const byId = new Map(list.map((i) => [i.id, i]))
  for (const inc of incoming) byId.set(inc.id, mergeIssue(byId.get(inc.id), inc))
  const seen = new Set(list.map((i) => i.id))
  const merged = list.map((i) => byId.get(i.id) as GithubIssue)
  for (const inc of incoming) if (!seen.has(inc.id)) merged.push(byId.get(inc.id) as GithubIssue)
  return merged
}

// A repo's label filter: empty means "everything". An issue passes when it
// carries at least one of the filtered labels.
export function passesLabelFilter(issue: GithubIssue, labelFilter: string[]): boolean {
  if (!labelFilter.length) return true
  const have = new Set(issue.labels.map((l) => l.toLowerCase()))
  return labelFilter.some((l) => have.has(l.toLowerCase()))
}

// ---- hydration ---------------------------------------------------------------
//
// Read-side sanitisers. They are strict allow-lists rather than spreads, which
// is also what guarantees a stray field written by an older/newer client — or
// anything token-shaped — cannot survive into app state (acceptance 59).

export function githubLinkOf(v: unknown): GithubLink | null {
  if (!v || typeof v !== 'object') return null
  const l = v as Record<string, unknown>
  if (typeof l.repoId !== 'string' || typeof l.issueNumber !== 'number') return null
  return {
    repoId: l.repoId,
    issueNumber: l.issueNumber,
    issueUrl: str(l.issueUrl),
    state: l.state === 'closed' ? 'closed' : 'open',
    syncedAt: num(l.syncedAt),
  }
}

export function sanitizeRepo(v: unknown): LinkedRepo | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const owner = str(r.owner)
  const name = str(r.name)
  if (!owner || !name) return null
  return {
    id: str(r.id) || repoKey(owner, name),
    owner,
    name,
    fullName: str(r.fullName) || `${owner}/${name}`,
    defaultBranch: str(r.defaultBranch, 'main'),
    private: r.private === true,
    htmlUrl: str(r.htmlUrl),
    stars: num(r.stars),
    openIssuesCount: num(r.openIssuesCount),
    language: str(r.language),
    pushedAt: num(r.pushedAt),
    linkedAt: num(r.linkedAt),
    syncEnabled: r.syncEnabled !== false,
    labelFilter: Array.isArray(r.labelFilter)
      ? r.labelFilter.filter((l): l is string => typeof l === 'string')
      : [],
    lastSyncAt: num(r.lastSyncAt),
    etag: str(r.etag),
  }
}

export function sanitizeIssue(v: unknown): GithubIssue | null {
  if (!v || typeof v !== 'object') return null
  const i = v as Record<string, unknown>
  const repoId = str(i.repoId)
  const number = num(i.number, -1)
  if (!repoId || number < 0) return null
  const parsed = parseRepoKey(repoId)
  return {
    id:
      str(i.id) || (parsed ? issueKey(parsed.owner, parsed.name, number) : `${repoId}__${number}`),
    repoId,
    number,
    title: str(i.title),
    body: str(i.body),
    state: i.state === 'closed' ? 'closed' : 'open',
    labels: Array.isArray(i.labels)
      ? i.labels.filter((l): l is string => typeof l === 'string')
      : [],
    assignees: Array.isArray(i.assignees)
      ? i.assignees.filter((a): a is string => typeof a === 'string')
      : [],
    author: str(i.author),
    htmlUrl: str(i.htmlUrl),
    createdAt: num(i.createdAt),
    updatedAt: num(i.updatedAt),
    closedAt: typeof i.closedAt === 'number' ? i.closedAt : null,
    commentsCount: num(i.commentsCount),
    linkedTaskId: typeof i.linkedTaskId === 'number' ? i.linkedTaskId : null,
    etag: str(i.etag),
  }
}

export function sanitizeIntegration(v: unknown): GithubIntegration {
  const empty = emptyGithubIntegration()
  if (!v || typeof v !== 'object') return empty
  const g = v as Record<string, unknown>
  const rl =
    g.rateLimit && typeof g.rateLimit === 'object' ? (g.rateLimit as Record<string, unknown>) : null
  return {
    installationId: typeof g.installationId === 'number' ? g.installationId : null,
    login: str(g.login),
    avatarUrl: str(g.avatarUrl),
    connectedAt: typeof g.connectedAt === 'number' ? g.connectedAt : null,
    scopes: Array.isArray(g.scopes)
      ? g.scopes.filter((s): s is string => typeof s === 'string')
      : [],
    lastSyncAt: num(g.lastSyncAt),
    rateLimit: rl
      ? { limit: num(rl.limit), remaining: num(rl.remaining), resetAt: num(rl.resetAt) }
      : null,
    pausedUntil: typeof g.pausedUntil === 'number' ? g.pausedUntil : null,
    pausedReason: str(g.pausedReason),
  }
}

// ---- the two-way rules (13c) -----------------------------------------------
//
//   issue closed on GitHub  → task done
//   issue reopened          → task back to in-progress
//   task done in Spasta     → issue closed (with a comment)
//   task title/description  → PATCH the issue (debounced)
//   labels / assignees      → GitHub → Spasta only
//
// Anything not listed does not sync. That narrowness is the point: nothing here
// can fight anything else.

export function taskStatusForIssueState(state: 'open' | 'closed', current: ItemStatus): ItemStatus {
  if (state === 'closed') return 'done'
  // Reopened: a done task moves back to in-progress; a task that was already
  // open is left exactly where the user put it.
  return current === 'done' ? 'progress' : current
}

export function issueStateForTaskStatus(status: ItemStatus): 'open' | 'closed' {
  return status === 'done' ? 'closed' : 'open'
}

export const CLOSED_VIA_SPASTA = 'Closed via Spasta'

// Whether an issue PATCH is warranted: only from the linked side, and only when
// a synced field actually differs. Prevents an echo loop where an inbound
// webhook write triggers an outbound patch.
export function shouldPatchIssue(task: Task, issue: GithubIssue | undefined): boolean {
  if (!task.github || !issue) return false
  if (task.github.repoId !== issue.repoId || task.github.issueNumber !== issue.number) return false
  return (
    task.title.trim() !== issue.title.trim() || issueStateForTaskStatus(task.status) !== issue.state
  )
}

// The chip shown on a task row / dialog: `#123 · open`.
export function issueChipLabel(link: GithubLink): string {
  return `#${link.issueNumber} · ${link.state}`
}

export function issueStateColor(state: 'open' | 'closed'): string {
  return state === 'open' ? 'oklch(0.7 0.16 150)' : 'oklch(0.68 0.16 300)'
}
