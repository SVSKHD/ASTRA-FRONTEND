// The screener's request builder, validation and the gate on the OpenAPI contract.
import { afterEach, describe, expect, it, vi } from 'vitest'
import openapi from '@/api/openapi.json'
import {
  PRESETS,
  SCREENER_AVAILABLE,
  SCREENER_RUN_PATH,
  buildRequest,
  defaultForm,
  describeFilter,
  indicatorLabel,
  requestText,
  runScreener,
  ScreenerFailure,
  screenerFailure,
  serverIssues,
  validateRequest,
  watchlistFromQuery,
  type ScreenerFilter,
} from './screener'

const preset = (key: string) => PRESETS.find((p) => p.key === key)!.make()

describe('availability gate', () => {
  it('matches the OpenAPI contract: the run path is present, so the screener is on', () => {
    const inJson = SCREENER_RUN_PATH in (openapi as { paths: Record<string, unknown> }).paths
    expect(SCREENER_AVAILABLE).toBe(inJson)
    // The backend now serves the screener (docs/market-terminal.md §6).
    expect(inJson).toBe(true)
  })
})

describe('buildRequest', () => {
  it('produces the docs §6 body, field for field', () => {
    const r = buildRequest(defaultForm())
    expect(Object.keys(r)).toEqual([
      'universe',
      'timeframe',
      'candle',
      'filters',
      'sort',
      'limit',
      'offset',
    ])
    expect(r).toEqual({
      universe: { exchange: ['NSE'], kind: ['equity'], watchlist_id: null },
      timeframe: '15m',
      candle: 'confirmed',
      filters: [{ type: 'ema_cross', fast: 8, slow: 32, direction: 'bullish', within_bars: 3 }],
      sort: { field: 'change_pct', dir: 'desc' },
      limit: 50,
      offset: 0,
    })
  })

  it('builds every filter in the doc example from the presets', () => {
    const form = defaultForm()
    form.filters = [
      'ema8_32_cross',
      'ema8_32_position',
      'price_vs_ema',
      'rsi',
      'macd_cross',
      'volume',
      'adx',
      'vwap_position',
    ].map(preset)
    expect(buildRequest(form).filters).toEqual([
      { type: 'ema_cross', fast: 8, slow: 32, direction: 'bullish', within_bars: 3 },
      { type: 'ema_position', fast: 8, slow: 32, relation: 'above' },
      { type: 'price_vs_ema', period: 200, relation: 'above' },
      { type: 'rsi', period: 14, op: '<', value: 30 },
      { type: 'macd_cross', fast: 12, slow: 26, signal: 9, direction: 'bullish' },
      { type: 'volume', op: '>', multiple_of_avg: 2, avg_period: 20 },
      { type: 'adx', period: 14, op: '>', value: 25 },
      { type: 'vwap_position', relation: 'above' },
    ])
    expect(validateRequest(buildRequest(form))).toEqual([])
  })

  it('offers EMA 9/21 as its own preset', () => {
    expect(preset('ema9_21_cross')).toMatchObject({ type: 'ema_cross', fast: 9, slow: 21 })
  })

  it('turns page and page size into limit/offset, and keeps the watchlist id', () => {
    const form = {
      ...defaultForm(),
      page: 3,
      pageSize: 25,
      watchlistId: 'wl_1',
      candle: 'live' as const,
    }
    const r = buildRequest(form)
    expect(r.limit).toBe(25)
    expect(r.offset).toBe(50)
    expect(r.universe.watchlist_id).toBe('wl_1')
    expect(r.candle).toBe('live')
  })

  it('copies the filters so later edits do not change a built request', () => {
    const form = defaultForm()
    const r = buildRequest(form)
    ;(form.filters[0] as { fast: number }).fast = 5
    expect(r.filters[0]).toMatchObject({ fast: 8 })
  })
})

