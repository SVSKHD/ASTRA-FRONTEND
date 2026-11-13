// The Stock Screener (Dhan instruments only): the request, its validation, the run.
//
//   POST /api/trading/screener/run          up to SCREENER_INLINE_MAX instruments: the
//                                           answer at once (status `done`); more: queued
//                                           for the research worker (status `queued`)
//   GET  /api/trading/screener/runs/{id}    a queued run, until it is `done` or `failed`
//   GET  /api/trading/screener/status       the worker and the queue
//
// It never screens in the browser and never shows sample results: scanning the market
// needs the server's candles and indicator code, so the chart and the screener agree to
// the digit. A watchlist is screened through its server copy (screenerWatchlistId): the
// lists live on this device, the scan runs on the server.

import { aureon, type components, type paths } from '@/api/client'
import type { Instrument } from '@/trading/instruments'

export const SCREENER_RUN_PATH = '/api/trading/screener/run' as const
export const SCREENER_DOC = 'docs/market-terminal.md §6'

type ScreenerInContract = typeof SCREENER_RUN_PATH extends keyof paths ? true : false
/** True only when the generated OpenAPI contract has the screener endpoint. */
export const SCREENER_AVAILABLE: ScreenerInContract = true

// --- the request (docs §6, field for field) ----------------------------------------------

export type Timeframe = components['schemas']['Timeframe']
export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']

export type ScreenerExchange = 'NSE' | 'BSE'
export type ScreenerKind = 'equity' | 'index' | 'future'
export type CandleMode = 'confirmed' | 'live'
export type Relation = 'above' | 'below'
export type Direction = 'bullish' | 'bearish'
export type Op = '<' | '>'

export type ScreenerFilter =
  | { type: 'ema_cross'; fast: number; slow: number; direction: Direction; within_bars: number }
  | { type: 'ema_position'; fast: number; slow: number; relation: Relation }
  | { type: 'price_vs_ema'; period: number; relation: Relation }
  | { type: 'rsi'; period: number; op: Op; value: number }
  | { type: 'macd_cross'; fast: number; slow: number; signal: number; direction: Direction }
  | { type: 'volume'; op: Op; multiple_of_avg: number; avg_period: number }
  | { type: 'adx'; period: number; op: Op; value: number }
  | { type: 'vwap_position'; relation: Relation }

export type FilterType = ScreenerFilter['type']

export type SortField = 'change_pct' | 'last' | 'symbol' | 'crossed_at'
export type SortDir = 'asc' | 'desc'

export interface ScreenerRequest {
  universe: { exchange: ScreenerExchange[]; kind: ScreenerKind[]; watchlist_id: string | null }
  timeframe: Timeframe
  candle: CandleMode
  filters: ScreenerFilter[]
  sort: { field: SortField; dir: SortDir }
  limit: number
  offset: number
}

// --- the response (docs §6) --------------------------------------------------------------

export type ScreenerSignal = 'bullish_cross' | 'bearish_cross' | 'above' | 'below'

export interface ScreenerItem {
  instrument: Instrument
  last: string | null
  change_pct: string | null
  indicators: Record<string, string | null>
  signal: ScreenerSignal | null
  crossed_at: string | null
  data_as_of: string
}

export type RunStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface ScreenerResponse {
  as_of: string
  candle: CandleMode
  timeframe: Timeframe
  universe_size: number
  total: number
  items: ScreenerItem[]
  /** The stored run; a queued one is polled at GET /screener/runs/{run_id}. */
  run_id?: string
  status?: RunStatus | string
  /** Why a run failed, or what is missing (no candles for this universe yet). */
  detail?: string | null
  cached?: boolean
}

export type ScreenerStatus = components['schemas']['ScreenerStatus']

/** Still on the server's queue: keep polling. */
export function isPending(r: Pick<ScreenerResponse, 'status'>): boolean {
  return r.status === 'queued' || r.status === 'running'
}

// --- vocabulary for the form -------------------------------------------------------------

