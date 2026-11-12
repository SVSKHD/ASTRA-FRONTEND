// Dhan's health as separate checks (backend docs/27): a healthy API never stands in for a
// healthy feed, and missing, stale, off and authentication failure read differently.
import { describe, expect, it } from 'vitest'
import { dhanChecks, marketOpen, type DhanInputs } from './dhanHealth'

// Wednesday 2026-11-04 11:00 IST = 05:30 UTC: the market is open.
const OPEN = Date.parse('2026-11-04T05:30:00Z')
// Saturday.
const WEEKEND = Date.parse('2026-11-07T05:30:00Z')

const iso = (msAgo: number, now = OPEN) => new Date(now - msAgo).toISOString()

const SESSION = {
  client_id_set: true,
  api_key_configured: true,
  session_active: true,
  session_expired: false,
  source: 'session' as const,
  valid_until: iso(-6 * 3_600_000),
  expires_soon: false,
  data_stale: false,
  auto_login_configured: true,
  auto_login_last: { at: iso(3_600_000), outcome: 'logged_in', code: null, expires_at: null },
}

const healthy = (over: Partial<DhanInputs> = {}): DhanInputs => ({
  session: SESSION,
  integration: {
    status: 'ok',
    configured: true,
    session: {},
    feed: { registered: true, state: 'running', age_s: 4, last_heartbeat_at: iso(4000) },
    reconcile: { last_status: 'succeeded', last_run_at: iso(120_000) },
    problems: [],
  },
  admin: true,
  hasAccount: true,
  health: { supported: true, ok: true },
  fundsAsOf: iso(60_000),
  fundsError: '',
  quotes: [{ received_at: iso(5000), stale: false }],
  now: OPEN,
  ...over,
})

const by = (i: DhanInputs) => Object.fromEntries(dhanChecks(i).map((c) => [c.key, c]))

