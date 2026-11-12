// The integrations summary (GET /api/v1/system/integrations). Its `claude` section is
// covered with the card in CcSystem.test.ts; here, the read itself.
import { describe, expect, it } from 'vitest'
import { loadIntegrations } from './integrations'

describe('loadIntegrations', () => {
  it('reads a missing endpoint as a 404, not as data', async () => {
    const r = await loadIntegrations(async () => ({
      data: undefined,
      response: { ok: false, status: 404 },
    }))
    expect(r).toEqual({ data: null, status: 404 })
  })

  it('returns the summary as sent', async () => {
    const body = { ok: true, problems: [], integrations: { claude: { status: 'ok' } } }
    const r = await loadIntegrations(async () => ({
      data: body,
      response: { ok: true, status: 200 },
    }))
    expect(r).toEqual({ data: body, status: 200 })
  })
})
