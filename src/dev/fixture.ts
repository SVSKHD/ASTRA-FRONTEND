// A Firestore that never leaves the tab (section 38).
//
// The screenshot harness needs the app to render a known month. Two ways to get
// one: sign into the demo account and read the real collections, or serve the
// same seed from memory. Both exist, and this is the second — because a
// baseline you cannot take without credentials is a baseline nobody takes, and
// because a run that touches the network is a run that can fail for reasons
// that have nothing to do with the pixels.
//
// It implements exactly the surface `services/owned.ts` and the month listener
// use, and nothing else. That is deliberate: the moment it grows a feature the
// real SDK does not have, the screenshots stop being of the real app.
//
// DEV ONLY, and enforced twice — `import.meta.env.DEV` is statically false in a
// production build so the whole module is dropped by the bundler, and the flag
// has to be set as well.

import { SEED_SETTINGS, seedExpenses, seedSignals, seedTrades, type SeedTrade } from '@/dev/seed'
import {
  SEED_FEED_PULLED_AT,
  seedComments,
  seedFeedHealth,
  seedNews,
  seedPulls,
  seedRepos,
} from '@/dev/seedFeed'

export const DEMO_UID = 'demo-uid'

/** What the harness asked for: a forced state, or nothing. */
export type ForcedState = '' | 'empty' | 'loading' | 'error'

export function fixtureEnabled(): boolean {
  return import.meta.env.DEV && String(import.meta.env.VITE_FIXTURE ?? '') === '1'
}

export function forcedState(search = globalThis.location?.search ?? ''): ForcedState {
  const value = new URLSearchParams(search).get('state') ?? ''
  return (['empty', 'loading', 'error'] as const).includes(value as 'empty')
    ? (value as ForcedState)
    : ''
}

// ---- the store --------------------------------------------------------------

type Row = Record<string, unknown>
const store = new Map<string, Map<string, Row>>()

function stamp(ms: number) {
  return { toMillis: () => ms, toDate: () => new Date(ms) }
}

function collectionOf(name: string): Map<string, Row> {
  let rows = store.get(name)
  if (!rows) {
    rows = new Map()
    store.set(name, rows)
  }
  return rows
}

function tradeRow(t: SeedTrade): Row {
  return {
    userId: DEMO_UID,
    istDate: t.istDate,
    istTime: t.istTime,
    entryAt: t.entryAtMs ? stamp(t.entryAtMs) : null,
    exitAt: t.exitAtMs ? stamp(t.exitAtMs) : null,
    ts: stamp(t.entryAtMs || Date.parse(`${t.istDate}T00:00:00Z`)),
    brokerOffsetMinutes: t.brokerOffsetMinutes,
    timeEstimated: t.timeEstimated,
    symbol: t.symbol,
    session: t.session,
    side: t.side,
    lot: t.lot,
    entry: t.entry,
    exit: t.exit,
    move: t.move,
    pl: t.pl,
    note: t.note,
    signalId: t.signalId,
    createdAt: stamp(t.entryAtMs || 0),
  }
}

/** Fill the store from the seed. Idempotent — the ids are derived, not minted. */
export function loadFixture(state: ForcedState = ''): void {
  store.clear()
  const names = SEED_SETTINGS
  collectionOf('Astra-users').set(DEMO_UID, { ...SEED_SETTINGS })
  if (state === 'empty') return

  const trades = seedTrades()
  for (const t of trades) collectionOf(names.tradesCollection).set(t.id, tradeRow(t))
  for (const s of seedSignals(trades)) {
    collectionOf(names.dacoitCollection).set(s.id, {
      userId: DEMO_UID,
      signalId: s.signalId,
      signalAt: stamp(s.signalAtMs),
      receivedAt: stamp(s.signalAtMs + 1200),
      istDate: s.istDate,
      symbol: s.symbol,
      session: s.session,
      verdict: s.verdict,
      raw: s.raw,
      source: 'dacoit',
    })
  }
  for (const e of seedExpenses()) {
    collectionOf(names.expensesCollection).set(e.id, {
      userId: DEMO_UID,
      date: e.date,
      amount: e.amount,
      category: e.category,
      note: e.note,
      kind: e.kind,
      recurDay: e.recurDay ?? null,
      createdAt: stamp(Date.parse(`${e.date}T00:00:00Z`)),
    })
  }

  // The news and the GitHub mirror. These four are NOT named in the settings:
  // `forex` is shared by the rules and the three `gh-` collections are fixed,
  // so the fixture writes the same literal names the composables read.
  for (const n of seedNews()) {
    const { id, publishedAt, ...rest } = n
    collectionOf('forex').set(id, {
      ...rest,
      publishedAt: stamp(publishedAt),
      fetchedAt: stamp(SEED_FEED_PULLED_AT),
    })
  }
  collectionOf('forex').set('_health', {
    kind: 'feed-health',
    at: stamp(SEED_FEED_PULLED_AT),
    feeds: seedFeedHealth(),
  })
  for (const r of seedRepos()) {
    const { id, pushedAt, updatedAt, ...rest } = r
    collectionOf('gh-repos').set(id, {
      ...rest,
      userId: DEMO_UID,
      pushedAt: stamp(pushedAt),
      updatedAt: stamp(updatedAt),
    })
  }
  for (const p of seedPulls()) {
    const { id, createdAt, updatedAt, ...rest } = p
    collectionOf('gh-pulls').set(id, {
      ...rest,
      userId: DEMO_UID,
      createdAt: stamp(createdAt),
      updatedAt: stamp(updatedAt),
    })
  }
  for (const c of seedComments()) {
    const { id, createdAt, ...rest } = c
    collectionOf('gh-comments').set(id, {
      ...rest,
      userId: DEMO_UID,
      createdAt: stamp(createdAt),
    })
  }
}

