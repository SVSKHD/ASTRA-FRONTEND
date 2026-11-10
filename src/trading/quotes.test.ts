import { afterEach, describe, expect, it, vi } from 'vitest'
import { changeOf, fetchQuotes, quoteView, snapshotFreshness } from './quotes'

const NOW = Date.parse('2026-11-10T06:00:00Z') // 11:30 IST, market open

describe('quotes', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('never estimates a change without a previous close', () => {
    expect(changeOf('100', null)).toBeNull()
    expect(changeOf(null, '100')).toBeNull()
    expect(changeOf('110.5', '100')).toEqual({ change: '10.5', pct: '10.50' })
    expect(changeOf('95', '100')).toEqual({ change: '-5', pct: '-5.00' })
  })

  it('never calls a snapshot "Live"', () => {
    const f = snapshotFreshness({ ts: new Date(NOW - 10_000).toISOString() }, NOW)
    expect(f.label).toBe('Fresh')
    expect(f.text).toContain('not streaming')
    expect(snapshotFreshness({ ts: new Date(NOW - 600_000).toISOString() }, NOW).level).toBe(
      'stale',
    )
  })

  it('prefers the live stream over a snapshot', () => {
    const snap = {
      symbol: 'NSE_EQ:1',
      last: '1',
      bid: null,
      ask: null,
      volume: null,
      ts: new Date(NOW).toISOString(),
      source: 'broker' as const,
    }
    const stream = {
      instrument_id: 1,
      ref: 'NSE_EQ:1',
      ltp: '2',
      ltt: null,
      volume: null,
      stale: false,
      received_at: new Date(NOW).toISOString(),
      source: 'broker' as const,
    }
    expect(quoteView(stream, snap, 'open', NOW)!.last).toBe('2')
    expect(quoteView(undefined, snap, 'open', NOW)!.source).toBe('snapshot')
    expect(quoteView(undefined, undefined, 'open', NOW)).toBeNull()
  })

  it('asks for quotes by reference, 50 at a time', async () => {
    const seen: string[][] = []
    vi.stubGlobal('fetch', async (req: Request) => {
      const refs = new URL(req.url).searchParams.get('symbols')!.split(',')
      seen.push(refs)
      const body = refs.map((r) => ({
        symbol: r,
        last: '1',
        bid: null,
        ask: null,
        volume: null,
        ts: new Date().toISOString(),
        source: 'broker',
      }))
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const refs = Array.from({ length: 120 }, (_, i) => `NSE_EQ:${i}`)
    const got = await fetchQuotes(refs)
    expect(seen.map((s) => s.length)).toEqual([50, 50, 20])
    expect(got.size).toBe(120)
    expect(got.get('NSE_EQ:7')?.last).toBe('1')
  })
})
