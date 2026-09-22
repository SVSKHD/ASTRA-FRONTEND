import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import type { Auth } from 'firebase/auth'

const TABLE = 'astra_documents'

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

const FIREBASE_MIRRORS = new Set(['forex', 'gh-repos', 'gh-pulls', 'gh-comments'])

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

export async function createSupabaseFirestoreHandle(
  auth: Auth | null,
  loadLegacy: LegacyFirestoreLoader,
) {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
  const key = String(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  ).trim()
  if (!url || !key) throw new Error('Supabase is not configured')

  // Supabase officially supports Firebase Auth as third-party auth. Returning
  // the current Firebase ID token here makes Postgres RLS, Storage and Realtime
  // see the same user without a second login or a client-side service key.
  const client = createClient(url, key, {
    accessToken: async () => (await auth?.currentUser?.getIdToken(false)) ?? null,
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
    if (!handle) throw new Error('Firebase mirror is unavailable')
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

  async function fetchSupabase(target: CompatRef | CompatQuery): Promise<SupabaseRow[]> {
    const q: CompatQuery = isQuery(target)
      ? target
      : { __kind: 'query', path: target.path, constraints: [] }

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
    const result = await client.rpc('astra_set_document', {
      p_namespace: ref.path,
      p_doc_id: ref.id,
      p_data: serialise(data),
      p_merge: options?.merge === true,
    })
    if (result.error) throw supabaseError(result.error)
  }

  async function deleteDoc(ref: CompatRef) {
    if (usesLegacyFirestore(ref.path)) {
      const legacyResolved = await legacyTarget(ref)
      return legacyResolved.handle.fs.deleteDoc(legacyResolved.target)
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
        } while (queued && !stopped)
      } catch (error) {
        if (!stopped) onError?.(error)
      } finally {
        running = false
      }
    }

    void refresh()
    const path = namespaceOf(target)
    channel = client
      .channel(`astra:${path}:${randomId()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLE,
          filter: `namespace=eq.${path}`,
        },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onError?.(new Error(`Supabase Realtime ${status.toLowerCase()}`))
        }
      })

    return () => {
      stopped = true
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
