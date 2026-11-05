// The integrations summary's `ai_providers` section (backend docs/26): built from settings,
// so "configured" is a key being set, not a working connection.
import { describe, expect, it } from 'vitest'
import { aiProviderRows, loadIntegrations } from './integrations'

describe('aiProviderRows', () => {
  it('lists each provider with enabled, key set, usable, default, cap and reason', () => {
    const rows = aiProviderRows({
      status: 'degraded',
      providers: {
        gemini: {
          enabled: true,
          configured: true,
          usable: false,
          reason: 'no_pricing',
          default_model: 'gemini-x',
          daily_limit_usd: '1.00',
        },
        openrouter: {
          enabled: true,
          configured: true,
          usable: true,
          reason: null,
          default_model: 'google/x',
          daily_limit_usd: '0.50',
        },
        anthropic: {
          enabled: false,
          configured: false,
          usable: false,
          reason: 'disabled',
          default_model: null,
          daily_limit_usd: '0',
        },
      },
    })
    expect(rows.map((r) => r.provider)).toEqual(['openrouter', 'anthropic', 'gemini'])
    expect(rows[0]).toMatchObject({ usable: true, tone: 'success', state: 'usable' })
    expect(rows[1]).toMatchObject({ enabled: false, tone: 'neutral', state: 'disabled' })
    expect(rows[2]).toMatchObject({
      configured: true,
      usable: false,
      reason: 'no_pricing',
      tone: 'warning',
      state: 'enabled, not usable',
      defaultModel: 'gemini-x',
      dailyLimitUsd: '1.00',
    })
  })

  it('is empty on a server without the section', () => {
    expect(aiProviderRows(undefined)).toEqual([])
    expect(aiProviderRows({ status: 'down', error: 'timeout after 5s' })).toEqual([])
  })

  it('reads a missing endpoint as a 404, not as data', async () => {
    const r = await loadIntegrations(async () => ({
      data: undefined,
      response: { ok: false, status: 404 },
    }))
    expect(r).toEqual({ data: null, status: 404 })
  })
})
