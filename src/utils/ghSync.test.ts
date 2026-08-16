import { describe, expect, it } from 'vitest'
import {
  effectForIssue,
  effectsForIssues,
  isGhDelivery,
  issueFromDelivery,
  mergeDeferred,
  partitionEffects,
  repoPatchFromDelivery,
  taskForIssue,
  timingSafeEqualHex,
  type GhDelivery,
} from './ghSync'
import type { GithubIssue, GithubLink, Task } from '@/types'

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

const link: GithubLink = {
  repoId: 'octo__demo',
  issueNumber: 12,
  issueUrl: 'https://github.com/octo/demo/issues/12',
  state: 'open',
  syncedAt: 0,
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Fix the thing',
    tag: '',
    done: false,
    status: 'progress',
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
    github: link,
    ...over,
  }
}

function delivery(over: Partial<GhDelivery> = {}): GhDelivery {
  return {
    event: 'issues',
    action: 'closed',
    repoId: 'octo__demo',
    deliveryId: 'd1',
    receivedAt: 5000,
    ...over,
  }
}

describe('timingSafeEqualHex', () => {
  it('accepts an exact match and rejects everything else', () => {
    expect(timingSafeEqualHex('abc123', 'abc123')).toBe(true)
    expect(timingSafeEqualHex('abc123', 'abc124')).toBe(false)
    expect(timingSafeEqualHex('abc123', 'abc12')).toBe(false)
    expect(timingSafeEqualHex('', '')).toBe(true)
  })

  it('rejects non-string input rather than coercing it', () => {
    expect(timingSafeEqualHex(undefined as unknown as string, 'a')).toBe(false)
  })
})

describe('isGhDelivery', () => {
  it('accepts the four subscribed event names', () => {
    for (const event of ['issues', 'issue_comment', 'push', 'pull_request'] as const) {
      expect(isGhDelivery({ event, repoId: 'octo__demo' })).toBe(true)
    }
  })

  it('rejects an unknown event or a missing repo', () => {
    expect(isGhDelivery({ event: 'release', repoId: 'octo__demo' })).toBe(false)
    expect(isGhDelivery({ event: 'issues' })).toBe(false)
    expect(isGhDelivery(null)).toBe(false)
  })
})

describe('issueFromDelivery', () => {
  it('mirrors the issue an issues event carries', () => {
    const got = issueFromDelivery(
      delivery({ issue: { number: 12, title: 'Fix', state: 'closed' } }),
    )
    expect(got).toMatchObject({ id: 'octo__demo__12', state: 'closed' })
  })

  it('also mirrors from an issue_comment event, keeping the comment count fresh', () => {
    const got = issueFromDelivery(
      delivery({ event: 'issue_comment', action: 'created', issue: { number: 12, comments: 3 } }),
    )
    expect(got?.commentsCount).toBe(3)
  })

  it('ignores push and pull_request deliveries', () => {
    expect(issueFromDelivery(delivery({ event: 'push', issue: { number: 1 } }))).toBeNull()
    expect(issueFromDelivery(delivery({ event: 'pull_request', issue: { number: 1 } }))).toBeNull()
  })
})

describe('repoPatchFromDelivery', () => {
  it('moves pushedAt on a push', () => {
    const patch = repoPatchFromDelivery(
      delivery({ event: 'push', repository: { pushed_at: '2024-03-03T00:00:00Z' } }),
    )
    expect(patch?.pushedAt).toBe(Date.parse('2024-03-03T00:00:00Z'))
  })

  it('falls back to the receive time when the payload has no pushed_at', () => {
    expect(repoPatchFromDelivery(delivery({ event: 'push' }))?.pushedAt).toBe(5000)
  })

  it('carries the open-issue count from any event that reports it', () => {
    const patch = repoPatchFromDelivery(delivery({ repository: { open_issues_count: 4 } }))
    expect(patch).toEqual({ openIssuesCount: 4 })
  })

  it('returns null when there is nothing worth writing', () => {
    expect(repoPatchFromDelivery(delivery({ repository: {} }))).toBeNull()
  })
})

describe('taskForIssue', () => {
  it('prefers the body marker', () => {
    const tasks = [task({ id: 1, github: null }), task({ id: 9, github: null })]
    expect(taskForIssue(issue({ linkedTaskId: 9 }), tasks)?.id).toBe(9)
  })

  it('falls back to a task whose own link points at the issue', () => {
    expect(taskForIssue(issue(), [task({ id: 3 })])?.id).toBe(3)
  })

  it('finds nothing for an unlinked issue', () => {
    expect(taskForIssue(issue(), [task({ github: null })])).toBeUndefined()
  })
})

describe('effectForIssue', () => {
  it('marks the task done when the issue closes (acceptance 56)', () => {
    const effect = effectForIssue(issue({ state: 'closed' }), [task({ status: 'progress' })])
    expect(effect).toMatchObject({ taskId: 1, status: 'done' })
    expect(effect?.link.state).toBe('closed')
  })

  it('moves a done task back to in-progress when the issue reopens', () => {
    const effect = effectForIssue(issue({ state: 'open' }), [
      task({ status: 'done', github: { ...link, state: 'closed' } }),
    ])
    expect(effect?.status).toBe('progress')
  })

  it('produces nothing when both sides already agree', () => {
    expect(effectForIssue(issue(), [task({ status: 'progress' })])).toBeNull()
  })

  it('refreshes a stale link even when the status is unchanged', () => {
    const effect = effectForIssue(
      issue({ htmlUrl: 'https://github.com/octo/demo/issues/12#new' }),
      [task({ status: 'progress' })],
    )
    expect(effect?.link.issueUrl).toBe('https://github.com/octo/demo/issues/12#new')
  })

  it('produces nothing for an issue no task is linked to', () => {
    expect(effectForIssue(issue(), [task({ github: null })])).toBeNull()
  })

  it('collects one effect per changed issue', () => {
    const tasks = [task({ id: 1 }), task({ id: 2, github: { ...link, issueNumber: 13 } })]
    const effects = effectsForIssues(
      [issue({ state: 'closed' }), issue({ id: 'octo__demo__13', number: 13, state: 'closed' })],
      tasks,
    )
    expect(effects.map((e) => e.taskId)).toEqual([1, 2])
  })
})

describe('partitionEffects', () => {
  it('defers effects for tasks the user has open (acceptance 57)', () => {
    const effects = effectsForIssues([issue({ state: 'closed' })], [task({ id: 1 })])
    const { apply, deferred } = partitionEffects(effects, new Set([1]))
    expect(apply).toEqual([])
    expect(deferred.map((e) => e.taskId)).toEqual([1])
  })

  it('applies effects for everything else', () => {
    const effects = effectsForIssues([issue({ state: 'closed' })], [task({ id: 1 })])
    expect(partitionEffects(effects, new Set([99])).apply.map((e) => e.taskId)).toEqual([1])
  })
})

describe('mergeDeferred', () => {
  it('keeps only the latest effect per task, so a burst replays once', () => {
    const older = [{ taskId: 1, status: 'done' as const, link }]
    const newer = [{ taskId: 1, status: 'progress' as const, link }]
    expect(mergeDeferred(older, newer)).toEqual(newer)
  })

  it('keeps effects for different tasks side by side', () => {
    const merged = mergeDeferred(
      [{ taskId: 1, status: 'done', link }],
      [{ taskId: 2, status: 'done', link }],
    )
    expect(merged.map((e) => e.taskId).sort()).toEqual([1, 2])
  })
})
