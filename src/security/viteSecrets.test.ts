// No credential in a VITE_ variable (Phase 21, D-21-2).
//
// Everything named VITE_* is inlined into the JavaScript every visitor
// downloads. GitHub, Claude and Discord credentials live on the Aureon server
// and nowhere else; the control center only ever sees what the API returns.
// This scans the source and every .env* file for VITE_ names that look like a
// credential and fails on any that is not one of the known public values.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const SRC = resolve(ROOT, 'src')
const LOOKS_SECRET = /TOKEN|SECRET|PAT|KEY/

/**
 * Public by design, each with why. A new entry needs the same: a reason the
 * value is safe in every visitor's browser.
 */
const KNOWN_PUBLIC: Record<string, string> = {
  VITE_SUPABASE_PUBLISHABLE_KEY: "Supabase's publishable key; row-level security guards the data.",
  VITE_SUPABASE_ANON_KEY:
    "Supabase's legacy anon key, the same public role as the publishable one.",
  VITE_FIREBASE_API_KEY: 'Firebase web API keys identify the project; security rules guard data.',
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|vue|js|mjs)$/.test(name)) out.push(full)
  }
  return out
}

const rel = (f: string) =>
  f
    .slice(ROOT.length + 1)
    .split(sep)
    .join('/')
const envFiles = readdirSync(ROOT)
  .filter((n) => n.startsWith('.env'))
  .map((n) => resolve(ROOT, n))
const SELF = resolve(__dirname, 'viteSecrets.test.ts')

export function secretLookingViteNames(text: string): string[] {
  return [...new Set(text.match(/VITE_[A-Z0-9_]+/g) ?? [])].filter((n) => LOOKS_SECRET.test(n))
}

describe('no credential in a VITE_ variable', () => {
  it('finds no new secret-looking VITE_ name in src or any .env file', () => {
    const offenders: string[] = []
    for (const f of [...walk(SRC), ...envFiles, resolve(ROOT, 'env.d.ts')]) {
      if (f === SELF) continue
      for (const name of secretLookingViteNames(readFileSync(f, 'utf8'))) {
        if (!KNOWN_PUBLIC[name]) offenders.push(`${rel(f)}: ${name}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('catches the shapes it is meant to catch', () => {
    const sample =
      'VITE_GITHUB_TOKEN VITE_CLAUDE_API_KEY VITE_DISCORD_SECRET VITE_GH_PAT VITE_THEME'
    expect(secretLookingViteNames(sample)).toEqual([
      'VITE_GITHUB_TOKEN',
      'VITE_CLAUDE_API_KEY',
      'VITE_DISCORD_SECRET',
      'VITE_GH_PAT',
    ])
  })

  it('states why each known value is public', () => {
    for (const [name, why] of Object.entries(KNOWN_PUBLIC))
      expect(why.length, name).toBeGreaterThan(20)
  })
})
