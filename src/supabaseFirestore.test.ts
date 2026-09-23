// Where each call lands: a phase-2 table, the phase-1 JSONB store, or legacy
// Firestore (src/supabaseFirestore.ts).
//
// The Supabase client is replaced by a recorder, so these assert the request
// the adapter builds rather than what a network did with it. The SQL on the
// other side of those requests is tested for real in src/db/.
import { afterEach, describe, expect, it, vi } from 'vitest'

type Call = [string, ...unknown[]]

type Result = { data: unknown; error: unknown }

/** A chainable, awaitable stand-in for a supabase-js query builder. */
function recorder(result: Result = { data: [], error: null }) {
  const calls: Call[] = []
  // Scripted answers for single-document reads, in order; the last repeats.
  const singles: Result[] = [{ data: null, error: null }]
  const builder: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'gte', 'lte', 'in', 'order', 'limit', 'upsert', 'delete']) {
    builder[name] = (...args: unknown[]) => {
      calls.push([name, ...args])
      return builder
    }
  }
  builder.maybeSingle = () => {
    calls.push(['maybeSingle'])
    return Promise.resolve(singles.length > 1 ? singles.shift()! : singles[0])
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  // The realtime channel's status callback, so a test can drop and restore it.
  let status: ((s: string, err?: unknown) => void) | null = null
  const client = {
    from: (table: string) => {
      calls.push(['from', table])
      return builder
    },
    rpc: (name: string, args: unknown) => {
      calls.push(['rpc', name, args])
      return Promise.resolve({ data: null, error: null })
    },
    channel: () => ({
      on: () => ({
        subscribe: (cb: (s: string, err?: unknown) => void) => {
          status = cb
          return {}
        },
      }),
    }),
    removeChannel: () => Promise.resolve(),
    // The signed-in Supabase session the adapter reads the owner from.
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'uid-alice' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  }
  return {
    calls,
    client,
    singles,
    channelStatus: (s: string) => status?.(s),
    reads: () => calls.filter((c) => c[0] === 'maybeSingle').length,
  }
}

let current: ReturnType<typeof recorder>

const legacyCalls: Call[] = []
const legacy = async () => ({
  db: {},
  fs: {
    collection: (...a: unknown[]) => ({ col: a.slice(1) }),
    doc: (...a: unknown[]) => ({ doc: a.slice(1) }),
    query: (...a: unknown[]) => ({ q: a }),
    where: (...a: unknown[]) => a,
    orderBy: (...a: unknown[]) => a,
    limit: (...a: unknown[]) => a,
    getDocs: (t: unknown) => {
      legacyCalls.push(['getDocs', t])
      return Promise.resolve({ docs: [] })
    },
    setDoc: (t: unknown, data: unknown, opts: unknown) => {
      legacyCalls.push(['setDoc', t, data, opts])
      return Promise.resolve()
    },
  },
})

/**
 * The adapter over a recording client. `withFirestore: false` is production
 * since sign-in moved to Supabase: there is no Firebase sign-in, so no legacy
 * Firestore to read the function-written namespaces from.
 */
