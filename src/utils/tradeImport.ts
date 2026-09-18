// Reading a CSV somebody else wrote (the Import tab).
//
// Everything else under Trades is the month on the server: rows this app wrote,
// in this app's shape, with a guaranteed `entryAt` behind every clock. This file
// is the opposite case — a file a broker produced, handed over once to be looked
// at, and never stored. So the rules here are the mirror image of the rest of
// the trade code:
//
//   * Nothing is trusted. Every column is optional except a date and a result,
//     and a row that cannot produce both is counted and dropped rather than
//     guessed at. A silently-zeroed P/L would be a lie drawn as a chart.
//   * Nothing is written. There is no id, no userId and no `ts` here, because
//     an imported row is never going to become a document. Giving it those
//     fields is how "just for a look" turns into a second write path.
//   * Headers are matched by meaning, not position. MT5 says "Profit", the
//     app's own export says "pl", a bank-ish export says "Net P/L", and a
//     column order is not something a person should have to edit a file to fix.
//
// The month, not the row, is the unit everything downstream reads: a 30MB file
// is a few hundred thousand rows and nobody scrolls those, so the charts are fed
// from `summariseByMonth` and the rows themselves are never rendered.

/**
 * 30MB, as asked for. Worth saying what that is in rows: a broker CSV row is
 * roughly 80–120 bytes, so this is somewhere around a quarter of a million
 * trades — years of anybody's history, and well past the point where the
 * charts stop changing shape.
 */
export const MAX_IMPORT_BYTES = 30 * 1024 * 1024

/** One row, reduced to what a chart actually needs. */
export interface ImportedTrade {
  /** 'YYYY-MM-DD'. */
  date: string
  /** 'YYYY-MM', derived once here so no caller re-slices it per frame. */
  month: string
  symbol: string
  side: '' | 'buy' | 'sell'
  lot: number
  entry: number
  exit: number
  /** The money. The one field that, missing, makes a row worthless. */
  pl: number
}

export interface MonthSummary {
  month: string
  trades: number
  wins: number
  losses: number
  pl: number
  /** Running total through this month — the equity curve, precomputed. */
  cumulative: number
}

export interface OverallStats {
  trades: number
  wins: number
  losses: number
  /** 0–1, of the rows that were not scratches. */
  winRate: number
  pl: number
  best: MonthSummary | null
  worst: MonthSummary | null
  from: string
  to: string
  symbols: number
}

export interface ParsedCsv {
  rows: ImportedTrade[]
  /** Rows that parsed as a line but carried no usable date or no usable P/L. */
  skipped: number
  /** A sentence for the reader, or '' when the file was understood. */
  error: string
  /** The header cells as found, so a failure can show what it was looking at. */
  headers: string[]
  /**
   * True when at least one date was `x/y/z` with both halves under 13 — the one
   * genuinely undecidable case. Surfaced rather than resolved, because a chart
   * that quietly read 04/09 as April is worse than one that says which it chose.
   */
  assumedDayFirst: boolean
}

// ---- headers ----------------------------------------------------------------

type Field = 'date' | 'symbol' | 'side' | 'lot' | 'entry' | 'exit' | 'pl'

/**
 * What each column might be called. Matched after stripping everything that is
 * not a letter or a digit, so "Net P/L", "net_pl" and "NET P / L" are one entry
 * rather than three.
 *
 * Order matters within a field: the first alias that hits wins, so the exact
 * names come before the loose ones. `price` is last under `entry` because a
 * file with "Open Price" and "Price" columns means the second one is something
 * else.
 */
const ALIASES: Record<Field, string[]> = {
  date: [
    'date',
    'istdate',
    'opentime',
    'openingtime',
    'entrytime',
    'entryat',
    'datetime',
    'dateandtime',
    'closetime',
    'time',
  ],
  symbol: ['symbol', 'instrument', 'pair', 'item', 'ticker', 'market'],
  side: ['side', 'type', 'direction', 'action', 'ordertype', 'buysell'],
  lot: ['lot', 'lots', 'volume', 'size', 'quantity', 'qty', 'units'],
  entry: ['entry', 'entryprice', 'openprice', 'opening', 'open', 'price'],
  exit: ['exit', 'exitprice', 'closeprice', 'closing', 'close'],
  pl: [
    'pl',
    'pandl',
    'profit',
    'netprofit',
    'profitloss',
    'pnl',
    'realizedpl',
    'realisedpl',
    'result',
    'gain',
    'netusd',
    'amount',
  ],
}

