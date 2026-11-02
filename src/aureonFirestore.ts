// The Firestore-shaped data API over Aureon_Agentic (migration stage 3).
//
// The third implementation of the handle `loadFirestore()` returns (after the
// Firestore SDK and src/supabaseFirestore.ts), selected when
// VITE_AUTH_PROVIDER=aureon. The callers — useTrades, useExpenses, useSecured,
// useSettings, the workspace in stores/app.ts, the outbox — do not change.
//
// Where each collection goes:
//
//   astra-trades / astra-expenses / astra-secured
//       the normalised /api/finance/{trades,expenses,secured} endpoints. The
//       client-minted id is kept (POST with `id`; a 409 replay becomes a PATCH),
//       and the row is translated field ↔ column with the same table routes the
//       Supabase tables use (src/db/tableRoutes.ts).
//   everything else (Astra-users, aureon-notes, aureon-shares, renamed
//   collections, …)
//       /api/finance/documents/{namespace}/{doc_id}; setDoc with merge is a PUT
//       with `merge: true`.
//
// Money comes back as exact decimal strings. The documents the app reads have
// always held numbers, and the readers (readTrade, readExpense, readSecured) do
// their maths on numbers, so the numeric columns are turned into numbers here,
// once, at the boundary. They are written as strings with at most 8 decimals,
// which is what the API's Decimal accepts (0.1 + 0.2 is not).
//
// Live updates: one shared poller per handle reads GET /api/finance/changes
// every few seconds while the tab is visible, backs off on errors, and hands
// each batch to every listener, which applies the rows and tombstones that
// concern it. A write kicks the poller so the writer's own screen catches up
// at once.

import { createAureonClient } from '@/api/client'
import type { components } from '@/api/client'
import { TABLE_ROUTES, fromRow, toRow, type TableRoute } from '@/db/tableRoutes'

type Client = ReturnType<typeof createAureonClient>

// The three row endpoints share one shape, addressed by kind. openapi-fetch
// cannot type a path built from a union, so those calls go through this loose
// view of the same client; the documents and changes calls stay typed.
interface LooseResult {
  data?: unknown
  response: Response
}
interface LooseClient {
  GET(path: string, init?: unknown): Promise<LooseResult>
  POST(path: string, init?: unknown): Promise<LooseResult>
  PATCH(path: string, init?: unknown): Promise<LooseResult>
  DELETE(path: string, init?: unknown): Promise<LooseResult>
}
type JsonRecord = Record<string, unknown>
type ChangesOut = components['schemas']['ChangesOut']
type RowKind = 'trades' | 'expenses' | 'secured'

const ROW_KINDS: Record<string, RowKind> = {
  'astra-trades': 'trades',
  'astra-expenses': 'expenses',
  'astra-secured': 'secured',
}

/** Namespaces the API accepts (`^[A-Za-z0-9_.-]+$`, at most 64). */
const NAMESPACE = /^[A-Za-z0-9_.-]{1,64}$/

// Written by Firebase Functions that never moved to Aureon, or by Aureon pieces
// that are still being built. Reading them as documents would show an empty
// list as if that were the truth, so they report themselves unavailable with the
// reason instead.
const NOT_ON_AUREON: Record<string, string> = {
  'gh-repos': 'The GitHub mirror moves to Aureon in Phase 21. Use Code (Aureon) meanwhile.',
  'gh-pulls': 'The GitHub mirror moves to Aureon in Phase 21. Use Code (Aureon) meanwhile.',
  'gh-comments': 'The GitHub mirror moves to Aureon in Phase 21. Use Code (Aureon) meanwhile.',
}

const PAGE = 500
export const POLL_MS = 5_000
export const POLL_MAX_MS = 60_000
/** How far back the first cursor reaches, to cover client/server clock skew. */
const FIRST_CURSOR_SKEW_MS = 5 * 60_000

interface CompatRef {
  __kind: 'doc' | 'collection'
  path: string
  id: string
}

interface CompatConstraint {
  kind: 'where' | 'orderBy' | 'limit'
  field?: string
  op?: string
  value?: unknown
  dir?: 'asc' | 'desc'
  count?: number
}

interface CompatQuery {
  __kind: 'query'
  path: string
  constraints: CompatConstraint[]
}

/** One document as this file holds it: the data, and the server's updated_at (ms). */
interface Held {
  id: string
  data: JsonRecord
  updatedAt: number
}

