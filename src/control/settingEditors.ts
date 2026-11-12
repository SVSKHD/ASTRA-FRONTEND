// Which editor each setting gets, and the exact string each one sends: the
// backend stores a setting as one string (PUT /api/v1/settings/{key} {value}),
// so every editor's state is turned into that string here and nowhere else.
// Pure, so every round trip is tested without a component.
//
// The server never sends a value back (only a mask), so an editor starts empty
// and a save replaces the value whole. That is why the structured editors (the
// budget split, the price table) are entered in full.

import type { SettingRow } from '@/control/settings'
import { cronError } from '@/control/cron'

export type Editor =
  | 'managed'
  | 'switch'
  | 'secret'
  | 'effort'
  | 'budgets'
  | 'prices'
  | 'cron'
  | 'number'
  | 'url'
  | 'csv'
  | 'json'
  | 'text'

export function editorFor(row: Pick<SettingRow, 'key' | 'kind' | 'managed'>): Editor {
  if (row.managed) return 'managed'
  if (row.kind === 'bool') return 'switch'
  if (row.kind === 'secret') return 'secret'
  if (row.key === 'AI_EFFORT') return 'effort'
  if (row.key === 'AI_AGENT_BUDGETS_USD') return 'budgets'
  if (row.key === 'AI_MODEL_PRICES') return 'prices'
  if (row.key.endsWith('_CRON')) return 'cron'
  if (row.kind === 'decimal' || row.kind === 'int' || row.kind === 'float') return 'number'
  if (row.kind === 'url') return 'url'
  if (row.kind === 'csv') return 'csv'
  if (row.kind === 'json_list' || row.kind === 'json_object') return 'json'
  return 'text'
}

// --- simple values --------------------------------------------------------------------------

const DECIMAL = /^\d+(\.\d+)?$/
const INT = /^-?\d+$/

/** Why a typed value cannot be saved for this kind, or null when it can. */
export function valueError(kind: string, value: string): string | null {
  const v = value.trim()
  if (kind === 'int') return INT.test(v) ? null : 'Enter a whole number.'
  if (kind === 'decimal' || kind === 'float') {
    return DECIMAL.test(v) ? null : 'Enter a number of 0 or more, like 2 or 0.50.'
  }
  if (kind === 'url') {
    try {
      const u = new URL(v)
      return ['http:', 'https:', 'wss:', 'ws:'].includes(u.protocol)
        ? null
        : 'Use an http(s) or wss address.'
    } catch {
      return 'Enter a full address, starting with https://.'
    }
  }
  if (kind === 'json_object' || kind === 'json_list') {
    try {
      const parsed: unknown = JSON.parse(v)
      if (kind === 'json_list' && !Array.isArray(parsed)) return 'Enter a JSON list: [ … ].'
      if (
        kind === 'json_object' &&
        (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      )
        return 'Enter a JSON object: { … }.'
      return null
    } catch {
      return 'That is not valid JSON.'
    }
  }
  return null
}

/** A csv setting's items, trimmed, blanks dropped. */
export function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
/** The csv string the backend stores: items joined by commas, no spaces, no duplicates. */
export function serializeCsv(items: string[]): string {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))].join(',')
}

// --- AI_EFFORT -----------------------------------------------------------------------------

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export const EFFORT_HINT: Record<string, string> = {
  low: 'Fastest and cheapest',
  medium: 'The default balance',
  high: 'More thinking per answer',
  xhigh: 'Much more thinking',
  max: 'The most thinking, the highest cost',
}

// --- AI_AGENT_BUDGETS_USD ------------------------------------------------------------------

export const BUDGET_KEYS = ['investments', 'business', 'chat', 'reserve'] as const
export type BudgetDraft = Record<(typeof BUDGET_KEYS)[number], string>

/** Why the split cannot be saved, or null when it can. */
export function budgetsError(d: BudgetDraft): string | null {
  for (const k of BUDGET_KEYS) {
    if (!DECIMAL.test(d[k].trim())) return `${k}: enter a number of 0 or more (USD).`
  }
  return null
}

/** The four caps' sum, for the live total. */
export function budgetsTotal(d: BudgetDraft): number {
  return BUDGET_KEYS.reduce((s, k) => s + (Number(d[k]) || 0), 0)
}

/**
 * `{"investments":40,"business":30,"chat":20,"reserve":10}`: each typed amount is
 * written as the JSON number it already is (checked against DECIMAL), so "40.50"
 * reaches the server as 40.50 — never re-rounded through a float.
 */
