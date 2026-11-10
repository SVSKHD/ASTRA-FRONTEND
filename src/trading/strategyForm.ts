// The strategy builder and backtest form: validation and request bodies.
//
// Checked against the backend (Aureon_agents_Assembler origin/main):
//
//   app/agents/research/strategies.py — the registry is `ema_cross` and
//   `ema_pullback`. Both read `fast` and `slow` (positive integers, defaults 9 and
//   21, fast < slow, else ValueError → 422 bad_params) and the watch list
//   `instrument_ids` + `timeframes`. ema_pullback also reads each bar's high and
//   low, which come from the candles, not from params. Nothing else is read.
//
//   app/api/v1/trading.py — POST /strategies (admin) validates params by running
//   the strategy on a tiny frame; POST /strategies/backtest needs end > start
//   with a timezone, merges `params` over the version's params, expands `grid`
//   (422 grid_too_large past BACKTEST_MAX_GRID) and takes optional `quantity`
//   and `costs` (spread/slippage/fee in bps). There is NO endpoint to enable or
//   disable a strategy: `is_active` is read-only here.
//
// Neither call places a trade: a version produces signals, a backtest is a
// simulation on stored candles.

import type { components } from '@/api/client'
import { ApiFailure } from '@/trading/useLoad'

export type StrategyCreate = components['schemas']['StrategyCreate']
export type BacktestRequest = components['schemas']['BacktestRequest']
export type Timeframe = components['schemas']['Timeframe']
export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']

export const STRATEGY_TYPES = [
  {
    value: 'ema_cross',
    label: 'EMA cross',
    help: 'BUY when the fast EMA crosses above the slow EMA on a closed bar; SELL on the cross below.',
  },
  {
    value: 'ema_pullback',
    label: 'EMA pullback',
    help: 'In a trend (fast above slow and close above slow), BUY when the bar dips to the fast EMA and closes back above it; SELL is the mirror.',
  },
] as const
export type CodeRef = (typeof STRATEGY_TYPES)[number]['value']

export const NAME_PATTERN = /^[A-Za-z0-9._: -]+$/
export const MAX_PERIOD = 1000
export const MAX_DAYS = 3650

const posInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0

export interface StrategyDraft {
  name: string
  description: string
  code_ref: string
  fast: number | null
  slow: number | null
  instrumentIds: number[]
  timeframes: string[]
}

export type DraftErrors = Partial<
  Record<'name' | 'code_ref' | 'fast' | 'slow' | 'instruments' | 'timeframes', string>
>

export function validateDraft(d: StrategyDraft): DraftErrors {
  const e: DraftErrors = {}
  const name = d.name.trim()
  if (!name) e.name = 'Give the strategy a name.'
  else if (name.length > 100) e.name = 'At most 100 characters.'
  else if (!NAME_PATTERN.test(name)) e.name = 'Letters, digits, spaces and . _ : - only.'
  if (!STRATEGY_TYPES.some((t) => t.value === d.code_ref)) e.code_ref = 'Pick a strategy type.'
  if (!posInt(d.fast) || d.fast > MAX_PERIOD) e.fast = `A whole number from 1 to ${MAX_PERIOD}.`
  if (!posInt(d.slow) || d.slow > MAX_PERIOD) e.slow = `A whole number from 1 to ${MAX_PERIOD}.`
  if (!e.fast && !e.slow && (d.fast as number) >= (d.slow as number))
    e.slow = 'The slow EMA must be longer than the fast one.'
  if (!d.instrumentIds.length) e.instruments = 'Pick at least one instrument to watch.'
  if (!d.timeframes.length) e.timeframes = 'Pick at least one timeframe.'
  else if (d.timeframes.some((t) => !TIMEFRAMES.includes(t as Timeframe)))
    e.timeframes = `Only ${TIMEFRAMES.join(', ')}.`
  return e
}

export function buildStrategyCreate(d: StrategyDraft): StrategyCreate {
  const description = d.description.trim()
  return {
    name: d.name.trim(),
    code_ref: d.code_ref,
    params: {
      fast: d.fast,
      slow: d.slow,
      instrument_ids: [...d.instrumentIds],
      timeframes: [...d.timeframes],
    },
    ...(description ? { description } : {}),
  }
}

export interface BacktestDraft {
  versionId: string
  instrumentId: number | null
  timeframe: string
  days: number | null
  quantity: number | null
  spread: number | null
  slippage: number | null
  fee: number | null
  fastGrid: string
  slowGrid: string
}

export type BacktestErrors = Partial<
  Record<'version' | 'instrument' | 'timeframe' | 'days' | 'quantity' | 'costs' | 'grid', string>
>

/** "5, 9" → [5, 9]; null when any entry is not a positive whole number. */
export function intList(text: string): number[] | null {
  const parts = text
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  const nums = parts.map(Number)
  return nums.every(posInt) ? nums : null
}

