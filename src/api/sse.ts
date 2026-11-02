// Server-Sent Events, two ways.
//
// • `parseSse` — an incremental parser for a fetch() body. Needed for POST
//   streams (chat sends a JSON body and a CSRF header, which EventSource cannot).
// • `openStream` — a GET stream over EventSource with our reconnect policy.
//   EventSource already resumes with Last-Event-ID after a dropped connection,
//   but it gives up for good on an HTTP error (401, 502 from nginx while the API
//   restarts). openStream then reconnects itself with backoff, keeping the last
//   cursor, and reports every state change so the UI can say "reconnecting".

export interface SseEvent {
  event: string
  data: string
  id?: string
}

/** Feed chunks of text; returns the complete events seen so far. Keeps partial ones. */
export function createSseParser() {
  let buf = ''
  return function push(chunk: string): SseEvent[] {
    buf += chunk.replace(/\r\n?/g, '\n')
    const out: SseEvent[] = []
    let idx: number
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      let event = 'message'
      let id: string | undefined
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (!line || line.startsWith(':')) continue
        const colon = line.indexOf(':')
        const field = colon < 0 ? line : line.slice(0, colon)
        let value = colon < 0 ? '' : line.slice(colon + 1)
        if (value.startsWith(' ')) value = value.slice(1)
        if (field === 'event') event = value
        else if (field === 'data') data.push(value)
        else if (field === 'id') id = value
      }
      if (data.length) out.push({ event, data: data.join('\n'), ...(id ? { id } : {}) })
    }
    return out
  }
}

/** Read a fetch Response body as SSE events. */
export async function* readSse(response: Response): AsyncGenerator<SseEvent> {
  if (!response.body) return
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  const push = createSseParser()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      for (const ev of push(value)) yield ev
    }
  } finally {
    reader.releaseLock()
  }
}

export type StreamStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface StreamOptions {
  /** Event names to listen for (EventSource only dispatches named events to listeners). */
  events: string[]
  onEvent: (ev: SseEvent) => void
  onStatus?: (status: StreamStatus) => void
  /** Base and cap for the reconnect delay after a hard failure, ms. */
  backoff?: { base: number; max: number }
  /** Test seam. */
  EventSourceImpl?: typeof EventSource
  setTimeoutImpl?: (fn: () => void, ms: number) => unknown
}

export interface StreamHandle {
  close(): void
  readonly lastEventId: string | null
}

export function openStream(url: string, opts: StreamOptions): StreamHandle {
  const ES = opts.EventSourceImpl ?? globalThis.EventSource
  const later = opts.setTimeoutImpl ?? ((fn, ms) => setTimeout(fn, ms))
  const { base, max } = opts.backoff ?? { base: 1000, max: 30000 }
  let source: EventSource | null = null
  let lastEventId: string | null = null
  let attempt = 0
  let closed = false

  const status = (s: StreamStatus) => opts.onStatus?.(s)

  function connect() {
    if (closed) return
    const target = lastEventId
      ? `${url}${url.includes('?') ? '&' : '?'}last_event_id=${encodeURIComponent(lastEventId)}`
      : url
    status(attempt ? 'reconnecting' : 'connecting')
    const es = new ES(target, { withCredentials: true })
    source = es
    es.onopen = () => {
      attempt = 0
      status('open')
    }
    for (const name of opts.events) {
      es.addEventListener(name, (msg) => {
        const m = msg as MessageEvent<string>
        if (m.lastEventId) lastEventId = m.lastEventId
        opts.onEvent({ event: name, data: m.data, ...(m.lastEventId ? { id: m.lastEventId } : {}) })
      })
    }
    es.onerror = () => {
      // CONNECTING: the browser is already retrying with Last-Event-ID. Leave it.
      if (es.readyState !== 2 /* CLOSED */) {
        status('reconnecting')
        return
      }
      es.close()
      if (closed) return
      attempt += 1
      const delay = Math.min(max, base * 2 ** Math.min(attempt - 1, 10))
      status('reconnecting')
      later(connect, delay * (0.75 + Math.random() * 0.5))
    }
  }

  connect()
  return {
    close() {
      closed = true
      source?.close()
      status('closed')
    },
    get lastEventId() {
      return lastEventId
    },
  }
}
