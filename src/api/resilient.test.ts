// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { TimeoutError, resilientFetch, retryAfterMs } from './resilient'

const noSleep = vi.fn(async () => {})

function sequence(...answers: Array<Response | Error>) {
  const calls: Request[] = []
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(new Request(input, init))
    const next = answers.shift()
    if (!next) throw new Error('no more answers')
    if (next instanceof Error) throw next
    return next
  }) as unknown as typeof fetch
  return { calls, impl }
}

const json = (status: number, headers: Record<string, string> = {}) =>
  new Response('{}', { status, headers: { 'content-type': 'application/json', ...headers } })
const html = (status: number) =>
  new Response('<html>bad gateway</html>', { status, headers: { 'content-type': 'text/html' } })

describe('retryAfterMs', () => {
  it('reads seconds and HTTP dates', () => {
    expect(retryAfterMs('3')).toBe(3000)
    expect(retryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6000)
    expect(retryAfterMs(null)).toBeNull()
    expect(retryAfterMs('soon')).toBeNull()
  })
})

describe('resilientFetch', () => {
  it('retries a proxy 502 on a GET, then returns the answer', async () => {
    const { calls, impl } = sequence(html(502), json(200))
    const f = resilientFetch(impl, { sleep: noSleep })
    const res = await f('https://x.test/api/agents')
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(2)
  })

  it('returns the API’s own JSON 503 at once (readiness “not ready”)', async () => {
    const { calls, impl } = sequence(json(503))
    const res = await resilientFetch(impl, { sleep: noSleep })('https://x.test/api/health/ready')
    expect(res.status).toBe(503)
    expect(calls).toHaveLength(1)
  })

  it('waits a short Retry-After on 429 but returns a long one', async () => {
    const sleep = vi.fn(async () => {})
    const short = sequence(json(429, { 'retry-after': '2' }), json(200))
    expect((await resilientFetch(short.impl, { sleep })('https://x.test/a')).status).toBe(200)
    expect(sleep).toHaveBeenCalledWith(2000, expect.anything())

    const long = sequence(json(429, { 'retry-after': '600' }))
    expect((await resilientFetch(long.impl, { sleep })('https://x.test/a')).status).toBe(429)
    expect(long.calls).toHaveLength(1)
  })

  it('never retries a mutation', async () => {
    const { calls, impl } = sequence(html(502))
    const res = await resilientFetch(impl, { sleep: noSleep })(
      'https://x.test/api/images/generate',
      {
        method: 'POST',
        body: '{}',
      },
    )
    expect(res.status).toBe(502)
    expect(calls).toHaveLength(1)
  })

  it('retries a dropped connection a bounded number of times', async () => {
    const { calls, impl } = sequence(
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
    )
    await expect(
      resilientFetch(impl, { retries: 2, sleep: noSleep })('https://x.test/a'),
    ).rejects.toBeInstanceOf(TypeError)
    expect(calls).toHaveLength(3)
  })

  it('times out a read that hangs', async () => {
    const impl = ((input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        const signal = new Request(input, init).signal
        signal.addEventListener('abort', () => reject(signal.reason))
      })) as typeof fetch
    await expect(
      resilientFetch(impl, { retries: 0, timeoutMs: 10, sleep: noSleep })('https://x.test/a'),
    ).rejects.toBeInstanceOf(TimeoutError)
  })

  it('stops when the caller aborts', async () => {
    const { calls, impl } = sequence(html(502), json(200))
    const ctl = new AbortController()
    const sleep = vi.fn(async () => {
      ctl.abort(new DOMException('gone', 'AbortError'))
      throw ctl.signal.reason
    })
    await expect(
      resilientFetch(impl, { sleep })('https://x.test/a', { signal: ctl.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(calls).toHaveLength(1)
  })
})
