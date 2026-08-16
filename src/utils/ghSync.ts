// Webhook ingestion and the issue → task effects it produces (section 13f).
//
// The delivery path is: GitHub webhook (`issues`, `issue_comment`, `push`,
// `pull_request`) → Cloud Function → the workspace document → this client's
// existing onSnapshot listener. The function is where the `X-Hub-Signature-256`
// HMAC is verified against the shared webhook secret and a mismatch is rejected;
// the secret is never in the browser, so the client's half is what you see here:
// turn a delivery into a mirrored issue, and turn a mirrored issue into the one
// narrow task effect the spec allows.
//
// Everything is pure. The store owns the writes and the sync-guard interaction.

import { issueFromApi, taskStatusForIssueState } from '@/utils/githubModel'
import type { GithubIssue, GithubLink, ItemStatus, LinkedRepo, Task } from '@/types'

// The header the Cloud Function must verify on every delivery. Named here so the
// contract is written down next to the code that depends on it.
export const WEBHOOK_SIGNATURE_HEADER = 'X-Hub-Signature-256'

// Constant-time hex comparison, for the function's signature check. Kept pure
// and here so the rule ("reject on mismatch") is unit-tested rather than assumed.
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export type GhEventName = 'issues' | 'issue_comment' | 'push' | 'pull_request'

// One verified delivery, as the Cloud Function records it.
export interface GhDelivery {
  event: GhEventName
  action: string
  repoId: string
  deliveryId: string
  receivedAt: number
  issue?: Record<string, unknown>
  repository?: Record<string, unknown>
  comment?: Record<string, unknown>
}

export function isGhDelivery(v: unknown): v is GhDelivery {
  if (!v || typeof v !== 'object') return false
  const d = v as Partial<GhDelivery>
  return (
    typeof d.repoId === 'string' &&
    (d.event === 'issues' ||
      d.event === 'issue_comment' ||
      d.event === 'push' ||
      d.event === 'pull_request')
  )
}

// The issue a delivery carries, if any. `issue_comment` deliveries carry the
// issue too, which is how the comment count stays current without syncing the
// comments themselves (explicitly out of scope for v1).
export function issueFromDelivery(delivery: GhDelivery): GithubIssue | null {
  if (delivery.event !== 'issues' && delivery.event !== 'issue_comment') return null
  if (!delivery.issue) return null
  return issueFromApi(delivery.issue, delivery.repoId)
}

// What a delivery says about the repo itself. `push` moves pushedAt; an issues
// event moves the open count. Returns null when there is nothing to patch, so
// the caller can skip a pointless write.
export function repoPatchFromDelivery(delivery: GhDelivery): Partial<LinkedRepo> | null {
  const repo = delivery.repository
  const patch: Partial<LinkedRepo> = {}
  if (delivery.event === 'push') {
    const pushedAt =
      typeof repo?.pushed_at === 'string' ? Date.parse(repo.pushed_at) : delivery.receivedAt
    if (Number.isFinite(pushedAt)) patch.pushedAt = pushedAt
  }
  if (typeof repo?.open_issues_count === 'number') patch.openIssuesCount = repo.open_issues_count
  if (typeof repo?.stargazers_count === 'number') patch.stars = repo.stargazers_count
  return Object.keys(patch).length ? patch : null
}

// ---- issue → task effects ---------------------------------------------------

// The single mutation an inbound issue is allowed to make to a task.
export interface TaskEffect {
  taskId: number
  status: ItemStatus
  link: GithubLink
}

// Resolve the task on the other side of an issue. The stored `linkedTaskId`
// (from the body marker or an explicit link) is authoritative; a task whose own
// `github` link points at this issue is the fallback, which is what makes
// linking an existing issue — one whose body we never rewrite — work.
export function taskForIssue(issue: GithubIssue, tasks: Task[]): Task | undefined {
  if (issue.linkedTaskId !== null) {
    const byMarker = tasks.find((t) => t.id === issue.linkedTaskId)
    if (byMarker) return byMarker
  }
  return tasks.find(
    (t) => t.github?.repoId === issue.repoId && t.github.issueNumber === issue.number,
  )
}

// The effect an issue has on its task, or null when there is nothing to change.
// Only the state rule crosses this way; labels and assignees are mirrored onto
// the issue record but never written onto the task, and comments never sync.
export function effectForIssue(issue: GithubIssue, tasks: Task[]): TaskEffect | null {
  const task = taskForIssue(issue, tasks)
  if (!task) return null
  const status = taskStatusForIssueState(issue.state, task.status)
  const link: GithubLink = {
    repoId: issue.repoId,
    issueNumber: issue.number,
    issueUrl: issue.htmlUrl,
    state: issue.state,
    syncedAt: Date.now(),
  }
  const linkUnchanged =
    task.github?.state === issue.state &&
    task.github.issueNumber === issue.number &&
    task.github.repoId === issue.repoId &&
    task.github.issueUrl === issue.htmlUrl
  if (status === task.status && linkUnchanged) return null
  return { taskId: task.id, status, link }
}

export function effectsForIssues(issues: GithubIssue[], tasks: Task[]): TaskEffect[] {
  const out: TaskEffect[] = []
  for (const issue of issues) {
    const effect = effectForIssue(issue, tasks)
    if (effect) out.push(effect)
  }
  return out
}

// Section 3's guard, applied to webhooks: an effect for a task the user has open
// (or has unsaved edits on) is deferred, never applied underneath them. The
// store replays the deferred half when the dialog closes, so the edit survives
// and the webhook is not lost (acceptance 57).
export function partitionEffects(
  effects: TaskEffect[],
  protectedIds: Set<number>,
): { apply: TaskEffect[]; deferred: TaskEffect[] } {
  const apply: TaskEffect[] = []
  const deferred: TaskEffect[] = []
  for (const e of effects) (protectedIds.has(e.taskId) ? deferred : apply).push(e)
  return { apply, deferred }
}

// Fold a newer effect over an older one for the same task, so a burst of
// deliveries during one open dialog replays as a single final state.
export function mergeDeferred(existing: TaskEffect[], incoming: TaskEffect[]): TaskEffect[] {
  const byTask = new Map(existing.map((e) => [e.taskId, e]))
  for (const e of incoming) byTask.set(e.taskId, e)
  return [...byTask.values()]
}
