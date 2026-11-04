import { describe, expect, it } from 'vitest'
import {
  isSafeLoginUrl,
  loginRefusal,
  readCallback,
  summarize,
  type DhanStatus,
} from '@/control/dhanSession'

const NOW = Date.parse('2026-11-04T06:00:00Z')

function status(over: Partial<DhanStatus> = {}): DhanStatus {
  return {
    client_id_set: true,
    api_key_configured: true,
    redirect_url: 'https://svskhd8.taila439d5.ts.net/api/v1/dhan/auth/callback',
    session_active: false,
    session_expires_at: null,
    session_expired: false,
    source: 'none',
    valid_until: null,
    expires_soon: false,
    data_stale: true,
    ...over,
  }
}

describe('Dhan session banner', () => {
  it('shows when an active session expires', () => {
    const s = summarize(
      status({
        source: 'session',
        session_active: true,
        valid_until: '2026-11-05T06:00:00Z',
        session_expires_at: '2026-11-05T06:00:00Z',
        data_stale: false,
      }),
      NOW,
    )
    expect(s.tone).toBe('success')
    expect(s.text).toMatch(/^Dhan session expires at .+\(24 h 0 min left\)\.$/)
    expect(s.needsLogin).toBe(false)
  })

  it('warns inside the alert window and asks for a new login', () => {
    const s = summarize(
      status({
        source: 'session',
        session_active: true,
        valid_until: '2026-11-04T06:40:00Z',
        expires_soon: true,
        data_stale: false,
      }),
      NOW,
    )
    expect(s.tone).toBe('warning')
    expect(s.text).toContain('40 min left')
    expect(s.needsLogin).toBe(true)
  })

  it('says the data is stale once the session has expired', () => {
    const s = summarize(
      status({ session_expired: true, session_expires_at: '2026-11-04T05:00:00Z' }),
      NOW,
    )
    expect(s.tone).toBe('danger')
    expect(s.text).toMatch(/expired at .+ Trading data is stale\.$/)
    expect(summarize(status(), NOW).text).toBe('No Dhan session. Trading data is stale.')
  })

  it('names the manual fallback and stays quiet when Dhan is not set up', () => {
    expect(summarize(status({ source: 'manual', data_stale: false }), NOW).text).toContain(
      'manual DHAN_ACCESS_TOKEN',
    )
    expect(summarize(status({ client_id_set: false }), NOW).needsLogin).toBe(false)
  })
})

describe('Dhan callback', () => {
  it('reads a well-formed tokenId and refuses anything else', () => {
    expect(readCallback({ dhan_token_id: '7f3c2a10-9e8b-4d2c-a111-0123456789ab' })).toEqual({
      tokenId: '7f3c2a10-9e8b-4d2c-a111-0123456789ab',
      error: null,
    })
    expect(readCallback({ dhan_token_id: '<script>alert(1)</script>' })).toEqual({
      tokenId: null,
      error: 'bad_callback',
    })
    expect(readCallback({ dhan_error: 'bad_callback' }).error).toBe('bad_callback')
    expect(readCallback({})).toEqual({ tokenId: null, error: null })
  })

  it('explains the server refusals', () => {
    expect(loginRefusal('dhan_client_mismatch', 'x')).toContain('different client id')
    expect(loginRefusal('no_pending_login', 'x')).toContain('Start again')
    expect(loginRefusal(undefined, 'fallback')).toBe('fallback')
  })

  it('only follows Dhan consent pages over https', () => {
    expect(
      isSafeLoginUrl('https://auth.dhan.co/login/consentApp-login?consentAppId=940b0ca1'),
    ).toBe(true)
    expect(isSafeLoginUrl('http://auth.dhan.co/login/consentApp-login?consentAppId=x')).toBe(false)
    expect(isSafeLoginUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeLoginUrl('https://evil.example/phish')).toBe(false)
  })
})
