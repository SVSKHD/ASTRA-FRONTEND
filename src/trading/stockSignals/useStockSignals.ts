// The Stock Signals page's data: which stocks it reads (the universe) and each
// one's EMA 8 / 32 + VWAP reading, from the server's own candles and indicators.
//
// Universe, in this order and without repeats, up to MAX_ROWS:
//   1. Dhan holdings (every active Dhan account), matched to instruments by ISIN
//      or symbol on NSE.
//   2. Watchlists: the server's (GET /api/trading/watchlists) and this device's.
//   3. Screener picks: NSE stocks whose EMA 8 crossed EMA 32 in the last few bars
//      (POST /api/trading/screener/run), bullish and bearish.
//
// Each stock's reading is two reads (candles + computed indicators) for the
// chosen timeframe, four at a time, cached for a minute. Nothing is invented: a
// read that fails leaves that row "unavailable" with the reason.

import { reactive, shallowRef, type ShallowRef } from 'vue'
import { aureon } from '@/api/client'
import { must } from '@/trading/useLoad'
import type { Timeframe } from '@/trading/chartView'
import { searchInstruments, type Instrument } from '@/trading/instruments'
import { remember } from '@/trading/resolve'
import { watchlistStore } from '@/trading/watchlists'
import { runScreener, type ScreenerItem } from '@/trading/screener'
import {
  changePct,
  readSignal,
  specsFor,
  toSeries,
  type Bar,
  type IndicatorRow,
  type Reading,
  type Series,
} from './classify'

export const MAX_ROWS = 60
const BARS = 120
const CONCURRENCY = 4
const TTL = 60_000

export type Origin = 'holding' | 'watchlist' | 'screener'
export const ORIGIN_LABEL: Record<Origin, string> = {
  holding: 'Held',
  watchlist: 'Watchlist',
  screener: 'Screener',
}

export interface HoldingInfo {
  quantity: number
  avgCost: number
  lastPrice: number | null
}

export interface UniverseItem {
  instrument: Instrument
  origins: Origin[]
  holding: HoldingInfo | null
  /** The screener's own row, when the stock came from (or is in) a screener run. */
  screener: ScreenerItem | null
}

export interface RowData {
  state: 'idle' | 'loading' | 'ready' | 'error'
  error: string
  reading: Reading | null
  series: Series | null
  change: number | null
  loadedAt: number
}

// --- reading one stock -------------------------------------------------------------------

const cache = new Map<string, { at: number; series: Series }>()

export async function loadSeries(
  instrumentId: number,
  tf: Timeframe,
  force = false,
): Promise<Series> {
  const key = `${instrumentId}:${tf}`
  const hit = cache.get(key)
  if (!force && hit && Date.now() - hit.at < TTL) return hit.series
  const [candles, rows] = await Promise.all([
    aureon
      .GET('/api/trading/candles', {
        params: { query: { instrument_id: instrumentId, timeframe: tf, limit: BARS } },
      })
      .then(must),
    aureon
      .GET('/api/trading/indicators/compute', {
        params: {
          query: { instrument_id: instrumentId, timeframe: tf, specs: specsFor(tf), limit: BARS },
        },
      })
      .then(must),
  ])
  const bars = (candles as (Bar & { is_gap?: boolean })[]).filter((c) => !c.is_gap)
  const series = toSeries(bars, rows as IndicatorRow[])
  cache.set(key, { at: Date.now(), series })
  return series
}

/** Run `jobs` with at most `n` at a time. */
async function pool<T>(items: T[], n: number, job: (t: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await job(items[next++])
    }),
  )
}

// --- the universe ------------------------------------------------------------------------

const resolved = new Map<string, Instrument | null>()

/** A holding's instrument on NSE: by ISIN when the broker gave one, else by symbol. */
async function instrumentFor(symbol: string, isin: string | null): Promise<Instrument | null> {
  const key = `${symbol}|${isin ?? ''}`
  if (resolved.has(key)) return resolved.get(key)!
  const page = await searchInstruments({ q: symbol, exchange: 'NSE', limit: 20 })
  remember(page.items)
  const eq = page.items.filter((i) => !i.expiry)
  const hit =
    (isin && eq.find((i) => i.isin === isin)) ||
    eq.find((i) => i.trading_symbol === symbol || i.symbol === symbol) ||
    null
  resolved.set(key, hit)
  return hit
}

export interface Universe {
  items: UniverseItem[]
  /** Sources that could not be read, in words. */
  gaps: string[]
  screenerAsOf: string | null
  bullish: ScreenerItem[]
  bearish: ScreenerItem[]
}

async function holdings(gaps: string[]): Promise<{ instrument: Instrument; info: HoldingInfo }[]> {
  try {
    const accounts = must(
      await aureon.GET('/api/trading/accounts', { params: { query: { limit: 50 } } }),
    )
    const dhan = accounts.items.filter((a) => a.broker === 'dhan' && a.is_active)
    const merged = new Map<
      string,
      { symbol: string; isin: string | null; qty: number; cost: number; last: number | null }
    >()
    for (const a of dhan) {
      const page = must(
        await aureon.GET('/api/trading/accounts/{account_id}/holdings', {
          params: { path: { account_id: a.id }, query: { limit: 500 } },
        }),
      )
      for (const h of page.items) {
        const qty = Number(h.quantity) || 0
        if (qty <= 0) continue
        const key = h.isin ?? h.symbol
        const m = merged.get(key) ?? {
          symbol: h.symbol,
          isin: h.isin ?? null,
          qty: 0,
          cost: 0,
          last: null,
        }
        m.cost += qty * (Number(h.avg_cost) || 0)
        m.qty += qty
        m.last = h.last_price !== null && h.last_price !== undefined ? Number(h.last_price) : m.last
        merged.set(key, m)
      }
    }
    const out: { instrument: Instrument; info: HoldingInfo }[] = []
    for (const m of merged.values()) {
      const instrument = await instrumentFor(m.symbol, m.isin)
      if (!instrument) {
        gaps.push(`Holding ${m.symbol} could not be matched to an NSE instrument.`)
        continue
      }
      out.push({
        instrument,
        info: { quantity: m.qty, avgCost: m.qty ? m.cost / m.qty : 0, lastPrice: m.last },
      })
    }
    return out
  } catch (e) {
    gaps.push(`Dhan holdings could not be read: ${(e as Error).message}`)
    return []
  }
}

