import { describe, expect, it } from 'vitest'
import { explainHistory, STUCK_MS } from './history'

const NOW = Date.parse('2026-11-13T10:00:00Z')
const req = (over: Record<string, unknown>) => ({
  status: 'queued',
  error: null,
  candles: null,
  created_at: new Date(NOW - 5_000).toISOString(),
  started_at: null,
  ...over,
})

describe('what the chart says about a history request', () => {
  it('keeps waiting while it is fresh in the queue or being fetched', () => {
    expect(explainHistory(req({}), NOW).waiting).toBe(true)
    expect(explainHistory(req({ status: 'running' }), NOW).waiting).toBe(true)
  })
  it('names the stopped research worker when nothing picks the request up', () => {
    const r = explainHistory(req({ created_at: new Date(NOW - STUCK_MS - 1).toISOString() }), NOW)
    expect(r.waiting).toBe(false)
    expect(r.text).toMatch(/research worker/)
  })
  it("passes on the broker's error, and an empty answer", () => {
    expect(explainHistory(req({ status: 'failed', error: 'DH-905 bad token' }), NOW).text).toMatch(
      /DH-905 bad token/,
    )
    expect(explainHistory(req({ status: 'done', candles: 0 }), NOW).text).toMatch(
      /no price history/,
    )
  })
})