type AureonError = Error & { code?: string; status?: number }

function isRef(value: unknown): value is CompatRef {
  return Boolean(value && typeof value === 'object' && '__kind' in value)
}

function isQuery(value: unknown): value is CompatQuery {
  return isRef(value) && (value as unknown as CompatQuery).__kind === 'query'
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 12) +
    Math.random().toString(36).slice(2, 8)
  )
}

/** HTTP status → the Firestore-style code the app's diagnostics already read. */
export function codeFor(status: number): string {
  if (status === 401 || status === 403) return 'permission-denied'
  if (status === 404) return 'not-found'
  if (status === 409) return 'already-exists'
  if (status === 400 || status === 413 || status === 415 || status === 422)
    return 'invalid-argument'
  if (status === 429) return 'resource-exhausted'
  return 'unavailable'
}

function failure(status: number, message: string): AureonError {
  const err = new Error(message) as AureonError
  err.code = codeFor(status)
  err.status = status
  return err
}

function unavailable(message: string): AureonError {
  const err = new Error(message) as AureonError
  err.code = 'unavailable'
  return err
}

/** Firestore Timestamps and Dates as epoch ms, undefined dropped: what JSON can carry. */
export function serialise(value: unknown): JsonRecord {
  const encoded = JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && 'toMillis' in item) {
      const toMillis = (item as { toMillis?: unknown }).toMillis
      if (typeof toMillis === 'function') return toMillis.call(item)
    }
    if (item instanceof Date) return item.getTime()
    return item
  })
  return encoded === undefined ? {} : (JSON.parse(encoded) as JsonRecord)
}

/** A number as the API's Decimal wants it: a string, at most 8 decimals, no float noise. */
export function decimalString(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '0'
  const fixed = n.toFixed(8)
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
  return trimmed === '-0' ? '0' : trimmed
}

function ms(value: unknown): number {
  if (typeof value === 'number') return value
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

// ---- rows ↔ documents --------------------------------------------------------

const NOT_WRITABLE = new Set(['user_id', 'created_at'])

/** The API body for a document written to a normalised table. */
export function rowBody(route: TableRoute, id: string, data: JsonRecord, merge: boolean) {
  const row = toRow(route, id, data, merge)
  for (const col of route.columns) {
    if (NOT_WRITABLE.has(col.column)) delete row[col.column]
    else if (col.type === 'num' && col.column in row && row[col.column] != null) {
      // recur_day is a whole day of the month, not money.
      row[col.column] =
        col.column === 'recur_day'
          ? Math.round(Number(row[col.column]))
          : decimalString(row[col.column])
    }
  }
  return row
}

/** The document a row reads as: numeric columns as numbers, the owner restated. */
export function rowDocument(route: TableRoute, row: JsonRecord, uid: string): Held {
  const { id, data } = fromRow(route, row)
  for (const col of route.columns) {
    if (col.type !== 'num' || data[col.field] == null) continue
    const n = Number(data[col.field])
    data[col.field] = Number.isFinite(n) ? n : 0
  }
  // The server scopes every row to the signed-in user and does not echo the
  // owner; the readers expect it on the document.
  data.userId = uid
  return { id, data, updatedAt: ms(row.updated_at) }
}

// ---- local query evaluation -----------------------------------------------------

function comparable(value: unknown): number | string {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis
    if (typeof toMillis === 'function') return Number(toMillis.call(value))
  }
  return typeof value === 'number' ? value : String(value ?? '')
}

function matches(data: JsonRecord, constraints: CompatConstraint[]): boolean {
  for (const c of constraints) {
    if (c.kind !== 'where' || !c.field) continue
    // The server already scopes everything to the signed-in user.
    if (c.field === 'userId' || c.field === 'ownerId') continue
    const have = comparable(data[c.field])
    const want = c.value
    if (c.op === '==' && have !== comparable(want)) return false
    if (c.op === '!=' && have === comparable(want)) return false
    if (c.op === '>=' && !(have >= comparable(want))) return false
    if (c.op === '<=' && !(have <= comparable(want))) return false
    if (c.op === '>' && !(have > comparable(want))) return false
    if (c.op === '<' && !(have < comparable(want))) return false
    if (c.op === 'in' && !(Array.isArray(want) && want.map(comparable).includes(have))) return false
  }
  return true
}

