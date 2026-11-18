// The market-data health panel: with a valid Dhan login and nothing else
// reported, every other check reads "not reported" or worse — never OK.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import MarketHealth from './MarketHealth.vue'

const SESSION = {
  client_id_set: true,
  api_key_configured: true,
  redirect_url: null,
  session_active: true,
  session_expires_at: null,
  session_expired: false,
  source: 'session',
  valid_until: new Date(Date.now() + 3_600_000).toISOString(),
  expires_soon: false,
  data_stale: false,
}

let feedDown = false
beforeEach(() => {
  feedDown = false
  vi.stubGlobal('fetch', async (req: Request) => {
    const p = new URL(req.url).pathname
    const [status, body]: [number, unknown] =
      p === '/api/v1/dhan/auth/status'
        ? [200, SESSION]
        : p === '/api/v1/dhan/feed/health'
          ? feedDown
            ? [503, { detail: 'feed health unavailable' }]
            : [
                200,
                {
                  status: 'down',
                  healthy: false,
                  problems: ['Dhan refused the feed token'],
                  codes: ['auth_failed'],
                  market: {},
                  configured_instruments: 3,
                  feed: null,
                  worker: null,
                  last_crash: null,
                  checked_at: new Date().toISOString(),
                },
              ]
          : p === '/api/trading/instruments/status'
            ? [
                200,
                {
                  broker: 'dhan',
                  count: 4200,
                  by_segment: {},
                  last_synced_at: new Date().toISOString(),
                  last_run_status: 'succeeded',
                  last_error: null,
                  max_age_hours: 30,
                  stale: false,
                },
              ]
            : p === '/api/trading/screener/status'
              ? [
                  200,
                  {
                    worker: 'down',
                    queued_runs: 2,
                    queued_backfills: 0,
                    last_run_at: null,
                    universe_size: null,
                    candles_as_of: {},
                  },
                ]
              : p === '/api/trading/instruments'
                ? [200, { items: [], total: 4200, limit: 1, offset: 0 }]
                : p === '/api/trading/agents'
                  ? [200, []]
                  : [404, { detail: 'not found' }]
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
})
afterEach(() => vi.unstubAllGlobals())

const level = (w: ReturnType<typeof mount>, key: string) =>
  w.find(`[data-check="${key}"] .ui-badge`).text()

describe('MarketHealth', () => {
  it('shows each check separately; unavailable ones are not reported, not OK', async () => {
    feedDown = true
    const w = mount(MarketHealth)
    await flushPromises()
    await flushPromises()
    expect(level(w, 'session')).toContain('OK')
    expect(w.find('[data-check="session"]').text()).toContain('not market-data readiness')
    for (const key of ['market_data_permission', 'live_feed']) {
      expect(level(w, key), key).toContain('Not reported')
    }
    // The instrument master and the screener now report their own state.
    expect(w.find('[data-check="instrument_master"]').text()).toContain('4,200 instruments, synced')
    expect(level(w, 'screener')).toContain('Worker down')
    expect(w.find('[data-check="screener"]').text()).toContain('2 queued')
    expect(w.find('[data-check="live_feed"]').text()).toContain('feed health unavailable')
    expect(level(w, 'historical_candles')).toContain('Not reported')
    expect(level(w, 'research_worker')).toContain('No data')
    expect(w.text()).toContain('§7')
    w.unmount()
  })

  it('shows a refused feed as an auth failure on the feed and the data permission', async () => {
    const w = mount(MarketHealth)
    await flushPromises()
    await flushPromises()
    expect(level(w, 'live_feed')).toContain('Auth failed')
    expect(level(w, 'market_data_permission')).toContain('Auth failed')
    w.unmount()
  })

  it('fits on one line on the Explorer, with the details on demand', async () => {
    const w = mount(MarketHealth, { props: { compact: true } })
    await flushPromises()
    await flushPromises()
    expect(w.findAll('.mh__chip')).toHaveLength(7)
    expect(w.text()).not.toContain('not market-data readiness')
    await w
      .findAll('button')
      .find((b) => b.text() === 'Details')!
      .trigger('click')
    expect(w.text()).toContain('not market-data readiness')
    w.unmount()
  })
})