describe('validateRequest', () => {
  const withFilter = (f: ScreenerFilter) => buildRequest({ ...defaultForm(), filters: [f] })
  const messages = (f: ScreenerFilter) => validateRequest(withFilter(f)).map((i) => i.message)

  it('needs fast shorter than slow, and whole positive periods', () => {
    expect(
      messages({ type: 'ema_cross', fast: 32, slow: 8, direction: 'bullish', within_bars: 3 }),
    ).toContain('The fast period must be shorter than the slow one.')
    expect(messages({ type: 'ema_position', fast: 0, slow: 8, relation: 'above' })).toContain(
      'Fast period must be a whole number above 0.',
    )
    expect(messages({ type: 'price_vs_ema', period: 2.5, relation: 'above' })).toContain(
      'EMA period must be a whole number above 0.',
    )
    expect(
      messages({ type: 'ema_cross', fast: 8, slow: 32, direction: 'bullish', within_bars: 0 }),
    ).toContain('"Within N bars" must be a whole number from 1 to 100.')
  })

  it('bounds RSI and ADX levels to 0..100 and the volume multiple above 0', () => {
    expect(messages({ type: 'rsi', period: 14, op: '<', value: 130 })).toContain(
      'The RSI level must be between 0 and 100.',
    )
    expect(messages({ type: 'adx', period: 14, op: '>', value: -1 })).toContain(
      'The ADX level must be between 0 and 100.',
    )
    expect(messages({ type: 'volume', op: '>', multiple_of_avg: 0, avg_period: 20 })).toContain(
      'The volume multiple must be above 0 and at most 1000.',
    )
  })

  it('treats an emptied number field (null) as invalid', () => {
    const f = { type: 'rsi', period: null, op: '<', value: 30 } as unknown as ScreenerFilter
    expect(validateRequest(withFilter(f))[0]).toEqual({
      path: 'filters.0',
      message: 'RSI period must be a whole number above 0.',
    })
  })

  it('needs a filter, an exchange and a market unless a watchlist is the universe', () => {
    const r = buildRequest({ ...defaultForm(), filters: [], exchanges: [], kinds: [] })
    expect(validateRequest(r).map((i) => i.path)).toEqual(['universe', 'universe', 'filters'])
    const wl = buildRequest({ ...defaultForm(), exchanges: [], kinds: [], watchlistId: 'wl_1' })
    expect(validateRequest(wl)).toEqual([])
  })

  it('rejects a timeframe outside the Timeframe enum', () => {
    const r = { ...buildRequest(defaultForm()), timeframe: '2h' as '1h' }
    expect(validateRequest(r).map((i) => i.path)).toEqual(['timeframe'])
  })
})

describe('helpers', () => {
  it('describes filters in words', () => {
    expect(describeFilter(preset('ema8_32_cross'))).toBe('EMA 8 crosses above EMA 32 within 3 bars')
    expect(describeFilter(preset('volume'))).toBe('Volume > 2× its 20-bar average')
  })
  it('labels indicator keys', () => {
    expect(indicatorLabel('ema:8')).toBe('EMA 8')
    expect(indicatorLabel('macd:12:26:9')).toBe('MACD 12/26/9')
    expect(indicatorLabel('vwap')).toBe('VWAP')
  })
  it('reads ?watchlist= safely', () => {
    expect(watchlistFromQuery('wl_abc-1')).toBe('wl_abc-1')
    expect(watchlistFromQuery(['wl_x'])).toBe('wl_x')
    expect(watchlistFromQuery('<script>')).toBeNull()
    expect(watchlistFromQuery(undefined)).toBeNull()
  })
  it('copies the method, path and body', () => {
    const text = requestText(buildRequest(defaultForm()))
    expect(text.startsWith('POST /api/trading/screener/run\n{')).toBe(true)
    expect(JSON.parse(text.slice(text.indexOf('\n') + 1))).toEqual(buildRequest(defaultForm()))
  })
})

