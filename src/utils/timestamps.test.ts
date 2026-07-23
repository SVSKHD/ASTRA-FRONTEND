import { describe, expect, it } from 'vitest'
import { formatAbsolute, formatRelative, isStamped, stampSummary } from '@/utils/timestamps'

const NOW = new Date('2026-07-21T14:00:00').getTime()
const MINUTE = 60000
const HOUR = 3600000
const DAY = 86400000
const WEEK = 604800000

describe('isStamped', () => {
  it('treats 0, undefined and null as unstamped', () => {
    expect(isStamped(0)).toBe(false)
    expect(isStamped(undefined)).toBe(false)
    expect(isStamped(null)).toBe(false)
    expect(isStamped(NOW)).toBe(true)
  })
})

describe('formatAbsolute', () => {
  it('renders a real stamp', () => {
    const out = formatAbsolute(NOW)
    expect(out).toContain('2026')
    expect(out).not.toBe('Unknown')
  })

  // The whole point of the 0 sentinel: legacy items must not claim 1970.
  it('renders the legacy sentinel as Unknown, never as 1970', () => {
    expect(formatAbsolute(0)).toBe('Unknown')
    expect(formatAbsolute(0)).not.toContain('1970')
  })
})

describe('formatRelative', () => {
  it('collapses anything under a minute to "just now"', () => {
    expect(formatRelative(NOW, NOW)).toBe('just now')
    expect(formatRelative(NOW - 59000, NOW)).toBe('just now')
  })

  it('never renders a negative age when the stamp is ahead of now', () => {
    expect(formatRelative(NOW + 5 * MINUTE, NOW)).toBe('just now')
  })

  it('steps through minutes, hours, days and weeks', () => {
    expect(formatRelative(NOW - 5 * MINUTE, NOW)).toBe('5m ago')
    expect(formatRelative(NOW - 3 * HOUR, NOW)).toBe('3h ago')
    expect(formatRelative(NOW - 2 * DAY, NOW)).toBe('2d ago')
    expect(formatRelative(NOW - 6 * WEEK, NOW)).toBe('6w ago')
  })

  it('switches to an absolute date past a year', () => {
    const out = formatRelative(NOW - 400 * DAY, NOW)
    expect(out).not.toContain('ago')
    expect(out).toContain('2025')
  })

  it('reports Unknown for the legacy sentinel', () => {
    expect(formatRelative(0, NOW)).toBe('Unknown')
  })
})

describe('stampSummary', () => {
  it('reports both stamps and the relative age of the update', () => {
    const out = stampSummary({ createdAt: NOW - 2 * DAY, updatedAt: NOW - 5 * MINUTE }, NOW)
    expect(out.created).toContain('2026')
    expect(out.updated).toContain('2026')
    expect(out.updatedAgo).toBe('5m ago')
  })

  it('survives a missing item', () => {
    const out = stampSummary(null, NOW)
    expect(out).toEqual({ created: 'Unknown', updated: 'Unknown', updatedAgo: 'Unknown' })
  })
})
