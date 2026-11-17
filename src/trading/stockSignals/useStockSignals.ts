// The Stock Signals page's data, all from the backend's signal engine
// (docs/37): the stored state of every evaluated instrument on the chosen
// timeframe (plus every held one, even without usable data), the newest
// crossover event per instrument, the portfolio map, and the market rankings.
// The engine runs on the server after each 15-minute close; this only reads
// what its latest finished run stored, so a refresh costs a handful of reads.

import { reactive, shallowRef } from 'vue'
import {
  fetchEvents,
  fetchMovers,
  fetchPortfolio,
  fetchSignal,
  fetchStates,
  fetchTrending,
  type PortfolioHolding,
  type PortfolioMap,
  type Ranking,
  type SignalEvent,
  type SignalTf,
  type StateRow,
} from './api'

export interface Movers {
  gainers: Ranking | null
  losers: Ranking | null
  unusual: Ranking | null
  bullish: Ranking | null
  bearish: Ranking | null
}

/** What the chart viewer and the detail panels need about one stock. */
export interface Target {
  id: number
  symbol: string
  name: string | null
  exchange: string | null
}
export function targetOf(
  r: Pick<StateRow, 'instrument_id' | 'symbol' | 'name' | 'exchange'>,
): Target {
  return { id: r.instrument_id, symbol: r.symbol, name: r.name, exchange: r.exchange }
}

export function useStockSignals() {
  const states = shallowRef<StateRow[]>([])
  const total = shallowRef(0)
  const events = shallowRef<ReadonlyMap<number, SignalEvent>>(new Map())
  const portfolio = shallowRef<PortfolioMap | null>(null)
  const trendingBull = shallowRef<Ranking | null>(null)
  const movers = shallowRef<Movers | null>(null)
  const status = reactive({
    loading: false,
    error: '',
    portfolioError: '',
    moversLoading: false,
    moversError: '',
    updatedAt: 0,
  })
  let seq = 0
  let moversTf: SignalTf | null = null

  async function load(tf: SignalTf) {
    const mine = ++seq
    status.loading = true
    status.error = ''
    status.portfolioError = ''
    try {
      const [all, held, evs, pmap, bull] = await Promise.all([
        fetchStates(tf),
        fetchStates(tf, { inHoldings: true, includeUnavailable: true }),
        fetchEvents(tf),
        fetchPortfolio(tf).catch((e: Error) => {
          status.portfolioError = e.message || 'The portfolio map could not be read.'
          return null
        }),
        fetchTrending('bullish', tf, 25).catch(() => null),
      ])
      if (mine !== seq) return
      // Held instruments first, then everything else the engine evaluated.
      const seen = new Set<number>()
      const rows: StateRow[] = []
      for (const r of [...held.items, ...all.items]) {
        if (seen.has(r.instrument_id)) continue
        seen.add(r.instrument_id)
        rows.push(r)
      }
      const newest = new Map<number, SignalEvent>()
      for (const e of evs) if (!newest.has(e.instrument_id)) newest.set(e.instrument_id, e)
      states.value = rows
      total.value = Math.max(all.total, rows.length)
      events.value = newest
      portfolio.value = pmap
      trendingBull.value = bull
      status.updatedAt = Date.now()
      if (moversTf !== tf) movers.value = null
    } catch (e) {
      if (mine === seq) status.error = (e as Error).message || 'The signals could not be loaded.'
    } finally {
      if (mine === seq) status.loading = false
    }
  }

  /** The rankings, read when the Market Movers tab opens (five reads). */
  async function loadMovers(tf: SignalTf, force = false) {
    if (!force && moversTf === tf && movers.value) return
    status.moversLoading = true
    status.moversError = ''
    try {
      const [gainers, losers, unusual, bullish, bearish] = await Promise.all(
        [
          fetchMovers('gainers', tf),
          fetchMovers('losers', tf),
          fetchMovers('unusual_volume', tf),
          fetchTrending('bullish', tf),
          fetchTrending('bearish', tf),
        ].map((p) => p.catch(() => null)),
      )
      if (!gainers && !losers && !unusual && !bullish && !bearish)
        throw new Error('The rankings could not be read.')
      movers.value = { gainers, losers, unusual, bullish, bearish }
      moversTf = tf
    } catch (e) {
      status.moversError = (e as Error).message
    } finally {
      status.moversLoading = false
    }
  }

  /** The newest event of one stock, from the map or (on demand) the server. */
  async function eventFor(
    row: Pick<StateRow, 'instrument_id' | 'event_id'>,
  ): Promise<SignalEvent | null> {
    const known = events.value.get(row.instrument_id)
    if (known) return known
    if (!row.event_id) return null
    const d = await fetchSignal(row.event_id)
    const next = new Map(events.value)
    next.set(row.instrument_id, d.event)
    events.value = next
    return d.event
  }

  function holdingOf(instrumentId: number): PortfolioHolding | null {
    return portfolio.value?.holdings.find((h) => h.instrument_id === instrumentId) ?? null
  }

  return {
    states,
    total,
    events,
    portfolio,
    trendingBull,
    movers,
    status,
    load,
    loadMovers,
    eventFor,
    holdingOf,
  }
}
