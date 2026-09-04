// Write the demo month into the demo account's real collections (section 38).
//
//   node scripts/seed.mjs            # writes
//   node scripts/seed.mjs --dry      # prints what it would write
//
// It needs Admin credentials, so it runs on the owner's machine and never in
// CI: point GOOGLE_APPLICATION_CREDENTIALS at a service-account key and set
// VITE_DEMO_UID in `.env.local`. Nothing here reads a password — the demo
// account's password is only ever used by the browser at `/dev/login`.
//
// THE SAME SEED THE FIXTURE SERVES. It imports `src/dev/seed.ts`, so the rows
// written here and the rows the harness renders offline are the same rows, and
// a screenshot taken against Firestore can be compared with one taken against
// the fixture.
//
// EVERY WRITE IS A `set` AT A DERIVED ID, so re-running replaces rather than
// duplicating — a seeder that appends is a seeder nobody dares run twice.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const DRY = process.argv.includes('--dry')

// `.env.local` is the only place the demo account's details live, and it is
// gitignored. Parsed rather than imported so this script needs no bundler.
function env(name) {
  if (process.env[name]) return process.env[name]
  try {
    const file = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const line = file.split('\n').find((l) => l.trim().startsWith(`${name}=`))
    return line ? line.slice(line.indexOf('=') + 1).trim() : ''
  } catch {
    return ''
  }
}

const UID = env('VITE_DEMO_UID')
if (!UID) {
  console.error("Set VITE_DEMO_UID in .env.local (the demo account's Firebase uid).")
  process.exit(1)
}

// The seed module is TypeScript; it is imported through the app's own build so
// there is exactly one copy of it. `npm run seed:demo` runs this with tsx-style
// resolution via vite-node when available, and falls back to a clear message.
let seed
try {
  seed = await import('../src/dev/seed.ts')
} catch {
  console.error(
    'Run this through the app toolchain so the TypeScript seed resolves:\n' +
      '  npx vite-node scripts/seed.mjs',
  )
  process.exit(1)
}

const { SEED_SETTINGS, seedExpenses, seedSignals, seedTrades } = seed
const trades = seedTrades()
const signals = seedSignals(trades)
const expenses = seedExpenses()

const plan = [
  { collection: 'Astra-users', id: UID, data: { ...SEED_SETTINGS } },
  ...trades.map((t) => ({
    collection: SEED_SETTINGS.tradesCollection,
    id: t.id,
    data: {
      userId: UID,
      istDate: t.istDate,
      istTime: t.istTime,
      entryAtMs: t.entryAtMs,
      exitAtMs: t.exitAtMs,
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
    },
  })),
  ...signals.map((s) => ({
    collection: SEED_SETTINGS.dacoitCollection,
    id: s.id,
    data: {
      userId: UID,
      signalId: s.signalId,
      signalAtMs: s.signalAtMs,
      istDate: s.istDate,
      symbol: s.symbol,
      session: s.session,
      verdict: s.verdict,
      raw: s.raw,
      source: 'dacoit',
    },
  })),
  ...expenses.map((e) => ({
    collection: SEED_SETTINGS.expensesCollection,
    id: e.id,
    data: {
      userId: UID,
      date: e.date,
      amount: e.amount,
      category: e.category,
      note: e.note,
      kind: e.kind,
      recurDay: e.recurDay ?? null,
    },
  })),
]

if (DRY) {
  const counts = plan.reduce((acc, row) => {
    acc[row.collection] = (acc[row.collection] ?? 0) + 1
    return acc
  }, {})
  console.log(`${plan.length} documents for ${UID}:`)
  for (const [name, n] of Object.entries(counts)) console.log(`  ${name}: ${n}`)
  process.exit(0)
}

const { initializeApp, applicationDefault } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
initializeApp({ credential: applicationDefault() })
const db = getFirestore()

// The epoch fields become real Timestamps here rather than in the seed module,
// because the fixture has no Firestore to make one with and the seed has to
// stay importable by both.
function withStamps(data) {
  const out = { ...data }
  if ('entryAtMs' in out) {
    out.entryAt = out.entryAtMs ? Timestamp.fromMillis(out.entryAtMs) : null
    out.exitAt = out.exitAtMs ? Timestamp.fromMillis(out.exitAtMs) : null
    out.ts = Timestamp.fromMillis(out.entryAtMs || Date.parse(`${out.istDate}T00:00:00Z`))
    delete out.entryAtMs
    delete out.exitAtMs
  }
  if ('signalAtMs' in out) {
    out.signalAt = Timestamp.fromMillis(out.signalAtMs)
    out.receivedAt = Timestamp.fromMillis(out.signalAtMs + 1200)
    delete out.signalAtMs
  }
  out.createdAt = out.createdAt ?? Timestamp.now()
  return out
}

let written = 0
// In batches of 400, under Firestore's 500-operation limit, so a large seed is
// one round trip per batch rather than one per document.
for (let i = 0; i < plan.length; i += 400) {
  const batch = db.batch()
  for (const row of plan.slice(i, i + 400)) {
    batch.set(db.collection(row.collection).doc(row.id), withStamps(row.data))
    written += 1
  }
  await batch.commit()
  console.log(`committed ${Math.min(i + 400, plan.length)}/${plan.length}`)
}

console.log(`\nSeeded ${written} documents for ${UID}.`)
console.log('Collections:', [...new Set(plan.map((p) => p.collection))].join(', '))