async function watchlistInstruments(gaps: string[]): Promise<Instrument[]> {
  const out: Instrument[] = []
  try {
    const lists = must(await aureon.GET('/api/trading/watchlists'))
    for (const l of lists) for (const it of l.items) if (it.instrument) out.push(it.instrument)
  } catch (e) {
    gaps.push(`Server watchlists could not be read: ${(e as Error).message}`)
  }
  // This device's lists name instruments by id; the ones already known are used.
  const device = watchlistStore().lists.flatMap((l) => l.items)
  for (const it of device) {
    if (out.some((i) => i.id === it.id)) continue
    try {
      const page = await searchInstruments({ q: it.symbol, limit: 10 })
      remember(page.items)
      const hit = page.items.find((i) => i.id === it.id)
      if (hit) out.push(hit)
    } catch {
      /* skipped: the server search failed */
    }
  }
  return out
}

async function screenerCrosses(direction: 'bullish' | 'bearish', tf: Timeframe) {
  return runScreener({
    universe: { exchange: ['NSE'], kind: ['equity'], watchlist_id: null },
    timeframe: tf === '1d' ? '1d' : tf,
    candle: 'confirmed',
    filters: [{ type: 'ema_cross', fast: 8, slow: 32, direction, within_bars: 3 }],
    sort: { field: 'crossed_at', dir: 'desc' },
    limit: 15,
    offset: 0,
  })
}

export async function loadUniverse(tf: Timeframe): Promise<Universe> {
  const gaps: string[] = []
  const [held, watched, bull, bear] = await Promise.all([
    holdings(gaps),
    watchlistInstruments(gaps),
    screenerCrosses('bullish', tf).catch((e: Error) => {
      gaps.push(`The screener could not run: ${e.message}`)
      return null
    }),
    screenerCrosses('bearish', tf).catch(() => null),
  ])
  const byId = new Map<number, UniverseItem>()
  const add = (instrument: Instrument, origin: Origin, extra: Partial<UniverseItem> = {}) => {
    const cur = byId.get(instrument.id)
    if (cur) {
      if (!cur.origins.includes(origin)) cur.origins.push(origin)
      Object.assign(
        cur,
        Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== null && v !== undefined)),
      )
      return
    }
    if (byId.size >= MAX_ROWS) return
    byId.set(instrument.id, {
      instrument,
      origins: [origin],
      holding: null,
      screener: null,
      ...extra,
    })
  }
  for (const h of held) add(h.instrument, 'holding', { holding: h.info })
  for (const i of watched) add(i, 'watchlist')
  for (const s of [...(bull?.items ?? []), ...(bear?.items ?? [])])
    add(s.instrument, 'screener', { screener: s })
  remember([...byId.values()].map((u) => u.instrument))
  return {
    items: [...byId.values()],
    gaps,
    screenerAsOf: bull?.as_of ?? bear?.as_of ?? null,
    bullish: bull?.items ?? [],
    bearish: bear?.items ?? [],
  }
}

// --- the page's state --------------------------------------------------------------------

export function useStockSignals() {
  const universe: ShallowRef<Universe | null> = shallowRef(null)
  const rows = reactive<Record<number, RowData>>({})
  const status = reactive({ loading: false, error: '', updatedAt: 0 })
  let seq = 0

  function blank(): RowData {
    return { state: 'idle', error: '', reading: null, series: null, change: null, loadedAt: 0 }
  }

  async function loadRow(id: number, tf: Timeframe, force = false) {
    if (!rows[id]) rows[id] = blank()
    // Through the reactive proxy, so every reader updates.
    const r = rows[id]
    if (r.state !== 'ready') r.state = 'loading'
    try {
      const series = await loadSeries(id, tf, force)
      r.series = series
      r.reading = readSignal(series, tf)
      r.change = changePct(series)
      r.state = 'ready'
      r.error = ''
      r.loadedAt = Date.now()
    } catch (e) {
      r.state = 'error'
      r.error = (e as Error).message || 'Could not be read.'
    }
  }

  async function load(tf: Timeframe, opts: { force?: boolean; quiet?: boolean } = {}) {
    const mine = ++seq
    status.loading = !opts.quiet
    status.error = ''
    try {
      const u = await loadUniverse(tf)
      if (mine !== seq) return
      universe.value = u
      for (const k of Object.keys(rows))
        if (!u.items.some((i) => i.instrument.id === Number(k))) delete rows[Number(k)]
      await pool(u.items, CONCURRENCY, async (it) => {
        if (mine === seq) await loadRow(it.instrument.id, tf, opts.force)
      })
      if (mine === seq) status.updatedAt = Date.now()
    } catch (e) {
      if (mine === seq) status.error = (e as Error).message || 'The signals could not be loaded.'
    } finally {
      if (mine === seq) status.loading = false
    }
  }

  return { universe, rows, status, load, loadRow }
}

/** Tests only. */
export function clearStockSignalCaches(): void {
  cache.clear()
  resolved.clear()
}
