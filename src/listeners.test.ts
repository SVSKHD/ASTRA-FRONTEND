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
      // `detach()` counts: it is the same teardown under the name the shared
      // month listener gives it.
      (f) => !/Unsub\s*\(\)|unsubscribe\s*\(\)|detach\s*\(\)/.test(f.body),
    )
    expect(leaks.map((f) => f.path)).toEqual([])
  })

  it('only the named owners of Firestore data open a listener', () => {
    // Named rather than counted, so a new entry has to be argued for in this
    // comment rather than by bumping a number:
    //
    //   stores/app.ts            the workspace, which is one document
    //   composables/useSettings  the settings document every query path is
    //                            built from
    //   useOwnedMonth            one month listener shared by trades, signals,
    //                            expenses and the secured ledger
    //   useNews                  the shared `forex` collection — no uid, because
    //                            the news is not anybody's data (section 39)
    //   useGithubLive            repos and pull requests, both live for as long
    //                            as the Code tab is open
    //   useGhThread              one pull request's comments, attached when it
    //                            is expanded and torn down when it is collapsed
    //   FeedHealthPanel          one document, read only while the panel is open
    const listeners = FILES.filter((f) => f.body.includes('onSnapshot(')).map((f) => f.path)
    expect(listeners.sort()).toEqual([
      'components/news/FeedHealthPanel.vue',
      'composables/useGhThread.ts',
      'composables/useGithubLive.ts',
      'composables/useNews.ts',
      'composables/useOwnedMonth.ts',
      'composables/useSettings.ts',
      'stores/app.ts',
    ])
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
