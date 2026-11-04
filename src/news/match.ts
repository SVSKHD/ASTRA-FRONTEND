// Which headlines are about what (the News tab's filters and the trading widgets).
//
// Aureon's news job stores four fields per item — title, link, published,
// source (backend app/services/news.py). There is no summary, sentiment,
// importance or symbol tagging on the server, so nothing here pretends there
// is: "mentions" are the words a headline actually contains, matched on word
// boundaries, and the UI calls them that.

import type { NewsItem } from '@/types'
import { IST, hhmmOn, ymdOn } from '@/utils/tradeTime'

/** Words a currency is written as in a headline. */
const CURRENCY_WORDS: Record<string, string[]> = {
  USD: ['USD', 'dollar', 'greenback', 'Fed', 'FOMC', 'Powell', 'Treasury', 'Treasuries'],
  EUR: ['EUR', 'euro', 'ECB', 'Lagarde'],
  GBP: ['GBP', 'pound', 'sterling', 'BoE'],
  JPY: ['JPY', 'yen', 'BoJ'],
  INR: ['INR', 'rupee', 'RBI'],
  CHF: ['CHF', 'franc', 'SNB'],
  AUD: ['AUD', 'Aussie', 'RBA'],
  CAD: ['CAD', 'loonie', 'BoC'],
  NZD: ['NZD', 'kiwi', 'RBNZ'],
  CNY: ['CNY', 'yuan', 'renminbi', 'PBoC'],
  XAU: ['XAU', 'gold', 'bullion'],
  XAG: ['XAG', 'silver'],
}
/** US data that moves the dollar, and so gold. */
const USD_EVENTS = ['CPI', 'NFP', 'payrolls', 'jobless', 'inflation', 'rate cut', 'rate hike']

/** `NSE:RELIANCE-EQ`, `RELIANCE.NS`, `xauusd` → `RELIANCE`, `XAUUSD`. */
export function baseSymbol(symbol: string): string {
  return symbol
    .trim()
    .toUpperCase()
    .replace(/^[A-Z]+:/, '')
    .replace(/[-.](EQ|BE|NS|BO|NSE|BSE|M|PRO|ECN|RAW)$/, '')
}

/** The words to look for when a headline is "about" this symbol. */
export function termsFor(symbol: string): string[] {
  const s = baseSymbol(symbol)
  if (!s) return []
  const pair = /^([A-Z]{3})([A-Z]{3})$/.exec(s)
  if (pair && (CURRENCY_WORDS[pair[1]] || CURRENCY_WORDS[pair[2]])) {
    const out = new Set([s, ...(CURRENCY_WORDS[pair[1]] ?? []), ...(CURRENCY_WORDS[pair[2]] ?? [])])
    if (pair[1] === 'USD' || pair[2] === 'USD') USD_EVENTS.forEach((w) => out.add(w))
    return [...out]
  }
  return CURRENCY_WORDS[s] ?? [s]
}

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The terms a headline contains, as written in `terms`, each once. */
export function mentions(title: string, terms: readonly string[]): string[] {
  const found: string[] = []
  for (const t of terms) {
    if (!t || found.includes(t)) continue
    // Names and codes (USD, Fed, BoE, RELIANCE) match as written, so "fed up"
    // is not dollar news; lowercase words (gold, dollar) match in any case.
    const flags = t === t.toLowerCase() ? 'i' : ''
    if (new RegExp(`(^|[^A-Za-z0-9])${escape(t)}($|[^A-Za-z0-9])`, flags).test(title)) {
      found.push(t)
    }
  }
  return found
}

export function aboutAny(item: NewsItem, terms: readonly string[]): boolean {
  return terms.length > 0 && mentions(item.title, terms).length > 0
}

export interface NewsFilter {
  /** A symbol (XAUUSD, RELIANCE) or any words in the headline or source. */
  q?: string
  source?: string
  /** Inclusive IST days, `YYYY-MM-DD`. */
  from?: string
  to?: string
}

/** A query that is one bare token is treated as a symbol, so XAUUSD finds "gold". */
function queryTerms(q: string): string[] | null {
  const t = q.trim()
  return /^[A-Za-z0-9:._-]{2,20}$/.test(t) ? termsFor(t) : null
}

export function filterNews(items: readonly NewsItem[], f: NewsFilter): NewsItem[] {
  const q = (f.q ?? '').trim()
  const symbolTerms = q ? queryTerms(q) : null
  const lower = q.toLowerCase()
  return items.filter((item) => {
    if (f.source && item.source !== f.source) return false
    if (f.from || f.to) {
      const day = item.publishedAt ? ymdOn(IST, item.publishedAt) : ''
      if (!day) return false
      if (f.from && day < f.from) return false
      if (f.to && day > f.to) return false
    }
    if (!q) return true
    if (item.title.toLowerCase().includes(lower) || item.source.toLowerCase().includes(lower)) {
      return true
    }
    return !!symbolTerms && aboutAny(item, symbolTerms)
  })
}

export interface SourceStat {
  source: string
  count: number
  latest: number
}

/** Each source in the feed, busiest first. */
export function sourcesOf(items: readonly NewsItem[]): SourceStat[] {
  const by = new Map<string, SourceStat>()
  for (const i of items) {
    const s = by.get(i.source) ?? { source: i.source, count: 0, latest: 0 }
    s.count++
    s.latest = Math.max(s.latest, i.publishedAt)
    by.set(i.source, s)
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
}

/** "14:05 IST" today, "3 Nov · 14:05 IST" before; "time unknown" when the feed gave none. */
export function istStamp(ms: number, now = Date.now()): string {
  if (!ms) return 'time unknown'
  const time = `${hhmmOn(IST, ms)} IST`
  if (ymdOn(IST, ms) === ymdOn(IST, now)) return time
  const day = new Date(ms + 330 * 60_000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  return `${day} · ${time}`
}
