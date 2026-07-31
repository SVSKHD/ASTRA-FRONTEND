// Pure helpers for the Bots tab. The app never runs strategy logic — it reads
// what the bot process writes and derives display state (status from heartbeat,
// daily-loss colour) here so the view and the tests share one source.

import type { Bot } from '@/types'

export const HEARTBEAT_FRESH_MS = 60_000 // green under a minute
export const HEARTBEAT_STALE_MS = 5 * 60_000 // amber up to five minutes, then red

// The status dot's meaning, derived from enabled + the last heartbeat age. A
// stored `error` always wins; otherwise a disabled bot is stopped, and an
// enabled bot is running / stale / (lost →) error by heartbeat age.
export function botDisplayStatus(bot: Bot, now: number): Bot['status'] {
  if (bot.status === 'error' || bot.lastError) return 'error'
  if (!bot.enabled) return 'stopped'
  const age = now - (bot.heartbeatAt || 0)
  if (age <= HEARTBEAT_FRESH_MS) return 'running'
  if (age <= HEARTBEAT_STALE_MS) return 'stale'
  return 'error' // heartbeat lost
}

export function statusColor(status: Bot['status'], c: { good: string; warn: string; bad: string }) {
  if (status === 'running') return c.good
  if (status === 'stale') return c.warn
  return c.bad // stopped | error
}

// Daily-loss usage as a 0..100 percentage of the cap (both stored as positive
// magnitudes; a −$182 of −$600 cap → 30%).
export function dailyLossPct(used: number, cap: number): number {
  if (!cap || cap <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((Math.abs(used) / Math.abs(cap)) * 100)))
}

// The bar flips amber past 60% and red past 85% of the cap.
export function dailyLossColor(
  used: number,
  cap: number,
  c: { good: string; warn: string; bad: string },
): string {
  const pct = dailyLossPct(used, cap)
  if (pct >= 85) return c.bad
  if (pct >= 60) return c.warn
  return c.good
}

export function relativeHeartbeat(from: number, now: number): string {
  if (!from) return 'never'
  const secs = Math.max(0, Math.round((now - from) / 1000))
  if (secs < 60) return secs + 's ago'
  const mins = Math.round(secs / 60)
  if (mins < 60) return mins + 'm ago'
  return Math.round(mins / 60) + 'h ago'
}

// The two seed bots for a fresh workspace. idFn draws from the store's id space
// so bot ids never collide with items.
export function seedBots(idFn: () => number, now: number): Bot[] {
  return [
    {
      id: idFn(),
      name: 'Aureon Hedge',
      symbol: 'XAUUSD',
      engine: 'hedge-baseline',
      lot: 0.05,
      enabled: false,
      mode: 'paper',
      status: 'stopped',
      heartbeatAt: now - 20_000,
      version: '1.0.0',
      lastError: '',
      realizedPl: -182,
      floatingPl: 46,
      tradeCount: 9,
      winRate: 0.56,
      dailyLossUsed: 182,
      dailyLossCap: 600,
      positions: [
        {
          ticket: '100482',
          direction: 'buy',
          lot: 0.05,
          entry: 2331.4,
          current: 2333.1,
          floatingPl: 8.5,
          sl: 2325.0,
          layer: 'H1',
        },
        {
          ticket: '100487',
          direction: 'sell',
          lot: 0.1,
          entry: 2336.2,
          current: 2333.1,
          floatingPl: 31.0,
          sl: 2342.0,
          layer: 'H2',
        },
      ],
      basket: {
        open: true,
        layers: 2,
        floatingTotal: 39.5,
        stop: -300,
        openedAt: now - 42 * 60_000,
      },
      equityCurve: [0, -40, -120, -182, -150, -110, -136],
      phase: 'London',
      phaseRemaining: '2h 40m',
      blackout: false,
      config: {
        entryThreshold: 1.8,
        stopLoss: 6.0,
        trailActivate: 3.0,
        trailLock: 1.5,
        trailStep: 0.5,
        actionOffset: 0.2,
        dailyStop: 600,
        streakPause: 3,
        blackout: '22:00-00:30',
        phases: ['Asia', 'London', 'NY'],
        hedgeLayers: 3,
        hedgeTrigger: 2.5,
      },
      configFrozenAt: now - 3 * 86_400_000,
    },
    {
      id: idFn(),
      name: 'Good-day Sniper',
      symbol: 'XAGUSD',
      engine: 'sniper',
      lot: 0.02,
      enabled: false,
      mode: 'demo',
      status: 'stopped',
      heartbeatAt: now - 90_000,
      version: '0.9.2',
      lastError: '',
      realizedPl: 214,
      floatingPl: 0,
      tradeCount: 4,
      winRate: 0.75,
      dailyLossUsed: 60,
      dailyLossCap: 250,
      positions: [],
      basket: null,
      equityCurve: [0, 60, 120, 96, 180, 214],
      phase: 'NY',
      phaseRemaining: '1h 05m',
      blackout: false,
      config: {
        entryThreshold: 2.2,
        stopLoss: 4.0,
        trailActivate: 2.5,
        trailLock: 1.0,
        trailStep: 0.4,
        actionOffset: 0.15,
        dailyStop: 250,
        streakPause: 2,
        blackout: '23:00-01:00',
        phases: ['London', 'NY'],
        hedgeLayers: 0,
        hedgeTrigger: 0,
      },
      configFrozenAt: now - 6 * 86_400_000,
    },
  ]
}
