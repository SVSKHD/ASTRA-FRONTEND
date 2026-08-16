import { describe, expect, it } from 'vitest'
import {
  assigneeOptions,
  countIssues,
  defaultIssueFilter,
  filterIssues,
  isLinked,
  labelOptions,
  repoTaskProgress,
  sortIssues,
} from './issueFilters'
import type { GithubIssue, Task } from '@/types'

function issue(over: Partial<GithubIssue> = {}): GithubIssue {
  return {
    id: 'octo__demo__1',
    repoId: 'octo__demo',
    number: 1,
    title: 'First',
    body: '',
    state: 'open',
    labels: [],
    assignees: [],
    author: 'octo',
    htmlUrl: '',
    createdAt: 0,
    updatedAt: 100,
    closedAt: null,
    commentsCount: 0,
    linkedTaskId: null,
    etag: '',
    ...over,
  }
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 't',
    tag: '',
    done: false,
    status: 'pending',
    deadline: '',
    notes: '',
    repo: '',
    rolledOverAt: null,
    rolloverCount: 0,
    completedAt: null,
    reminderIds: [],
    sourceRef: null,
    linked: [],
    parents: [],
    parentId: null,
    order: 0,
    depth: 0,
    rootId: 1,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
    github: null,
    ...over,
  }
}

const linkTo = (number: number, repoId = 'octo__demo') => ({
  repoId,
  issueNumber: number,
  issueUrl: '',
  state: 'open' as const,
  syncedAt: 0,
})

describe('isLinked', () => {
  it('is true when the mirrored record carries a task id', () => {
    expect(isLinked(issue({ linkedTaskId: 7 }), [])).toBe(true)
  })

  it('is true when a task points at the issue, even with no marker', () => {
    expect(isLinked(issue(), [task({ github: linkTo(1) })])).toBe(true)
  })

  it('is false for an issue nothing points at', () => {
    expect(isLinked(issue(), [task({ github: linkTo(2) })])).toBe(false)
  })
})

describe('filterIssues', () => {
  const issues = [
    issue({ id: 'a', number: 1, state: 'open', labels: ['bug'], assignees: ['octo'] }),
    issue({ id: 'b', number: 2, state: 'closed', labels: ['docs'], linkedTaskId: 5 }),
    issue({ id: 'c', number: 3, repoId: 'other__repo', title: 'Elsewhere' }),
  ]

  it('defaults to open issues across every repo', () => {
    expect(filterIssues(issues, defaultIssueFilter()).map((i) => i.id)).toEqual(['a', 'c'])
  })

  it('filters by repo', () => {
    const f = { ...defaultIssueFilter(), repoId: 'other__repo', state: 'all' as const }
    expect(filterIssues(issues, f).map((i) => i.id)).toEqual(['c'])
  })

  it('filters by label, case-insensitively', () => {
    const f = { ...defaultIssueFilter(), state: 'all' as const, label: 'BUG' }
    expect(filterIssues(issues, f).map((i) => i.id)).toEqual(['a'])
  })

  it('filters by assignee', () => {
    const f = { ...defaultIssueFilter(), state: 'all' as const, assignee: 'octo' }
    expect(filterIssues(issues, f).map((i) => i.id)).toEqual(['a'])
  })

  it('filters by linked and unlinked', () => {
    const base = { ...defaultIssueFilter(), state: 'all' as const }
    expect(filterIssues(issues, { ...base, link: 'linked' }).map((i) => i.id)).toEqual(['b'])
    expect(filterIssues(issues, { ...base, link: 'unlinked' }).map((i) => i.id)).toEqual(['a', 'c'])
  })

  it('matches the free-text query on an exact number or a title substring', () => {
    const base = { ...defaultIssueFilter(), state: 'all' as const }
    expect(filterIssues(issues, { ...base, query: '2' }).map((i) => i.id)).toEqual(['b'])
    expect(filterIssues(issues, { ...base, query: 'else' }).map((i) => i.id)).toEqual(['c'])
    expect(filterIssues(issues, { ...base, query: 'zzz' })).toEqual([])
  })
})

describe('sortIssues', () => {
  it('puts the most recently updated first', () => {
    const sorted = sortIssues([
      issue({ id: 'a', updatedAt: 10 }),
      issue({ id: 'b', updatedAt: 90 }),
    ])
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('does not mutate the input', () => {
    const list = [issue({ id: 'a', updatedAt: 1 }), issue({ id: 'b', updatedAt: 2 })]
    sortIssues(list)
    expect(list.map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('option lists', () => {
  it('collects unique, sorted labels and assignees', () => {
    const issues = [
      issue({ labels: ['bug', 'docs'], assignees: ['zoe', 'amy'] }),
      issue({ labels: ['bug'], assignees: ['amy'] }),
    ]
    expect(labelOptions(issues)).toEqual(['bug', 'docs'])
    expect(assigneeOptions(issues)).toEqual(['amy', 'zoe'])
  })
})

describe('countIssues', () => {
  it('counts open, closed and unlinked', () => {
    const counts = countIssues(
      [issue({ number: 1 }), issue({ number: 2, state: 'closed', linkedTaskId: 3 })],
      [],
    )
    expect(counts).toEqual({ total: 2, open: 1, closed: 1, unlinked: 1 })
  })
})

describe('repoTaskProgress', () => {
  it('counts linked tasks done over total for one repo', () => {
    const tasks = [
      task({ id: 1, status: 'done', github: linkTo(1) }),
      task({ id: 2, github: linkTo(2) }),
      task({ id: 3, github: linkTo(3, 'other__repo') }),
      task({ id: 4 }),
    ]
    expect(repoTaskProgress('octo__demo', tasks)).toEqual({ done: 1, total: 2 })
  })

  it('reports zero over zero for a repo with no linked tasks', () => {
    expect(repoTaskProgress('octo__demo', [])).toEqual({ done: 0, total: 0 })
  })
})