// ---- the SDK surface, and only the parts that are used ----------------------

interface Ref {
  __kind: 'doc' | 'collection'
  path: string
  id: string
}
interface Constraint {
  kind: 'where' | 'orderBy' | 'limit'
  field?: string
  op?: string
  value?: unknown
  dir?: 'asc' | 'desc'
  count?: number
}
interface Query {
  __kind: 'query'
  path: string
  constraints: Constraint[]
}

let autoId = 0

function matches(row: Row, c: Constraint): boolean {
  const value = row[c.field ?? '']
  switch (c.op) {
    case '==':
      return value === c.value
    case 'in':
      return Array.isArray(c.value) && (c.value as unknown[]).includes(value)
    case '>=':
      return String(value ?? '') >= String(c.value)
    case '<=':
      return String(value ?? '') <= String(c.value)
    default:
      return true
  }
}

/**
 * Sortable form of a field.
 *
 * A timestamp sorts by its millis and a number by its value; anything else
 * falls back to its string. Comparing a timestamp as a string would order the
 * news by the letters of "[object Object]", which is no order at all.
 */
function sortable(value: unknown): number | string {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis(): number }).toMillis()
  }
  return typeof value === 'number' ? value : String(value ?? '')
}

function runQuery(q: Query) {
  const rows = [...collectionOf(q.path).entries()]
    .filter(([, row]) =>
      q.constraints.filter((c) => c.kind === 'where').every((c) => matches(row, c)),
    )
    .map(([id, data]) => ({ id, data }))
  const order = q.constraints.find((c) => c.kind === 'orderBy')
  if (order) {
    rows.sort((a, b) => {
      const av = sortable(a.data[order.field ?? ''])
      const bv = sortable(b.data[order.field ?? ''])
      return (av < bv ? -1 : av > bv ? 1 : 0) * (order.dir === 'desc' ? -1 : 1)
    })
  }
  const cap = q.constraints.find((c) => c.kind === 'limit')?.count
  return cap ? rows.slice(0, cap) : rows
}

function snapshotOf(q: Query) {
  const docs = runQuery(q).map(({ id, data }) => ({
    id,
    data: () => data,
    exists: () => true,
    metadata: { hasPendingWrites: false },
  }))
  return {
    docs,
    // A first snapshot is every document added, which is what the real SDK
    // reports too — so the row-flash reads nothing as modified, and the
    // screenshot is of a settled list rather than of one lit up all over.
    docChanges: () => docs.map((doc) => ({ type: 'added' as const, doc })),
  }
}

/**
 * The handle, shaped like `FirestoreHandle`.
 *
 * `loading` never calls back at all, which is how the harness holds a skeleton
 * still long enough to photograph it; `error` calls the error callback, which
 * is the only way to see that state without breaking something for real.
 */
export function fixtureHandle(state: ForcedState = '') {
  const fs = {
    collection: (_db: unknown, path: string): Ref => ({ __kind: 'collection', path, id: path }),
    doc: (a: unknown, b?: string, c?: string): Ref => {
      if (typeof b !== 'string') {
        // doc(collectionRef) — mint an id, the way the real SDK does.
        const ref = a as Ref
        autoId += 1
        return { __kind: 'doc', path: ref.path, id: `fixture-${autoId}` }
      }
      return { __kind: 'doc', path: b, id: c ?? '' }
    },
    query: (ref: Ref, ...constraints: Constraint[]): Query => ({
      __kind: 'query',
      path: ref.path,
      constraints,
    }),
    where: (field: string, op: string, value: unknown): Constraint => ({
      kind: 'where',
      field,
      op,
      value,
    }),
    orderBy: (field: string, dir: 'asc' | 'desc' = 'asc'): Constraint => ({
      kind: 'orderBy',
      field,
      dir,
    }),
    limit: (count: number): Constraint => ({ kind: 'limit', count }),
    onSnapshot: (target: Ref | Query, ...rest: unknown[]) => {
      const callbacks = rest.filter((r) => typeof r === 'function') as ((v: unknown) => void)[]
      const [next, onError] = callbacks
      if (state === 'loading') return () => {}
      if (state === 'error') {
        setTimeout(() => onError?.(new Error('Forced error state')), 0)
        return () => {}
      }
      setTimeout(() => {
        if ('__kind' in target && target.__kind === 'query') {
          next?.(snapshotOf(target as Query))
          return
        }
        const ref = target as Ref
        const row = collectionOf(ref.path).get(ref.id)
        next?.({ exists: () => Boolean(row), data: () => row, id: ref.id })
      }, 0)
      return () => {}
    },
    getDocs: async (q: Query) => snapshotOf(q),
    setDoc: async (ref: Ref, data: Row, options?: { merge?: boolean }) => {
      const rows = collectionOf(ref.path)
      rows.set(ref.id, options?.merge ? { ...(rows.get(ref.id) ?? {}), ...data } : data)
    },
    deleteDoc: async (ref: Ref) => {
      collectionOf(ref.path).delete(ref.id)
    },
    Timestamp: { fromMillis: (ms: number) => stamp(ms), now: () => stamp(Date.now()) },
    serverTimestamp: () => stamp(Date.now()),
  }
  return { db: {} as never, fs: fs as never }
}