describe('dhanChecks', () => {
  it('is all OK only when every part is', () => {
    const c = by(healthy())
    expect(Object.values(c).map((x) => x.level)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'])
    expect(c.autologin.text).toBe('On. Last logged in 60 min ago.')
    expect(c.session.text).toContain('Login session valid for 6 h more')
    expect(c.ticks.text).toBe('Live; last tick 5 s ago.')
  })

  it('does not call the feed healthy because the API is: a stale worker is failing', () => {
    const c = by(
      healthy({
        integration: {
          ...healthy().integration!,
          feed: { registered: true, state: 'stale', age_s: 600 },
        },
        quotes: [{ received_at: iso(600_000), stale: true }],
      }),
    )
    expect(c.session.level).toBe('ok')
    expect(c.feed).toMatchObject({ level: 'error', text: 'stale, last heartbeat 10 min ago.' })
    expect(c.ticks.level).toBe('stale')
    expect(c.ticks.text).toContain('marked it stale')
  })

  it('says the feed is off when the worker never registered (profile not started)', () => {
    const c = by(
      healthy({
        integration: { ...healthy().integration!, feed: { registered: false } },
        quotes: [],
      }),
    )
    expect(c.feed.level).toBe('disabled')
    expect(c.feed.text).toContain('COMPOSE_PROFILES')
    expect(c.ticks).toMatchObject({ level: 'disabled', text: 'No ticks: the feed is off.' })
  })

  it('tells old ticks during market hours from a closed market', () => {
    const old = [{ received_at: iso(5 * 60_000), stale: false }]
    expect(by(healthy({ quotes: old })).ticks.level).toBe('stale')
    const closed = by(
      healthy({ now: WEEKEND, quotes: [{ received_at: iso(3_600_000, WEEKEND), stale: false }] }),
    )
    expect(closed.ticks).toMatchObject({
      level: 'ok',
      text: 'Market closed; last tick 60 min ago.',
    })
    expect(by(healthy({ quotes: [] })).ticks.level).toBe('missing')
  })

  it('separates an expired session from a broker that refused the credentials', () => {
    const expired = by(
      healthy({
        session: { ...SESSION, source: 'none', session_active: false, session_expired: true },
        integration: { status: 'down', configured: true, problems: ['no valid Dhan session'] },
      }),
    )
    expect(expired.session).toMatchObject({ level: 'auth' })
    expect(expired.session.text).toContain('expired')
    // Without a session the server skips the feed: unknown, not "fine".
    expect(expired.feed.level).toBe('unknown')
    expect(expired.reconcile.level).toBe('unknown')

    const refused = by(
      healthy({ health: { supported: true, ok: false, detail: 'DH-901 invalid token' } }),
    )
    expect(refused.session).toMatchObject({
      level: 'auth',
      text: 'Authentication failed at Dhan: DH-901 invalid token.',
    })
    // Credentials being set is a separate fact.
    expect(refused.credentials.level).toBe('ok')
  })

  it('marks account data stale by age, and when no session can refresh it', () => {
    expect(by(healthy({ fundsAsOf: iso(20 * 60_000) })).account).toMatchObject({
      level: 'stale',
      text: 'Stale: last read 20 min ago.',
    })
    expect(by(healthy({ session: { ...SESSION, data_stale: true } })).account.text).toContain(
      'cannot refresh',
    )
    expect(by(healthy({ hasAccount: false })).account.level).toBe('missing')
    expect(by(healthy({ fundsError: 'Dhan answered 502' })).account.level).toBe('error')
  })

  it('says what is missing when Dhan is not configured', () => {
    const c = by(
      healthy({
        session: { ...SESSION, client_id_set: false, api_key_configured: false, source: 'none' },
        integration: { status: 'not_configured', configured: false },
        hasAccount: false,
        health: null,
        fundsAsOf: null,
        quotes: [],
      }),
    )
    expect(c.credentials).toMatchObject({ level: 'missing', text: 'Not configured: no client id.' })
    expect(c.session.level).toBe('disabled')
    expect(c.feed.level).toBe('disabled')
    expect(c.reconcile.level).toBe('disabled')
  })

  it('reports a failed or never-run reconciliation', () => {
    const fail = healthy({
      integration: {
        ...healthy().integration!,
        reconcile: { last_status: 'failed', last_run_at: iso(300_000) },
      },
    })
    expect(by(fail).reconcile).toMatchObject({ level: 'error', text: 'Last run failed 5 min ago.' })
    const never = healthy({
      integration: {
        ...healthy().integration!,
        reconcile: { last_status: null, last_run_at: null },
      },
    })
    expect(by(never).reconcile.level).toBe('missing')
  })

  it('does not pretend to know admin-only checks for other users', () => {
    const c = by(healthy({ admin: false, integration: null }))
    expect(c.feed).toMatchObject({ level: 'unknown', text: 'Only admins can see the feed worker.' })
    expect(c.reconcile.level).toBe('unknown')
    expect(c.ticks.level).toBe('ok')
  })
})

describe('marketOpen', () => {
  it('follows NSE hours in IST, weekdays only', () => {
    expect(marketOpen(Date.parse('2026-11-04T03:44:00Z'))).toBe(false) // 09:14 IST
    expect(marketOpen(Date.parse('2026-11-04T03:45:00Z'))).toBe(true) // 09:15 IST
    expect(marketOpen(Date.parse('2026-11-04T10:00:00Z'))).toBe(true) // 15:30 IST
    expect(marketOpen(Date.parse('2026-11-04T10:01:00Z'))).toBe(false)
    expect(marketOpen(WEEKEND)).toBe(false)
  })
})

describe('quote freshness', () => {
  it('only calls a quote live with the stream open, the market open and a recent tick', async () => {
    const { quoteFreshness } = await import('./dhanHealth')
    expect(quoteFreshness({ received_at: iso(5_000), stale: false }, 'open', OPEN).level).toBe(
      'live',
    )
    expect(quoteFreshness({ received_at: iso(5 * 60_000), stale: false }, 'open', OPEN).level).toBe(
      'stale',
    )
    expect(quoteFreshness({ received_at: iso(5_000), stale: true }, 'open', OPEN).level).toBe(
      'stale',
    )
  })

  it('turns every quote into last known while the stream is down', async () => {
    const { quoteFreshness } = await import('./dhanHealth')
    for (const s of ['reconnecting', 'closed', 'connecting']) {
      expect(quoteFreshness({ received_at: iso(1_000), stale: false }, s, OPEN).level).toBe(
        'last_known',
      )
    }
  })

  it('says market closed rather than live outside market hours', async () => {
    const { quoteFreshness } = await import('./dhanHealth')
    const q = { received_at: iso(1_000, WEEKEND), stale: false }
    expect(quoteFreshness(q, 'open', WEEKEND).level).toBe('closed')
  })
})

describe('feed summary', () => {
  const base = { streamStatus: 'open', sessionSource: 'session' as const, subscribed: 1, now: OPEN }

  it('puts an unauthorized session and interruptions first', async () => {
    const { feedSummary } = await import('./dhanHealth')
    const q = [{ received_at: iso(1_000), stale: false }]
    expect(feedSummary({ ...base, sessionSource: 'none', quotes: q }).level).toBe('unauthorized')
    expect(feedSummary({ ...base, streamStatus: 'reconnecting', quotes: q }).level).toBe(
      'interrupted',
    )
    expect(feedSummary({ ...base, quotes: q }).level).toBe('live')
  })

  it('reports no subscriptions and no ticks without inventing one', async () => {
    const { feedSummary } = await import('./dhanHealth')
    expect(feedSummary({ ...base, subscribed: 0, quotes: [] }).label).toBe('No subscriptions')
    expect(feedSummary({ ...base, quotes: [] }).label).toBe('No ticks')
  })
})

describe('automatic login check', () => {
  const auto = (over: Partial<NonNullable<DhanInputs['session']>>) =>
    by(healthy({ session: { ...SESSION, ...over } })).autologin

  it('is off (not a failure) without a PIN and TOTP secret, and says how to turn it on', () => {
    const c = auto({ auto_login_configured: false, auto_login_last: null })
    expect(c.level).toBe('disabled')
    expect(c.text).toContain('DHAN_PIN and DHAN_TOTP_SECRET')
  })

  it('is on with no attempt yet', () => {
    const c = auto({ auto_login_last: null })
    expect(c.level).toBe('ok')
    expect(c.text).toContain('about to expire')
  })

  it('a refused PIN or TOTP is an authentication failure that is not retried', () => {
    for (const last of [
      { at: iso(600_000), outcome: 'failed', code: 'dhan_refused' },
      { at: iso(600_000), outcome: 'blocked', code: 'dhan_refused' },
    ]) {
      const c = auto({ auto_login_last: last })
      expect(c.level).toBe('auth')
      expect(c.text).toContain('will not retry until DHAN_PIN or DHAN_TOTP_SECRET changes')
    }
  })

  it('other failures retry; a logout pauses it', () => {
    const failed = auto({
      auto_login_last: { at: iso(600_000), outcome: 'failed', code: 'dhan_unavailable' },
    })
    expect(failed.level).toBe('error')
    expect(failed.text).toBe(
      'Last attempt failed 10 min ago (dhan_unavailable). It retries on the next run.',
    )
    const paused = auto({ auto_login_last: { at: iso(0), outcome: 'paused', code: 'logged_out' } })
    expect(paused.level).toBe('disabled')
    expect(paused.text).toContain('Log in to Dhan once')
  })

  it('an expiring session says automatic login will replace it', () => {
    const c = by(healthy({ session: { ...SESSION, expires_soon: true } })).session
    expect(c.level).toBe('stale')
    expect(c.text).toContain('Automatic login will replace it.')
  })
})
