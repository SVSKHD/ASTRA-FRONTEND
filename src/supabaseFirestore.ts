import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import {
  columnFor,
  enabledDomains,
  fromRow,
  routeFor,
  toRow,
  type TableRoute,
} from '@/db/tableRoutes'

const TABLE = 'astra_documents'

// Phase 2: collections whose domain is switched on read and write real tables
// instead of `astra_documents`. See src/db/tableRoutes.ts.
const ENABLED_TABLES = enabledDomains(import.meta.env.VITE_SUPABASE_TABLES)

type JsonRecord = Record<string, unknown>

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

interface SupabaseRow {
  namespace: string
  doc_id: string
  user_id: string | null
  data: JsonRecord
  updated_at: string
}

export interface LegacyFirestoreHandle {
  db: unknown
  fs: Record<string, any>
}

export type LegacyFirestoreLoader = () => Promise<LegacyFirestoreHandle | null>

// Namespaces whose WRITER is still a Firebase function, so their readers stay
// on Firestore until that writer moves (phase 4). Reading them from Supabase
// would show only what was imported once, and never anything new.
//
// `astra-dacoit-signals` was missing from this list: the `dacoitSignal`
// function still writes every new signal to Firestore, so with Supabase on the
// Trades tab stopped receiving signals.
const FIREBASE_MIRRORS = new Set([
  'forex',
  'gh-repos',
  'gh-pulls',
  'gh-comments',
  'astra-dacoit-signals',
])

// The other direction: documents the APP writes that a Firebase function
// still READS. Written to both until those functions move (phase 4).
// `Astra-users` holds `trackedRepos` (read by the GitHub webhook and sweep) and
// `dacoitCollection` (read by `dacoitSignal`); written only to Supabase, a repo
// tracked in the app was invisible to the functions that fill the Code tab.
const DUAL_WRITE_TO_FIRESTORE = new Set(['Astra-users'])

// Recovery timings for live listeners (see `onSnapshot`).
const RETRY_START_MS = 2_000
const RETRY_MAX_MS = 30_000
const CATCH_UP_MS = 30_000

function isRef(value: unknown): value is CompatRef {
  return Boolean(value && typeof value === 'object' && '__kind' in value)
}

function isQuery(value: unknown): value is CompatQuery {
  return Boolean(
    value &&
    typeof value === 'object' &&
    '__kind' in value &&
    (value as { __kind?: string }).__kind === 'query',
  )
}

function namespaceOf(target: CompatRef | CompatQuery): string {
  return target.path
}

function usesLegacyFirestore(path: string): boolean {
  return FIREBASE_MIRRORS.has(path) || path.startsWith('users/')
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

function serialise(value: unknown): unknown {
  const encoded = JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && 'toMillis' in item) {
      const toMillis = (item as { toMillis?: unknown }).toMillis
      if (typeof toMillis === 'function') return toMillis.call(item)
    }
    if (item instanceof Date) return item.getTime()
    return item
  })
  return encoded === undefined ? null : (JSON.parse(encoded) as unknown)
}

function sortable(value: unknown): number | string {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis
    if (typeof toMillis === 'function') return Number(toMillis.call(value))
  }
  if (value instanceof Date) return value.getTime()
  return typeof value === 'number' ? value : String(value ?? '')
}

function snapshotDoc(id: string, data: JsonRecord | null) {
  return {
    id,
    exists: () => data !== null,
    data: () => data ?? undefined,
    metadata: { fromCache: false, hasPendingWrites: false },
  }
}

function supabaseError(error: unknown): Error & { code?: string } {
  const raw = error as { message?: string; code?: string; status?: number }
  const out = new Error(raw?.message || 'Supabase request failed') as Error & { code?: string }
  if (raw?.code === '42501' || raw?.status === 401 || raw?.status === 403)
    out.code = 'permission-denied'
  else if (raw?.code) out.code = raw.code
  else out.code = 'unavailable'
  return out
}