export function validateBacktest(b: BacktestDraft): BacktestErrors {
  const e: BacktestErrors = {}
  if (!b.versionId) e.version = 'Pick a strategy version.'
  if (!posInt(b.instrumentId)) e.instrument = 'Pick an instrument.'
  if (!TIMEFRAMES.includes(b.timeframe as Timeframe)) e.timeframe = 'Pick a timeframe.'
  if (!posInt(b.days) || b.days > MAX_DAYS) e.days = `A whole number of days from 1 to ${MAX_DAYS}.`
  if (b.quantity !== null && !(typeof b.quantity === 'number' && b.quantity > 0))
    e.quantity = 'Leave empty, or a quantity above 0.'
  for (const c of [b.spread, b.slippage, b.fee])
    if (c !== null && !(typeof c === 'number' && c >= 0)) e.costs = 'Costs cannot be negative.'
  if (intList(b.fastGrid) === null || intList(b.slowGrid) === null)
    e.grid = 'Grid values are whole numbers above 0, separated by commas.'
  return e
}

export function buildBacktestRequest(b: BacktestDraft, now = new Date()): BacktestRequest {
  const end = now
  const start = new Date(end.getTime() - (b.days ?? 30) * 86_400_000)
  const grid: Record<string, number[]> = {}
  const fast = intList(b.fastGrid) ?? []
  const slow = intList(b.slowGrid) ?? []
  if (fast.length) grid.fast = fast
  if (slow.length) grid.slow = slow
  return {
    strategy_version_id: b.versionId,
    instrument_id: b.instrumentId as number,
    timeframe: b.timeframe as Timeframe,
    start: start.toISOString(),
    end: end.toISOString(),
    grid,
    ...(b.quantity !== null ? { quantity: String(b.quantity) } : {}),
    costs: {
      spread_bps: String(b.spread ?? 0),
      slippage_bps: String(b.slippage ?? 0),
      fee_bps: String(b.fee ?? 0),
    },
  }
}

/**
 * Unwrap an openapi-fetch result like `must`, but spell out FastAPI's 422
 * validation list ("name: String should match pattern …") instead of
 * "Aureon answered 422", and keep the backend's own `{code, detail}` text.
 */
export function mustDetail<T>(r: { data?: T; error?: unknown; response: Response }): T {
  if (r.data !== undefined && r.response.ok) return r.data
  throw new ApiFailure(errorText(r.error, r.response.status), r.response.status)
}

export function errorText(body: unknown, status: number): string {
  const d = (body as { detail?: unknown } | undefined)?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {
    const parts = d
      .map((x) => {
        const item = x as { loc?: unknown[]; msg?: string }
        const loc = (item.loc ?? []).filter((p) => p !== 'body').join('.')
        return item.msg ? (loc ? `${loc}: ${item.msg}` : item.msg) : ''
      })
      .filter(Boolean)
    if (parts.length) return parts.join('; ')
  }
  if (d && typeof d === 'object') {
    const o = d as { detail?: unknown; code?: unknown }
    if (typeof o.detail === 'string') return o.detail
    if (typeof o.code === 'string') return o.code.replaceAll('_', ' ')
  }
  return `Aureon answered ${status}`
}

// --- backtest metrics, readable ----------------------------------------------------------

/** The keys app/agents/research/backtest.py `metrics()` writes, in reading order. */
export const METRIC_LABELS: Record<string, string> = {
  trades: 'Trades',
  wins: 'Wins',
  losses: 'Losses',
  win_rate: 'Win rate',
  net_pnl: 'Net P&L',
  gross_profit: 'Gross profit',
  gross_loss: 'Gross loss',
  expectancy: 'Expectancy per trade',
  profit_factor: 'Profit factor',
  max_drawdown: 'Max drawdown',
  fees: 'Fees',
  spread_slippage_cost: 'Spread + slippage',
  open_at_end: 'Open at end',
  fill: 'Fills at',
}

/** Every metric the run carries, labelled; unknown keys keep their own name. */
export function metricEntries(
  metrics: Record<string, unknown>,
): { key: string; label: string; value: unknown }[] {
  const known = Object.keys(METRIC_LABELS).filter((k) => k in metrics)
  const rest = Object.keys(metrics).filter((k) => !(k in METRIC_LABELS) && k !== 'costs')
  return [...known, ...rest].map((k) => ({
    key: k,
    label: METRIC_LABELS[k] ?? k.replaceAll('_', ' '),
    value: metrics[k],
  }))
}

/** `{fast: 9, slow: 21, instrument_ids: [1], timeframes: ['15m']}` → "fast 9 · slow 21". */
export function paramsText(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([k]) => k !== 'instrument_ids' && k !== 'timeframes')
    .map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join(' · ')
}

export function idsOf(params: Record<string, unknown>): number[] {
  const v = params.instrument_ids
  return Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []
}

export function timeframesOf(params: Record<string, unknown>): string[] {
  const v = params.timeframes
  return Array.isArray(v) ? v.map(String) : []
}

export function typeLabel(codeRef: string): string {
  return STRATEGY_TYPES.find((t) => t.value === codeRef)?.label ?? codeRef
}
