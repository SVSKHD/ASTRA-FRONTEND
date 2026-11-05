// Dhan ops: incidents matched to Dhan, the overall state (a recovery only counts
// once the server resolved it), approval scope, and credential redaction.
import { describe, expect, it } from 'vitest'
import {
  actionable,
  approvalAccount,
  approvalScope,
  dhanApprovals,
  feedAgent,
  isDhanIncident,
  opsState,
  redact,
  type Agent,
  type Incident,
} from './dhanOps'
import type { Approval } from './approvals'
import type { Check } from '@/trading/dhanHealth'

const NOW = Date.parse('2026-11-05T06:00:00Z')

function incident(over: Partial<Incident> = {}): Incident {
  return {
    id: 'i1',
    title: 'dhan-feed heartbeat stale',
    fingerprint: 'heartbeat:dhan-feed',
    source: 'heartbeat',
    severity: 'high',
    status: 'open',
    count: 3,
    first_seen: '2026-11-05T05:00:00Z',
    last_seen: '2026-11-05T05:50:00Z',
    recovery_attempts: 0,
    last_recovery_at: null,
    resolved_at: null,
    ...over,
  }
}
const ok = (key: Check['key']): Check => ({ key, label: key, level: 'ok', text: 'fine' })

function approval(over: Partial<Approval> = {}): Approval {
  return {
    id: 'a1',
    kind: 'trading.order_intent',
    target: 'dhan:1100123456',
    status: 'pending',
    payload: {},
    created_at: '2026-11-05T05:55:00Z',
    expires_at: '2026-11-05T06:10:00Z',
    artifact_sha256: null,
    decided_at: null,
    decided_by: null,
    executed_at: null,
    requested_by: null,
    result: null,
    ...over,
  } as Approval
}

describe('incidents', () => {
  it('matches Dhan incidents by title or fingerprint only', () => {
    expect(isDhanIncident(incident())).toBe(true)
    expect(isDhanIncident(incident({ title: 'x', fingerprint: 'ollama:down' }))).toBe(false)
  })
})

describe('opsState', () => {
  it('fails on an auth or error check before anything else', () => {
    const v = opsState([{ ...ok('session'), level: 'auth', text: 'expired' }], [], NOW)
    expect(v.state).toBe('failed')
  })

  it('shows a recovery in progress as recovering, not recovered', () => {
    const v = opsState(
      [ok('feed')],
      [incident({ status: 'recovering', recovery_attempts: 2 })],
      NOW,
    )
    expect(v.state).toBe('reconnecting')
    expect(v.text).toContain('not yet confirmed')
  })

  it('is recovered only with a server resolved_at inside the window', () => {
    const resolved = incident({ status: 'resolved', resolved_at: '2026-11-05T05:40:00Z' })
    expect(opsState([ok('feed')], [resolved], NOW).state).toBe('recovered')
    const old = incident({ status: 'resolved', resolved_at: '2026-11-04T05:40:00Z' })
    expect(opsState([ok('feed')], [old], NOW).state).toBe('healthy')
    // "resolved" without a time is not taken as a confirmed recovery.
    expect(opsState([ok('feed')], [incident({ status: 'resolved' })], NOW).state).toBe('healthy')
  })

  it('is degraded with an open incident or a stale check', () => {
    expect(opsState([ok('feed')], [incident()], NOW).state).toBe('degraded')
    expect(opsState([{ ...ok('ticks'), level: 'stale' }], [], NOW).state).toBe('degraded')
  })
})

describe('feed worker', () => {
  it('finds the dhan feed agent', () => {
    const a = (name: string, kind = 'worker') => ({ id: name, name, kind }) as Agent
    expect(feedAgent([a('mt5-feed'), a('dhan-reconcile'), a('dhan-feed')])?.id).toBe('dhan-feed')
    expect(feedAgent([a('mt5-feed')])).toBeNull()
  })
})

describe('approvals', () => {
  it('tells trading operations apart from read-only Dhan ones', () => {
    expect(approvalScope(approval())).toBe('trading')
    expect(approvalScope(approval({ kind: 'dhan.session.reset', target: 'dhan' }))).toBe(
      'market_data',
    )
    expect(approvalScope(approval({ kind: 'github.merge', target: 'repo' }))).toBe('other')
  })

  it('lists trading and Dhan requests only', () => {
    const list = [
      approval(),
      approval({ id: 'g', kind: 'github.merge', target: 'o/r' }),
      approval({ id: 'p', kind: 'ops.restart', target: 'x', payload: { service: 'dhan-feed' } }),
    ]
    expect(dhanApprovals(list).map((a) => a.id)).toEqual(['a1', 'p'])
  })

  it('names the account from the payload, else the target', () => {
    expect(approvalAccount(approval({ payload: { broker_account_id: 'acc-9' } }))).toBe('acc-9')
    expect(approvalAccount(approval())).toBe('dhan:1100123456')
  })

  it('never offers an expired or decided request', () => {
    expect(actionable(approval(), NOW)).toBe(true)
    expect(actionable(approval({ expires_at: '2026-11-05T05:59:00Z' }), NOW)).toBe(false)
    expect(actionable(approval({ status: 'denied' }), NOW)).toBe(false)
  })
})

describe('redact', () => {
  it('hides credential-shaped keys and bearer values at any depth', () => {
    const out = redact({
      error: 'DH-901',
      access_token: 'abc',
      nested: { api_key: 'k', ok: 1, header: 'Bearer abcdefghijklmnop' },
    }) as Record<string, unknown>
    expect(out.error).toBe('DH-901')
    expect(out.access_token).toBe('[redacted]')
    expect(out.nested).toEqual({ api_key: '[redacted]', ok: 1, header: '[redacted]' })
  })
})
