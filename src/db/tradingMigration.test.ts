// @vitest-environment node
//
// Phase 2, domain 1: trades, expenses and the secured ledger out of the JSONB
// compatibility table (supabase/migrations/20260923_normalise_trading.sql).
//
// Run against real Postgres (PGlite) with the phase-1 migration applied first
// and documents seeded in the shape phase 1 imported them: Firestore
// Timestamps as epoch milliseconds, the Firebase uid as the owner, and each
// user's renamed collection as its own namespace.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, migration, supabaseLike } from '@/db/supabaseStub'

const A = 'uid-alice'
const B = 'uid-bob'
const ms = (iso: string) => Date.parse(iso)

async function seed(db: PGlite) {
  const rows: [string, string, string, unknown][] = [
    // Alice: default collection names.
    [
      'astra-trades',
      't1',
      A,
      {
        userId: A,
        istDate: '2026-09-04',
        istTime: '14:05',
        entryAt: ms('2026-09-04T08:35:00Z'),
        exitAt: ms('2026-09-04T09:10:00Z'),
        ts: ms('2026-09-04T08:35:00Z'),
        brokerOffsetMinutes: 180,
        symbol: 'xauusd',
        session: 'London',
        side: 'sell',
        lot: 0.5,
        entry: 2500.5,
        exit: 2490.25,
        move: 10.25,
        pl: 512.5,
        note: 'clean',
        signalId: '',
        timeEstimated: false,
        createdAt: ms('2026-09-04T09:11:00Z'),
      },
    ],
    // A hand-edited row: bad numbers, no stored day — derived from entryAt in
    // IST (01:00 IST on the 5th is still 19:30 UTC on the 4th).
    [
      'astra-trades',
      't2',
      A,
      {
        userId: A,
        istDate: 'garbage',
        entryAt: ms('2026-09-04T19:30:00Z'),
        lot: 'abc',
        session: 'Tokyo',
        signalId: 'XAU-NY-1',
      },
    ],
    // No day and no instant: cannot be placed in a month.
    ['astra-trades', 't3', A, { userId: A, symbol: 'EURUSD' }],
    // A day that matches the pattern but does not exist. It used to pass the
    // pattern check, fail the cast, and abort the whole migration.
    [
      'astra-trades',
      't4',
      A,
      { userId: A, istDate: '2026-02-30', entryAt: ms('2026-02-27T05:00:00Z') },
    ],
    ['astra-expenses', 'e-bad', A, { userId: A, date: '2026-13-01', amount: 5 }],
    [
      'astra-expenses',
      'e1',
      A,
      {
        userId: A,
        date: '2026-09-02',
        amount: -120.5,
        category: '  ',
        note: 'vps',
        kind: 'recurring',
        recurDay: 2,
        createdAt: ms('2026-09-02T00:00:00Z'),
      },
    ],
    ['astra-secured', 's1', A, { userId: A, date: '2026-09-03', amt: 1000, note: 'payout' }],

    // Bob renamed his trades collection. The copy moved rows to `bob-trades`
    // and left the old collection behind, holding a row he later deleted.
    ['Astra-users', B, B, { tradesCollection: 'bob-trades' }],
    ['bob-trades', 'b1', B, { userId: B, istDate: '2026-09-01', symbol: 'GBPUSD', pl: -40 }],
    [
      'astra-trades',
      'b-stale',
      B,
      { userId: B, istDate: '2026-08-01', symbol: 'GBPUSD', note: 'deleted after the rename' },
    ],
  ]
  for (const [ns, id, uid, data] of rows) {
    await db.query(
      `insert into public.astra_documents (namespace, doc_id, user_id, data) values ($1, $2, $3, $4)`,
      [ns, id, uid, JSON.stringify(data)],
    )
  }
}

let db: PGlite

beforeAll(async () => {
  db = await supabaseLike()
  await db.exec(migration('20260922_firestore_compat.sql'))
  await seed(db)
  await db.exec(migration('20260923_normalise_trading.sql'))
}, 60_000)

