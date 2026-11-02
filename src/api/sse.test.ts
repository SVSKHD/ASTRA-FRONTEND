import { describe, expect, it } from 'vitest'
import { createSseParser, openStream, readSse, type StreamStatus } from './sse'

describe('createSseParser', () => {
  it('handles split chunks, comments, ids, CRLF and multi-line data', () => {
    const push = createSseParser()
    expect(push(': ping\n\nid: c1\nevent: sig')).toEqual([])
    expect(push('nal\ndata: {"a":1}\r\n\r\ndata: x\ndata: y\n\n')).toEqual([
      { event: 'signal', data: '{"a":1}', id: 'c1' },
      { event: 'message', data: 'x\ny' },
    ])
  })
})

describe('readSse', () => {
  it('yields events from a streamed body', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const enc = new TextEncoder()
        c.enqueue(enc.encode('event: token\ndata: {"content":"Hel'))
        c.enqueue(enc.encode('lo"}\n\nevent: done\ndata: {}\n\n'))
        c.close()
      },
    })
    const out = []
    for await (const ev of readSse(new Response(body))) out.push(ev)
    expect(out.map((e) => e.event)).toEqual(['token', 'done'])
    expect(JSON.parse(out[0].data).content).toBe('Hello')
  })
})

class FakeES {
  static all: FakeES[] = []
  readyState = 0
  listeners: Record<string, (m: MessageEvent<string>) => void> = {}
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(
    public url: string,
    public init?: EventSourceInit,
  ) {
    FakeES.all.push(this)
  }
  addEventListener(name: string, fn: (m: MessageEvent<string>) => void) {
    this.listeners[name] = fn
  }
  close() {
    this.closed = true
    this.readyState = 2
  }
  emit(name: string, data: string, id: string) {
    this.listeners[name]?.({ data, lastEventId: id } as MessageEvent<string>)
  }
}

describe('openStream', () => {
  it('reconnects after a hard failure with the last cursor, and reports status', () => {
    FakeES.all = []
    const statuses: StreamStatus[] = []
    const got: string[] = []
    const timers: Array<() => void> = []
    const h = openStream('/api/trading/stream?instrument_id=1', {
      events: ['signal'],
      onEvent: (e) => got.push(e.data),
      onStatus: (s) => statuses.push(s),
      EventSourceImpl: FakeES as unknown as typeof EventSource,
      setTimeoutImpl: (fn) => timers.push(fn),
    })
    const first = FakeES.all[0]
    expect(first.init?.withCredentials).toBe(true)
    first.onopen?.()
    first.emit('signal', 'A', 'cur-1')
    // A soft error (browser retrying): nothing for us to do.
    first.readyState = 0
    first.onerror?.()
    expect(FakeES.all).toHaveLength(1)
    // A hard error (HTTP 502/401): we reconnect ourselves, with the cursor.
    first.readyState = 2
    first.onerror?.()
    expect(timers).toHaveLength(1)
    timers[0]()
    const second = FakeES.all[1]
    expect(second.url).toBe('/api/trading/stream?instrument_id=1&last_event_id=cur-1')
    second.onopen?.()
    h.close()
    expect(second.closed).toBe(true)
    expect(got).toEqual(['A'])
    expect(statuses).toEqual([
      'connecting',
      'open',
      'reconnecting',
      'reconnecting',
      'reconnecting',
      'open',
      'closed',
    ])
    expect(h.lastEventId).toBe('cur-1')
  })
})
