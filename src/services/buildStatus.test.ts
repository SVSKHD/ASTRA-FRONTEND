import { describe, expect, it } from 'vitest'
import { ago, isNewerBuild, runningBuild, type BuildStamp } from '@/services/buildStatus'

const stamp = (commit: string): BuildStamp => ({
  version: '2.6.0',
  commit,
  branch: 'dev',
  builtAt: '2026-11-08T00:00:00.000Z',
})

describe('the build stamp', () => {
  it('is baked into the bundle with a commit and a build time', () => {
    expect(runningBuild.commit).toBeTruthy()
    expect(Number.isFinite(Date.parse(runningBuild.builtAt))).toBe(true)
  })
})

describe('isNewerBuild', () => {
  it('is false until the server has answered', () => {
    expect(isNewerBuild(stamp('aaa'), null)).toBe(false)
  })
  it('is false when the server runs the same commit', () => {
    expect(isNewerBuild(stamp('aaa'), stamp('aaa'))).toBe(false)
  })
  it('is true when the server runs a different commit, even at the same version', () => {
    expect(isNewerBuild(stamp('aaa'), stamp('bbb'))).toBe(true)
  })
  it('never nags over an unstamped server build', () => {
    expect(isNewerBuild(stamp('aaa'), stamp('unknown'))).toBe(false)
  })
})

describe('ago', () => {
  const now = Date.parse('2026-11-08T12:00:00Z')
  it('reads short', () => {
    expect(ago(now - 10_000, now)).toBe('just now')
    expect(ago(now - 5 * 60_000, now)).toBe('5m ago')
    expect(ago(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(ago('nonsense', now)).toBe('—')
  })
})