function normalise(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Which column holds which field, by name. Absent fields are simply missing. */
function mapColumns(cells: string[]): Partial<Record<Field, number>> {
  const cleaned = cells.map(normalise)
  const out: Partial<Record<Field, number>> = {}
  for (const field of Object.keys(ALIASES) as Field[]) {
    for (const alias of ALIASES[field]) {
      const at = cleaned.indexOf(alias)
      // A column already claimed by an earlier field is not claimed twice:
      // "Close Time" must not become both the date and the exit price.
      if (at >= 0 && !Object.values(out).includes(at)) {
        out[field] = at
        break
      }
    }
  }
  return out
}

// ---- cells ------------------------------------------------------------------

/** Comma, semicolon or tab, whichever the header line has most of. */
export function detectDelimiter(line: string): string {
  const counts = [
    [',', line.split(',').length],
    [';', line.split(';').length],
    ['\t', line.split('\t').length],
  ] as const
  let best = ','
  let seen = 1
  for (const [char, n] of counts) {
    if (n > seen) {
      best = char
      seen = n
    }
  }
  return best
}

/**
 * One line into cells, honouring quotes and doubled quotes — the format
 * `csvField` in financeExport writes, and the one every spreadsheet emits for a
 * value with a comma in it. Written as a scan rather than a regex because this
 * runs a few hundred thousand times on a large file.
 */
export function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/**
 * A number as brokers write them: thousands separators, a currency symbol, a
 * stray space, a leading +, or a parenthesised negative from an accounting
 * export. NaN for anything that is not a number at all, which is what the
 * caller uses to drop a row.
 */
export function toNumber(raw: string): number {
  const text = raw.trim()
  if (!text) return NaN
  const negative = /^\(.*\)$/.test(text)
  // Keep digits, sign and the decimal point. A comma is a thousands separator
  // far more often than a decimal comma in broker exports, and a file that uses
  // decimal commas would need the whole locale, not a guess per cell.
  const stripped = text.replace(/[()]/g, '').replace(/[^0-9.+-]/g, '')
  if (!stripped || !/[0-9]/.test(stripped)) return NaN
  const n = Number(stripped)
  if (!Number.isFinite(n)) return NaN
  return negative ? -Math.abs(n) : n
}

const ISO = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/
const SLASHED = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

/**
 * A date out of whatever the file says, as 'YYYY-MM-DD'.
 *
 * Handles the year-first forms every platform agrees on, and the day/month
 * forms nobody does. When both halves are 12 or under the answer is genuinely
 * unknowable from the cell, so it reads day-first — the format used everywhere
 * except the US — and reports that it guessed, which is the caller's job to
 * pass on.
 */
export function toDate(raw: string): { date: string; guessed: boolean } {
  const text = raw.trim()
  if (!text) return { date: '', guessed: false }

  const iso = ISO.exec(text)
  if (iso) {
    const [, y, m, d] = iso
    const month = Number(m)
    const day = Number(d)
    if (month < 1 || month > 12 || day < 1 || day > 31) return { date: '', guessed: false }
    return { date: `${y}-${pad(month)}-${pad(day)}`, guessed: false }
  }

  const slashed = SLASHED.exec(text)
  if (slashed) {
    const [, a, b, y] = slashed
    const first = Number(a)
    const second = Number(b)
    // Whichever half cannot be a month settles it; only when neither can is it
    // a guess.
    const dayFirst = first > 12 ? true : second > 12 ? false : true
    const day = dayFirst ? first : second
    const month = dayFirst ? second : first
    if (month < 1 || month > 12 || day < 1 || day > 31) return { date: '', guessed: false }
    return {
      date: `${y}-${pad(month)}-${pad(day)}`,
      guessed: first <= 12 && second <= 12,
    }
  }

  return { date: '', guessed: false }
}

function toSide(raw: string): '' | 'buy' | 'sell' {
  const text = raw.trim().toLowerCase()
  if (!text) return ''
  // MT5 writes "buy", "sell", "buy limit", "DEAL_TYPE_BUY"; a long/short export
  // says so in words. Anything else is left blank rather than forced.
  if (text.includes('sell') || text.includes('short')) return 'sell'
  if (text.includes('buy') || text.includes('long')) return 'buy'
  return ''
}

// ---- the file ---------------------------------------------------------------

/**
 * How far in to look for the header row. MT5 and most broker exports open with
 * a title, an account number and a blank line or two before the real columns,
 * and a parser that insists on line 1 rejects a file whose only problem is a
 * letterhead.
 */
const HEADER_SEARCH_LINES = 50

export function parseTradeCsv(text: string): ParsedCsv {
  const empty: ParsedCsv = {
    rows: [],
    skipped: 0,
    error: '',
    headers: [],
    assumedDayFirst: false,
  }
  // A BOM would make the first header 'ï»¿date' and match nothing.
  const body = text.replace(/^﻿/, '')
  if (!body.trim()) return { ...empty, error: 'That file is empty.' }

  const lines = body.split(/\r?\n/)

  // The header is the first line that names both a date and a result: the two
  // columns without which there is nothing to draw.
  let headerAt = -1
  let delim = ','
  let columns: Partial<Record<Field, number>> = {}
  let headers: string[] = []
  const limit = Math.min(lines.length, HEADER_SEARCH_LINES)
  for (let i = 0; i < limit; i++) {
    if (!lines[i].trim()) continue
    const candidateDelim = detectDelimiter(lines[i])
    const cells = splitCsvLine(lines[i], candidateDelim)
    if (cells.length < 2) continue
    const mapped = mapColumns(cells)
    if (mapped.date !== undefined && mapped.pl !== undefined) {
      headerAt = i
      delim = candidateDelim
      columns = mapped
      headers = cells.map((cell) => cell.trim()).filter(Boolean)
      break
    }
    // Remember the widest row seen, so a failure can report something.
    if (cells.length > headers.length) headers = cells.map((cell) => cell.trim()).filter(Boolean)
  }

  if (headerAt < 0) {
    return {
      ...empty,
      headers,
      error:
        'No date and profit columns found. The file needs a header row with a date column (date, open time, close time…) and a result column (profit, P/L, pnl…).',
    }
  }

  const rows: ImportedTrade[] = []
  let skipped = 0
  let assumedDayFirst = false

  for (let i = headerAt + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const cells = splitCsvLine(line, delim)
    // A totals or summary line at the foot of a broker export: fewer cells than
    // the header, and not a trade.
    if (cells.length <= (columns.pl ?? 0)) {
      skipped++
      continue
    }

    const when = toDate(cells[columns.date as number] ?? '')
    const pl = toNumber(cells[columns.pl as number] ?? '')
    if (!when.date || !Number.isFinite(pl)) {
      skipped++
      continue
    }
    if (when.guessed) assumedDayFirst = true

    const at = (field: Field): string =>
      columns[field] === undefined ? '' : (cells[columns[field] as number] ?? '')
    const lot = toNumber(at('lot'))
    const entry = toNumber(at('entry'))
    const exit = toNumber(at('exit'))

    rows.push({
      date: when.date,
      month: when.date.slice(0, 7),
      symbol: at('symbol').trim(),
      side: toSide(at('side')),
      lot: Number.isFinite(lot) ? lot : 0,
      entry: Number.isFinite(entry) ? entry : 0,
      exit: Number.isFinite(exit) ? exit : 0,
      pl,
    })
  }

  if (!rows.length) {
    return {
      ...empty,
      headers,
      skipped,
      error: `The columns were found but no row could be read from them${
        skipped ? ` — ${skipped} lines were skipped` : ''
      }.`,
    }
  }

  return { rows, skipped, error: '', headers, assumedDayFirst }
}

// ---- what the charts read ---------------------------------------------------

/**
 * The months, oldest first, with the running total already on each one.
 *
 * Months with no trades in them are NOT filled in. A gap in a trading history
 * is a fact about the history — a run of zero-height columns would draw it as
 * months that were traded flat, which is a different claim.
 */
export function summariseByMonth(rows: readonly ImportedTrade[]): MonthSummary[] {
  const byMonth = new Map<string, MonthSummary>()
  for (const row of rows) {
    let entry = byMonth.get(row.month)
    if (!entry) {
      entry = { month: row.month, trades: 0, wins: 0, losses: 0, pl: 0, cumulative: 0 }
      byMonth.set(row.month, entry)
    }
    entry.trades++
    entry.pl += row.pl
    if (row.pl > 0) entry.wins++
    else if (row.pl < 0) entry.losses++
  }
  const out = [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1))
  let running = 0
  for (const month of out) {
    // Rounded per month rather than at the end: a few hundred thousand floats
    // summed raw drift into a cumulative figure ending .00000000004.
    month.pl = Math.round(month.pl * 100) / 100
    running = Math.round((running + month.pl) * 100) / 100
    month.cumulative = running
  }
  return out
}

