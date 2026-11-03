// The MT5 bot dashboard (/trading/mt5): display helpers and the live refresh.
//
// Everything here is read-only. The data comes from the bot's pushes
// (aureon.mt5.push/v1, backend docs/12-mt5-adapter.md §3) through
// GET /api/trading/mt5/*; GET /api/trading/stream announces each new push as an
// `mt5` event, and the page refetches its panels (debounced).

import { onScopeDispose, watch } from 'vue'
import type { components } from '@/api/client'
import { live } from '@/trading/stream'

type S = components['schemas']
export type Mt5BotStatus = S['Mt5BotStatusOut']
export type Mt5Market = S['Mt5MarketOut']
export type Mt5SymbolMarket = S['Mt5SymbolMarketOut']
export type Mt5Candle = S['Mt5CandleOut']
export type Mt5Positions = S['Mt5PositionsOut']
export type Mt5Position = S['Mt5PositionOut']
export type Mt5Guardian = S['Mt5GuardianOut']
export type Mt5Signals = S['Mt5SignalsOut']
export type Mt5Event = S['Mt5EventOut']
export type Mt5Failures = S['Mt5FailuresOut']
export type Mt5Failure = S['Mt5FailureOut']
export type Mt5Strategy = S['Mt5StrategyOut']
export type Mt5Report = S['Mt5ReportOut']

/** Same shapes as CandleChart's props. */
export interface ChartCandle {
  ts: string
  open: string
  high: string
  low: string
  close: string
}
export interface ChartLine {
  name: string
  points: { ts: string; value: string | null }[]
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export const BOT_AGENT_ID = 'mt5-bot'

export const STATE_TONE: Record<string, Tone> = {
  online: 'success',
  stale: 'warning',
  error: 'danger',
}

/** Timeline kinds with a badge of their own; any other kind gets a neutral one. */
export const KINDS = ['P', 'cross', 'reentry', 'protected', 'secured', 'exit', 'closed', 'error']

const KIND_TONE: Record<string, Tone> = {
  P: 'info',
  cross: 'info',
  reentry: 'info',
  protected: 'success',
  secured: 'success',
  exit: 'warning',
  closed: 'neutral',
  error: 'danger',
}
const KIND_LABEL: Record<string, string> = {
  P: 'P (pullback)',
  cross: 'Cross',
  reentry: 'Re-entry',
  protected: 'Protected',
  secured: 'Secured',
  exit: 'Exit',
  closed: 'Closed',
  error: 'Error',
}

export function kindTone(kind: string): Tone {
  return KIND_TONE[kind] ?? 'neutral'
}

/** "pre_cross" → "Pre cross"; the known kinds keep their own names. */
export function kindLabel(kind: string): string {
  if (KIND_LABEL[kind]) return KIND_LABEL[kind]
  const s = kind.replaceAll('_', ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : 'Event'
}

/** The guardian's own phase words (pre | protect | secured | ride). */
const PHASE_TONE: Record<string, Tone> = {
  pre: 'neutral',
  protect: 'info',
  protected: 'info',
  secured: 'success',
  ride: 'success',
}
export function phaseTone(phase: string | null | undefined): Tone {
  return (phase && PHASE_TONE[phase.toLowerCase()]) || 'neutral'
}

export const FAILURE_LABEL: Record<string, string> = {
  mt5_disconnected: 'MT5 disconnected',
  stale_ticks: 'Stale ticks',
  guardian_error: 'Guardian error',
  discord_error: 'Discord error',
  exception: 'Exception',
  stale_heartbeat: 'No heartbeat',
}

const SESSION_LABEL: Record<string, string> = {
  asia: 'Asia',
  london: 'London',
  ny: 'New York',
  off: 'Off-session',
}
export function sessionLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return SESSION_LABEL[s.toLowerCase()] ?? s
}

/** EMA keys present in the candles, in numeric order ("9" before "21"). */
export function emaKeys(candles: Mt5Candle[], hinted: string[] = []): string[] {
  const keys = new Set(hinted)
  for (const c of candles) for (const k of Object.keys(c.ema ?? {})) keys.add(k)
  return [...keys].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
}

/** API candles → CandleChart's shape, with one line per EMA period. */
export function toChart(
  candles: Mt5Candle[],
  hinted: string[] = [],
): { candles: ChartCandle[]; lines: ChartLine[] } {
  const keys = emaKeys(candles, hinted)
  return {
    candles: candles.map((c) => ({ ts: c.t, open: c.o, high: c.h, low: c.l, close: c.c })),
    lines: keys
      .map((k) => ({
        name: `EMA ${k}`,
        points: candles.map((c) => ({ ts: c.t, value: c.ema?.[k] ?? null })),
      }))
      .filter((l) => l.points.some((p) => p.value !== null)),
  }
}

/** A short one-line summary of a journal event's payload, for the timeline. */
export function eventSummary(ev: Mt5Event): string {
  const p = ev.payload as Record<string, unknown>
  const parts: string[] = []
  for (const k of [
    'side',
    'direction',
    'signal_kind',
    'phase',
    'reason',
    'price',
    'points',
    'sl',
    'type',
    'message',
    'error',
    'where',
  ]) {
    const v = p[k]
    if (v === null || v === undefined || v === '' || typeof v === 'object') continue
    parts.push(`${k.replace('_', ' ')} ${String(v)}`)
  }
  return parts.join(' · ').slice(0, 240)
}

/**
 * Call `refresh` (debounced) when the bot pushes, its failures change or its
 * agent state changes on the live stream, plus a slow backstop poll while the
 * tab is visible (for a stream that is down).
 */
export function useMt5Live(refresh: () => void, debounceMs = 400, everyMs = 30_000): void {
  let t: ReturnType<typeof setTimeout> | null = null
  const fire = () => {
    if (t) clearTimeout(t)
    t = setTimeout(() => {
      t = null
      refresh()
    }, debounceMs)
  }
  const sig = () =>
    `${live.mt5?.push_id ?? ''}|${live.mt5?.open_failures ?? ''}|${live.agents[BOT_AGENT_ID]?.state ?? ''}`
  const stop = watch(sig, (now, before) => {
    if (now !== before) fire()
  })
  const timer = setInterval(() => {
    if (globalThis.document?.visibilityState !== 'hidden') refresh()
  }, everyMs)
  onScopeDispose(() => {
    stop()
    clearInterval(timer)
    if (t) clearTimeout(t)
  })
}
