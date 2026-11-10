// Turning what a screen holds (an instrument id, a "SEGMENT:ID" reference) back
// into instrument rows from the master.
//
// There is no "instrument by id" endpoint, so this searches
// `GET /api/trading/instruments?q=<symbol>` and matches by id or by
// `broker_instrument_id`. The search only returns ACTIVE instruments (backend
// `Instrument.is_active`), so an id that is not found is reported as missing —
// delisted, or not in the master because it has not been synced — never
// silently dropped.
//
// Rows seen anywhere (the Explorer's pages, a search) are remembered for the
// page's lifetime, so a watchlist opened after browsing costs no extra calls.

import {
  searchInstruments,
  type Broker,
  type Instrument,
  type InstrumentPage,
} from '@/trading/instruments'
import { ApiFailure } from '@/trading/useLoad'

const byId = new Map<number, Instrument>()
const byRef = new Map<string, Instrument>()

export function remember(rows: Instrument[]): void {
  for (const r of rows) {
    byId.set(r.id, r)
    if (r.broker_instrument_id) byRef.set(`${r.broker}|${r.broker_instrument_id}`, r)
  }
}
export function cachedInstrument(id: number): Instrument | undefined {
  return byId.get(id)
}
/** Tests only. */
export function forgetInstruments(): void {
  byId.clear()
  byRef.clear()
}

export type Resolution =
  | { status: 'ok'; instrument: Instrument }
  | { status: 'missing' }
  | { status: 'error'; message: string }

/** Rows scanned per search while looking for an id; the API allows 500 per page. */
const SCAN_LIMIT = 500
const SCAN_PAGES = 2
const CONCURRENCY = 4

function asBroker(b: string): Broker | undefined {
  return b === 'dhan' || b === 'mt5' ? (b as Broker) : undefined
}

async function scan(
  q: string,
  broker: Broker | undefined,
  instrumentType: string | undefined,
  done: () => boolean,
  pages: number,
): Promise<number> {
  let scanned = 0
  for (let p = 0; p < pages; p++) {
    const page: InstrumentPage = await searchInstruments({
      broker,
      q,
      instrumentType,
      limit: SCAN_LIMIT,
      offset: p * SCAN_LIMIT,
    })
    remember(page.items)
    scanned += page.items.length
    if (done() || scanned >= page.total || page.items.length < SCAN_LIMIT) break
  }
  return scanned
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await fn(items[next++])
  })
  await Promise.all(workers)
}

/** Each item's instrument row, or why it has none. */
export async function resolveItems(
  items: { id: number; symbol: string; broker: string }[],
): Promise<Map<number, Resolution>> {
  const out = new Map<number, Resolution>()
  const todo = new Map<string, { symbol: string; broker: string; ids: number[] }>()
  for (const it of items) {
    const hit = byId.get(it.id)
    if (hit) {
      out.set(it.id, { status: 'ok', instrument: hit })
      continue
    }
    const key = `${it.broker}|${it.symbol}`
    const t = todo.get(key) ?? { symbol: it.symbol, broker: it.broker, ids: [] }
    t.ids.push(it.id)
    todo.set(key, t)
  }
  await pool([...todo.values()], CONCURRENCY, async (t) => {
    try {
      await scan(
        t.symbol.slice(0, 64),
        asBroker(t.broker),
        undefined,
        () => t.ids.every((id) => byId.has(id)),
        SCAN_PAGES,
      )
      for (const id of t.ids) {
        const hit = byId.get(id)
        out.set(id, hit ? { status: 'ok', instrument: hit } : { status: 'missing' })
      }
    } catch (e) {
      const message =
        e instanceof ApiFailure ? e.message : 'The instrument search could not be reached.'
      for (const id of t.ids) out.set(id, { status: 'error', message })
    }
  })
  return out
}

export interface LegLookup {
  /** "SEGMENT:ID" → instrument row, for every reference found. */
  found: Map<string, Instrument>
  /** Rows read while looking. */
  scanned: number
  /** True when every reference was found. */
  complete: boolean
}

/** Pages of contract rows read per instrument type while looking for option legs. */
export const LEG_SCAN_PAGES = 10

/**
 * Find option (or future) contracts by their references, by scanning the
 * instrument search for `q` and these types. Stops once every reference is
 * found, or after LEG_SCAN_PAGES pages per type (the caller says so).
 */
export async function lookupRefs(
  refs: string[],
  q: string,
  instrumentTypes: string[],
  broker: Broker = 'dhan',
): Promise<LegLookup> {
  const wanted = [...new Set(refs.filter(Boolean))]
  const key = (r: string) => `${broker}|${r}`
  const done = () => wanted.every((r) => byRef.has(key(r)))
  let scanned = 0
  for (const t of instrumentTypes) {
    if (done()) break
    scanned += await scan(q.slice(0, 64), broker, t, done, LEG_SCAN_PAGES)
  }
  const found = new Map<string, Instrument>()
  for (const r of wanted) {
    const hit = byRef.get(key(r))
    if (hit) found.set(r, hit)
  }
  return { found, scanned, complete: found.size === wanted.length }
}
