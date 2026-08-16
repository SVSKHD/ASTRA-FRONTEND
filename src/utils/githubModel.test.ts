import { describe, expect, it } from 'vitest'
import {
  buildIssueBody,
  ingestIssues,
  issueFromApi,
  issueKey,
  issueStateForTaskStatus,
  mergeIssue,
  parseIssueKey,
  parseRepoKey,
  parseTaskMarker,
  passesLabelFilter,
  repoFromApi,
  repoKey,
  shouldPatchIssue,
  stripSpastaFooter,
  taskStatusForIssueState,
  taskUrl,
} from './githubModel'
import type { GithubIssue, Task } from '@/types'

function issue(over: Partial<GithubIssue> = {}): GithubIssue {
  return {
    id: 'octo__demo__12',
    repoId: 'octo__demo',
    number: 12,
    title: 'Fix the thing',
    body: '',
    state: 'open',
    labels: [],
    assignees: [],
    author: 'octo',
    htmlUrl: 'https://github.com/octo/demo/issues/12',
    createdAt: 1000,
    updatedAt: 2000,
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
    title: 'Fix the thing',
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

describe('composite ids', () => {
  it('round-trips a repo key', () => {
    expect(repoKey('octo', 'demo')).toBe('octo__demo')
    expect(parseRepoKey('octo__demo')).toEqual({ owner: 'octo', name: 'demo' })
  })

  it('round-trips an issue key', () => {
    expect(issueKey('octo', 'demo', 42)).toBe('octo__demo__42')
    expect(parseIssueKey('octo__demo__42')).toEqual({ owner: 'octo', name: 'demo', number: 42 })
  })

  it('rejects malformed keys rather than guessing', () => {
    expect(parseRepoKey('octo')).toBeNull()
    expect(parseRepoKey('octo__')).toBeNull()
    expect(parseIssueKey('octo__demo')).toBeNull()
    expect(parseIssueKey('octo__demo__x')).toBeNull()
  })
})

describe('issue body round-trip', () => {
  it('appends a backlink and the task marker', () => {
    const body = buildIssueBody('Do the work', 'https://app.test/tasks/7/view', 7)
    expect(body).toContain('Do the work')
    expect(body).toContain('[Open in Spasta](https://app.test/tasks/7/view)')
    expect(parseTaskMarker(body)).toBe(7)
  })

  it('still carries the marker when the description is empty', () => {
    expect(parseTaskMarker(buildIssueBody('', 'https://app.test/tasks/3/view', 3))).toBe(3)
  })

  it('strips the footer back off so a pulled-in task has a clean description', () => {
    const body = buildIssueBody('Do the work', 'https://app.test/tasks/7/view', 7)
    expect(stripSpastaFooter(body)).toBe('Do the work')
  })

  it('leaves an issue body we did not write alone', () => {
    expect(stripSpastaFooter('Written by a human\n\n---\nSigned, a human')).toBe(
      'Written by a human\n\n---\nSigned, a human',
    )
  })

  it('reports no marker for an unrelated body', () => {
    expect(parseTaskMarker('nothing here')).toBeNull()
    expect(parseTaskMarker(null)).toBeNull()
  })

  it('builds the task backlink from the app origin', () => {
    expect(taskUrl('https://app.test/', 9)).toBe('https://app.test/tasks/9/view')
  })
})

describe('normalisation', () => {
  it('maps a GitHub repo payload onto the linked-repo shape', () => {
    const repo = repoFromApi(
      {
        name: 'demo',
        full_name: 'octo/demo',
        owner: { login: 'octo' },
        default_branch: 'trunk',
        private: true,
        html_url: 'https://github.com/octo/demo',
        stargazers_count: 12,
        open_issues_count: 3,
        language: 'TypeScript',
        pushed_at: '2024-01-01T00:00:00Z',
      },
      500,
    )
    expect(repo).toMatchObject({
      id: 'octo__demo',
      fullName: 'octo/demo',
      defaultBranch: 'trunk',
      private: true,
      stars: 12,
      linkedAt: 500,
      syncEnabled: true,
    })
    expect(repo?.pushedAt).toBe(Date.parse('2024-01-01T00:00:00Z'))
  })

  it('refuses a repo payload with no owner', () => {
    expect(repoFromApi({ name: 'demo' }, 0)).toBeNull()
  })

  it('maps an issue payload, flattening labels and assignees', () => {
    const got = issueFromApi(
      {
        number: 12,
        title: 'Fix the thing',
        body: 'context <!-- spasta:taskId:5 -->',
        state: 'closed',
        labels: [{ name: 'bug' }, 'chore'],
        assignees: [{ login: 'octo' }],
        user: { login: 'nova' },
        html_url: 'https://github.com/octo/demo/issues/12',
        comments: 4,
        closed_at: '2024-02-02T00:00:00Z',
      },
      'octo__demo',
    )
    expect(got).toMatchObject({
      id: 'octo__demo__12',
      state: 'closed',
      labels: ['bug', 'chore'],
      assignees: ['octo'],
      author: 'nova',
      commentsCount: 4,
      linkedTaskId: 5,
    })
  })

  it('refuses an issue payload with no number', () => {
    expect(issueFromApi({ title: 'x' }, 'octo__demo')).toBeNull()
  })
})

describe('ingestion', () => {
  it('lets GitHub win for issue fields', () => {
    const existing = issue({ title: 'old', updatedAt: 1000 })
    const incoming = issue({ title: 'new', state: 'closed', updatedAt: 2000 })
    expect(mergeIssue(existing, incoming)).toMatchObject({ title: 'new', state: 'closed' })
  })

  it('keeps a Spasta-side link when the incoming payload has no marker', () => {
    const existing = issue({ linkedTaskId: 9, updatedAt: 1000 })
    const merged = mergeIssue(existing, issue({ updatedAt: 2000 }))
    expect(merged.linkedTaskId).toBe(9)
  })

  it('drops a stale delivery that is older than what is stored', () => {
    const existing = issue({ title: 'current', updatedAt: 5000 })
    expect(mergeIssue(existing, issue({ title: 'stale', updatedAt: 1000 })).title).toBe('current')
  })

  it('replaces in place and appends new issues, preserving order', () => {
    const list = [issue({ id: 'a', number: 1 }), issue({ id: 'b', number: 2 })]
    const merged = ingestIssues(list, [
      issue({ id: 'b', number: 2, title: 'B2', updatedAt: 3000 }),
      issue({ id: 'c', number: 3 }),
    ])
    expect(merged.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(merged[1].title).toBe('B2')
  })

  it('is a no-op for an empty batch', () => {
    const list = [issue()]
    expect(ingestIssues(list, [])).toBe(list)
  })
})

describe('label filter', () => {
  it('passes everything when the filter is empty', () => {
    expect(passesLabelFilter(issue({ labels: [] }), [])).toBe(true)
  })

  it('matches case-insensitively on any one label', () => {
    expect(passesLabelFilter(issue({ labels: ['Bug'] }), ['bug', 'chore'])).toBe(true)
    expect(passesLabelFilter(issue({ labels: ['docs'] }), ['bug'])).toBe(false)
  })
})

describe('two-way rules', () => {
  it('moves a task to done when its issue closes', () => {
    expect(taskStatusForIssueState('closed', 'progress')).toBe('done')
  })

  it('moves a done task back to in-progress when the issue reopens', () => {
    expect(taskStatusForIssueState('open', 'done')).toBe('progress')
  })

  it('leaves an already-open task where the user put it', () => {
    expect(taskStatusForIssueState('open', 'pending')).toBe('pending')
    expect(taskStatusForIssueState('open', 'progress')).toBe('progress')
  })

  it('closes the issue only when the task is done', () => {
    expect(issueStateForTaskStatus('done')).toBe('closed')
    expect(issueStateForTaskStatus('progress')).toBe('open')
    expect(issueStateForTaskStatus('pending')).toBe('open')
  })
})

describe('shouldPatchIssue', () => {
  const link = {
    repoId: 'octo__demo',
    issueNumber: 12,
    issueUrl: 'https://github.com/octo/demo/issues/12',
    state: 'open' as const,
    syncedAt: 0,
  }

  it('patches when the title diverged', () => {
    expect(shouldPatchIssue(task({ github: link, title: 'Renamed' }), issue())).toBe(true)
  })

  it('patches when the task went done but the issue is still open', () => {
    expect(shouldPatchIssue(task({ github: link, status: 'done' }), issue())).toBe(true)
  })

  it('does not patch when both sides already agree — no echo loop', () => {
    expect(shouldPatchIssue(task({ github: link }), issue())).toBe(false)
  })

  it('does not patch an unlinked task, or across a mismatched link', () => {
    expect(shouldPatchIssue(task(), issue())).toBe(false)
    expect(shouldPatchIssue(task({ github: { ...link, issueNumber: 99 } }), issue())).toBe(false)
  })
})
