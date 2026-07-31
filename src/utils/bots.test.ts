import { describe, expect, it } from 'vitest'
import { botDisplayStatus, dailyLossColor, dailyLossPct, seedBots, statusColor } from '@/utils/bots'
import type { Bot } from '@/types'

const C = { good: 'green', warn: 'amber', bad: 'red' }
const NOW = 1_000_000_000

function bot(over: Partial<Bot>): Bot {
  return {
    id: 1,
    name: 'B',
    symbol: 'XAUUSD',
    engine: 'e',
    lot: 0.01,
    enabled: true,
    mode: 'paper',
    status: 'running',
    heartbeatAt: NOW,
    version: '1',
    lastError: '',
    realizedPl: 0,
    floatingPl: 0,
    tradeCount: 0,
    winRate: 0,
    dailyLossUsed: 0,
    dailyLossCap: 600,
    positions: [],
    basket: null,
    equityCurve: [],
    phase: '',
    phaseRemaining: '',
    blackout: false,
    config: {},
    configFrozenAt: 0,
    ...over,
  }
}

describe('botDisplayStatus', () => {
  it('is stopped when disabled', () => {
    expect(botDisplayStatus(bot({ enabled: false, status: 'stopped' }), NOW)).toBe('stopped')
  })
  it('is running with a fresh heartbeat', () => {
    expect(botDisplayStatus(bot({ heartbeatAt: NOW - 10_000 }), NOW)).toBe('running')
  })
  it('is stale between 1 and 5 minutes', () => {
    expect(botDisplayStatus(bot({ heartbeatAt: NOW - 120_000 }), NOW)).toBe('stale')
  })
  it('is error when the heartbeat is lost past 5 minutes', () => {
    expect(botDisplayStatus(bot({ heartbeatAt: NOW - 6 * 60_000 }), NOW)).toBe('error')
  })
  it('a stored error always wins', () => {
    expect(botDisplayStatus(bot({ lastError: 'boom', heartbeatAt: NOW }), NOW)).toBe('error')
  })
})

describe('daily loss', () => {
  it('computes a clamped percentage of the cap', () => {
    expect(dailyLossPct(182, 600)).toBe(30)
    expect(dailyLossPct(700, 600)).toBe(100)
    expect(dailyLossPct(0, 0)).toBe(0)
  })
  it('flips colour at 60% and 85%', () => {
    expect(dailyLossColor(100, 600, C)).toBe('green') // 17%
    expect(dailyLossColor(400, 600, C)).toBe('amber') // 67%
    expect(dailyLossColor(540, 600, C)).toBe('red') // 90%
  })
})

describe('statusColor', () => {
  it('maps status to a colour', () => {
    expect(statusColor('running', C)).toBe('green')
    expect(statusColor('stale', C)).toBe('amber')
    expect(statusColor('error', C)).toBe('red')
    expect(statusColor('stopped', C)).toBe('red')
  })
})

describe('seedBots', () => {
  it('seeds two bots with distinct ids and the two symbols', () => {
    let n = 10
    const bots = seedBots(() => ++n, NOW)
    expect(bots).toHaveLength(2)
    expect(new Set(bots.map((b) => b.id)).size).toBe(2)
    expect(bots.map((b) => b.symbol)).toEqual(['XAUUSD', 'XAGUSD'])
    // Seeds start disabled so nothing trades on first render.
    expect(bots.every((b) => b.enabled === false)).toBe(true)
  })
})