async function adapter(tables: string, rows: unknown[] = [], withFirestore = true) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_TABLES', tables)
  current = recorder({ data: rows, error: null })
  legacyCalls.length = 0
  const { createSupabaseFirestoreHandle } = await import('@/supabaseFirestore')
  return createSupabaseFirestoreHandle(
    current.client as never,
    (withFirestore ? legacy : async () => null) as never,
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('trading, with its tables switched on', () => {
  it('writes a trade to the trades table, keyed on owner and id', async () => {
    const { fs } = await adapter('trading')
    const ref = fs.doc(fs.collection(null, 'astra-trades'), 't1')
    await fs.setDoc(ref, { userId: 'uid-alice', istDate: '2026-09-04', lot: 0.5 })

    expect(current.calls[0]).toEqual(['from', 'trades'])
    const [, row, opts] = current.calls[1]
    expect(current.calls[1][0]).toBe('upsert')
    expect(row).toMatchObject({ id: 't1', user_id: 'uid-alice', ist_date: '2026-09-04', lot: 0.5 })
    expect(opts).toEqual({ onConflict: 'user_id,id', defaultToNull: false })
    // Nothing went to the JSONB store.
    expect(current.calls.some((c) => c[0] === 'rpc')).toBe(false)
  })

  it('runs the month query in Postgres, on columns, and reads rows back as documents', async () => {
    const { fs } = await adapter('trading', [
      { id: 't1', user_id: 'uid-alice', ist_date: '2026-09-04', lot: 0.5, signal_id: null },
    ])
    const snap = await fs.getDocs(
      fs.query(
        fs.collection(null, 'astra-trades'),
        fs.where('userId', '==', 'uid-alice'),
        fs.where('istDate', '>=', '2026-09-01'),
        fs.where('istDate', '<=', '2026-09-30'),
        fs.orderBy('istDate', 'asc'),
      ),
    )
    expect(current.calls).toEqual([
      ['from', 'trades'],
      ['select', '*'],
      ['eq', 'user_id', 'uid-alice'],
      ['gte', 'ist_date', '2026-09-01'],
      ['lte', 'ist_date', '2026-09-30'],
      ['order', 'ist_date', { ascending: true }],
    ])
    expect(snap.docs[0].id).toBe('t1')
    expect(snap.docs[0].data()).toMatchObject({
      userId: 'uid-alice',
      istDate: '2026-09-04',
      lot: 0.5,
      signalId: '',
    })
  })

  it('deletes from the table', async () => {
    const { fs } = await adapter('trading')
    await fs.deleteDoc(fs.doc(fs.collection(null, 'astra-expenses'), 'e1'))
    expect(current.calls).toEqual([['from', 'expenses'], ['delete'], ['eq', 'id', 'e1']])
  })
})

describe('trading, with its tables still off', () => {
  it('keeps using the JSONB store exactly as in phase 1', async () => {
    const { fs } = await adapter('')
    await fs.setDoc(fs.doc(fs.collection(null, 'astra-trades'), 't1'), { userId: 'uid-alice' })
    expect(current.calls).toEqual([
      [
        'rpc',
        'astra_set_document',
        {
          p_namespace: 'astra-trades',
          p_doc_id: 't1',
          p_data: { userId: 'uid-alice' },
          p_merge: false,
        },
      ],
    ])
  })
})

describe('staying live ("Sync interrupted")', () => {
  const workspace = { data: { data: { todos: [] } }, error: null }

  function listen(fs: Awaited<ReturnType<typeof adapter>>['fs']) {
    const onNext = vi.fn()
    const onError = vi.fn()
    const stop = fs.onSnapshot(
      fs.doc(fs.collection(null, 'aureon-notes'), 'uid-alice'),
      onNext,
      onError,
    )
    return { onNext, onError, stop }
  }

  it('does not report a dropped channel, and catches up when it is back', async () => {
    const { fs } = await adapter('')
    current.singles.splice(0, 1, workspace)
    const { onNext, onError } = listen(fs)
    await vi.waitFor(() => expect(onNext).toHaveBeenCalledTimes(1))
    current.channelStatus('SUBSCRIBED')

    current.channelStatus('CHANNEL_ERROR')
    current.channelStatus('TIMED_OUT')
    expect(onError).not.toHaveBeenCalled()

    // Realtime rejoined: whatever changed meanwhile was never pushed.
    current.channelStatus('SUBSCRIBED')
    await vi.waitFor(() => expect(onNext).toHaveBeenCalledTimes(2))
    expect(onError).not.toHaveBeenCalled()
  })

  it('polls while the channel stays down, and stops when it is back', async () => {
    vi.useFakeTimers()
    const { fs } = await adapter('')
    current.singles.splice(0, 1, workspace)
    const { onNext } = listen(fs)
    await vi.waitFor(() => expect(onNext).toHaveBeenCalledTimes(1))

    current.channelStatus('CLOSED')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(onNext).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(onNext).toHaveBeenCalledTimes(3)

    current.channelStatus('SUBSCRIBED')
    await vi.waitFor(() => expect(onNext).toHaveBeenCalledTimes(4))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(onNext).toHaveBeenCalledTimes(4)
  })

  it('still reports a first load that fails — there is nothing on screen yet', async () => {
    const { fs } = await adapter('')
    current.singles.splice(0, 1, { data: null, error: { message: 'offline' } })
    const { onNext, onError } = listen(fs)
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(onNext).not.toHaveBeenCalled()
  })

  it('retries a failed read quietly once data is on screen', async () => {
    vi.useFakeTimers()
    const { fs } = await adapter('')
    current.singles.splice(
      0,
      1,
      workspace,
      { data: null, error: { message: 'Failed to fetch' } },
      workspace,
    )
    const { onNext, onError } = listen(fs)
    await vi.waitFor(() => expect(onNext).toHaveBeenCalledTimes(1))

    current.channelStatus('SUBSCRIBED')
    current.channelStatus('CHANNEL_ERROR')
    current.channelStatus('SUBSCRIBED') // catch-up read → fails
    await vi.advanceTimersByTimeAsync(0)
    expect(onError).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2_000) // backoff retry → succeeds
    expect(onNext).toHaveBeenCalledTimes(2)
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports access being refused even after data was shown', async () => {
    const { fs } = await adapter('')
    current.singles.splice(0, 1, workspace, { data: null, error: { code: '42501' } })
    const { onNext, onError } = listen(fs)
    await vi.waitFor(() => expect(onNext).toHaveBeenCalledTimes(1))
    current.channelStatus('CHANNEL_ERROR')
    current.channelStatus('SUBSCRIBED')
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect((onError.mock.calls[0][0] as { code: string }).code).toBe('permission-denied')
  })

  it('stops every timer when the listener is torn down', async () => {
    vi.useFakeTimers()
    const { fs } = await adapter('')
    current.singles.splice(0, 1, workspace)
    const { onNext, stop } = listen(fs)
    await vi.waitFor(() => expect(onNext).toHaveBeenCalledTimes(1))
    current.channelStatus('CLOSED')
    stop()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(current.reads()).toBe(1)
  })
})