export const EXCHANGES: { value: ScreenerExchange; label: string }[] = [
  { value: 'NSE', label: 'NSE' },
  { value: 'BSE', label: 'BSE' },
]
export const KINDS: { value: ScreenerKind; label: string }[] = [
  { value: 'equity', label: 'Equity' },
  { value: 'index', label: 'Indices' },
  { value: 'future', label: 'Futures' },
]
export const SORT_FIELDS: { value: SortField; label: string }[] = [
  { value: 'change_pct', label: '% change' },
  { value: 'last', label: 'Price' },
  { value: 'symbol', label: 'Symbol' },
  { value: 'crossed_at', label: 'Crossover time' },
]
export const PAGE_SIZES = [25, 50, 100]
export const MAX_FILTERS = 12
export const MAX_LIMIT = 500

export const FILTER_LABEL: Record<FilterType, string> = {
  ema_cross: 'EMA crossover',
  ema_position: 'EMA above / below EMA',
  price_vs_ema: 'Price vs EMA',
  rsi: 'RSI threshold',
  macd_cross: 'MACD cross',
  volume: 'Volume vs average',
  adx: 'ADX threshold',
  vwap_position: 'Price vs VWAP',
}

/** The presets the "Add filter" menu offers: each one is a filter with its defaults. */
export const PRESETS: { key: string; label: string; make: () => ScreenerFilter }[] = [
  {
    key: 'ema8_32_cross',
    label: 'EMA 8/32 crossover within N bars',
    make: () => ({ type: 'ema_cross', fast: 8, slow: 32, direction: 'bullish', within_bars: 3 }),
  },
  {
    key: 'ema8_32_position',
    label: 'EMA 8 above / below EMA 32',
    make: () => ({ type: 'ema_position', fast: 8, slow: 32, relation: 'above' }),
  },
  {
    key: 'ema9_21_cross',
    label: 'EMA 9/21 crossover',
    make: () => ({ type: 'ema_cross', fast: 9, slow: 21, direction: 'bullish', within_bars: 3 }),
  },
  {
    key: 'price_vs_ema',
    label: 'Price above / below EMA n',
    make: () => ({ type: 'price_vs_ema', period: 200, relation: 'above' }),
  },
  {
    key: 'rsi',
    label: 'RSI threshold',
    make: () => ({ type: 'rsi', period: 14, op: '<', value: 30 }),
  },
  {
    key: 'macd_cross',
    label: 'MACD cross',
    make: () => ({ type: 'macd_cross', fast: 12, slow: 26, signal: 9, direction: 'bullish' }),
  },
  {
    key: 'volume',
    label: 'Volume vs average',
    make: () => ({ type: 'volume', op: '>', multiple_of_avg: 2, avg_period: 20 }),
  },
  {
    key: 'adx',
    label: 'ADX threshold',
    make: () => ({ type: 'adx', period: 14, op: '>', value: 25 }),
  },
  {
    key: 'vwap_position',
    label: 'Price above / below VWAP',
    make: () => ({ type: 'vwap_position', relation: 'above' }),
  },
]

/** One line a person reads back: "EMA 8 crosses above EMA 32 within 3 bars". */
export function describeFilter(f: ScreenerFilter): string {
  switch (f.type) {
    case 'ema_cross':
      return `EMA ${f.fast} crosses ${f.direction === 'bullish' ? 'above' : 'below'} EMA ${f.slow} within ${f.within_bars} bar${f.within_bars === 1 ? '' : 's'}`
    case 'ema_position':
      return `EMA ${f.fast} ${f.relation} EMA ${f.slow}`
    case 'price_vs_ema':
      return `Price ${f.relation} EMA ${f.period}`
    case 'rsi':
      return `RSI ${f.period} ${f.op} ${f.value}`
    case 'macd_cross':
      return `MACD ${f.fast}/${f.slow}/${f.signal} ${f.direction} cross`
    case 'volume':
      return `Volume ${f.op} ${f.multiple_of_avg}× its ${f.avg_period}-bar average`
    case 'adx':
      return `ADX ${f.period} ${f.op} ${f.value}`
    case 'vwap_position':
      return `Price ${f.relation} VWAP`
  }
}

// --- the form state and the builder ------------------------------------------------------

export interface ScreenerForm {
  exchanges: ScreenerExchange[]
  kinds: ScreenerKind[]
  watchlistId: string | null
  timeframe: Timeframe
  candle: CandleMode
  filters: ScreenerFilter[]
  sortField: SortField
  sortDir: SortDir
  pageSize: number
  page: number
}