function querySnapshot(rows: SupabaseRow[], previous?: Map<string, string>) {
  const docs = rows.map((row) => snapshotDoc(row.doc_id, row.data))
  const current = new Map(rows.map((row) => [row.doc_id, JSON.stringify(row.data)]))
  const changes: Array<{
    type: 'added' | 'modified' | 'removed'
    doc: ReturnType<typeof snapshotDoc>
  }> = []

  if (!previous) {
    for (const doc of docs) changes.push({ type: 'added', doc })
  } else {
    for (const doc of docs) {
      const encoded = current.get(doc.id) ?? ''
      if (!previous.has(doc.id)) changes.push({ type: 'added', doc })
      else if (previous.get(doc.id) !== encoded) changes.push({ type: 'modified', doc })
    }
    for (const [id] of previous) {
      if (!current.has(id)) changes.push({ type: 'removed', doc: snapshotDoc(id, null) })
    }
  }

  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    metadata: { fromCache: false, hasPendingWrites: false },
    docChanges: () => changes,
    __state: current,
  }
}

/**
 * The Firestore-shaped data API over Supabase.
 *
 * `client` is the app's one Supabase client (src/supabase.ts), signed in with
 * Supabase Auth: every request and Realtime channel carries that session, and
 * supabase-js refreshes it for both. (Under Firebase third-party auth the
 * Realtime token was handed over once and went stale after an hour.)
 *
 * `loadLegacy` reaches the Firestore that Firebase Functions still write to.
 * It resolves to null when there is no Firebase sign-in to read it with.
 */
