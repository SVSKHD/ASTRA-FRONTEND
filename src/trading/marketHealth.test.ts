import { describe, expect, it } from 'vitest'
import { marketChecks, type MarketInputs } from './marketHealth'

const NOW = Date.parse('2026-11-10T06:00:00Z') // 11:30 IST, a Tuesday

const SESSION_OK = {
  client_id_set: true,
  api_key_configured: true,
  session_active: true,
  session_expired: false,
  source: 'session' as const,
  valid_until: new Date(NOW + 3_600_000).toISOString(),
  expires_soon: false,
  data_stale: false,
}

function inputs(over: Partial<MarketInputs> = {}): MarketInputs {
  return {
    session: null,
    sessionError: '',
    feed: null,
    feedError: '',
    masterTotal: null,
    masterError: '',
    candles: null,
    candlesError: '',
    agents: null,
    agentsError: '',
    now: NOW,
    ...over,
  }
}
const by = (i: MarketInputs) => Object.fromEntries(marketChecks(i).map((c) => [c.key, c]))

describe('market-data health', () => {
  it('reports seven separate checks, all unknown when nothing could be read', () => {
    const checks = marketChecks(
      inputs({ sessionError: 'offline', feedError: 'offline', agentsError: 'offline' }),
    )
    expect(checks.map((c) => c.key)).toEqual([
      'session',
      'instrument_master',
      'market_data_permission',
      'live_feed',
      'historical_candles',
      'research_worker',
      'screener',
    ])
    expect(checks.every((c) => c.level === 'unknown')).toBe(true)
  })

  it('never turns a Dhan login into market-data readiness', () => {
    const c = by(inputs({ session: SESSION_OK, masterTotal: 250_000 }))
    expect(c.session.level).toBe('ok')
    expect(c.session.text).toContain('not market-data readiness')
    for (const key of [
      'instrument_master',
      'market_data_permission',
      'live_feed',
      'historical_candles',
      'research_worker',
      'screener',
    ]) {
      expect(c[key].level, key).not.toBe('ok')
    }
    // Without its sync status, a populated master is "unknown", never OK.
    expect(c.instrument_master.level).toBe('unknown')
    expect(c.instrument_master.text).toContain('250,000')
    expect(c.screener.level).toBe('unknown')
  })

  it('reads the instrument sync status: ok, stale, never synced, failed', () => {
    const at = '2026-11-13T02:41:00Z'
    const ok = by(
      inputs({
        masterTotal: 250000,
        masterStatus: { count: 250000, last_synced_at: at, stale: false },
      }),
    ).instrument_master
    expect(ok.level).toBe('ok')
    expect(ok.text).toContain('250,000 instruments, synced')
    expect(
      by(inputs({ masterTotal: 250000, masterStatus: { last_synced_at: at, stale: true } }))
        .instrument_master.level,
    ).toBe('stale')
    const never = by(
      inputs({ masterTotal: 250000, masterStatus: { last_synced_at: null } }),
    ).instrument_master
    expect(never.level).toBe('stale')
    expect(never.text).toContain('no successful sync')
    const failed = by(
      inputs({
        masterTotal: 250000,
        masterStatus: {
          last_synced_at: null,
          last_run_status: 'failed',
          last_error: 'the number of query arguments cannot exceed 32767',
        },
      }),
    ).instrument_master
    expect(failed.level).toBe('error')
    expect(failed.text).toContain('32767')
  })

  it('reads the screener worker and queue', () => {
    const down = by(inputs({ screener: { worker: 'down', queued_runs: 3 } })).screener
    expect(down.level).toBe('error')
    expect(down.text).toContain('3 queued')
    expect(by(inputs({ screener: { worker: 'stale' } })).screener.level).toBe('stale')
    expect(by(inputs({ screener: { worker: 'ok', queued_runs: 0 } })).screener.level).toBe('ok')
    expect(by(inputs({ screenerError: 'boom' })).screener.level).toBe('error')
  })

  it('reads an empty master as missing', () => {
    expect(by(inputs({ masterTotal: 0 })).instrument_master.level).toBe('missing')
  })

  it('maps feed health, keeping market_closed apart from ok', () => {
    expect(by(inputs({ feed: { status: 'ok', codes: [] } })).live_feed.level).toBe('ok')
    const closed = by(inputs({ feed: { status: 'market_closed', codes: [] } })).live_feed
    expect(closed.level).not.toBe('ok')
    expect(closed.badge).toBe('Market closed')
    expect(by(inputs({ feed: { status: 'degraded', problems: ['2 stale'] } })).live_feed.text).toBe(
      '2 stale',
    )
    // An unexpected body (no status) is unknown, never ok.
    expect(by(inputs({ feed: { healthy: true } })).live_feed.level).toBe('unknown')
  })

  it('shows a refused data plan as an auth failure on permission and feed', () => {
    const c = by(inputs({ feed: { status: 'down', codes: ['auth_failed'] } }))
    expect(c.market_data_permission.level).toBe('auth')
    expect(c.live_feed.level).toBe('auth')
    // Otherwise permission is not reported, even with a healthy feed.
    expect(by(inputs({ feed: { status: 'ok', codes: [] } })).market_data_permission.level).toBe(
      'unknown',
    )
  })

  it('probes stored candles for one instrument only, and says so', () => {
    const fresh = by(
      inputs({
        candles: { symbol: 'TCS', count: 1, newest: new Date(NOW - 86_400_000).toISOString() },
      }),
    ).historical_candles
    expect(fresh.level).toBe('ok')
    expect(fresh.badge).toBe('OK for TCS')
    expect(fresh.text).toContain('other instruments is not reported')
    const old = by(
      inputs({
        candles: { symbol: 'TCS', count: 1, newest: new Date(NOW - 30 * 86_400_000).toISOString() },
      }),
    ).historical_candles
    expect(old.level).toBe('stale')
    expect(
      by(inputs({ candles: { symbol: 'TCS', count: 0, newest: null } })).historical_candles.level,
    ).toBe('missing')
  })

  it('reads the research worker from the technical-analysis agent heartbeat', () => {
    const agent = (state: string) => ({
      id: 'technical-analysis',
      name: 'Technical analysis agent',
      state,
      last_heartbeat_at: new Date(NOW - 30_000).toISOString(),
    })
    expect(by(inputs({ agents: [agent('idle')] })).research_worker.level).toBe('ok')
    expect(by(inputs({ agents: [agent('stale')] })).research_worker.level).toBe('stale')
    expect(by(inputs({ agents: [agent('paused')] })).research_worker.level).toBe('disabled')
    expect(by(inputs({ agents: [] })).research_worker.level).toBe('missing')
  })
})