export function defaultForm(): ScreenerForm {
  return {
    exchanges: ['NSE'],
    kinds: ['equity'],
    watchlistId: null,
    timeframe: '15m',
    // Confirmed by default: a live candle's crossover can undo itself before the bar closes.
    candle: 'confirmed',
    filters: [PRESETS[0].make()],
    sortField: 'change_pct',
    sortDir: 'desc',
    pageSize: 50,
    page: 1,
  }
}

/** The exact docs §6 body. Key order follows the doc so "copy request" reads like it. */
export function buildRequest(form: ScreenerForm): ScreenerRequest {
  return {
    universe: {
      exchange: [...form.exchanges],
      kind: [...form.kinds],
      watchlist_id: form.watchlistId || null,
    },
    timeframe: form.timeframe,
    candle: form.candle,
    filters: form.filters.map((f) => ({ ...f })),
    sort: { field: form.sortField, dir: form.sortDir },
    limit: form.pageSize,
    offset: Math.max(0, (form.page - 1) * form.pageSize),
  }
}

export interface ValidationIssue {
  /** 'universe', 'timeframe', 'filters', 'filters.2', 'sort', 'page'. */
  path: string
  message: string
}

const posInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0
const inRange = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi

function filterIssues(f: ScreenerFilter): string[] {
  const out: string[] = []
  const period = (label: string, n: unknown) => {
    if (!posInt(n)) out.push(`${label} must be a whole number above 0.`)
    else if (n > 500) out.push(`${label} must be 500 or less.`)
  }
  const fastSlow = (fast: number, slow: number) => {
    period('Fast period', fast)
    period('Slow period', slow)
    if (posInt(fast) && posInt(slow) && fast >= slow)
      out.push('The fast period must be shorter than the slow one.')
  }
  switch (f.type) {
    case 'ema_cross':
      fastSlow(f.fast, f.slow)
      if (!posInt(f.within_bars) || f.within_bars > 100)
        out.push('"Within N bars" must be a whole number from 1 to 100.')
      break
    case 'ema_position':
      fastSlow(f.fast, f.slow)
      break
    case 'price_vs_ema':
      period('EMA period', f.period)
      break
    case 'rsi':
      period('RSI period', f.period)
      if (!inRange(f.value, 0, 100)) out.push('The RSI level must be between 0 and 100.')
      break
    case 'macd_cross':
      fastSlow(f.fast, f.slow)
      period('Signal period', f.signal)
      break
    case 'volume':
      period('Average period', f.avg_period)
      if (!inRange(f.multiple_of_avg, 0, 1000) || f.multiple_of_avg <= 0)
        out.push('The volume multiple must be above 0 and at most 1000.')
      break
    case 'adx':
      period('ADX period', f.period)
      if (!inRange(f.value, 0, 100)) out.push('The ADX level must be between 0 and 100.')
      break
    case 'vwap_position':
      break
  }
  return out
}

/** Everything wrong with a request, in the order the form shows it. Empty = valid. */
export function validateRequest(r: ScreenerRequest): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!r.universe.watchlist_id && !r.universe.exchange.length)
    issues.push({ path: 'universe', message: 'Pick an exchange or a watchlist to screen.' })
  if (!r.universe.watchlist_id && !r.universe.kind.length)
    issues.push({
      path: 'universe',
      message: 'Pick at least one market: equity, indices or futures.',
    })
  if (!TIMEFRAMES.includes(r.timeframe))
    issues.push({
      path: 'timeframe',
      message: `Timeframe must be one of ${TIMEFRAMES.join(', ')}.`,
    })
  if (r.candle !== 'confirmed' && r.candle !== 'live')
    issues.push({ path: 'candle', message: 'Choose confirmed or live candle.' })
  if (!r.filters.length) issues.push({ path: 'filters', message: 'Add at least one filter.' })
  if (r.filters.length > MAX_FILTERS)
    issues.push({ path: 'filters', message: `At most ${MAX_FILTERS} filters.` })
  r.filters.forEach((f, i) => {
    for (const message of filterIssues(f)) issues.push({ path: `filters.${i}`, message })
  })
  if (!SORT_FIELDS.some((s) => s.value === r.sort.field) || !['asc', 'desc'].includes(r.sort.dir))
    issues.push({ path: 'sort', message: 'Choose a sort field and direction.' })
  if (!posInt(r.limit) || r.limit > MAX_LIMIT)
    issues.push({ path: 'page', message: `Page size must be 1 to ${MAX_LIMIT}.` })
  if (!Number.isInteger(r.offset) || r.offset < 0)
    issues.push({ path: 'page', message: 'The page offset cannot be negative.' })
  return issues
}

