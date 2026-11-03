import { describe, expect, it } from 'vitest'
import { bytes, overallHealth, pct, sectionHealth, uptime } from './system'

describe('sectionHealth', () => {
  it('tells unknown, healthy, degraded and unavailable apart', () => {
    expect(sectionHealth(undefined)).toBe('unknown')
    expect(sectionHealth({})).toBe('unknown')
    expect(sectionHealth({ ok: true })).toBe('healthy')
    // Answered, but something in it is wrong (a full disk, a stopped container).
    expect(sectionHealth({ ok: false })).toBe('degraded')
    // The probe itself failed.
    expect(sectionHealth({ ok: false, error: 'timeout after 3s' })).toBe('unavailable')
  })
})

describe('overallHealth', () => {
  it('is unavailable when the process is down, degraded when a check fails', () => {
    expect(overallHealth(false, null, null)).toBe('unavailable')
    expect(overallHealth(null, null, null)).toBe('unknown')
    expect(
      overallHealth(true, { status: 'not_ready', checks: { redis: { ok: false } } }, null),
    ).toBe('degraded')
    expect(overallHealth(true, { checks: { redis: { ok: true } } }, { status: 'degraded' })).toBe(
      'degraded',
    )
    expect(overallHealth(true, { checks: { redis: { ok: true } } }, { status: 'ok' })).toBe(
      'healthy',
    )
  })
})

describe('formatting', () => {
  it('prints what the server sent and a dash for what it did not', () => {
    expect(bytes(512)).toBe('512 B')
    expect(bytes(1536)).toBe('1.5 KB')
    expect(bytes(5 * 1024 ** 3)).toBe('5.0 GB')
    expect(bytes(undefined)).toBe('—')
    expect(pct(41.6)).toBe('42%')
    expect(pct(null)).toBe('—')
    expect(uptime(3 * 86400 + 4 * 3600 + 60)).toBe('3 d 4 h')
    expect(uptime(5 * 3600 + 12 * 60)).toBe('5 h 12 min')
    expect(uptime(undefined)).toBe('—')
  })
})
