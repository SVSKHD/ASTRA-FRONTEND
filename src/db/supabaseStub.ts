// A Postgres that behaves enough like Supabase to run our migrations against.
//
// There is no Supabase CLI or Docker on the machines this runs on, so the SQL
// in supabase/migrations is checked against PGlite — real Postgres, compiled to
// WASM, in-process. What Supabase adds on top is small and is stubbed here:
//
//   • the `anon` / `authenticated` / `service_role` roles the policies name;
//   • `auth.jwt()`, which Supabase fills from the verified request token and
//     which every policy reads the owner from — here it reads a setting the
//     test sets, so "signed in as A" is one statement;
//   • the `supabase_realtime` publication the migrations add tables to.
//
// Nothing else is faked: the tables, policies, triggers and the copy out of
// astra_documents are the migration files, run verbatim.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')

export function migration(name: string): string {
  return readFileSync(join(MIGRATIONS, name), 'utf8')
}

export async function supabaseLike(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;

    create schema auth;
    grant usage on schema auth to anon, authenticated, service_role;
    create function auth.jwt() returns jsonb
      language sql stable
      as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant execute on function auth.jwt() to anon, authenticated, service_role;

    create publication supabase_realtime;
  `)
  return db
}

/** Run `work` as a signed-in user, the way a browser request reaches Postgres. */
export async function asUser<T>(db: PGlite, uid: string, work: () => Promise<T>): Promise<T> {
  await db.exec(`set request.jwt.claims = '${JSON.stringify({ sub: uid, role: 'authenticated' })}'`)
  await db.exec('set role authenticated')
  try {
    return await work()
  } finally {
    await db.exec('reset role')
    await db.exec(`reset request.jwt.claims`)
  }
}