describe('the copy out of astra_documents', () => {
  it('moves a trade across with typed columns', async () => {
    const { rows } = await db.query<Record<string, unknown>>(
      `select id, ist_date::text, ist_time, symbol, session, side, lot, entry, pl, note,
              signal_id, time_estimated, extract(epoch from entry_at) * 1000 as entry_ms,
              extract(epoch from exit_at) * 1000 as exit_ms
         from public.trades where user_id = $1 and id = 't1'`,
      [A],
    )
    expect(rows[0]).toMatchObject({
      ist_date: '2026-09-04',
      ist_time: '14:05',
      // Upper-cased on the way in, as `tradeDocument` does for new rows.
      symbol: 'XAUUSD',
      session: 'London',
      side: 'sell',
      lot: 0.5,
      entry: 2500.5,
      pl: 512.5,
      note: 'clean',
      // '' meant "no signal".
      signal_id: null,
      time_estimated: false,
    })
    expect(Number(rows[0].entry_ms)).toBe(ms('2026-09-04T08:35:00Z'))
    expect(Number(rows[0].exit_ms)).toBe(ms('2026-09-04T09:10:00Z'))
  })

  it('repairs what a hand edit broke instead of aborting the whole copy', async () => {
    const { rows } = await db.query<Record<string, unknown>>(
      `select ist_date::text, lot, session, signal_id from public.trades where user_id = $1 and id = 't2'`,
      [A],
    )
    expect(rows[0]).toEqual({
      // The day of the entry instant in IST, not in UTC.
      ist_date: '2026-09-05',
      lot: 1,
      session: 'London',
      signal_id: 'XAU-NY-1',
    })
  })

  it('reports a row it could not place rather than dropping it silently', async () => {
    const { rows } = await db.query<Record<string, unknown>>(
      `select target, user_id, doc_id from public.astra_trading_not_copied order by doc_id`,
    )
    expect(rows).toEqual([
      { target: 'expenses', user_id: A, doc_id: 'e-bad' },
      { target: 'trades', user_id: A, doc_id: 't3' },
    ])
  })

  it('treats an impossible day as absent instead of aborting', async () => {
    // 30 February is not a day; the entry instant still is.
    const { rows } = await db.query<{ ist_date: string }>(
      `select ist_date::text from public.trades where user_id = $1 and id = 't4'`,
      [A],
    )
    expect(rows).toEqual([{ ist_date: '2026-02-27' }])
  })

  it('stores expenses and withdrawals as sizes, with defaults for blanks', async () => {
    const expense = await db.query<Record<string, unknown>>(
      `select amount, category, kind, recur_day from public.expenses where user_id = $1`,
      [A],
    )
    expect(expense.rows).toEqual([
      { amount: 120.5, category: 'Other', kind: 'recurring', recur_day: 2 },
    ])
    const secured = await db.query<Record<string, unknown>>(
      `select amt, note from public.secured where user_id = $1`,
      [A],
    )
    expect(secured.rows).toEqual([{ amt: 1000, note: 'payout' }])
  })

  it('copies only the collection each user points at', async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from public.trades where user_id = $1 order by id`,
      [B],
    )
    // Bob's current collection; the row left in the old one stays behind,
    // because he deleted it after the rename.
    expect(rows.map((r) => r.id)).toEqual(['b1'])
  })

  it('can run again without undoing a newer edit', async () => {
    await db.query(
      `update public.trades set note = 'edited in the app' where user_id = $1 and id = 't1'`,
      [A],
    )
    await db.exec(migration('20260923_normalise_trading.sql'))
    const { rows } = await db.query<{ note: string; n: number }>(
      `select note, (select count(*)::int from public.trades) as n
         from public.trades where user_id = $1 and id = 't1'`,
      [A],
    )
    expect(rows[0]).toEqual({ note: 'edited in the app', n: 4 })
  })
})

describe('row-level security', () => {
  it('shows a user only their own rows', async () => {
    const ids = await asUser(db, B, async () =>
      (await db.query<{ id: string }>('select id from public.trades order by id')).rows.map(
        (r) => r.id,
      ),
    )
    expect(ids).toEqual(['b1'])
  })

  it('refuses a row written for someone else', async () => {
    await expect(
      asUser(db, B, () =>
        db.query(
          `insert into public.trades (user_id, id, ist_date) values ($1, 'forged', '2026-09-01')`,
          [A],
        ),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('stamps the owner from the token when the client leaves it out', async () => {
    await asUser(db, B, () =>
      db.query(`insert into public.secured (id, date, amt) values ('b-s1', '2026-09-09', 50)`),
    )
    const { rows } = await db.query<{ user_id: string }>(
      `select user_id from public.secured where id = 'b-s1'`,
    )
    expect(rows[0].user_id).toBe(B)
  })

  it('cannot touch another user’s row, or hand one over', async () => {
    const touched = await asUser(db, B, async () => {
      const upd = await db.query(`update public.trades set note = 'hijacked' where user_id = $1`, [
        A,
      ])
      const del = await db.query(`delete from public.expenses where user_id = $1`, [A])
      return [upd.affectedRows, del.affectedRows]
    })
    expect(touched).toEqual([0, 0])
    await expect(
      asUser(db, B, () => db.query(`update public.trades set user_id = $1 where id = 'b1'`, [A])),
    ).rejects.toThrow(/row-level security/)
  })

  it('shows a signed-out visitor nothing', async () => {
    await db.exec('set role anon')
    try {
      await expect(db.query('select * from public.trades')).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec('reset role')
    }
  })
})
