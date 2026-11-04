// What a reply did, step by step — the chat's "thinking steps".
//
// Built from the stream itself (src/ai/aureonChat.ts), so every step is something the
// server actually reported, never an animation that pretends: the request went out, the
// server routed it (and why it stayed local, if it did), the model thought (its own
// reasoning, when asked for), wrote, and finished with tokens, cost and time — or fell
// back, or stopped.
//
// Traces live for the visit only, by `${chatId}:${msgId}`; the reply's text and route are
// what the chat store keeps.

import { reactive } from 'vue'
import { fallbackText, targetLabel, type AiRoute, type ChatEvent } from './aureonChat'

export type StepState = 'running' | 'done' | 'warn' | 'error'
export type StepKey =
  'send' | 'route' | 'filter' | 'fallback' | 'think' | 'write' | 'done' | 'error'

export interface AiStep {
  key: StepKey
  label: string
  detail?: string
  state: StepState
  at: number
}

export type TracePhase = 'sending' | 'thinking' | 'writing' | 'done' | 'error' | 'stopped'

export interface AiTrace {
  steps: AiStep[]
  /** The model's reasoning, as streamed. */
  thinking: string
  phase: TracePhase
  startedAt: number
  endedAt?: number
  route?: AiRoute
}

export function startTrace(now = Date.now(), think = false): AiTrace {
  return {
    steps: [
      {
        key: 'send',
        label: think ? 'Sent, asking the model to think' : 'Sent to Aureon',
        state: 'running',
        at: now,
      },
    ],
    thinking: '',
    phase: 'sending',
    startedAt: now,
  }
}

function step(t: AiTrace, key: StepKey): AiStep | undefined {
  return t.steps.find((s) => s.key === key)
}
function finish(t: AiTrace, key: StepKey, detail?: string) {
  const s = step(t, key)
  if (s && s.state === 'running') {
    s.state = 'done'
    if (detail) s.detail = detail
  }
}
function add(t: AiTrace, s: AiStep) {
  const i = t.steps.findIndex((x) => x.key === s.key)
  if (i >= 0) t.steps.splice(i, 1, s)
  else t.steps.push(s)
}

export function seconds(ms: number): string {
  return ms < 1000 ? `${Math.max(0, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`
}

function usd(cost: string | null | undefined): string {
  const n = Number(cost)
  if (!cost || !Number.isFinite(n)) return ''
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}

/** Fold one stream event into the trace (mutates it). */
export function applyEvent(t: AiTrace, ev: ChatEvent, now = Date.now()): void {
  if (ev.route && ev.reset) {
    // OpenRouter failed mid-reply; the text so far is dropped and the local model answers.
    t.route = ev.route
    finish(t, 'think')
    finish(t, 'write')
    add(t, {
      key: 'fallback',
      label: `Fell back to ${targetLabel(ev.route)}`,
      detail: fallbackText(ev.route.fallbackReason),
      state: 'warn',
      at: now,
    })
    t.steps = t.steps.filter((s) => s.key !== 'write')
    t.phase = 'sending'
  } else if (ev.route && !step(t, 'route')) {
    t.route = ev.route
    finish(t, 'send')
    add(t, {
      key: 'route',
      label: `Routed to ${targetLabel(ev.route)}`,
      detail:
        ev.route.requestedProvider && ev.route.requestedProvider !== ev.route.provider
          ? `asked for ${ev.route.requestedProvider === 'openrouter' ? 'OpenRouter' : 'local'}`
          : undefined,
      state: 'done',
      at: now,
    })
    if (ev.route.localOnly) {
      const cats = ev.route.filterCategories?.length
        ? ` (${ev.route.filterCategories.join(', ')})`
        : ''
      add(t, {
        key: 'filter',
        label: 'Kept on this server',
        detail: `${fallbackText(ev.route.fallbackReason)}${cats}`,
        state: 'warn',
        at: now,
      })
    } else if (ev.route.fallbackReason && ev.route.fallbackReason !== 'disabled') {
      add(t, {
        key: 'filter',
        label: 'Answered locally',
        detail: fallbackText(ev.route.fallbackReason),
        state: 'warn',
        at: now,
      })
    }
  } else if (ev.route) {
    t.route = ev.route
  }

  if (ev.thinking) {
    if (!step(t, 'think')) {
      finish(t, 'send')
      add(t, { key: 'think', label: 'Thinking', state: 'running', at: now })
    }
    t.thinking += ev.thinking
    t.phase = 'thinking'
  }

  if (ev.text) {
    const think = step(t, 'think')
    if (think && think.state === 'running') {
      finish(t, 'think', `for ${seconds(now - think.at)}`)
      think.label = 'Thought'
    }
    if (!step(t, 'write')) {
      finish(t, 'send')
      add(t, {
        key: 'write',
        label: 'Writing the answer',
        detail: `first words after ${seconds(now - t.startedAt)}`,
        state: 'running',
        at: now,
      })
    }
    t.phase = 'writing'
  }

  if (ev.usage) {
    finish(t, 'send')
    finish(t, 'think')
    finish(t, 'write')
    const took = ev.durationMs ?? now - t.startedAt
    const parts = [
      `${ev.usage.in.toLocaleString()} in / ${ev.usage.out.toLocaleString()} out tokens`,
      ev.reasoningTokens ? `${ev.reasoningTokens.toLocaleString()} reasoning` : '',
      usd(ev.route?.costUsd ?? t.route?.costUsd),
    ].filter(Boolean)
    add(t, {
      key: 'done',
      label: `Done in ${seconds(took)}`,
      detail: parts.join(' · '),
      state: 'done',
      at: now,
    })
    t.phase = 'done'
    t.endedAt = now
  }

  if (ev.error) {
    for (const s of t.steps) if (s.state === 'running') s.state = 'error'
    add(t, {
      key: 'error',
      label: 'Stopped with an error',
      detail: ev.error,
      state: 'error',
      at: now,
    })
    t.phase = 'error'
    t.endedAt = now
  }
}

/** The reply ended without a done/error event: stopped by the user, or the stream broke. */
export function endTrace(t: AiTrace, how: 'stopped' | 'error', detail = '', now = Date.now()) {
  if (t.phase === 'done' || t.phase === 'error') return
  for (const s of t.steps) if (s.state === 'running') s.state = how === 'error' ? 'error' : 'warn'
  add(t, {
    key: how === 'error' ? 'error' : 'done',
    label: how === 'error' ? 'Stopped with an error' : 'Stopped',
    detail: detail || undefined,
    state: how === 'error' ? 'error' : 'warn',
    at: now,
  })
  t.phase = how
  t.endedAt = now
}

/** "Thinking…", "Writing…", "Done in 2.1 s" — the one-line status of a run. */
export function phaseText(t: AiTrace | null | undefined, now = Date.now()): string {
  if (!t) return ''
  switch (t.phase) {
    case 'sending':
      return 'Waiting for the model…'
    case 'thinking':
      return `Thinking… ${seconds(now - (step(t, 'think')?.at ?? t.startedAt))}`
    case 'writing':
      return 'Writing…'
    case 'done':
      return step(t, 'done')?.label ?? 'Done'
    case 'error':
      return 'Stopped with an error'
    case 'stopped':
      return 'Stopped'
  }
}

/** This visit's traces, by `${chatId}:${msgId}` (or any caller's own key). */
export const aiTraces = reactive<Record<string, AiTrace>>({})

export const traceKey = (chatId: number | string, msgId: number | string) => `${chatId}:${msgId}`