export function serializeBudgets(d: BudgetDraft): string {
  return `{${BUDGET_KEYS.map((k) => `"${k}":${d[k].trim()}`).join(',')}}`
}

/** A draft from a stored value (or the usage endpoint's caps), for the editor's start. */
export function parseBudgets(value: string): BudgetDraft | null {
  try {
    const o = JSON.parse(value) as Record<string, unknown>
    if (!o || typeof o !== 'object') return null
    const out = {} as BudgetDraft
    for (const k of BUDGET_KEYS) out[k] = o[k] == null ? '' : String(o[k])
    return out
  } catch {
    return null
  }
}

// --- AI_MODEL_PRICES ----------------------------------------------------------------------

export interface PriceRow {
  model: string
  /** USD per million input tokens, as typed. */
  input: string
  output: string
  /** Optional: blank leaves the built-in cache-read price. */
  cacheRead: string
}

/** Why the table cannot be saved, or null when it can. */
export function pricesError(rows: PriceRow[]): string | null {
  const used = rows.filter((r) => r.model.trim() || r.input.trim() || r.output.trim())
  if (!used.length) return 'Add at least one model with its prices.'
  const seen = new Set<string>()
  for (const r of used) {
    const id = r.model.trim()
    if (!id) return 'Every price needs a model id.'
    if (seen.has(id)) return `${id} is listed twice.`
    seen.add(id)
    if (!DECIMAL.test(r.input.trim()) || !DECIMAL.test(r.output.trim())) {
      return `${id}: input and output must be numbers of 0 or more (USD per million tokens).`
    }
    if (r.cacheRead.trim() && !DECIMAL.test(r.cacheRead.trim())) {
      return `${id}: cache read must be a number of 0 or more, or blank.`
    }
  }
  return null
}

/**
 * The exact value the backend stores:
 * `{"<model>": {"input": "<usd>", "output": "<usd>", "cache_read"?: "<usd>"}}`,
 * prices as strings, models sorted.
 */
export function serializePrices(rows: PriceRow[]): string {
  const out: Record<string, Record<string, string>> = {}
  for (const r of rows) {
    const id = r.model.trim()
    if (!id) continue
    out[id] = {
      input: r.input.trim(),
      output: r.output.trim(),
      ...(r.cacheRead.trim() ? { cache_read: r.cacheRead.trim() } : {}),
    }
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)))
  return JSON.stringify(sorted)
}

export function parsePrices(value: string): PriceRow[] {
  try {
    const o = JSON.parse(value) as Record<string, Record<string, unknown>>
    return Object.entries(o).map(([model, p]) => ({
      model,
      input: String(p.input ?? ''),
      output: String(p.output ?? ''),
      cacheRead: p.cache_read == null ? '' : String(p.cache_read),
    }))
  } catch {
    return []
  }
}

// --- the one check before any save ----------------------------------------------------------

/** Why a draft for this row cannot be saved, or null. Cron and json get their own checks. */
export function draftError(row: Pick<SettingRow, 'key' | 'kind'>, value: string): string | null {
  const editor = editorFor({ ...row, managed: false })
  if (editor === 'cron') return cronError(value)
  if (editor === 'effort') {
    return (EFFORTS as readonly string[]).includes(value) ? null : 'Pick an effort level.'
  }
  if (editor === 'number' || editor === 'url' || editor === 'json') {
    return valueError(row.kind, value)
  }
  return null
}

// --- notes on the keys where the description alone would mislead ---------------------------

export function keyNote(key: string): string {
  if (key === 'ANTHROPIC_API_KEY') {
    return 'From console.anthropic.com. Stored encrypted on the server and never sent back; unset, every AI feature is off.'
  }
  if (key === 'AI_MODEL_PRICES') {
    return 'USD per million tokens. Overrides the built-in prices; a model without a price is never called. Saving replaces every price, so enter all of them.'
  }
  if (key === 'AI_AGENT_BUDGETS_USD') {
    return 'Each budget’s monthly cap. A call that could cross its budget, or the monthly budget, is refused.'
  }
  if (key === 'AI_MODEL_ROUTER')
    return 'Leave blank to turn the router off: chats then need an agent picked.'
  if (key.startsWith('AI_TRADE_')) {
    return 'Hard limits on what Claude may propose. Every proposal still waits for your approval and is paper only.'
  }
  return ''
}