describe('runScreener', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('POSTs the body to the documented path (used once the gate opens)', async () => {
    const seen: { method: string; path: string; body: unknown }[] = []
    vi.stubGlobal('fetch', async (req: Request) => {
      seen.push({
        method: req.method,
        path: new URL(req.url).pathname,
        body: JSON.parse(await req.text()),
      })
      return new Response(
        JSON.stringify({
          as_of: 'x',
          candle: 'confirmed',
          timeframe: '15m',
          universe_size: 0,
          total: 0,
          items: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    const body = buildRequest(defaultForm())
    const r = await runScreener(body)
    expect(r.total).toBe(0)
    expect(seen).toEqual([{ method: 'POST', path: SCREENER_RUN_PATH, body }])
  })
})

describe('runScreener failures', () => {
  afterEach(() => vi.unstubAllGlobals())
  const h = (o: Record<string, string> = {}) => new Headers(o)

  it('classifies every status the screen handles', () => {
    expect(screenerFailure(401, {}, h()).kind).toBe('auth')
    expect(screenerFailure(403, { detail: 'admins only' }, h())).toMatchObject({
      kind: 'forbidden',
      message: 'admins only',
    })
    expect(screenerFailure(404, {}, h()).kind).toBe('not_deployed')
    expect(screenerFailure(405, {}, h()).kind).toBe('not_deployed')
    expect(screenerFailure(422, { detail: 'bad' }, h()).kind).toBe('invalid')
    expect(screenerFailure(501, {}, h()).kind).toBe('unsupported')
    expect(screenerFailure(500, {}, h())).toMatchObject({
      kind: 'server',
      message: 'Aureon answered 500.',
    })
    expect(screenerFailure(503, { detail: { code: 'worker_down' } }, h()).message).toBe(
      'worker down',
    )
  })

  it('reads Retry-After on a 429, in seconds or as a date', () => {
    const s = screenerFailure(429, {}, h({ 'retry-after': '12' }))
    expect(s).toMatchObject({ kind: 'rate_limited', retryAfter: 12 })
    expect(s.message).toBe('Too many screener runs. Try again in 12s.')
    const d = screenerFailure(
      429,
      {},
      h({ 'retry-after': new Date(Date.now() + 5000).toUTCString() }),
    )
    expect(d.retryAfter).toBeGreaterThanOrEqual(3)
    expect(d.retryAfter).toBeLessThanOrEqual(6)
    expect(screenerFailure(429, {}, h()).retryAfter).toBeNull()
  })

  it('maps FastAPI 422 locations onto the form', () => {
    const issues = serverIssues({
      detail: [
        { loc: ['body', 'filters', 1, 'slow'], msg: 'must exceed fast', type: 'x' },
        { loc: ['body', 'universe', 'exchange', 0], msg: 'bad exchange', type: 'x' },
        { loc: ['body', 'limit'], msg: 'too big', type: 'x' },
        { loc: ['body', 'timeframe'], msg: 'unknown', type: 'x' },
        { loc: ['body'], msg: 'whole body', type: 'x' },
        { nonsense: true },
      ],
    })
    expect(issues).toEqual([
      { path: 'filters.1', message: 'slow: must exceed fast' },
      { path: 'universe', message: 'bad exchange' },
      { path: 'page', message: 'too big' },
      { path: 'timeframe', message: 'unknown' },
      { path: 'request', message: 'whole body' },
    ])
    expect(serverIssues({ detail: 'universe too large' })).toEqual([
      { path: 'request', message: 'universe too large' },
    ])
    expect(serverIssues(null)).toEqual([])
  })

  it('turns a network error into a network failure, and a wrong 200 body into a server one', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(runScreener(buildRequest(defaultForm()))).rejects.toMatchObject({
      kind: 'network',
    })
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ items: 'nope' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const e = await runScreener(buildRequest(defaultForm())).catch((x) => x)
    expect(e).toBeInstanceOf(ScreenerFailure)
    expect(e.kind).toBe('server')
  })

  it('sends the POST once with the CSRF header, never retrying it', async () => {
    document.cookie = 'aureon_csrf=tok123; path=/'
    let n = 0
    const headers: (string | null)[] = []
    vi.stubGlobal('fetch', async (req: Request) => {
      n++
      headers.push(req.headers.get('x-csrf-token'))
      return new Response(JSON.stringify({ detail: 'down' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })
    })
    await expect(runScreener(buildRequest(defaultForm()))).rejects.toMatchObject({
      kind: 'server',
    })
    expect(n).toBe(1)
    expect(headers).toEqual(['tok123'])
    document.cookie = 'aureon_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })
})

describe('EMA 8/32 and custom EMA filters', () => {
  it('defaults to an EMA 8/32 bullish crossover on confirmed candles', () => {
    const r = buildRequest(defaultForm())
    expect(r.candle).toBe('confirmed')
    expect(r.filters).toEqual([
      { type: 'ema_cross', fast: 8, slow: 32, direction: 'bullish', within_bars: 3 },
    ])
    expect(describeFilter(r.filters[0])).toBe('EMA 8 crosses above EMA 32 within 3 bars')
  })

  it('keeps custom fast/slow EMA periods and the bearish direction as typed', () => {
    const form = defaultForm()
    form.filters = [
      { type: 'ema_cross', fast: 13, slow: 55, direction: 'bearish', within_bars: 1 },
      { type: 'ema_position', fast: 8, slow: 32, relation: 'below' },
      { type: 'price_vs_ema', period: 32, relation: 'above' },
    ]
    const r = buildRequest(form)
    expect(validateRequest(r)).toEqual([])
    expect(r.filters).toEqual(form.filters)
    expect(r.filters.map(describeFilter)).toEqual([
      'EMA 13 crosses below EMA 55 within 1 bar',
      'EMA 8 below EMA 32',
      'Price above EMA 32',
    ])
  })

  it('rejects an EMA pair whose fast period is not shorter, or a fractional period', () => {
    const form = defaultForm()
    form.filters = [
      { type: 'ema_cross', fast: 32, slow: 8, direction: 'bullish', within_bars: 3 },
      { type: 'ema_position', fast: 8, slow: 8, relation: 'above' },
      { type: 'price_vs_ema', period: 8.5, relation: 'above' },
    ]
    const msgs = validateRequest(buildRequest(form))
    expect(msgs.filter((m) => m.path === 'filters.0').map((m) => m.message)).toContain(
      'The fast period must be shorter than the slow one.',
    )
    expect(msgs.some((m) => m.path === 'filters.1')).toBe(true)
    expect(msgs.filter((m) => m.path === 'filters.2').map((m) => m.message)).toContain(
      'EMA period must be a whole number above 0.',
    )
  })

  it('labels the EMA 8 and EMA 32 readings the server returns', () => {
    expect(indicatorLabel('ema:8')).toBe('EMA 8')
    expect(indicatorLabel('ema:32')).toBe('EMA 32')
  })
})
