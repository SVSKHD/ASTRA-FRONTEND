// @vitest-environment node
//
// Moving a user's rows from the Firebase uid to the Supabase Auth id
// (supabase/migrations/20260924_remap_user_to_supabase_auth.sql), on real
// Postgres with the phase-1 and phase-2 migrations applied first.
import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, migration, supabaseLike } from '@/db/supabaseStub'

const OLD = 'iDsFXyP3wWUlDE9ehZZag35iFxx1'
const NEW = '0b6a4c5e-8a61-4c3e-9d2b-5d1f0e7c9a11'
const OTHER = 'someone-else'

let db: PGlite

async function doc(ns: string, id: string, uid: string, data: unknown) {
  await db.query(
    `insert into public.astra_documents (namespace, doc_id, user_id, data) values ($1, $2, $3, $4)`,
    [ns, id, uid, JSON.stringify(data)],
  )
}

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows
}

beforeEach(async () => {
  db = await supabaseLike()
  await db.exec(migration('20260922_firestore_compat.sql'))
  // The old account's data, as phase 1 imported it.
  await doc('aureon-notes', OLD, OLD, { ownerId: OLD, todos: [{ id: 1, text: 'real work' }] })
  await doc('Astra-users', OLD, OLD, { theme: 'midnight' })
  await doc('astra-trades', 't1', OLD, { userId: OLD, istDate: '2026-09-04', pl: 50 })
  await doc('aureon-shares', 'sh1', OLD, { ownerId: OLD, isPublic: true, item: {} })
  // Somebody else, who must not be touched.
  await doc('aureon-notes', OTHER, OTHER, { ownerId: OTHER })
  await db.exec(migration('20260923_normalise_trading.sql'))
  await db.exec(migration('20260924_remap_user_to_supabase_auth.sql'))
  // First sign-in with Supabase: the app saw an empty account and seeded one.
  await doc('aureon-notes', NEW, NEW, { ownerId: NEW, todos: [] })
}, 60_000)

describe('the dry run', () => {
  it('counts what would move and changes nothing', async () => {
    const report = await rows(`select * from public.astra_remap_user($1, $2)`, [OLD, NEW])
    expect(report).toEqual([
      { what: 'new-account documents set aside (aureon-notes, Astra-users)', affected: 1 },
      { what: 'astra_documents rows', affected: 4 },
      { what: 'trades', affected: 1 },
      { what: 'expenses', affected: 0 },
      { what: 'secured', affected: 0 },
      { what: 'DRY RUN — nothing changed; pass true to apply', affected: null },
    ])
    expect(
      await rows(`select count(*)::int as n from public.astra_documents where user_id = $1`, [OLD]),
    ).toEqual([{ n: 4 }])
  })
})

describe('applying it', () => {
  beforeEach(async () => {
    await db.query(`select * from public.astra_remap_user($1, $2, true)`, [OLD, NEW])
  })

  it('moves the workspace to the new id, owner fields and all', async () => {
    expect(
      await rows(
        `select doc_id, user_id, data from public.astra_documents where namespace = 'aureon-notes' and doc_id = $1`,
        [NEW],
      ),
    ).toEqual([
      { doc_id: NEW, user_id: NEW, data: { ownerId: NEW, todos: [{ id: 1, text: 'real work' }] } },
    ])
    expect(
      await rows(`select data from public.astra_documents where namespace = 'astra-trades'`),
    ).toEqual([{ data: { userId: NEW, istDate: '2026-09-04', pl: 50 } }])
  })

  it('keeps the empty workspace the first sign-in made, out of the way', async () => {
    const aside = await rows(
      `select doc_id, data from public.astra_documents where namespace = 'aureon-notes' and doc_id like $1`,
      [`${NEW}__before-remap-%`],
    )
    expect(aside).toHaveLength(1)
    expect(aside[0].data).toEqual({ ownerId: NEW, todos: [] })
  })

  it('moves the normalised trading rows', async () => {
    expect(await rows(`select user_id, id from public.trades`)).toEqual([
      { user_id: NEW, id: 't1' },
    ])
  })

  it('leaves nothing behind under the old id, and nobody else is touched', async () => {
    expect(
      await rows(
        `select count(*)::int as n from public.astra_documents where user_id = $1 or doc_id = $1`,
        [OLD],
      ),
    ).toEqual([{ n: 0 }])
    expect(
      await rows(`select user_id, data from public.astra_documents where doc_id = $1`, [OTHER]),
    ).toEqual([{ user_id: OTHER, data: { ownerId: OTHER } }])
  })

  it('is what the new account can now read through row-level security', async () => {
    const seen = await asUser(db, NEW, () =>
      rows(`select namespace from public.astra_documents order by namespace, doc_id`),
    )
    expect(seen.map((r) => r.namespace)).toEqual([
      'Astra-users',
      'astra-trades',
      'aureon-notes',
      'aureon-notes', // the set-aside empty one is still theirs
      'aureon-shares',
    ])
  })
})

describe('guards', () => {
  it('refuses the same id twice, or an empty one', async () => {
    await expect(db.query(`select * from public.astra_remap_user($1, $1)`, [OLD])).rejects.toThrow(
      /two different, non-empty/,
    )
    await expect(db.query(`select * from public.astra_remap_user('', $1)`, [NEW])).rejects.toThrow(
      /two different, non-empty/,
    )
  })

  it('cannot be called by a signed-in user', async () => {
    await expect(
      asUser(db, NEW, () => db.query(`select * from public.astra_remap_user($1, $2)`, [OLD, NEW])),
    ).rejects.toThrow(/permission denied/)
  })
})
