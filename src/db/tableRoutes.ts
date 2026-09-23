// Which Firestore-shaped collections now live in real tables, and how a
// document maps onto a row (Supabase migration, phase 2).
//
// The app still speaks the Firestore-shaped API from phase 1 — `setDoc` with a
// document, `onSnapshot` on a query over document fields. For a collection
// listed here the adapter answers from a normalised table instead of from
// `astra_documents`, translating field ↔ column on the way through. The
// callers (`useTrades`, `useExpenses`, `useSecured`) do not change; the data
// underneath them does.
//
// A domain is only routed when it is switched on in `VITE_SUPABASE_TABLES`
// (see `.env.example`), because the table must exist before the app reads
// from it: the migration is applied first, then the switch is flipped.

export type ColumnType = 'text' | 'num' | 'bool' | 'date' | 'ms' | 'emptyIsNull'

export interface Column {
  /** The document field the app reads and writes. */
  field: string
  /** The table column it lives in. */
  column: string
  type: ColumnType
  /** What a replace (`setDoc` without merge) writes when the field is missing. */
  fallback: unknown
}

export interface TableRoute {
  domain: Domain
  table: string
  columns: Column[]
}

export type Domain = 'trading'

const OWNER: Column = { field: 'userId', column: 'user_id', type: 'text', fallback: '' }

const c = (field: string, column: string, type: ColumnType, fallback: unknown): Column => ({
  field,
  column,
  type,
  fallback,
})

/**
 * Keyed by the collection's DEFAULT name. Per-user renamed collections are not
 * routed: the rename feature is retired once trading is in tables (a fixed
 * table has no per-user name), and until then a renamed collection keeps using
 * `astra_documents` exactly as before.
 */
export const TABLE_ROUTES: Record<string, TableRoute> = {
  'astra-trades': {
    domain: 'trading',
    table: 'trades',
    columns: [
      OWNER,
      c('istDate', 'ist_date', 'date', null),
      c('istTime', 'ist_time', 'text', ''),
      c('entryAt', 'entry_at', 'ms', null),
      c('exitAt', 'exit_at', 'ms', null),
      c('ts', 'ts', 'ms', null),
      c('brokerOffsetMinutes', 'broker_offset_minutes', 'num', 180),
      c('symbol', 'symbol', 'text', ''),
      c('session', 'session', 'text', 'London'),
      c('side', 'side', 'text', 'buy'),
      c('lot', 'lot', 'num', 1),
      c('entry', 'entry', 'num', 0),
      c('exit', 'exit', 'num', 0),
      c('move', 'move', 'num', 0),
      c('pl', 'pl', 'num', 0),
      c('note', 'note', 'text', ''),
      c('signalId', 'signal_id', 'emptyIsNull', ''),
      c('timeEstimated', 'time_estimated', 'bool', false),
      c('createdAt', 'created_at', 'ms', null),
    ],
  },
  'astra-expenses': {
    domain: 'trading',
    table: 'expenses',
    columns: [
      OWNER,
      c('date', 'date', 'date', null),
      c('amount', 'amount', 'num', 0),
      c('category', 'category', 'text', 'Other'),
      c('note', 'note', 'text', ''),
      c('kind', 'kind', 'text', 'one-off'),
      c('recurDay', 'recur_day', 'num', null),
      c('createdAt', 'created_at', 'ms', null),
    ],
  },
  'astra-secured': {
    domain: 'trading',
    table: 'secured',
    columns: [
      OWNER,
      c('date', 'date', 'date', null),
      c('amt', 'amt', 'num', 0),
      c('note', 'note', 'text', ''),
      c('createdAt', 'created_at', 'ms', null),
    ],
  },
}

/** The domains switched on, from a comma-separated setting like "trading". */
export function enabledDomains(setting: string | undefined): Set<Domain> {
  const known: Domain[] = ['trading']
  return new Set(
    String(setting ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is Domain => (known as string[]).includes(s)),
  )
}

export function routeFor(namespace: string, enabled: Set<Domain>): TableRoute | null {
  const route = TABLE_ROUTES[namespace]
  return route && enabled.has(route.domain) ? route : null
}

export function columnFor(route: TableRoute, field: string): string {
  const found = route.columns.find((col) => col.field === field)
  // Loud, because a query on a field the table does not have would otherwise
  // be dropped and quietly return every row.
  if (!found) throw new Error(`${route.table} has no column for field "${field}"`)
  return found.column
}

function toMillis(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'object' && 'toMillis' in value) {
    const fn = (value as { toMillis?: unknown }).toMillis
    if (typeof fn === 'function') return Number(fn.call(value))
  }
  return null
}

function toColumn(col: Column, value: unknown): unknown {
  switch (col.type) {
    case 'ms': {
      const ms = toMillis(value)
      return ms == null ? null : new Date(ms).toISOString()
    }
    case 'emptyIsNull':
      return value === '' || value == null ? null : String(value)
    case 'num':
      return typeof value === 'number' && Number.isFinite(value) ? value : col.fallback
    case 'bool':
      return value === true
    case 'date':
      return typeof value === 'string' && value ? value : col.fallback
    default:
      return value == null ? col.fallback : String(value)
  }
}

function fromColumn(col: Column, value: unknown): unknown {
  switch (col.type) {
    case 'ms':
      // What phase 1 stored and what every reader already accepts: epoch ms.
      return value == null ? null : Date.parse(String(value))
    case 'emptyIsNull':
      return value == null ? '' : String(value)
    default:
      return value
  }
}

/**
 * The row for a write. A replace fills every column, missing fields from their
 * fallback — a document replace means "this is the whole thing". A merge sends
 * only the fields it was given, so the rest of the row is left alone.
 */
export function toRow(
  route: TableRoute,
  id: string,
  data: Record<string, unknown>,
  merge: boolean,
): Record<string, unknown> {
  const row: Record<string, unknown> = { id }
  for (const col of route.columns) {
    const present = Object.prototype.hasOwnProperty.call(data, col.field)
    if (!present && merge) continue
    // The fallback goes through the same conversion as a real value, so a
    // missing `signalId` is stored as null exactly like an empty one is.
    row[col.column] = toColumn(col, present ? data[col.field] : col.fallback)
  }
  return row
}

/** The document a row reads as, in the shape the app's readers expect. */
export function fromRow(
  route: TableRoute,
  row: Record<string, unknown>,
): { id: string; data: Record<string, unknown> } {
  const data: Record<string, unknown> = {}
  for (const col of route.columns) {
    if (col.column in row) data[col.field] = fromColumn(col, row[col.column])
  }
  return { id: String(row.id ?? ''), data }
}