export function overallStats(rows: readonly ImportedTrade[], months: MonthSummary[]): OverallStats {
  let wins = 0
  let losses = 0
  const symbols = new Set<string>()
  let from = ''
  let to = ''
  for (const row of rows) {
    if (row.pl > 0) wins++
    else if (row.pl < 0) losses++
    if (row.symbol) symbols.add(row.symbol)
    if (!from || row.date < from) from = row.date
    if (!to || row.date > to) to = row.date
  }
  let best: MonthSummary | null = null
  let worst: MonthSummary | null = null
  for (const month of months) {
    if (!best || month.pl > best.pl) best = month
    if (!worst || month.pl < worst.pl) worst = month
  }
  const decided = wins + losses
  return {
    trades: rows.length,
    wins,
    losses,
    // Scratches are excluded from the denominator rather than counted as
    // losses: a break-even close is not a loss, and calling it one moves the
    // number that gets quoted.
    winRate: decided ? wins / decided : 0,
    pl: months.length ? months[months.length - 1].cumulative : 0,
    best,
    worst,
    from,
    to,
    symbols: symbols.size,
  }
}

/**
 * Why this file cannot be read, as a sentence, or null. The same shape as
 * `rejectReason` for attachments, for the same reason: there is one place it is
 * shown, and a code would only be turned back into this sentence there.
 */
export function importRejectReason(file: { name: string; size: number }): string | null {
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_IMPORT_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(file.size / (1024 * 1024) >= 10 ? 0 : 1)
    return `Too large — ${mb} MB, and the limit is 30 MB.`
  }
  return null
}
