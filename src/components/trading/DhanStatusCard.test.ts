// The Dhan status card shows a stale feed as failing even while the API and session are
// fine (backend docs/27), and keeps the admin-only checks unreported for other users.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({ GET: vi.fn() }))
vi.mock('@/api/client', () => ({ aureon: api }))

import DhanStatusCard from './DhanStatusCard.vue'
import { live } from '@/trading/stream'
import { tradingSession } from '@/trading/session'

const ok = (data: unknown, status = 200) => ({
  data: status < 400 ? data : undefined,
  error: status >= 400 ? data : undefined,
  response: { ok: status < 400, status },
})

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

function serve(feedState: string) {
  api.GET.mockImplementation(async (path: string) => {
    if (path === '/api/v1/dhan/auth/status') return ok(SESSION)
    if (path === '/api/v1/system/integrations') {
      return ok({
        ok: false,
        problems: [`dhan-feed ${feedState}`],
        integrations: {
          dhan: {
            status: 'degraded',
            configured: true,
            feed: { registered: true, state: feedState, age_s: 900 },
            reconcile: { last_status: 'succeeded', last_run_at: new Date().toISOString() },
            problems: [`dhan-feed ${feedState}`],
          },
        },
      })
    }
    return ok({ detail: 'Not Found' }, 404)
  })
}

const props = {
  hasAccount: true,
  health: { supported: true, ok: true },
  fundsAsOf: new Date().toISOString(),
  fundsError: '',
}

describe('<DhanStatusCard />', () => {
  beforeEach(() => {
    api.GET.mockReset()
    live.quotes = {}
    Object.assign(tradingSession, {
      checked: true,
      user: { uid: 'u1', name: 'o', email: 'o@x', provider: 'aureon', initial: 'O', color: '#000' },
      role: 'admin',
      error: '',
    })
  })

  it('shows a stale feed as failing while the session is valid', async () => {
    serve('stale')
    const w = mount(DhanStatusCard, { props })
    await flushPromises()
    const check = (k: string) => w.get(`[data-check="${k}"]`).text()
    expect(check('session')).toContain('OK')
    expect(check('feed')).toContain('Failing')
    expect(check('feed')).toContain('stale, last heartbeat 15 min ago')
    expect(check('ticks')).toContain('No data')
    expect(w.get('[data-testid="dhan-problems"]').text()).toContain('dhan-feed stale')
    expect(w.text()).toContain('Read-only')
  })

  it('does not read the admin summary for other users, and says so', async () => {
    tradingSession.role = 'user'
    serve('running')
    const w = mount(DhanStatusCard, { props })
    await flushPromises()
    expect(api.GET).not.toHaveBeenCalledWith('/api/v1/system/integrations')
    expect(w.get('[data-check="feed"]').text()).toContain('Not reported')
  })
})
