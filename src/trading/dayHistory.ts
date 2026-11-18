// Daily closes for the Stocks tab: the trend line on each row and the day's
// change, worked out from the previous session's close.
//
// The quotes API carries no previous close (docs/market-terminal.md §3), but the
// candles API has the daily bars, and the last CLOSED daily bar before today is
// exactly that: a broker number, not an estimate. One request per instrument,
// cached for ten minutes and read three at a time, so a long list does not fire
// a burst at the broker.
import { shallowRef, watch, type ShallowRef } from 'vue'
import { aureon } from '@/api/client'
import { must } from '@/trading/useLoad'

export interface DayHistory {
  /** Up to the last 30 daily closes, oldest first (today's, if open, last). */
  closes: number[]
  /** The last closed session's close before today, as the broker sent it. */
  previousClose: string | null
}

export const DAYS = 30
const TTL = 10 * 60_000
const CONCURRENCY = 3

interface Bar {
  ts: string
  close: string
  is_closed: boolean
  is_gap: boolean
}

const cache = new Map<number, { at: number; value: DayHistory }>()
const inflight = new Map<number, Promise<DayHistory>>()

function localDay(ts: string | number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Closes and the previous close from daily bars, oldest first. */
export function historyOf(bars: Bar[], now: number = Date.now()): DayHistory {
  const rows = bars.filter((b) => !b.is_gap && Number.isFinite(Number(b.close)))
  const today = localDay(now)
  const before = rows.filter((b) => b.is_closed && localDay(b.ts) !== today)
  return {
    closes: rows.slice(-DAYS).map((b) => Number(b.close)),
    previousClose: before.length ? before[before.length - 1]!.close : null,
  }
}

async function load(id: number): Promise<DayHistory> {
  const bars = must(
    await aureon.GET('/api/trading/candles', {
      params: { query: { instrument_id: id, timeframe: '1d', limit: DAYS + 1 } },
    }),
  ) as Bar[]
  const sorted = [...bars].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
  return historyOf(sorted)
}

// A small queue: at most CONCURRENCY reads at once, across every table.
let running = 0
const queue: (() => void)[] = []
function slot<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const go = () => {
      running++
      fn()
        .then(resolve, reject)
        .finally(() => {
          running--
          queue.shift()?.()
        })
    }
    if (running < CONCURRENCY) go()
    else queue.push(go)
  })
}

export function dayHistory(id: number): Promise<DayHistory> {
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.value)
  let p = inflight.get(id)
  if (!p) {
    p = slot(() => load(id))
      .then((value) => {
        cache.set(id, { at: Date.now(), value })
        return value
      })
      .finally(() => inflight.delete(id))
    inflight.set(id, p)
  }
  return p
}

/** Tests only. */
export function forgetDayHistory(): void {
  cache.clear()
  inflight.clear()
}

/**
 * The daily history of these instruments, filled in as each arrives. A failed
 * read leaves that row without a trend line or change; it never blocks the rest.
 */
export function useDayHistory(ids: () => number[]): ShallowRef<ReadonlyMap<number, DayHistory>> {
  const out = shallowRef<ReadonlyMap<number, DayHistory>>(new Map())
  let seq = 0
  watch(
    () => ids().join(),
    () => {
      const mine = ++seq
      const want = ids()
      const next = new Map<number, DayHistory>()
      for (const id of want) {
        const hit = cache.get(id)
        if (hit) next.set(id, hit.value)
      }
      out.value = next
      for (const id of want) {
        if (next.has(id) && Date.now() - cache.get(id)!.at < TTL) continue
        dayHistory(id).then(
          (h) => {
            if (mine !== seq) return
            out.value = new Map(out.value).set(id, h)
          },
          () => {},
        )
      }
    },
    { immediate: true },
  )
  return out
}
