import { beforeEach, describe, expect, it } from 'vitest'
import { applyEvent, connect, disconnect, live, reconnect } from './stream'

class FakeES {
  static all: FakeES[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners: Record<string, (m: MessageEvent<string>) => void> = {}
  constructor(public url: string) {
    FakeES.all.push(this)
  }
  addEventListener(n: string, fn: (m: MessageEvent<string>) => void) {
    this.listeners[n] = fn
  }
  close() {
    this.readyState = 2
  }
}

beforeEach(() => {
  live.signals.length = 0
  live.risks.length = 0
  live.agents = {}
  live.quotes = {}
  FakeES.all = []
  disconnect()
})

describe('live state', () => {
  it('folds events in, newest first, without duplicates', () => {
    const sig = (id: string) =>
      JSON.stringify({ id, side: 'BUY', instrument_id: 1, timeframe: '5m', candle_time: 't' })
    applyEvent('signal', sig('a'))
    applyEvent('signal', sig('b'))
    applyEvent('signal', sig('a'))
    expect(live.signals.map((s) => s.id)).toEqual(['b', 'a'])
    applyEvent('agent', JSON.stringify({ id: 'risk', name: 'Risk', state: 'idle' }))
    applyEvent('agent', JSON.stringify({ id: 'risk', name: 'Risk', state: 'stale' }))
    expect(live.agents.risk.state).toBe('stale')
    applyEvent('quote', JSON.stringify({ instrument_id: 7, ltp: '101.5', source: 'broker' }))
    expect(live.quotes[7].ltp).toBe('101.5')
    applyEvent('signal', 'not json')
    expect(live.signals).toHaveLength(2)
  })

  it('opens one stream and only reopens it when the instruments change', () => {
    const impl = { EventSourceImpl: FakeES as unknown as typeof EventSource }
    connect([7, 3], impl)
    connect([3, 7], impl)
    expect(FakeES.all).toHaveLength(1)
    expect(FakeES.all[0].url).toBe('/api/trading/stream?instrument_id=3&instrument_id=7')
    FakeES.all[0].onopen?.()
    expect(live.status).toBe('open')
    FakeES.all[0].listeners.signal?.({
      data: JSON.stringify({ id: 'x', side: 'SELL' }),
      lastEventId: 'cur',
    } as MessageEvent<string>)
    expect(live.signals[0].id).toBe('x')
    connect([3], impl)
    expect(FakeES.all).toHaveLength(2)
    expect(FakeES.all[0].readyState).toBe(2)
  })
})

describe('subscriptions', () => {
  const impl = { EventSourceImpl: FakeES as unknown as typeof EventSource }

  it('drops quotes for instruments no longer followed, so they never look current', () => {
    connect([1, 2], impl)
    applyEvent('quote', JSON.stringify({ instrument_id: 1, ltp: '10' }))
    applyEvent('quote', JSON.stringify({ instrument_id: 2, ltp: '20' }))
    connect([2], impl)
    expect(Object.keys(live.quotes)).toEqual(['2'])
    expect(live.subscribed).toEqual([2])
  })

  it('reconnects with the same subscription and one stream at a time', () => {
    connect([5], impl)
    reconnect(impl)
    expect(FakeES.all).toHaveLength(2)
    expect(FakeES.all[0].readyState).toBe(2)
    expect(FakeES.all[1].url).toBe('/api/trading/stream?instrument_id=5')
  })

  it('reads closed after disconnect', () => {
    connect([5], impl)
    FakeES.all[0].onopen?.()
    disconnect()
    expect(live.status).toBe('closed')
  })
})
