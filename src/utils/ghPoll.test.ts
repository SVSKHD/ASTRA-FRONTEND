import { describe, expect, it } from 'vitest'
import {
  POLL_INTERVAL_MS,
  RATE_LIMIT_FLOOR,
  backoffDelay,
  dueForPoll,
  isPaused,
  pausedLabel,
  rateLimitLabel,
  reposDueForPoll,
  resumeAtFor,
  shouldPauseForRateLimit,
} from './ghPoll'
import type { LinkedRepo } from '@/types'

function repo(over: Partial<LinkedRepo> = {}): LinkedRepo {
  return {
    id: 'octo__demo',
    owner: 'octo',
    name: 'demo',
    fullName: 'octo/demo',
    defaultBranch: 'main',
    private: false,
    htmlUrl: '',
    stars: 0,
    openIssuesCount: 0,
    language: '',
    pushedAt: 0,
    linkedAt: 0,
    syncEnabled: true,
    labelFilter: [],
    lastSyncAt: 0,
    etag: '',
    ...over,
  }
}

const NOW = 1_000_000_000

describe('dueForPoll', () => {
  it('is due once the interval has elapsed', () => {
    expect(dueForPoll(repo({ lastSyncAt: NOW - POLL_INTERVAL_MS }), NOW)).toBe(true)
    expect(dueForPoll(repo({ lastSyncAt: NOW - 1000 }), NOW)).toBe(false)
  })

  it('is due immediately for a repo that has never synced', () => {
    expect(dueForPoll(repo({ lastSyncAt: 0 }), NOW)).toBe(true)
  })

  it('is never due while sync is switched off', () => {
    expect(dueForPoll(repo({ syncEnabled: false, lastSyncAt: 0 }), NOW)).toBe(false)
  })
})

describe('reposDueForPoll', () => {
  it('takes the least recently synced first and caps the batch', () => {
    const repos = [
      repo({ id: 'a', lastSyncAt: 500 }),
      repo({ id: 'b', lastSyncAt: 100 }),
      repo({ id: 'c', lastSyncAt: 300 }),
      repo({ id: 'd', lastSyncAt: 200 }),
    ]
    expect(reposDueForPoll(repos, NOW, 2).map((r) => r.id)).toEqual(['b', 'd'])
  })

  it('skips repos with sync off', () => {
    const repos = [repo({ id: 'a', syncEnabled: false }), repo({ id: 'b' })]
    expect(reposDueForPoll(repos, NOW).map((r) => r.id)).toEqual(['b'])
  })

  it('does not mutate the input order', () => {
    const repos = [repo({ id: 'a', lastSyncAt: 500 }), repo({ id: 'b', lastSyncAt: 100 })]
    reposDueForPoll(repos, NOW)
    expect(repos.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('backoffDelay', () => {
  it('doubles per consecutive failure', () => {
    expect(backoffDelay(1, 1000)).toBe(1000)
    expect(backoffDelay(2, 1000)).toBe(2000)
    expect(backoffDelay(3, 1000)).toBe(4000)
  })

  it('stops at the ceiling', () => {
    expect(backoffDelay(20, 1000, 10_000)).toBe(10_000)
  })

  it('is zero before any failure', () => {
    expect(backoffDelay(0)).toBe(0)
  })
})

describe('rate-limit backoff', () => {
  it('pauses once the remaining budget hits the floor', () => {
    expect(
      shouldPauseForRateLimit({ limit: 5000, remaining: RATE_LIMIT_FLOOR, resetAt: NOW }),
    ).toBe(true)
    expect(shouldPauseForRateLimit({ limit: 5000, remaining: 4000, resetAt: NOW })).toBe(false)
  })

  it('does not pause when the rate limit is simply unknown', () => {
    expect(shouldPauseForRateLimit(null)).toBe(false)
  })

  it('resumes at GitHub reset time, or a minute out when there is none', () => {
    expect(resumeAtFor({ limit: 1, remaining: 0, resetAt: NOW + 5000 }, NOW)).toBe(NOW + 5000)
    expect(resumeAtFor({ limit: 1, remaining: 0, resetAt: NOW - 5000 }, NOW)).toBe(NOW + 60_000)
    expect(resumeAtFor(null, NOW)).toBe(NOW + 60_000)
  })
})

describe('paused state is always visible', () => {
  it('is paused only until the resume time', () => {
    expect(isPaused(NOW + 1000, NOW)).toBe(true)
    expect(isPaused(NOW - 1000, NOW)).toBe(false)
    expect(isPaused(null, NOW)).toBe(false)
  })

  it('says why and when it lifts', () => {
    expect(pausedLabel(NOW + 5 * 60_000, 'GitHub rate limit reached', NOW)).toBe(
      'GitHub rate limit reached — sync paused, resuming in 5m',
    )
  })

  it('rounds a sub-minute pause up rather than saying 0m', () => {
    expect(pausedLabel(NOW + 5_000, '', NOW)).toBe('Backing off — sync paused, resuming in 1m')
  })

  it('is empty when nothing is paused', () => {
    expect(pausedLabel(null, 'x', NOW)).toBe('')
  })
})

describe('rateLimitLabel', () => {
  it('reports remaining, total and time to reset', () => {
    expect(rateLimitLabel({ limit: 5000, remaining: 4231, resetAt: NOW + 12 * 60_000 }, NOW)).toBe(
      '4,231 / 5,000 · resets in 12m',
    )
  })

  it('says so plainly when no reading has arrived yet', () => {
    expect(rateLimitLabel(null, NOW)).toBe('Rate limit unknown')
  })
})
