import { describe, expect, it } from 'vitest'
import {
  compareOrigins,
  dhanOrigin,
  duration,
  matchesOrigin,
  originBadge,
  originFromQuery,
  periodRange,
  queryForOrigin,
  subDec,
  type OriginStats,
  type TradeStatsOut,
} from './origins'

const S = (net: string, trades = 3): OriginStats => ({
  trades,
  wins: 2,
  losses: 1,
  win_rate: '0.6667',
  net,
  gross_profit: '0',
  gross_loss: '0',
  avg_r: '1.2',
  max_drawdown: '10',
  avg_duration_s: 600,
})
const stats = (manual: OriginStats, bot: OriginStats): TradeStatsOut => ({
  from: '',
  to: '',
  currency: 'USD',
  account_total_net: '0',
  origins: { all: S('0'), manual, bot },
  by_session: {},
  buckets: [],
  check: { split_sum_net: '0', account_total_net: '0', ok: true },
})

describe('origin chips ↔ query', () => {
  it('reads the chip from ?origin and falls back to all', () => {
    expect(originFromQuery({ origin: 'bot' })).toBe('bot')
    expect(originFromQuery({ origin: 'managed' })).toBe('managed')
    expect(originFromQuery({ origin: ['manual', 'bot'] })).toBe('manual')
    expect(originFromQuery({ origin: 'nonsense' })).toBe('all')
    expect(originFromQuery({})).toBe('all')
  })

  it('writes each chip to the query, keeping the other keys', () => {
    const q = { period: '30', origin: 'bot' }
    expect(queryForOrigin(q, 'manual')).toEqual({ period: '30', origin: 'manual' })
    expect(queryForOrigin(q, 'bot')).toEqual({ period: '30', origin: 'bot' })
    expect(queryForOrigin(q, 'managed')).toEqual({ period: '30', origin: 'managed' })
    expect(queryForOrigin(q, 'all')).toEqual({ period: '30' })
  })

  it('maps chips onto Dhan origins', () => {
    expect(dhanOrigin('all')).toBeNull()
    expect(dhanOrigin('bot')).toBe('aureon')
    expect(dhanOrigin('manual')).toBe('manual')
    expect(dhanOrigin('managed')).toBe('manual')
  })

  it('filters rows client-side the way the API does', () => {
    const mine = { origin: 'manual', guardian_touched: false }
    const managed = { origin: 'manual', guardian_touched: true }
    const bot = { origin: 'bot', guardian_touched: false }
    const unk = { origin: 'unknown', guardian_touched: false }
    const rows = [mine, managed, bot, unk]
    expect(rows.filter((r) => matchesOrigin(r, 'all'))).toHaveLength(4)
    expect(rows.filter((r) => matchesOrigin(r, 'manual'))).toEqual([mine, managed])
    expect(rows.filter((r) => matchesOrigin(r, 'managed'))).toEqual([managed])
    expect(rows.filter((r) => matchesOrigin(r, 'bot'))).toEqual([bot])
  })
})

describe('badges', () => {
  it('labels each origin', () => {
    expect(originBadge('manual', false).label).toBe('My trade')
    expect(originBadge('manual', true).label).toBe('Guardian-managed')
    expect(originBadge('bot', false).label).toBe('Bot')
    expect(originBadge('bot', true).label).toBe('Bot')
    expect(originBadge('unknown').label).toBe('Unknown')
    expect(originBadge(null).label).toBe('Unknown')
  })
})

describe('compareOrigins', () => {
  it('picks the side with the higher net, exactly', () => {
    const c = compareOrigins(stats(S('120.5'), S('-30.25')))
    expect(c.winner).toBe('manual')
    expect(c.diff).toBe('150.75')
    expect(c.manual?.net).toBe('120.5')
    expect(c.bot?.net).toBe('-30.25')
  })
  it('says the bot did better when it did', () => {
    const c = compareOrigins(stats(S('-5'), S('0.1')))
    expect(c.winner).toBe('bot')
    expect(c.diff).toBe('-5.1')
  })
  it('handles a tie and no trades at all', () => {
    expect(compareOrigins(stats(S('7'), S('7'))).winner).toBe('tie')
    expect(compareOrigins(stats(S('0', 0), S('0', 0))).winner).toBeNull()
    expect(compareOrigins(null).winner).toBeNull()
  })
  it('compares against a side with no trades as zero', () => {
    const c = compareOrigins(stats(S('0', 0), S('-12')))
    expect(c.winner).toBe('manual')
  })
})

describe('helpers', () => {
  it('subtracts decimals without floats', () => {
    expect(subDec('0.3', '0.1')).toBe('0.2')
    expect(subDec(1, -2)).toBe('3')
    expect(subDec(null, '1')).toBeNull()
  })
  it('formats durations', () => {
    expect(duration(4320)).toBe('1h12m')
    expect(duration(59)).toBe('59s')
    expect(duration(3600)).toBe('1h')
    expect(duration(90061)).toBe('1d1h')
    expect(duration(null)).toBe('—')
  })
  it('builds the period range', () => {
    const now = Date.UTC(2026, 10, 4, 15, 30)
    expect(periodRange('1', now)).toEqual({
      from: '2026-11-04T00:00:00.000Z',
      to: '2026-11-04T15:30:00.000Z',
    })
    expect(periodRange('7', now).from).toBe('2026-10-28T15:30:00.000Z')
  })
})
