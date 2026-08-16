// Filtering and option-building for the Issues view (13d). Pure, so the view is
// just markup over these: filter by repo, state, label, assignee and
// linked/unlinked, plus a free-text match on number or title.

import type { GithubIssue, Task } from '@/types'

export type IssueLinkFilter = 'all' | 'linked' | 'unlinked'

export interface IssueFilter {
  repoId: string
  state: 'all' | 'open' | 'closed'
  label: string
  assignee: string
  link: IssueLinkFilter
  query: string
}

export function defaultIssueFilter(): IssueFilter {
  return { repoId: 'all', state: 'open', label: 'all', assignee: 'all', link: 'all', query: '' }
}

// An issue counts as linked when either side says so: the mirrored record's
// linkedTaskId, or a task pointing at it. Both are checked because an issue
// mirrored before its task was created carries only the marker.
export function isLinked(issue: GithubIssue, tasks: Task[]): boolean {
  if (issue.linkedTaskId !== null) return true
  return tasks.some(
    (t) => t.github?.repoId === issue.repoId && t.github.issueNumber === issue.number,
  )
}

export function filterIssues(
  issues: GithubIssue[],
  filter: IssueFilter,
  tasks: Task[] = [],
): GithubIssue[] {
  const q = filter.query.trim().toLowerCase()
  return issues.filter((i) => {
    if (filter.repoId !== 'all' && i.repoId !== filter.repoId) return false
    if (filter.state !== 'all' && i.state !== filter.state) return false
    if (
      filter.label !== 'all' &&
      !i.labels.some((l) => l.toLowerCase() === filter.label.toLowerCase())
    )
      return false
    if (filter.assignee !== 'all' && !i.assignees.includes(filter.assignee)) return false
    if (filter.link !== 'all') {
      const linked = isLinked(i, tasks)
      if (filter.link === 'linked' && !linked) return false
      if (filter.link === 'unlinked' && linked) return false
    }
    if (q && String(i.number) !== q && !i.title.toLowerCase().includes(q)) return false
    return true
  })
}

// Most recently updated first — an issues list is read newest-activity-down.
export function sortIssues(issues: GithubIssue[]): GithubIssue[] {
  return issues.slice().sort((a, b) => b.updatedAt - a.updatedAt || b.number - a.number)
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

export function labelOptions(issues: GithubIssue[]): string[] {
  return uniqueSorted(issues.flatMap((i) => i.labels))
}

export function assigneeOptions(issues: GithubIssue[]): string[] {
  return uniqueSorted(issues.flatMap((i) => i.assignees))
}

export interface IssueCounts {
  total: number
  open: number
  closed: number
  unlinked: number
}

export function countIssues(issues: GithubIssue[], tasks: Task[] = []): IssueCounts {
  let open = 0
  let unlinked = 0
  for (const i of issues) {
    if (i.state === 'open') open++
    if (!isLinked(i, tasks)) unlinked++
  }
  return { total: issues.length, open, closed: issues.length - open, unlinked }
}

// The repo card's progress line: linked tasks done / total, for one repo.
export function repoTaskProgress(repoId: string, tasks: Task[]): { done: number; total: number } {
  const linked = tasks.filter((t) => t.github?.repoId === repoId)
  return { done: linked.filter((t) => t.status === 'done').length, total: linked.length }
}
