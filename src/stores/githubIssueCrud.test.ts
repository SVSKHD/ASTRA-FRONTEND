// Writing issues from the GitHub tab (as opposed to writing them from a task).
//
// The tab used to be read-plus-import: you could see an issue and pull it in as
// a task, but answering it meant leaving for github.com. These are the three
// writes that close that gap, and what they must do to the mirror afterwards.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const ghCall = vi.fn()
vi.mock('@/utils/ghProxy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/ghProxy')>()
  return {
    ...actual,
    ghCall: (...args: unknown[]) => ghCall(...args),
    // The proxy is "configured" here; whether it is reachable is the mock's job.
    isGhConfigured: () => true,
  }
})

import { useAppStore } from '@/stores/app'
import { emptyGithubIntegration, type GithubIssue, type LinkedRepo } from '@/types'

function repo(): LinkedRepo {
  return {
    id: 'octo__demo',
    owner: 'octo',
    name: 'demo',
    fullName: 'octo/demo',
    defaultBranch: 'main',
    private: false,
    htmlUrl: 'https://github.com/octo/demo',
    stars: 0,
    openIssuesCount: 1,
    language: 'TypeScript',
    pushedAt: 0,
    linkedAt: 0,
    syncEnabled: true,
    labelFilter: [],
    lastSyncAt: 0,
    etag: '',
  }
}

function issue(over: Partial<GithubIssue> = {}): GithubIssue {
  return {
    id: 'octo__demo__12',
    repoId: 'octo__demo',
    number: 12,
    title: 'Fix the thing',
    body: 'before',
    state: 'open',
    labels: [],
    assignees: [],
    author: 'octo',
    htmlUrl: 'https://github.com/octo/demo/issues/12',
    createdAt: 0,
    updatedAt: 1000,
    closedAt: null,
    commentsCount: 0,
    linkedTaskId: null,
    etag: '',
    ...over,
  }
}

/** GitHub's own answer shape, which is what the store ingests. */
function apiIssue(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    number: 12,
    title: 'Fix the thing',
    body: 'before',
    state: 'open',
    labels: [],
    assignees: [],
    user: { login: 'octo' },
    html_url: 'https://github.com/octo/demo/issues/12',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    closed_at: null,
    comments: 0,
    ...over,
  }
}

function connected() {
  const app = useAppStore()
  app.linkRepo(repo())
  app.githubIntegration = { ...emptyGithubIntegration(), installationId: 1, login: 'octo' }
  return app
}

beforeEach(() => {
  setActivePinia(createPinia())
  ghCall.mockReset().mockResolvedValue({ data: apiIssue(), rateLimit: null })
})

describe('creating an issue', () => {
  it('posts it and puts GitHub’s answer in the mirror', async () => {
    const app = connected()
    const ok = await app.createGithubIssue('octo__demo', {
      title: '  Fix the thing  ',
      body: 'before',
      labels: ['bug'],
    })
    expect(ok).toBe(true)
    expect(ghCall).toHaveBeenCalledWith('createIssue', {
      owner: 'octo',
      repo: 'demo',
      // Trimmed: a title with trailing spaces is a title somebody mistyped.
      title: 'Fix the thing',
      body: 'before',
      labels: ['bug'],
    })
    expect(app.ghIssues).toHaveLength(1)
    expect(app.ghIssues[0].number).toBe(12)
  })

  it('refuses a blank title and an unknown repo without calling GitHub', async () => {
    const app = connected()
    expect(await app.createGithubIssue('octo__demo', { title: '   ' })).toBe(false)
    expect(await app.createGithubIssue('nonsense', { title: 'x' })).toBe(false)
    expect(ghCall).not.toHaveBeenCalled()
  })

  it('says so rather than throwing when GitHub refuses', async () => {
    const app = connected()
    ghCall.mockRejectedValueOnce(new Error('Validation Failed'))
    expect(await app.createGithubIssue('octo__demo', { title: 'x' })).toBe(false)
    expect(app.ghIssues).toEqual([])
  })
})

describe('editing an issue', () => {
  it('patches only what was given and keeps the task link', async () => {
    const app = connected()
    app.ingestGithubIssues([issue({ linkedTaskId: 7 })])
    ghCall.mockResolvedValueOnce({
      data: apiIssue({ title: 'Fix it properly', body: 'after' }),
      rateLimit: null,
    })
    const ok = await app.updateGithubIssue('octo__demo__12', {
      title: 'Fix it properly',
      body: 'after',
    })
    expect(ok).toBe(true)
    expect(ghCall).toHaveBeenCalledWith('patchIssue', {
      owner: 'octo',
      repo: 'demo',
      number: 12,
      title: 'Fix it properly',
      body: 'after',
    })
    expect(app.ghIssues[0].title).toBe('Fix it properly')
    // GitHub's answer knows nothing about the task; the link is the app's fact.
    expect(app.ghIssues[0].linkedTaskId).toBe(7)
  })

  it('closes and reopens through the same call', async () => {
    const app = connected()
    app.ingestGithubIssues([issue()])
    ghCall.mockResolvedValueOnce({
      data: apiIssue({ state: 'closed', closed_at: '2026-01-03T00:00:00Z' }),
      rateLimit: null,
    })
    await app.updateGithubIssue('octo__demo__12', { state: 'closed' })
    expect(ghCall.mock.calls[0][1]).toMatchObject({ number: 12, state: 'closed' })
    expect(app.ghIssues[0].state).toBe('closed')
  })
})

describe('commenting on an issue', () => {
  it('posts the comment and bumps the count on the row', async () => {
    const app = connected()
    app.ingestGithubIssues([issue({ commentsCount: 2 })])
    ghCall.mockResolvedValueOnce({ data: { id: 5 }, rateLimit: null })
    const ok = await app.commentOnGithubIssue('octo__demo__12', '  looks right  ')
    expect(ok).toBe(true)
    expect(ghCall).toHaveBeenCalledWith('comment', {
      owner: 'octo',
      repo: 'demo',
      number: 12,
      body: 'looks right',
    })
    expect(app.ghIssues[0].commentsCount).toBe(3)
  })

  it('will not post an empty comment', async () => {
    const app = connected()
    app.ingestGithubIssues([issue()])
    expect(await app.commentOnGithubIssue('octo__demo__12', '   ')).toBe(false)
    expect(ghCall).not.toHaveBeenCalled()
  })
})