/** What "Copy request" puts on the clipboard: the method, the path and the body. */
export function requestText(r: ScreenerRequest): string {
  return `POST ${SCREENER_RUN_PATH}\n${JSON.stringify(r, null, 2)}\n`
}

/** Deep-link parsing: `?watchlist=<id>` from the Watchlists screen. */
export function watchlistFromQuery(q: unknown): string | null {
  const v = Array.isArray(q) ? q[0] : q
  return typeof v === 'string' && /^[\w-]{1,80}$/.test(v) ? v : null
}

// --- the call (only reachable once the contract has it) ----------------------------------

/**
 * What went wrong with a run, in the terms the screen acts on:
 *
 * - `auth`          401: the Aureon session ended (the client's onUnauthorized hook also
 *                   returns the panel to its sign-in gate).
 * - `forbidden`     403: signed in, but this account may not run the screener.
 * - `invalid`       422: the server rejected the request; `issues` maps its complaints onto
 *                   the form's fields where the location says which one.
 * - `rate_limited`  429: too many runs; `retryAfter` is the server's Retry-After in seconds.
 * - `not_deployed`  404/405: the server answering does not have the endpoint, i.e. the
 *                   frontend and the backend deployed here disagree about the contract.
 * - `unsupported`   501: the broker cannot provide what the filters need.
 * - `server`        any other answer, or a 200 whose body is not a screener response.
 * - `network`       no answer at all.
 */
export type ScreenerFailureKind =
  | 'auth'
  | 'forbidden'
  | 'invalid'
  | 'rate_limited'
  | 'not_deployed'
  | 'unsupported'
  | 'server'
  | 'network'

export class ScreenerFailure extends Error {
  constructor(
    readonly kind: ScreenerFailureKind,
    message: string,
    readonly status: number | null = null,
    readonly issues: ValidationIssue[] = [],
    readonly retryAfter: number | null = null,
  ) {
    super(message)
    this.name = 'ScreenerFailure'
  }
}

/** A FastAPI 422 `loc` (["body", "filters", 0, "fast"]) → the form path the screen shows it at. */
function issuePath(loc: unknown[]): string {
  const at = loc[0] === 'body' ? loc.slice(1) : loc
  const [head, index] = at
  if (head === 'filters' && typeof index === 'number') return `filters.${index}`
  if (head === 'universe' || head === 'timeframe' || head === 'candle' || head === 'sort')
    return head
  if (head === 'filters') return 'filters'
  if (head === 'limit' || head === 'offset') return 'page'
  return 'request'
}

function detailText(body: unknown): string | null {
  const d = (body as { detail?: unknown } | null | undefined)?.detail
  if (typeof d === 'string') return d
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const o = d as { detail?: unknown; message?: unknown; code?: unknown }
    if (typeof o.detail === 'string') return o.detail
    if (typeof o.message === 'string') return o.message
    if (typeof o.code === 'string') return o.code.replaceAll('_', ' ')
  }
  return null
}

/** The server's 422 complaints as form issues. A string detail is one request-level issue. */
export function serverIssues(body: unknown): ValidationIssue[] {
  const d = (body as { detail?: unknown } | null | undefined)?.detail
  if (Array.isArray(d)) {
    return d.flatMap((e) => {
      if (!e || typeof e !== 'object') return []
      const { loc, msg } = e as { loc?: unknown; msg?: unknown }
      if (typeof msg !== 'string') return []
      const path = Array.isArray(loc) ? issuePath(loc) : 'request'
      const at = Array.isArray(loc) ? (loc[0] === 'body' ? loc.slice(1) : loc) : []
      // Name the field inside a filter ("fast: …") so the message reads on its own.
      const field = path.startsWith('filters.') && typeof at[2] === 'string' ? `${at[2]}: ` : ''
      return [{ path, message: `${field}${msg}` }]
    })
  }
  const text = detailText(body)
  return text ? [{ path: 'request', message: text }] : []
}

