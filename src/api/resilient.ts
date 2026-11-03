// Timeouts and bounded retries for the typed client's SAFE reads.
//
// • GET / HEAD get a timeout and up to `retries` more attempts when the network
//   drops, the proxy answers 502/503/504 without a JSON body (nginx while the API
//   restarts), or the API says 429 / 503 with a Retry-After it is worth waiting.
// • A JSON 503 without Retry-After is the API's own answer (readiness "not
//   ready", storage not mounted) and comes straight back: retrying it only
//   delays what the page should show.
// • Unsafe methods pass through untouched — no timeout, no retry. A POST that
//   timed out may still have happened on the server; repeating it is not ours to
//   decide (the backend's idempotency keys are for that).
// • The caller's AbortSignal always wins: an abort stops the wait and the retry.

export interface ResilientOptions {
  /** Extra attempts after the first, for safe reads. */
  retries?: number
  /** Per-attempt timeout for safe reads, ms. */
  timeoutMs?: number
  /** Backoff base, ms (doubled per attempt, with jitter). */
  baseMs?: number
  /** Longest Retry-After worth waiting in the page, ms; beyond it the answer is returned. */
  maxWaitMs?: number
  /** Test seam. */
  sleep?: (ms: number, signal: AbortSignal | null) => Promise<void>
}

const SAFE = new Set(['GET', 'HEAD'])

export class TimeoutError extends Error {
  constructor(readonly ms: number) {
    super(`Aureon did not answer within ${Math.round(ms / 1000)} s`)
    this.name = 'TimeoutError'
  }
}

/** Retry-After as ms: delta-seconds or an HTTP date. Null when absent or unreadable. */
export function retryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null
  const secs = Number(value)
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000)
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, at - now) : null
}

function isJson(res: Response): boolean {
  return (res.headers.get('content-type') ?? '').includes('json')
}

/** Whether a safe read's response is worth another attempt, and after how long (null = no). */
export function retryDelay(
  res: Response,
  attempt: number,
  opts: Required<Pick<ResilientOptions, 'baseMs' | 'maxWaitMs'>>,
): number | null {
  const after = retryAfterMs(res.headers.get('retry-after'))
  const backoff = opts.baseMs * 2 ** attempt * (0.75 + Math.random() * 0.5)
  let delay: number | null = null
  if (res.status === 429) delay = after ?? backoff
  else if (res.status === 503) delay = after ?? (isJson(res) ? null : backoff)
  else if (res.status === 502 || res.status === 504) delay = isJson(res) ? null : (after ?? backoff)
  if (delay == null || delay > opts.maxWaitMs) return null
  return delay
}

function defaultSleep(ms: number, signal: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(signal!.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * The request bound to this attempt's signal. Null where the runtime's Request
 * rejects the signal (jsdom's AbortSignal under Node's fetch, in unit tests);
 * the attempt then runs without a timeout rather than not at all.
 */
function withSignal(request: Request, signal: AbortSignal): Request | null {
  try {
    return new Request(request, { signal })
  } catch {
    return null
  }
}

export function resilientFetch(base: typeof fetch, options: ResilientOptions = {}): typeof fetch {
  const retries = options.retries ?? 2
  const timeoutMs = options.timeoutMs ?? 20_000
  const baseMs = options.baseMs ?? 500
  const maxWaitMs = options.maxWaitMs ?? 10_000
  const sleep = options.sleep ?? defaultSleep

  return async function fetchWithPolicy(input: RequestInfo | URL, init?: RequestInit) {
    const request = new Request(input, init)
    if (!SAFE.has(request.method.toUpperCase())) return base(request)

    const outer = request.signal
    for (let attempt = 0; ; attempt++) {
      // One controller per attempt: the timeout, or the caller's abort, ends it.
      const ctl = new AbortController()
      const onOuter = () => ctl.abort(outer.reason)
      if (outer.aborted) throw outer.reason
      outer.addEventListener('abort', onOuter, { once: true })
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        ctl.abort(new TimeoutError(timeoutMs))
      }, timeoutMs)
      const attemptRequest = withSignal(request, ctl.signal)
      try {
        const res = await base(attemptRequest ?? request)
        const delay = attempt < retries ? retryDelay(res, attempt, { baseMs, maxWaitMs }) : null
        if (delay == null) return res
        await res.body?.cancel().catch(() => {})
        await sleep(delay, outer)
      } catch (e) {
        if (outer.aborted) throw outer.reason
        const err = timedOut ? new TimeoutError(timeoutMs) : e
        // Only a dropped connection or a timeout is retried; anything else is a bug to surface.
        const transient = timedOut || e instanceof TypeError
        if (!transient || attempt >= retries) throw err
        await sleep(baseMs * 2 ** attempt * (0.75 + Math.random() * 0.5), outer)
      } finally {
        clearTimeout(timer)
        outer.removeEventListener('abort', onOuter)
      }
    }
  }
}
