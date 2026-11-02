// The Aureon data adapter against a stubbed API (no network, no backend): the
// row and document mapping, client-minted ids and replays, decimal money, the
// shared change poller, and how a listener applies rows and tombstones.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAureonClient } from '@/api/client'
import {
  createAureonFirestoreHandle,
  createChangePoller,
  decimalString,
  type ChangeBatch,
  type ChangePoller,
} from './aureonFirestore'

const T0 = '2026-11-01T10:00:00+00:00'
const T1 = '2026-11-01T10:05:00+00:00'
const T2 = '2026-11-01T10:10:00+00:00'

interface Sent {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
}

function tradeRow(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    ist_date: '2026-11-01',
    ist_time: '15:30',
    entry_at: '2026-11-01T10:00:00Z',
    exit_at: null,
    ts: '2026-11-01T10:00:00Z',
    broker_offset_minutes: 120,
    symbol: 'XAUUSD',
    session: 'London',
    side: 'buy',
    lot: '0.5',
    entry: '2650.1',
    exit: '2652.35',
    move: '2.25',
    pl: '112.5',
    note: '',
    signal_id: null,
    time_estimated: false,
    created_at: T0,
    updated_at: T0,
    ...extra,
  }
}

type Handler = (req: Sent) => [number, unknown] | undefined

