// @vitest-environment node
//
// The field ↔ column mapping for phase-2 tables (src/db/tableRoutes.ts).
//
// The round trips are the point: a document built by the app's own writer,
// through `toRow`, into the real table on PGlite, back out through `fromRow`
// and the app's own reader, must read exactly as the document read before the
// table existed. Anything the mapping loses shows up as a different trade.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { migration, supabaseLike } from '@/db/supabaseStub'
import {
  TABLE_ROUTES,
  columnFor,
  enabledDomains,
  fromRow,
  routeFor,
  toRow,
  type TableRoute,
} from '@/db/tableRoutes'
import { readTrade, tradeDocument, type TradeDraft } from '@/services/tradeDoc'
import { expenseDocument, readExpense } from '@/services/expenseDoc'
import { readSecured } from '@/composables/useSecured'
import { DEFAULT_LOGGER_SETTINGS } from '@/utils/tradeMath'
import type { AstraSettings } from '@/types'
import type { FirestoreModule } from '@/firebase'

const UID = 'uid-alice'
const CREATED = Date.parse('2026-09-04T09:11:00.000Z')

// The adapter's own stand-ins for Firestore's timestamp helpers: epoch ms.
const fsLike = {
  Timestamp: { fromMillis: (ms: number) => ms, now: () => CREATED },
  serverTimestamp: () => CREATED,
} as unknown as FirestoreModule

const settings = {
  ...DEFAULT_LOGGER_SETTINGS,
  contractSizes: { XAUUSD: 100 },
  brokerTimezone: '',
  brokerOffsetMinutes: 180,
} as unknown as AstraSettings

let db: PGlite

beforeAll(async () => {
  db = await supabaseLike()
  await db.exec(migration('20260922_firestore_compat.sql'))
  await db.exec(migration('20260923_normalise_trading.sql'))
}, 60_000)

/** Insert exactly the columns `toRow` produced, the way PostgREST would. */
async function write(route: TableRoute, row: Record<string, unknown>) {
  const cols = Object.keys(row)
  const list = cols.map((c) => `"${c}"`).join(', ')
  await db.query(
    `insert into public.${route.table} (${list})
       select ${list} from jsonb_populate_record(null::public.${route.table}, $1::jsonb)`,
    [JSON.stringify(row)],
  )
}

async function readBack(route: TableRoute, id: string) {
  const { rows } = await db.query<{ row: Record<string, unknown> }>(
    `select to_jsonb(t) as row from public.${route.table} t where id = $1`,
    [id],
  )
  return fromRow(route, rows[0].row)
}

describe('round trips through the real tables', () => {
  it('a trade reads back exactly as its document did', async () => {
    const route = TABLE_ROUTES['astra-trades']
    const draft: TradeDraft = {
      istDate: '2026-09-04',
      istTime: '14:05',
      exitTime: '14:40',
      symbol: 'xauusd',
      session: 'London',
      side: 'sell',
      lot: 0.5,
      entry: 2500.5,
      exit: 2490.25,
      note: 'clean',
      signalId: 'XAU-LDN-1',
      timeEstimated: true,
    }
    const doc = { ...tradeDocument(draft, settings, fsLike), userId: UID }

    await write(route, toRow(route, 'rt-1', doc, false))
    const back = await readBack(route, 'rt-1')

    expect(back.id).toBe('rt-1')
    expect(readTrade('rt-1', back.data)).toEqual(readTrade('rt-1', doc))
  })

  it('a trade with no signal and no close keeps both empty', async () => {
    const route = TABLE_ROUTES['astra-trades']
    const doc = {
      ...tradeDocument(
        {
          istDate: '2026-09-05',
          istTime: '09:00',
          exitTime: '',
          symbol: 'EURUSD',
          session: 'Asia',
          side: 'buy',
          lot: 1,
          entry: 1.1,
          exit: 1.1,
          note: '',
        },
        settings,
        fsLike,
      ),
      userId: UID,
    }
    await write(route, toRow(route, 'rt-2', doc, false))
    const { rows } = await db.query<{ signal_id: string | null; exit_at: string | null }>(
      `select signal_id, exit_at from public.trades where id = 'rt-2'`,
    )
    // Stored as absent, not as an empty string or an epoch-zero instant…
    expect(rows[0]).toEqual({ signal_id: null, exit_at: null })
    // …and read back as the app always read them.
    const back = await readBack(route, 'rt-2')
    expect(readTrade('rt-2', back.data)).toEqual(readTrade('rt-2', doc))
  })

  it('an expense reads back exactly as its document did', async () => {
    const route = TABLE_ROUTES['astra-expenses']
    const doc = {
      ...expenseDocument(
        { date: '2026-09-02', amount: -120.555, category: '', note: 'vps', kind: 'recurring' },
        fsLike,
      ),
      userId: UID,
    }
    await write(route, toRow(route, 'rt-e', doc, false))
    const back = await readBack(route, 'rt-e')
    expect(readExpense('rt-e', back.data)).toEqual(readExpense('rt-e', doc))
  })

  it('a withdrawal reads back exactly as its document did', async () => {
    const route = TABLE_ROUTES['astra-secured']
    const doc = { date: '2026-09-03', amt: 1000, note: 'payout', createdAt: CREATED, userId: UID }
    await write(route, toRow(route, 'rt-s', doc, false))
    const back = await readBack(route, 'rt-s')
    expect(readSecured('rt-s', back.data)).toEqual(readSecured('rt-s', doc))
  })
})

describe('writes', () => {
  const route = TABLE_ROUTES['astra-trades']

  it('a replace fills every column, missing fields from their defaults', () => {
    const row = toRow(route, 't', { userId: UID, istDate: '2026-09-04' }, false)
    expect(row).toMatchObject({
      id: 't',
      user_id: UID,
      ist_date: '2026-09-04',
      lot: 1,
      note: '',
      // Absent, not '' — the same as a trade saved with no signal.
      signal_id: null,
      time_estimated: false,
      exit_at: null,
    })
    expect(Object.keys(row)).toHaveLength(route.columns.length + 1)
  })

  it('a merge sends only what it was given, so the rest of the row is untouched', () => {
    expect(toRow(route, 't', { note: 'edited', userId: UID }, true)).toEqual({
      id: 't',
      user_id: UID,
      note: 'edited',
    })
  })
})

describe('switching domains on', () => {
  it('reads the setting leniently and ignores what it does not know', () => {
    expect([...enabledDomains(' Trading , nonsense,')]).toEqual(['trading'])
    expect(enabledDomains(undefined).size).toBe(0)
  })

  it('routes a collection only when its domain is on', () => {
    expect(routeFor('astra-trades', enabledDomains(''))).toBeNull()
    expect(routeFor('astra-trades', enabledDomains('trading'))?.table).toBe('trades')
    // Signals stay on Firestore until their writer moves (phase 4).
    expect(routeFor('astra-dacoit-signals', enabledDomains('trading'))).toBeNull()
    // A renamed collection is not a table.
    expect(routeFor('my-trades', enabledDomains('trading'))).toBeNull()
  })

  it('refuses a query on a field the table does not have', () => {
    const route = TABLE_ROUTES['astra-trades']
    // Silently dropping the filter would return every row instead of none.
    expect(() => columnFor(route, 'nope')).toThrow(/no column for field "nope"/)
    expect(columnFor(route, 'userId')).toBe('user_id')
  })
})
