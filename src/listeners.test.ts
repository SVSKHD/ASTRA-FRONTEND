// The listener audit (section 16e), kept as a test rather than a one-off sweep:
// a snapshot listener or a timer added later without a teardown fails here
// instead of leaking in a long-lived session.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.(ts|vue)$/.test(entry) || entry.endsWith('.test.ts')) continue
    out.push(full)
  }
  return out
}

// Comments talk about listeners without opening any — the audit is about code.
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
}

const FILES = sourceFiles(SRC).map((path) => ({
  path: path.slice(SRC.length + 1),
  body: code(path),
}))

describe('every listener is torn down', () => {
  it('every onSnapshot keeps its unsubscribe', () => {
    const leaks = FILES.filter((f) => f.body.includes('onSnapshot(')).filter(
      (f) => !/Unsub\s*\(\)|unsubscribe\s*\(\)/.test(f.body),
    )
    expect(leaks.map((f) => f.path)).toEqual([])
  })

  it('the workspace runs exactly one snapshot listener', () => {
    // One document, one listener: the whole workspace is a single Firestore doc,
    // so a second onSnapshot anywhere would be duplicated traffic on the same data.
    const listeners = FILES.filter((f) => f.body.includes('onSnapshot(')).map((f) => f.path)
    expect(listeners).toEqual(['stores/app.ts'])
  })

  it('every setInterval has a clearInterval in the same module', () => {
    const leaks = FILES.filter((f) => f.body.includes('setInterval(')).filter(
      (f) => !f.body.includes('clearInterval('),
    )
    expect(leaks.map((f) => f.path)).toEqual([])
  })
})

describe('Firestore stays out of the initial chunk', () => {
  // The SDK is reached through @/firebase's loader. A static import anywhere
  // would pull it — and its 72KB regex engine — back into the first paint.
  it('nothing imports a value from firebase/firestore', () => {
    const offenders = FILES.filter((f) => f.path !== 'firebase.ts').filter((f) =>
      f.body
        .split('\n')
        .some(
          (line) =>
            /from\s+['"]firebase\/firestore['"]/.test(line) && !/^\s*import\s+type\b/.test(line),
        ),
    )
    expect(offenders.map((f) => f.path)).toEqual([])
  })
})