function stub(handler: Handler) {
  const sent: Sent[] = []
  const fetchImpl = (async (input: Request) => {
    const url = new URL(input.url)
    const text = input.method === 'GET' || input.method === 'DELETE' ? '' : await input.text()
    const req: Sent = {
      method: input.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: text ? JSON.parse(text) : undefined,
    }
    sent.push(req)
    const [status, body] = handler(req) ?? [404, { detail: 'not found' }]
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return { sent, client: createAureonClient('http://aureon.test', fetchImpl) }
}

/** A poller the test drives by hand. */
function manualPoller() {
  const subs = new Set<(b: ChangeBatch) => void>()
  let kicks = 0
  const poller: ChangePoller = {
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    kick() {
      kicks++
    },
    get size() {
      return subs.size
    },
  }
  const push = (b: Partial<ChangeBatch>) => {
    const batch: ChangeBatch = {
      cursor: T2,
      truncated: false,
      trades: [],
      expenses: [],
      secured: [],
      documents: [],
      deleted: [],
      ...b,
    } as ChangeBatch
    for (const fn of [...subs]) fn(batch)
  }
  return { poller, push, kicks: () => kicks }
}

const PAGE = (items: unknown[]) => ({ items, total: items.length, limit: 500, offset: 0 })

async function settle() {
  for (let i = 0; i < 6; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('decimalString', () => {
  it('writes money exactly, at most 8 decimals, without float noise', () => {
    expect(decimalString(0.1 + 0.2)).toBe('0.3')
    expect(decimalString(112.5)).toBe('112.5')
    expect(decimalString(-3)).toBe('-3')
    expect(decimalString(1 / 3)).toBe('0.33333333')
    expect(decimalString(Number.NaN)).toBe('0')
  })
})

describe('the Aureon data handle', () => {
  it('writes a trade to /api/finance/trades at its client-minted id, money as strings', async () => {
    const { sent, client } = stub((r) => (r.method === 'POST' ? [201, tradeRow('t1')] : undefined))
    const m = manualPoller()
    const { fs, db } = createAureonFirestoreHandle({ client, uid: () => 'u1', poller: m.poller })
    await fs.setDoc(fs.doc(db, 'astra-trades', 't1'), {
      userId: 'u1',
      istDate: '2026-11-01',
      istTime: '15:30',
      entryAt: 1_793_527_200_000,
      exitAt: null,
      ts: 1_793_527_200_000,
      brokerOffsetMinutes: 120,
      symbol: 'XAUUSD',
      session: 'London',
      side: 'buy',
      lot: 0.5,
      entry: 2650.1,
      exit: 2652.35,
      move: 2.25,
      pl: 0.1 + 0.2,
      note: '',
      signalId: '',
      timeEstimated: false,
      createdAt: Date.now(),
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('POST')
    expect(sent[0].path).toBe('/api/finance/trades')
    const body = sent[0].body as Record<string, unknown>
    expect(body.id).toBe('t1')
    expect(body.pl).toBe('0.3')
    expect(body.lot).toBe('0.5')
    expect(body.signal_id).toBeNull()
    // The server owns the owner and the creation time.
    expect(body).not.toHaveProperty('user_id')
    expect(body).not.toHaveProperty('created_at')
    expect(m.kicks()).toBe(1)
  })

  it('turns a replay (409) into a PATCH of the same row, so no second trade appears', async () => {
    const { sent, client } = stub((r) => {
      if (r.method === 'POST') return [409, { detail: { code: 'exists' } }]
      if (r.method === 'PATCH') return [200, tradeRow('t1')]
    })
    const { fs, db } = createAureonFirestoreHandle({ client, poller: manualPoller().poller })
    await fs.setDoc(fs.doc(db, 'astra-trades', 't1'), { istDate: '2026-11-01', pl: 5 })
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      'POST /api/finance/trades',
      'PATCH /api/finance/trades/t1',
    ])
    expect(sent[1].body).not.toHaveProperty('id')
    expect((sent[1].body as Record<string, unknown>).pl).toBe('5')
  })

  it('reads a month of expenses with the day range, money back as numbers', async () => {
    const { sent, client } = stub((r) =>
      r.path === '/api/finance/expenses'
        ? [
            200,
            PAGE([
              {
                id: 'e1',
                date: '2026-11-03',
                amount: '12.40',
                category: 'Data',
                note: '',
                kind: 'one-off',
                recur_day: null,
                created_at: T0,
                updated_at: T0,
              },
            ]),
          ]
        : undefined,
    )
    const { fs, db } = createAureonFirestoreHandle({
      client,
      uid: () => 'u1',
      poller: manualPoller().poller,
    })
    const snap = await fs.getDocs(
      fs.query(
        fs.collection(db, 'astra-expenses'),
        fs.where('userId', '==', 'u1'),
        fs.where('date', '>=', '2026-11-01'),
        fs.where('date', '<=', '2026-11-30'),
        fs.orderBy('date', 'asc'),
      ),
    )
    expect(sent[0].query).toMatchObject({
      date_from: '2026-11-01',
      date_to: '2026-11-30',
      limit: '500',
    })
    expect(snap.size).toBe(1)
    expect(snap.docs[0].data()).toMatchObject({
      userId: 'u1',
      amount: 12.4,
      category: 'Data',
      recurDay: null,
    })
  })

  it('stores settings and the workspace as documents, merge as PUT merge', async () => {
    const { sent, client } = stub((r) => {
      if (r.method === 'PUT')
        return [200, { namespace: 'Astra-users', doc_id: 'u1', data: { a: 1 }, updated_at: T0 }]
      if (r.path === '/api/finance/documents/aureon-notes/u1') return [404, { detail: 'nope' }]
    })
    const { fs, db } = createAureonFirestoreHandle({ client, poller: manualPoller().poller })
    await fs.setDoc(fs.doc(db, 'Astra-users', 'u1'), { budget: 10 }, { merge: true })
    expect(sent[0]).toMatchObject({
      method: 'PUT',
      path: '/api/finance/documents/Astra-users/u1',
      body: { data: { budget: 10 }, merge: true },
    })
    const missing = await fs.getDoc(fs.doc(db, 'aureon-notes', 'u1'))
    expect(missing.exists()).toBe(false)
  })

  it('reports the GitHub mirror as unavailable instead of an empty list', async () => {
    const { sent, client } = stub(() => undefined)
    const { fs, db } = createAureonFirestoreHandle({ client, poller: manualPoller().poller })
    await expect(fs.getDocs(fs.collection(db, 'gh-repos'))).rejects.toMatchObject({
      code: 'unavailable',
    })
    await expect(fs.getDocs(fs.collection(db, 'users', 'u1', 'sessions'))).rejects.toMatchObject({
      code: 'unavailable',
    })
    expect(sent).toEqual([])
  })

  it('maps a refusal to the code the diagnostics read', async () => {
    const { client } = stub(() => [403, { detail: 'csrf' }])
    const { fs, db } = createAureonFirestoreHandle({ client, poller: manualPoller().poller })
    await expect(fs.deleteDoc(fs.doc(db, 'astra-secured', 's1'))).rejects.toMatchObject({
      code: 'permission-denied',
    })
  })

  it('applies changes to a live month: updates, moves out of range, and deletes', async () => {
    const { client } = stub((r) =>
      r.path === '/api/finance/trades' ? [200, PAGE([tradeRow('t1'), tradeRow('t2')])] : undefined,
    )
    const m = manualPoller()
    const { fs, db } = createAureonFirestoreHandle({ client, uid: () => 'u1', poller: m.poller })
    const seen: string[][] = []
    const kinds: string[][] = []
    const stop = fs.onSnapshot(
      fs.query(
        fs.collection(db, 'astra-trades'),
        fs.where('istDate', '>=', '2026-11-01'),
        fs.where('istDate', '<=', '2026-11-30'),
        fs.orderBy('istDate', 'asc'),
      ),
      { includeMetadataChanges: true },
      (snap: {
        docs: { id: string; data(): Record<string, unknown> }[]
        docChanges(): { type: string }[]
      }) => {
        seen.push(snap.docs.map((d) => `${d.id}:${d.data().pl}`))
        kinds.push(snap.docChanges().map((c) => c.type))
      },
    )
    await settle()
    expect(seen.at(-1)).toEqual(['t1:112.5', 't2:112.5'])

    // An edit from another device, a row moved to October, a new row.
    m.push({
      trades: [
        tradeRow('t1', { pl: '-20', updated_at: T1 }),
        tradeRow('t2', { ist_date: '2026-10-31', updated_at: T1 }),
        tradeRow('t3', { updated_at: T1 }),
      ] as never,
    })
    expect(seen.at(-1)).toEqual(['t1:-20', 't3:112.5'])
    expect(kinds.at(-1)?.sort()).toEqual(['added', 'modified', 'removed'])

    // A delete newer than the row removes it; one older than a re-created row does not.
    m.push({
      trades: [tradeRow('t3', { updated_at: T2 })] as never,
      deleted: [
        { kind: 'trades', ref: 't1', deleted_at: T2 },
        { kind: 'trades', ref: 't3', deleted_at: T1 },
        { kind: 'expenses', ref: 't3', deleted_at: T2 },
      ],
    })
    expect(seen.at(-1)).toEqual(['t3:112.5'])
    stop()
    expect(m.poller.size).toBe(0)
  })

  it('follows one document, including its tombstone', async () => {
    const { client } = stub((r) =>
      r.path === '/api/finance/documents/aureon-notes/u1'
        ? [200, { namespace: 'aureon-notes', doc_id: 'u1', data: { v: 1 }, updated_at: T0 }]
        : undefined,
    )
    const m = manualPoller()
    const { fs, db } = createAureonFirestoreHandle({ client, poller: m.poller })
    const seen: unknown[] = []
    fs.onSnapshot(
      fs.doc(db, 'aureon-notes', 'u1'),
      (snap: { exists(): boolean; data(): unknown }) =>
        seen.push(snap.exists() ? snap.data() : null),
    )
    await settle()
    m.push({
      documents: [
        { namespace: 'aureon-notes', doc_id: 'other', data: { v: 9 }, updated_at: T1 },
        { namespace: 'aureon-notes', doc_id: 'u1', data: { v: 2 }, updated_at: T1 },
      ],
    })
    m.push({ deleted: [{ kind: 'document', ref: 'aureon-notes/u1', deleted_at: T2 }] })
    expect(seen).toEqual([{ v: 1 }, { v: 2 }, null])
  })

  it('reports a failed first read to the listener', async () => {
    const { client } = stub(() => [500, { detail: 'boom' }])
    const m = manualPoller()
    const { fs, db } = createAureonFirestoreHandle({ client, poller: m.poller })
    const errors: unknown[] = []
    fs.onSnapshot(
      fs.collection(db, 'aureon-shares'),
      () => {},
      (err: unknown) => errors.push(err),
    )
    await settle()
    expect(errors).toHaveLength(1)
    expect(m.poller.size).toBe(0)
  })
})

describe('the change poller', () => {
  it('shares one poll, follows a truncated batch at once, and backs off on errors', async () => {
    vi.useFakeTimers()
    let failNext = false
    const { sent, client } = stub((r) => {
      if (r.path !== '/api/finance/changes') return undefined
      if (failNext) {
        failNext = false
        return [503, { detail: 'down' }]
      }
      const truncated = r.query.since === 'c1'
      return [
        200,
        {
          cursor: truncated ? 'c2' : 'c1',
          truncated,
          trades: [],
          expenses: [],
          secured: [],
          documents: [],
          deleted: [],
        },
      ]
    })
    const poller = createChangePoller(client, { intervalMs: 1000, maxIntervalMs: 8000, doc: null })
    const a: string[] = []
    const b: string[] = []
    const stopA = poller.subscribe((x) => a.push(x.cursor))
    poller.subscribe((x) => b.push(x.cursor))

    await vi.advanceTimersByTimeAsync(1000)
    expect(a).toEqual(['c1'])
    expect(b).toEqual(['c1'])
    // The first cursor reaches back, to cover clock skew.
    expect(sent[0].query.since).toMatch(/Z$/)

    await vi.advanceTimersByTimeAsync(1000)
    // since=c1 came back truncated, so c2 was asked for straight away.
    expect(a).toEqual(['c1', 'c2', 'c1'])

    failNext = true
    const before = sent.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(sent.length).toBe(before + 1)
    // Backed off: nothing at the normal interval, a retry at double it.
    await vi.advanceTimersByTimeAsync(1000)
    expect(sent.length).toBe(before + 1)
    await vi.advanceTimersByTimeAsync(1000)
    // The retry (since=c1, truncated) and its follow-up (since=c2).
    expect(sent.length).toBe(before + 3)

    stopA()
    expect(poller.size).toBe(1)
  })

  it('does not poll while the tab is hidden, and polls on return', async () => {
    vi.useFakeTimers()
    const { sent, client } = stub(() => [
      200,
      { cursor: 'c', trades: [], expenses: [], secured: [], documents: [], deleted: [] },
    ])
    let state: DocumentVisibilityState = 'hidden'
    const handlers: Array<() => void> = []
    const doc = {
      get visibilityState() {
        return state
      },
      addEventListener: (_: string, fn: () => void) => handlers.push(fn),
      removeEventListener: () => {},
    } as unknown as Document
    const poller = createChangePoller(client, { intervalMs: 1000, doc })
    poller.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(5000)
    expect(sent).toHaveLength(0)
    state = 'visible'
    handlers.forEach((fn) => fn())
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toHaveLength(1)
  })
})