/** Order and cap, as the query asks. Without an orderBy, the id keeps it stable. */
function arrange(held: Held[], constraints: CompatConstraint[]): Held[] {
  const order = constraints.find((c) => c.kind === 'orderBy' && c.field)
  const out = held.slice().sort((a, b) => {
    if (order?.field) {
      const av = comparable(a.data[order.field])
      const bv = comparable(b.data[order.field])
      if (av !== bv) return (av < bv ? -1 : 1) * (order.dir === 'desc' ? -1 : 1)
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  const cap = constraints.find((c) => c.kind === 'limit')?.count
  return cap && cap > 0 ? out.slice(0, cap) : out
}

/** The day range a month query asks for, so the server filters before it pages. */
function dayRange(route: TableRoute, constraints: CompatConstraint[]) {
  const dayField = route.columns.find((c) => c.type === 'date')?.field
  const range: { date_from?: string; date_to?: string } = {}
  for (const c of constraints) {
    if (c.kind !== 'where' || c.field !== dayField || typeof c.value !== 'string') continue
    if (c.op === '>=' || c.op === '==') range.date_from = c.value
    if (c.op === '<=' || c.op === '==') range.date_to = c.value
  }
  return range
}

// ---- snapshots -------------------------------------------------------------------

const METADATA = { fromCache: false, hasPendingWrites: false }

function snapshotDoc(id: string, data: JsonRecord | null) {
  return {
    id,
    exists: () => data !== null,
    data: () => data ?? undefined,
    metadata: METADATA,
  }
}

function querySnapshot(rows: Held[], previous?: Map<string, string>) {
  const docs = rows.map((row) => snapshotDoc(row.id, row.data))
  const current = new Map(rows.map((row) => [row.id, JSON.stringify(row.data)]))
  const changes: Array<{
    type: 'added' | 'modified' | 'removed'
    doc: ReturnType<typeof snapshotDoc>
  }> = []
  for (const doc of docs) {
    if (!previous || !previous.has(doc.id)) changes.push({ type: 'added', doc })
    else if (previous.get(doc.id) !== current.get(doc.id)) changes.push({ type: 'modified', doc })
  }
  if (previous) {
    for (const [id] of previous) {
      if (!current.has(id)) changes.push({ type: 'removed', doc: snapshotDoc(id, null) })
    }
  }
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    metadata: METADATA,
    docChanges: () => changes,
    forEach: (fn: (doc: ReturnType<typeof snapshotDoc>) => void) => docs.forEach(fn),
    __state: current,
  }
}

// ---- the shared change poller ---------------------------------------------------------

export type ChangeBatch = ChangesOut

export interface ChangePoller {
  subscribe(fn: (batch: ChangeBatch) => void): () => void
  /** Poll now (after a write), instead of waiting for the next tick. */
  kick(): void
  /** Test seam: how many listeners are attached. */
  readonly size: number
}

export interface PollerOptions {
  intervalMs?: number
  maxIntervalMs?: number
  now?: () => number
  doc?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> | null
}

export function createChangePoller(client: Client, options: PollerOptions = {}): ChangePoller {
  const interval = options.intervalMs ?? POLL_MS
  const maxInterval = options.maxIntervalMs ?? POLL_MAX_MS
  const now = options.now ?? Date.now
  const doc = options.doc === undefined ? (globalThis.document ?? null) : options.doc
  const listeners = new Set<(batch: ChangeBatch) => void>()
  let cursor = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let again = false
  let delay = interval

  const visible = () => !doc || doc.visibilityState !== 'hidden'

  function schedule(ms: number) {
    if (timer) clearTimeout(timer)
    timer = null
    if (!listeners.size || !visible()) return
    timer = setTimeout(() => {
      timer = null
      void poll()
    }, ms)
  }

  async function poll(): Promise<void> {
    if (!listeners.size) return
    if (running) {
      again = true
      return
    }
    running = true
    try {
      let truncated = true
      // A truncated batch is followed at once with the cursor it returned.
      while (truncated && listeners.size) {
        const since = cursor || new Date(now() - FIRST_CURSOR_SKEW_MS).toISOString()
        const { data, response } = await client.GET('/api/finance/changes', {
          params: { query: { since } },
        })
        if (!data) throw failure(response.status, `Change sync failed (HTTP ${response.status}).`)
        cursor = data.cursor
        truncated = data.truncated === true
        for (const fn of [...listeners]) fn(data)
      }
      delay = interval
    } catch (err) {
      delay = Math.min(delay * 2, maxInterval)
      console.warn('[Aureon] Change sync failed; retrying:', err)
    } finally {
      running = false
    }
    if (again) {
      again = false
      void poll()
      return
    }
    schedule(delay)
  }

  function onVisibility() {
    if (visible()) void poll()
    else schedule(0)
  }

  return {
    subscribe(fn) {
      listeners.add(fn)
      if (listeners.size === 1) {
        doc?.addEventListener('visibilitychange', onVisibility)
        schedule(interval)
      }
      return () => {
        listeners.delete(fn)
        if (!listeners.size) {
          if (timer) clearTimeout(timer)
          timer = null
          doc?.removeEventListener('visibilitychange', onVisibility)
        }
      }
    },
    kick() {
      if (listeners.size && visible()) void poll()
    },
    get size() {
      return listeners.size
    },
  }
}

// ---- the handle ------------------------------------------------------------------

export interface AureonHandleOptions {
  client?: Client
  /** The signed-in Aureon user id, read when a document needs its owner restated. */
  uid?: () => string
  poller?: ChangePoller
}

export function createAureonFirestoreHandle(options: AureonHandleOptions = {}) {
  const client = options.client ?? createAureonClient()
  const uid = options.uid ?? (() => '')
  const poller = options.poller ?? createChangePoller(client)
  const rows = client as unknown as LooseClient

  function routeOf(path: string): { kind: RowKind; route: TableRoute } | null {
    const kind = ROW_KINDS[path]
    return kind ? { kind, route: TABLE_ROUTES[path] } : null
  }

  function checkNamespace(path: string): void {
    if (NOT_ON_AUREON[path]) throw unavailable(NOT_ON_AUREON[path])
    if (!NAMESPACE.test(path)) {
      throw unavailable(`${path} has no Aureon equivalent (nested collections are not migrated).`)
    }
  }

  function collection(root: unknown, ...segments: string[]): CompatRef {
    const base =
      isRef(root) && root.__kind === 'doc' ? [root.path, root.id].filter(Boolean).join('/') : ''
    const path = [base, ...segments].filter(Boolean).join('/')
    return { __kind: 'collection', path, id: path.split('/').at(-1) ?? path }
  }

  function doc(root: unknown, ...segments: string[]): CompatRef {
    if (isRef(root) && root.__kind === 'collection') {
      return { __kind: 'doc', path: root.path, id: segments[0] || randomId() }
    }
    const pieces = (segments.length === 1 ? segments[0].split('/') : segments).filter(Boolean)
    return { __kind: 'doc', path: pieces.slice(0, -1).join('/'), id: pieces.at(-1) ?? '' }
  }

  const query = (ref: CompatRef, ...constraints: CompatConstraint[]): CompatQuery => ({
    __kind: 'query',
    path: ref.path,
    constraints,
  })
  const where = (field: string, op: string, value: unknown): CompatConstraint => ({
    kind: 'where',
    field,
    op,
    value,
  })
  const orderBy = (field: string, dir: 'asc' | 'desc' = 'asc'): CompatConstraint => ({
    kind: 'orderBy',
    field,
    dir,
  })
  const limit = (count: number): CompatConstraint => ({ kind: 'limit', count })

  // ---- reads ----

  async function fetchAll(q: CompatQuery): Promise<Held[]> {
    checkNamespace(q.path)
    const routed = routeOf(q.path)
    const out: Held[] = []
    for (let offset = 0; ; offset += PAGE) {
      let items: JsonRecord[]
      let total: number
      if (routed) {
        const { data, response } = await rows.GET(`/api/finance/${routed.kind}`, {
          params: { query: { ...dayRange(routed.route, q.constraints), limit: PAGE, offset } },
        })
        const page = data as { items: JsonRecord[]; total: number } | undefined
        if (!page)
          throw failure(response.status, `${q.path} could not be read (HTTP ${response.status}).`)
        items = page.items
        total = page.total
        for (const row of items) out.push(rowDocument(routed.route, row, uid()))
      } else {
        const { data, response } = await client.GET('/api/finance/documents/{namespace}', {
          params: { path: { namespace: q.path }, query: { limit: PAGE, offset } },
        })
        if (!data)
          throw failure(response.status, `${q.path} could not be read (HTTP ${response.status}).`)
        items = data.items as unknown as JsonRecord[]
        total = data.total
        for (const d of data.items)
          out.push({ id: d.doc_id, data: d.data, updatedAt: ms(d.updated_at) })
      }
      if (!items.length || offset + items.length >= total) break
    }
    return arrange(
      out.filter((h) => matches(h.data, q.constraints)),
      q.constraints,
    )
  }

  async function fetchOne(ref: CompatRef): Promise<Held | null> {
    checkNamespace(ref.path)
    const routed = routeOf(ref.path)
    if (routed) {
      const { data, response } = await rows.GET(`/api/finance/${routed.kind}/{row_id}`, {
        params: { path: { row_id: ref.id } },
      })
      if (data) return rowDocument(routed.route, data as unknown as JsonRecord, uid())
      if (response.status === 404) return null
      throw failure(
        response.status,
        `${ref.path}/${ref.id} could not be read (HTTP ${response.status}).`,
      )
    }
    const { data, response } = await client.GET('/api/finance/documents/{namespace}/{doc_id}', {
      params: { path: { namespace: ref.path, doc_id: ref.id } },
    })
    if (data) return { id: data.doc_id, data: data.data, updatedAt: ms(data.updated_at) }
    if (response.status === 404) return null
    throw failure(
      response.status,
      `${ref.path}/${ref.id} could not be read (HTTP ${response.status}).`,
    )
  }

  function asQuery(target: CompatRef | CompatQuery): CompatQuery {
    return isQuery(target) ? target : { __kind: 'query', path: target.path, constraints: [] }
  }

  async function getDocs(target: CompatRef | CompatQuery) {
    return querySnapshot(await fetchAll(asQuery(target)))
  }

  async function getDoc(ref: CompatRef) {
    const held = await fetchOne(ref)
    return snapshotDoc(ref.id, held?.data ?? null)
  }

  // ---- writes ----

  async function setDoc(ref: CompatRef, data: JsonRecord, opts?: { merge?: boolean }) {
    checkNamespace(ref.path)
    const merge = opts?.merge === true
    const plain = serialise(data)
    const routed = routeOf(ref.path)
    try {
      if (!routed) {
        const { response } = await client.PUT('/api/finance/documents/{namespace}/{doc_id}', {
          params: { path: { namespace: ref.path, doc_id: ref.id } },
          body: { data: plain, merge },
        })
        if (!response.ok)
          throw failure(response.status, `${ref.path} refused the write (HTTP ${response.status}).`)
        return
      }
      const kind = routed.kind
      const patchRow = async (body: JsonRecord) => {
        delete body.id
        const { response } = await rows.PATCH(`/api/finance/${kind}/{row_id}`, {
          params: { path: { row_id: ref.id } },
          body,
        })
        return response
      }
      const createRow = async (body: JsonRecord) => {
        const { response } = await rows.POST(`/api/finance/${kind}`, { body })
        return response
      }
      if (merge) {
        // Firestore merge: update what is there; create it when it is not.
        let response = await patchRow(rowBody(routed.route, ref.id, plain, true))
        if (response.status === 404)
          response = await createRow(rowBody(routed.route, ref.id, plain, false))
        if (!response.ok)
          throw failure(response.status, `${ref.path} refused the write (HTTP ${response.status}).`)
        return
      }
      // A replace: create at the client-minted id; a replay (409) rewrites
      // every column of the row that is already there.
      const full = rowBody(routed.route, ref.id, plain, false)
      let response = await createRow({ ...full })
      if (response.status === 409) response = await patchRow({ ...full })
      if (!response.ok)
        throw failure(response.status, `${ref.path} refused the write (HTTP ${response.status}).`)
    } finally {
      poller.kick()
    }
  }

  async function deleteDoc(ref: CompatRef) {
    checkNamespace(ref.path)
    const routed = routeOf(ref.path)
    try {
      const { response } = routed
        ? await rows.DELETE(`/api/finance/${routed.kind}/{row_id}`, {
            params: { path: { row_id: ref.id } },
          })
        : await client.DELETE('/api/finance/documents/{namespace}/{doc_id}', {
            params: { path: { namespace: ref.path, doc_id: ref.id } },
          })
      // Deleting what is already gone is not an error in Firestore either.
      if (!response.ok && response.status !== 404)
        throw failure(response.status, `${ref.path} refused the delete (HTTP ${response.status}).`)
    } finally {
      poller.kick()
    }
  }

  // ---- live ----

  /** What a change batch says about one namespace: id → newest row or delete. */
  function changesFor(path: string, batch: ChangeBatch) {
    const routed = routeOf(path)
    const latest = new Map<string, { held: Held | null; at: number }>()
    const offer = (id: string, held: Held | null, at: number) => {
      const seen = latest.get(id)
      if (!seen || at >= seen.at) latest.set(id, { held, at })
    }
    if (routed) {
      for (const row of batch[routed.kind] as unknown as JsonRecord[]) {
        const held = rowDocument(routed.route, row, uid())
        offer(held.id, held, held.updatedAt)
      }
      for (const t of batch.deleted) {
        // A delete newer than the row wins; an id re-created after it does not.
        if (t.kind === routed.kind) offer(t.ref, null, ms(t.deleted_at))
      }
    } else {
      for (const d of batch.documents) {
        if (d.namespace !== path) continue
        offer(
          d.doc_id,
          { id: d.doc_id, data: d.data, updatedAt: ms(d.updated_at) },
          ms(d.updated_at),
        )
      }
      const prefix = path + '/'
      for (const t of batch.deleted) {
        if (t.kind === 'document' && t.ref.startsWith(prefix)) {
          offer(t.ref.slice(prefix.length), null, ms(t.deleted_at))
        }
      }
    }
    return latest
  }

  function onSnapshot(target: CompatRef | CompatQuery, ...rest: unknown[]) {
    const callbacks = rest.filter((value) => typeof value === 'function') as Array<
      (value: unknown) => void
    >
    const next = callbacks[0]
    const onError = callbacks[1]
    const single = !isQuery(target) && target.__kind === 'doc'
    const q = asQuery(target)
    let stopped = false
    let held = new Map<string, Held>()
    let previous: Map<string, string> | undefined
    let ready = false
    let pending: ChangeBatch[] = []

    const emit = () => {
      if (stopped) return
      if (single) {
        const one = held.get((target as CompatRef).id) ?? null
        next?.(snapshotDoc((target as CompatRef).id, one?.data ?? null))
        return
      }
      const snap = querySnapshot(arrange([...held.values()], q.constraints), previous)
      previous = snap.__state
      next?.(snap)
    }

    const refetch = async () => {
      if (single) {
        const one = await fetchOne(target as CompatRef)
        held = new Map(one ? [[one.id, one]] : [])
      } else {
        held = new Map((await fetchAll(q)).map((h) => [h.id, h]))
      }
    }

    const apply = (batch: ChangeBatch) => {
      if (!ready) {
        // The initial read is still in flight: keep the batch for after it.
        pending.push(batch)
        return
      }
      const latest = changesFor(q.path, batch)
      let changed = false
      let removedUnderLimit = false
      const capped = q.constraints.some((c) => c.kind === 'limit')
      for (const [id, { held: incoming, at }] of latest) {
        if (single && id !== (target as CompatRef).id) continue
        const mine = held.get(id)
        if (!incoming) {
          if (mine && at > mine.updatedAt) {
            held.delete(id)
            changed = true
            removedUnderLimit ||= capped
          }
          continue
        }
        if (mine && mine.updatedAt > incoming.updatedAt) continue
        if (single || matches(incoming.data, q.constraints)) {
          held.set(id, incoming)
          changed = true
        } else if (mine) {
          held.delete(id)
          changed = true
          removedUnderLimit ||= capped
        }
      }
      if (removedUnderLimit) {
        // Something left a capped list: the next one in line is not held here.
        void refetch().then(emit, (err) => console.warn('[Aureon] Refetch failed:', err))
        return
      }
      if (changed) emit()
    }

    const unsubscribe = poller.subscribe(apply)
    refetch().then(
      () => {
        ready = true
        const queued = pending
        pending = []
        emit()
        for (const batch of queued) apply(batch)
      },
      (err) => {
        if (stopped) return
        unsubscribe()
        onError?.(err)
      },
    )

    return () => {
      stopped = true
      unsubscribe()
    }
  }

  const fs = {
    collection,
    doc,
    query,
    where,
    orderBy,
    limit,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp: () => Date.now(),
    Timestamp: {
      fromMillis: (value: number) => value,
      now: () => Date.now(),
    },
  }

  return { db: { __kind: 'aureon' }, fs, poller }
}