describe('data a Firebase function still writes or reads', () => {
  it('reads Dacoit signals from Firestore, where the function writes them', async () => {
    const { fs } = await adapter('trading')
    await fs.getDocs(fs.collection(null, 'astra-dacoit-signals'))
    expect(legacyCalls.map((c) => c[0])).toEqual(['getDocs'])
    expect(current.calls).toEqual([])
  })

  it('writes settings to Supabase and mirrors them to Firestore for the functions', async () => {
    const { fs } = await adapter('')
    const ref = fs.doc(fs.collection(null, 'Astra-users'), 'uid-alice')
    await fs.setDoc(ref, { trackedRepos: ['svskhd/astra-frontend'] }, { merge: true })
    // Supabase is the record the app reads back…
    expect(current.calls[0].slice(0, 2)).toEqual(['rpc', 'astra_set_document'])
    // …and the copy the GitHub and Dacoit functions read is kept in step.
    await vi.waitFor(() => expect(legacyCalls).toHaveLength(1))
    expect(legacyCalls[0][2]).toEqual({ trackedRepos: ['svskhd/astra-frontend'] })
    expect(legacyCalls[0][3]).toEqual({ merge: true })
  })

  it('does not mirror anything else', async () => {
    const { fs } = await adapter('')
    await fs.setDoc(fs.doc(fs.collection(null, 'aureon-notes'), 'uid-alice'), { todos: [] })
    await new Promise((r) => setTimeout(r, 0))
    expect(legacyCalls).toEqual([])
  })
})

describe('with sign-in on Supabase, and so no Firebase', () => {
  it('says why function-written data is unavailable, instead of failing vaguely', async () => {
    const { fs } = await adapter('trading', [], false)
    await expect(fs.getDocs(fs.collection(null, 'forex'))).rejects.toMatchObject({
      code: 'unavailable',
      message: expect.stringMatching(/still written by Firebase Functions/),
    })
  })

  it('saves settings to Supabase and does not try to copy them to Firestore', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fs } = await adapter('', [], false)
    await fs.setDoc(
      fs.doc(fs.collection(null, 'Astra-users'), 'uid-alice'),
      { theme: 'x' },
      { merge: true },
    )
    await new Promise((r) => setTimeout(r, 0))
    expect(current.calls[0].slice(0, 2)).toEqual(['rpc', 'astra_set_document'])
    // Nothing to mirror to, and nothing worth a warning on every save.
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('filters a table listener to the signed-in Supabase user', async () => {
    const channels: unknown[] = []
    const { fs } = await adapter('trading')
    // A channel that records the filter it was opened with.
    current.client.channel = (() => ({
      on: (_kind: string, filter: unknown) => {
        channels.push(filter)
        return { subscribe: () => ({}) }
      },
    })) as never
    fs.onSnapshot(fs.collection(null, 'astra-trades'), () => {})
    expect(channels[0]).toMatchObject({ table: 'trades', filter: 'user_id=eq.uid-alice' })
  })
})