function retryAfterSeconds(headers: Headers): number | null {
  const v = headers.get('retry-after')
  if (!v) return null
  const n = Number(v)
  if (Number.isFinite(n) && n >= 0) return Math.ceil(n)
  const at = Date.parse(v)
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - Date.now()) / 1000))
}

/** Turn a non-2xx answer into a ScreenerFailure. Exported for the tests. */
export function screenerFailure(status: number, body: unknown, headers: Headers): ScreenerFailure {
  const said = detailText(body)
  switch (status) {
    case 401:
      return new ScreenerFailure('auth', 'Your Aureon session ended. Sign in again.', status)
    case 403:
      return new ScreenerFailure(
        'forbidden',
        said || 'Your Aureon account is not allowed to run the screener.',
        status,
      )
    case 404:
    case 405:
      return new ScreenerFailure(
        'not_deployed',
        `The Aureon server here does not have POST ${SCREENER_RUN_PATH}. This build expects it; the backend deployed on this host is older than the contract.`,
        status,
      )
    case 422: {
      const issues = serverIssues(body)
      return new ScreenerFailure(
        'invalid',
        issues.length === 1 ? issues[0].message : 'The server rejected these filters.',
        status,
        issues,
      )
    }
    case 429: {
      const wait = retryAfterSeconds(headers)
      return new ScreenerFailure(
        'rate_limited',
        said ||
          (wait !== null
            ? `Too many screener runs. Try again in ${wait}s.`
            : 'Too many screener runs. Wait a moment and try again.'),
        status,
        [],
        wait,
      )
    }
    case 501:
      return new ScreenerFailure(
        'unsupported',
        said || 'The broker cannot provide the data these filters need.',
        status,
      )
    default:
      return new ScreenerFailure('server', said || `Aureon answered ${status}.`, status)
  }
}

/** Just enough of a shape check that a wrong 200 body is an error, not a blank table. */
function isScreenerResponse(v: unknown): v is ScreenerResponse {
  if (!v || typeof v !== 'object') return false
  const r = v as Partial<ScreenerResponse>
  return (
    Array.isArray(r.items) &&
    typeof r.total === 'number' &&
    r.items.every((it) => !!it && typeof it === 'object' && !!it.instrument)
  )
}

export interface RunOptions {
  /** Told each time a queued scan is checked, with the server's latest word on it. */
  onWaiting?: (r: ScreenerResponse) => void
  signal?: AbortSignal
  pollMs?: number
  /** Give up waiting after this long (the run keeps going on the server). */
  maxWaitMs?: number
}

export const POLL_MS = 3_000
export const MAX_WAIT_MS = 15 * 60_000

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

function checked(r: { data?: unknown; error?: unknown; response: Response }): ScreenerResponse {
  if (!r.response.ok) throw screenerFailure(r.response.status, r.error, r.response.headers)
  if (!isScreenerResponse(r.data))
    throw new ScreenerFailure(
      'server',
      'The screener answered with something that is not a result page.',
      r.response.status,
    )
  return r.data
}

/**
 * Run a screen. A small universe answers at once; a large one is queued for the research
 * worker, and this waits for it (checking every `pollMs`), telling `onWaiting` each time.
 * Throws a ScreenerFailure for every way a run can fail, including a failed or cancelled
 * run and a wait that ran out.
 */
