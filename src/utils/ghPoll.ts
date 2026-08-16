// The fallback path behind webhooks (13f): poll each linked repo every 10
// minutes with a conditional request, so a repo whose webhook delivery was
// missed still converges — and a repo with nothing new answers 304, which costs
// no rate limit at all.
//
// This module owns the arithmetic: who is due, how far to back off after a
// failure, and when a spent rate limit means "pause and say so" rather than
// "keep hammering and fail silently".

import type { GhRateLimit } from '@/utils/ghProxy'
import type { LinkedRepo } from '@/types'

// Ten minutes per repo, per the spec.
export const POLL_INTERVAL_MS = 10 * 60_000
// How often the loop wakes up to see whether anything is due. Cheap: a tick with
// nothing due does no I/O.
export const POLL_TICK_MS = 60_000

// A repo is due when its sync is on and its last successful poll is older than
// the interval. A repo that has never synced is due immediately.
export function dueForPoll(repo: LinkedRepo, now: number, interval = POLL_INTERVAL_MS): boolean {
  if (!repo.syncEnabled) return false
  return now - repo.lastSyncAt >= interval
}

// The repos to poll on this tick, oldest sync first so nothing starves, capped
// so one tick cannot fan out across a hundred repos at once.
export function reposDueForPoll(
  repos: LinkedRepo[],
  now: number,
  limit = 3,
  interval = POLL_INTERVAL_MS,
): LinkedRepo[] {
  return repos
    .filter((r) => dueForPoll(r, now, interval))
    .slice()
    .sort((a, b) => a.lastSyncAt - b.lastSyncAt)
    .slice(0, limit)
}

// Exponential backoff with a ceiling, for consecutive failures. Attempt 1 is the
// first failure.
export function backoffDelay(attempt: number, base = 30_000, max = 30 * 60_000): number {
  if (attempt <= 0) return 0
  return Math.min(max, base * 2 ** (attempt - 1))
}

// Below this many remaining requests, stop polling until the window resets
// rather than spending the last of the budget on background work — an
// interactive action (creating an issue) should always have room.
export const RATE_LIMIT_FLOOR = 50

export function shouldPauseForRateLimit(
  rate: GhRateLimit | null,
  floor = RATE_LIMIT_FLOOR,
): boolean {
  return !!rate && rate.remaining <= floor
}

// When to resume after a rate-limit pause: the reset time GitHub gave, or a
// conservative minute from now if it gave none.
export function resumeAtFor(rate: GhRateLimit | null, now: number): number {
  if (rate?.resetAt && rate.resetAt > now) return rate.resetAt
  return now + 60_000
}

export function isPaused(pausedUntil: number | null, now: number): boolean {
  return pausedUntil !== null && pausedUntil > now
}

// The user-facing "sync paused" line. Never silent, always says when it lifts.
export function pausedLabel(pausedUntil: number | null, reason: string, now: number): string {
  if (!isPaused(pausedUntil, now)) return ''
  const mins = Math.max(1, Math.round(((pausedUntil as number) - now) / 60_000))
  const why = reason || 'Backing off'
  return `${why} — sync paused, resuming in ${mins}m`
}

// The Settings line: "4,231 / 5,000 · resets in 12m".
export function rateLimitLabel(rate: GhRateLimit | null, now: number): string {
  if (!rate) return 'Rate limit unknown'
  const mins = Math.max(0, Math.round((rate.resetAt - now) / 60_000))
  return `${rate.remaining.toLocaleString()} / ${rate.limit.toLocaleString()} · resets in ${mins}m`
}