export async function createSupabaseFirestoreHandle(
  client: SupabaseClient,
  loadLegacy: LegacyFirestoreLoader,
) {
  // The signed-in user, kept current for the one synchronous reader below
  // (a Realtime filter is built when a listener starts).
  let signedInUid = (await client.auth.getSession()).data.session?.user.id ?? ''
  client.auth.onAuthStateChange((_event, session) => {
    signedInUid = session?.user.id ?? ''
  })

  let legacy: Promise<LegacyFirestoreHandle | null> | null = null
  const getLegacy = () => {
    if (!legacy) legacy = loadLegacy()
    return legacy
  }

  function collection(root: unknown, ...segments: string[]): CompatRef {
    const base =
      isRef(root) && root.__kind === 'doc' ? [root.path, root.id].filter(Boolean).join('/') : ''
    const path = [base, ...segments].filter(Boolean).join('/')
    return { __kind: 'collection', path, id: path.split('/').at(-1) ?? path }
  }

  function doc(root: unknown, ...segments: string[]): CompatRef {
    if (isRef(root) && root.__kind === 'collection') {
      if (segments.length === 0) return { __kind: 'doc', path: root.path, id: randomId() }
      return { __kind: 'doc', path: root.path, id: segments[0] || randomId() }
    }

    if (segments.length === 1) {
      const pieces = segments[0].split('/').filter(Boolean)
      return {
        __kind: 'doc',
        path: pieces.slice(0, -1).join('/'),
        id: pieces.at(-1) ?? '',
      }
    }

    return {
      __kind: 'doc',
      path: segments.slice(0, -1).join('/'),
      id: segments.at(-1) ?? '',
    }
  }

  function query(ref: CompatRef, ...constraints: CompatConstraint[]): CompatQuery {
    return { __kind: 'query', path: ref.path, constraints }
  }

  function where(field: string, op: string, value: unknown): CompatConstraint {
    return { kind: 'where', field, op, value }
  }

  function orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): CompatConstraint {
    return { kind: 'orderBy', field, dir }
  }

  function limit(count: number): CompatConstraint {
    return { kind: 'limit', count }
  }

  async function legacyTarget(target: CompatRef | CompatQuery) {
    const handle = await getLegacy()
    if (!handle) {
      // Said plainly, because the reader sees it: this data is written by a
      // Firebase function, and there is no Firebase sign-in to read it with
      // since sign-in moved to Supabase. It comes back when that function
      // moves to Supabase (phase 4).
      const err = new Error(
        `${target.path} is still written by Firebase Functions, which are not connected since sign-in moved to Supabase.`,
      ) as Error & { code?: string }
      err.code = 'unavailable'
      throw err
    }
    const { db, fs } = handle
    const path = target.path.split('/').filter(Boolean)
    const col = fs.collection(db, ...path)
    if (isQuery(target)) {
      const constraints = target.constraints.map((constraint) => {
        if (constraint.kind === 'where')
          return fs.where(constraint.field, constraint.op, constraint.value)
        if (constraint.kind === 'orderBy') return fs.orderBy(constraint.field, constraint.dir)
        return fs.limit(constraint.count)
      })
      return { handle, target: fs.query(col, ...constraints) }
    }
    if (target.__kind === 'doc') {
      return { handle, target: fs.doc(db, ...path, target.id) }
    }
    return { handle, target: col }
  }

  // ---- phase 2: normalised tables ------------------------------------------

  function currentUid(): string {
    return signedInUid
  }

  // Table rows presented as the document rows the rest of this file expects,
  // so snapshots, change detection and callers are the same for both.
  function asDocRow(route: TableRoute, namespace: string, row: Record<string, unknown>) {
    const { id, data } = fromRow(route, row)
    return {
      namespace,
      doc_id: id,
      user_id: String(row.user_id ?? ''),
      data,
      updated_at: String(row.updated_at ?? ''),
    } satisfies SupabaseRow
  }

  async function fetchTable(route: TableRoute, q: CompatQuery): Promise<SupabaseRow[]> {
    // Filtering, ordering and the limit all happen in Postgres here — on
    // `astra_documents` the ordering had to be done in the browser.
    let request: any = client.from(route.table).select('*')
    for (const constraint of q.constraints) {
      if (constraint.kind === 'where') {
        const column = columnFor(route, constraint.field || '')
        const value = constraint.value
        if (constraint.op === '==') request = request.eq(column, value)
        else if (constraint.op === '>=') request = request.gte(column, value)
        else if (constraint.op === '<=') request = request.lte(column, value)
        else if (constraint.op === 'in' && Array.isArray(value)) request = request.in(column, value)
        else throw new Error(`Unsupported filter "${constraint.op}" on ${route.table}`)
      } else if (constraint.kind === 'orderBy' && constraint.field) {
        request = request.order(columnFor(route, constraint.field), {
          ascending: constraint.dir !== 'desc',
        })
      } else if (constraint.kind === 'limit' && constraint.count) {
        request = request.limit(constraint.count)
      }
    }
    const result = await request
    if (result.error) throw supabaseError(result.error)
    return ((result.data ?? []) as Record<string, unknown>[]).map((row) =>
      asDocRow(route, q.path, row),
    )
  }

  async function fetchSupabase(target: CompatRef | CompatQuery): Promise<SupabaseRow[]> {
    const q: CompatQuery = isQuery(target)
      ? target
      : { __kind: 'query', path: target.path, constraints: [] }

    const route = routeFor(q.path, ENABLED_TABLES)
    if (route) return fetchTable(route, q)

    let request: any = client
      .from(TABLE)
      .select('namespace,doc_id,user_id,data,updated_at')
      .eq('namespace', q.path)

    for (const constraint of q.constraints.filter((item) => item.kind === 'where')) {
      const field = constraint.field || ''
      const op = constraint.op || '=='
      const value = constraint.value
      const column = field === 'userId' ? 'user_id' : `data->${field}`
      const textColumn = field === 'userId' ? 'user_id' : `data->>${field}`

      if (op === '==') request = request.eq(column, value as any)
      else if (op === 'in' && Array.isArray(value))
        request = request.in(
          textColumn,
          value.map((item) => String(item)),
        )
      else if (op === '>=') request = request.gte(textColumn, String(value ?? ''))
      else if (op === '<=') request = request.lte(textColumn, String(value ?? ''))
    }

    const result = await request
    if (result.error) throw supabaseError(result.error)
    let rows = ((result.data ?? []) as SupabaseRow[]).slice()

    const ordering = q.constraints.find((item) => item.kind === 'orderBy')
    if (ordering?.field) {
      rows.sort((a, b) => {
        const av = sortable(a.data?.[ordering.field!])
        const bv = sortable(b.data?.[ordering.field!])
        return (av < bv ? -1 : av > bv ? 1 : 0) * (ordering.dir === 'desc' ? -1 : 1)
      })
    }

    const cap = q.constraints.find((item) => item.kind === 'limit')?.count
    if (cap && cap > 0) rows = rows.slice(0, cap)
    return rows
  }

  async function getDocs(target: CompatRef | CompatQuery) {
    if (usesLegacyFirestore(namespaceOf(target))) {
      const legacyResolved = await legacyTarget(target)
      return legacyResolved.handle.fs.getDocs(legacyResolved.target)
    }
    return querySnapshot(await fetchSupabase(target))
  }

  async function getDoc(ref: CompatRef) {
    if (usesLegacyFirestore(ref.path)) {
      const legacyResolved = await legacyTarget(ref)
      return legacyResolved.handle.fs.getDoc(legacyResolved.target)
    }
    const route = routeFor(ref.path, ENABLED_TABLES)
    if (route) {
      const found = await client.from(route.table).select('*').eq('id', ref.id).maybeSingle()
      if (found.error) throw supabaseError(found.error)
      const row = found.data as Record<string, unknown> | null
      return snapshotDoc(ref.id, row ? fromRow(route, row).data : null)
    }
    const result = await client
      .from(TABLE)
      .select('namespace,doc_id,user_id,data,updated_at')
      .eq('namespace', ref.path)
      .eq('doc_id', ref.id)
      .maybeSingle()
    if (result.error) throw supabaseError(result.error)
    const row = result.data as SupabaseRow | null
    return snapshotDoc(ref.id, row?.data ?? null)
  }

  async function setDoc(ref: CompatRef, data: JsonRecord, options?: { merge?: boolean }) {
    if (usesLegacyFirestore(ref.path)) {
      const legacyResolved = await legacyTarget(ref)
      return legacyResolved.handle.fs.setDoc(legacyResolved.target, data, options)
    }
    const route = routeFor(ref.path, ENABLED_TABLES)
    if (route) {
      const merge = options?.merge === true
      // `defaultToNull: false`: a column the payload leaves out keeps its
      // table default on insert and its current value on update, which is
      // what a Firestore merge means.
      const written = await client.from(route.table).upsert(toRow(route, ref.id, data, merge), {
        onConflict: 'user_id,id',
        defaultToNull: false,
      })
      if (written.error) throw supabaseError(written.error)
      return
    }
    const result = await client.rpc('astra_set_document', {
      p_namespace: ref.path,
      p_doc_id: ref.id,
      p_data: serialise(data),
      p_merge: options?.merge === true,
    })
    if (result.error) throw supabaseError(result.error)
    if (DUAL_WRITE_TO_FIRESTORE.has(ref.path)) void mirrorToFirestore(ref, data, options)
  }

  // Best effort, after the Supabase write has succeeded: Supabase is the
  // record the app reads back, and the Firestore copy only feeds functions
  // that have not moved yet. A failure is logged, not surfaced — the save the
  // user asked for did happen.
  async function mirrorToFirestore(
    ref: CompatRef,
    data: JsonRecord,
    options?: { merge?: boolean },
  ) {
    // No Firebase sign-in, no Firestore to keep in step: nothing to mirror to,
    // and nothing worth a warning on every settings save.
    if (!(await getLegacy())) return
    try {
      const legacyResolved = await legacyTarget(ref)
      await legacyResolved.handle.fs.setDoc(legacyResolved.target, data, options)
    } catch (err) {
      console.warn(`[Aureon] Firestore mirror of ${ref.path}/${ref.id} failed:`, err)
    }
  }

  async function deleteDoc(ref: CompatRef) {
    if (usesLegacyFirestore(ref.path)) {
      const legacyResolved = await legacyTarget(ref)
      return legacyResolved.handle.fs.deleteDoc(legacyResolved.target)
    }
    const route = routeFor(ref.path, ENABLED_TABLES)
    if (route) {
      const removed = await client.from(route.table).delete().eq('id', ref.id)
      if (removed.error) throw supabaseError(removed.error)
      return
    }
    const result = await client.from(TABLE).delete().eq('namespace', ref.path).eq('doc_id', ref.id)
    if (result.error) throw supabaseError(result.error)
  }

  function onSnapshot(target: CompatRef | CompatQuery, ...rest: any[]) {
    if (usesLegacyFirestore(namespaceOf(target))) {
      let stopped = false
      let unsub: (() => void) | null = null
      const callbacks = rest.filter((value) => typeof value === 'function')
      const onError = callbacks[1] as ((error: unknown) => void) | undefined
      void legacyTarget(target)
        .then(({ handle, target: converted }) => {
          if (stopped) return
          unsub = handle.fs.onSnapshot(converted, ...rest)
        })
        .catch((error) => onError?.(error))
      return () => {
        stopped = true
        unsub?.()
      }
    }

    const callbacks = rest.filter((value) => typeof value === 'function')
    const next = callbacks[0] as ((snapshot: any) => void) | undefined
    const onError = callbacks[1] as ((error: unknown) => void) | undefined
    let stopped = false
    let running = false
    let queued = false
    let previous: Map<string, string> | undefined
    let channel: RealtimeChannel | null = null
    // Whether this listener has ever delivered. Until it has, a failure is a
    // failure to load and the caller must hear about it; after it has, the
    // caller is holding good data and a blip is this file's problem to recover.
    let delivered = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryDelay = RETRY_START_MS
    // While the channel is down, changes from other devices are not pushed, so
    // the data is re-read on a slow timer until the channel is back.
    let catchUpTimer: ReturnType<typeof setTimeout> | null = null
    let channelDown = false

    const scheduleRetry = () => {
      if (stopped || retryTimer) return
      retryTimer = setTimeout(() => {
        retryTimer = null
        void refresh()
      }, retryDelay)
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
    }

    const refresh = async () => {
      if (stopped) return
      if (running) {
        queued = true
        return
      }
      running = true
      try {
        do {
          queued = false
          if (isQuery(target) || target.__kind === 'collection') {
            const snap = querySnapshot(await fetchSupabase(target), previous)
            previous = snap.__state
            next?.(snap)
          } else {
            next?.(await getDoc(target))
          }
          delivered = true
          retryDelay = RETRY_START_MS
        } while (queued && !stopped)
      } catch (error) {
        if (stopped) return
        // Before the first delivery, or when access itself was refused, the
        // caller has to know. Anything else — a dropped connection, a laptop
        // waking up — is retried quietly with backoff: the screen already
        // shows good data, and a full-screen error for a network blip is worse
        // than a few seconds of staleness.
        const refused = (error as { code?: string })?.code === 'permission-denied'
        if (!delivered || refused) onError?.(error)
        else {
          console.warn('[Aureon] Supabase read failed; retrying:', error)
          scheduleRetry()
        }
      } finally {
        running = false
      }
    }

    const startCatchUp = () => {
      if (stopped || catchUpTimer) return
      catchUpTimer = setTimeout(() => {
        catchUpTimer = null
        void refresh()
        startCatchUp()
      }, CATCH_UP_MS)
    }
    const stopCatchUp = () => {
      if (catchUpTimer) clearTimeout(catchUpTimer)
      catchUpTimer = null
    }

    void refresh()
    const path = namespaceOf(target)
    const route = routeFor(path, ENABLED_TABLES)
    // A routed collection listens to its own table, narrowed to this user's
    // rows; everything else listens to its namespace in astra_documents.
    const uid = currentUid()
    const listen = route
      ? { table: route.table, filter: uid ? `user_id=eq.${uid}` : undefined }
      : { table: TABLE, filter: `namespace=eq.${path}` }
    channel = client
      .channel(`astra:${path}:${randomId()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          ...listen,
        },
        () => void refresh(),
      )
      .subscribe((status, err) => {
        if (stopped) return
        if (status === 'SUBSCRIBED') {
          // Back (or up for the first time). Anything that changed while the
          // channel was down was never pushed, so read once to catch up.
          if (channelDown) void refresh()
          channelDown = false
          stopCatchUp()
          return
        }
        channelDown = true
        // CHANNEL_ERROR, TIMED_OUT, CLOSED. Realtime rejoins the channel on
        // its own with backoff, so this is not the end of the listener — it
        // used to be reported as one, which put the full-screen "Sync
        // interrupted" card over the app for what was usually a network blip
        // or an expired token. Until the channel is back, poll.
        console.warn(`[Aureon] Supabase Realtime ${status.toLowerCase()} on ${path}:`, err ?? '')
        startCatchUp()
      })

    return () => {
      stopped = true
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = null
      stopCatchUp()
      if (channel) void client.removeChannel(channel)
      channel = null
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
      fromMillis: (ms: number) => ms,
      now: () => Date.now(),
    },
  }

  return {
    db: { __kind: 'supabase', client },
    fs,
  }
}