export async function runScreener(
  body: ScreenerRequest,
  opts: RunOptions = {},
): Promise<ScreenerResponse> {
  let r: ScreenerResponse
  try {
    r = checked(
      await aureon.POST(SCREENER_RUN_PATH, {
        body: body as unknown as components['schemas']['ScreenerRequest'],
      }),
    )
  } catch (e) {
    if (e instanceof ScreenerFailure) throw e
    throw new ScreenerFailure(
      'network',
      'Aureon could not be reached. Check the connection and try again.',
    )
  }
  const started = Date.now()
  while (isPending(r) && r.run_id) {
    opts.onWaiting?.(r)
    if (Date.now() - started > (opts.maxWaitMs ?? MAX_WAIT_MS)) {
      throw new ScreenerFailure(
        'server',
        'The scan is still running on the server. Run it again later to see the result.',
      )
    }
    await sleep(opts.pollMs ?? POLL_MS, opts.signal)
    const runId: string = r.run_id
    try {
      r = checked(
        await aureon.GET('/api/trading/screener/runs/{run_id}', {
          params: {
            path: { run_id: runId },
            query: {
              sort: body.sort.field,
              dir: body.sort.dir,
              limit: body.limit,
              offset: body.offset,
            },
          },
        }),
      )
    } catch (e) {
      if (e instanceof ScreenerFailure) throw e
      throw new ScreenerFailure('network', 'Aureon could not be reached while the scan ran.')
    }
  }
  if (r.status === 'failed' || r.status === 'cancelled') {
    throw new ScreenerFailure(
      'server',
      r.status === 'cancelled'
        ? 'The scan was cancelled.'
        : `The scan failed: ${r.detail || 'the server gave no reason'}.`,
    )
  }
  return r
}

/** The research worker and the queue, for the line above the results. */
export async function fetchScreenerStatus(): Promise<ScreenerStatus> {
  const r = await aureon.GET('/api/trading/screener/status')
  if (!r.response.ok || !r.data) throw new Error(`status ${r.response.status}`)
  return r.data
}

// --- screening a watchlist ---------------------------------------------------------------

/** A list as this device keeps it: a name and the instrument ids in it. */
export interface LocalList {
  name: string
  items: { id: number }[]
}

/**
 * The server copy of a local watchlist, made to match it (same name, same instruments),
 * so the server can screen it. Returns the server's watchlist id. Only the user's own
 * lists are touched (the server scopes watchlists to their owner); nothing on this
 * device changes.
 */
export async function screenerWatchlistId(list: LocalList): Promise<string> {
  const name = list.name.trim().slice(0, 40) || 'Watchlist'
  const fail = (what: string, status?: number) =>
    new ScreenerFailure(
      'server',
      `The watchlist could not be prepared for the server (${what}).`,
      status ?? null,
    )
  const all = await aureon.GET('/api/trading/watchlists')
  if (!all.response.ok || !all.data) throw fail('list', all.response.status)
  let server = all.data.find((w) => w.name === name)
  if (!server) {
    const made = await aureon.POST('/api/trading/watchlists', { body: { name } })
    if (!made.response.ok || !made.data) throw fail('create', made.response.status)
    server = made.data
  }
  const id = server.id
  const want = new Set(list.items.map((i) => i.id))
  const have = new Set(server.items.map((i) => i.instrument_id))
  for (const instrument_id of want) {
    if (have.has(instrument_id)) continue
    const r = await aureon.POST('/api/trading/watchlists/{watchlist_id}/items', {
      params: { path: { watchlist_id: id } },
      body: { instrument_id },
    })
    // 409: already there (another tab); 404: an instrument the server no longer has.
    if (!r.response.ok && r.response.status !== 409 && r.response.status !== 404)
      throw fail('add', r.response.status)
  }
  for (const instrument_id of have) {
    if (want.has(instrument_id)) continue
    const r = await aureon.DELETE('/api/trading/watchlists/{watchlist_id}/items/{instrument_id}', {
      params: { path: { watchlist_id: id, instrument_id } },
    })
    if (!r.response.ok && r.response.status !== 404) throw fail('remove', r.response.status)
  }
  return id
}

// --- display helpers ---------------------------------------------------------------------

export const SIGNAL_LABEL: Record<ScreenerSignal, string> = {
  bullish_cross: 'Bullish cross',
  bearish_cross: 'Bearish cross',
  above: 'Above',
  below: 'Below',
}

/** "ema:8" → "EMA 8", "macd:12:26:9" → "MACD 12/26/9", "vwap" → "VWAP". */
export function indicatorLabel(key: string): string {
  const [name, ...args] = key.split(':')
  const n = name.toUpperCase()
  return args.length ? `${n} ${args.join('/')}` : n
}
