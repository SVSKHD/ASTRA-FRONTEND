// The Code tab's list, from Aureon: repositories with their open pull-request counts,
// a pull request whose repository failed is reported rather than shown as zero, and a
// conversation interleaves its three kinds of comment by time.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const gh = vi.hoisted(() => ({
  repositories: vi.fn(),
  pulls: vi.fn(),
  pullIssueComments: vi.fn(),
  pullReviews: vi.fn(),
  pullReviewComments: vi.fn(),
}))
vi.mock('./aureon', () => ({ ghApi: gh }))

import { changedPulls, readLive, readThread } from './live'

const repo = (id: number, full: string, extra = {}) => ({
  id,
  name: full.split('/')[1],
  owner: full.split('/')[0],
  full_name: full,
  html_url: '',
  private: false,
  archived: false,
  default_branch: 'main',
  description: null,
  pushed_at: '2026-11-01T00:00:00Z',
  synced_at: '2026-11-04T00:00:00Z',
  ...extra,
})
const pull = (n: number, extra = {}) => ({
  number: n,
  title: `PR ${n}`,
  state: 'open',
  draft: false,
  user: 'koushik',
  head: { ref: `feat/${n}` },
  base: { ref: 'dev01' },
  html_url: `https://github.com/x/${n}`,
  created_at: '2026-11-02T00:00:00Z',
  updated_at: `2026-11-0${n}T00:00:00Z`,
  ...extra,
})

beforeEach(() => Object.values(gh).forEach((f) => f.mockReset()))

describe('readLive', () => {
  it('builds repos with counts, skips archived, and reports a repo whose PRs failed', async () => {
    gh.repositories.mockResolvedValue({
      items: [
        repo(1, 'svskhd/astra'),
        repo(2, 'svskhd/aureon'),
        repo(3, 'svskhd/old', { archived: true }),
      ],
      total: 3,
    })
    gh.pulls.mockImplementation((_owner: string, name: string) =>
      name === 'astra'
        ? Promise.resolve({ items: [pull(3), pull(4, { draft: true })], has_next: false })
        : Promise.reject(new Error('boom')),
    )
    const snap = await readLive('u1')
    expect(snap.repos.map((r) => [r.fullName, r.openPRCount])).toEqual([
      ['svskhd/astra', 2],
      ['svskhd/aureon', 0],
    ])
    expect(snap.failed).toEqual(['svskhd/aureon'])
    expect(snap.pulls.map((p) => [p.number, p.state])).toEqual([
      [4, 'draft'],
      [3, 'open'],
    ])
    expect(snap.pulls[0]).toMatchObject({ repoId: 1, headRef: 'feat/4', baseRef: 'dev01' })
  })

  it('rings only pull requests that moved since the last pass', () => {
    const a = { id: '1#3', updatedAt: 1 } as never
    const b = { id: '1#4', updatedAt: 1 } as never
    expect(changedPulls([a, b], [{ ...(a as object), updatedAt: 2 } as never, b])).toEqual(['1#3'])
  })
})

describe('readThread', () => {
  it('interleaves issue comments, review summaries and line comments by time', async () => {
    gh.pullIssueComments.mockResolvedValue([
      { id: 1, user: 'a', body: 'first', created_at: '2026-11-01T00:00:00Z' },
    ])
    gh.pullReviews.mockResolvedValue([
      { id: 2, user: 'b', body: '', state: 'APPROVED', submitted_at: '2026-11-03T00:00:00Z' },
      { id: 9, user: 'b', body: '', state: 'COMMENTED', submitted_at: '2026-11-03T00:00:00Z' },
    ])
    gh.pullReviewComments.mockResolvedValue([
      { id: 3, user: 'c', body: 'nit', path: 'a.ts', line: 4, created_at: '2026-11-02T00:00:00Z' },
    ])
    const list = await readThread('svskhd/astra', 1, 7, 'u1')
    expect(gh.pullReviews).toHaveBeenCalledWith('svskhd', 'astra', 7, { signal: undefined })
    expect(list.map((c) => [c.kind, c.author, c.bodyPreview])).toEqual([
      ['issue', 'a', 'first'],
      ['review_comment', 'c', 'nit'],
      ['review', 'b', 'Approved'],
    ])
    expect(list[1]).toMatchObject({ path: 'a.ts', line: 4, pullNumber: 7, repoId: 1 })
  })
})
