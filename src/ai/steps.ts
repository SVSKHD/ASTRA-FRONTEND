// What a reply did, step by step — the chat's "thinking steps".
//
// Built from the stream itself (src/ai/aureonChat.ts), so every step is something the
// server actually reported, never an animation that pretends: the request went out, an
// agent took it, it used tools (each one a step), asked for approvals, wrote, and
// finished with its cost — or failed, or was stopped.
//
// Traces live for the visit only, by `${chatId}:${msgId}`; the reply's text, agent and
// cost are what the chat store keeps.

import { reactive } from 'vue'
import { agentLabel, toolActivity, toolDone, usd, type ChatEvent } from './aureonChat'

export type StepState = 'running' | 'done' | 'warn' | 'error'
export type StepKey = 'send' | 'agent' | 'tool' | 'approval' | 'write' | 'done' | 'error'

export interface AiStep {
  key: StepKey
  label: string
  detail?: string
  state: StepState
  at: number
}

export type TracePhase = 'sending' | 'working' | 'writing' | 'done' | 'error' | 'stopped'

export interface AiTrace {
  steps: AiStep[]
  phase: TracePhase
  startedAt: number
  endedAt?: number
  /** The agent that answers (meta). */
  agent?: string
  /** The latest tool, while the agent may still be working with it. */
  activity?: string
}

export function startTrace(now = Date.now()): AiTrace {
  return {
    steps: [{ key: 'send', label: 'Sent to Aureon', state: 'running', at: now }],
    phase: 'sending',
    startedAt: now,
  }
}

function step(t: AiTrace, key: StepKey): AiStep | undefined {
  return t.steps.find((s) => s.key === key)
}
function finish(t: AiTrace, key: StepKey, detail?: string) {
  for (const s of t.steps) {
    if (s.key === key && s.state === 'running') {
      s.state = 'done'
      if (detail) s.detail = detail
    }
  }
}
/** Replace the one step of this key (send, agent, write, done, error). */
function put(t: AiTrace, s: AiStep) {
  const i = t.steps.findIndex((x) => x.key === s.key)
  if (i >= 0) t.steps.splice(i, 1, s)
  else t.steps.push(s)
}

export function seconds(ms: number): string {
  return ms < 1000 ? `${Math.max(0, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`
}

/** Fold one stream event into the trace (mutates it). */
export function applyEvent(t: AiTrace, ev: ChatEvent, now = Date.now()): void {
  if (ev.meta) {
    finish(t, 'send')
    t.agent = ev.meta.agent
    put(t, {
      key: 'agent',
      label: `${agentLabel(ev.meta.agent) || 'An'} agent`,
      state: 'done',
      at: now,
    })
    t.phase = 'working'
  }

  if (ev.tool) {
    finish(t, 'send')
    // Tools come between pieces of text: the text so far was a preamble.
    finish(t, 'write')
    const bad = ev.tool.status === 'error' || ev.tool.status === 'refused'
    t.steps.push({
      key: 'tool',
      label: toolDone(ev.tool.name, ev.tool.status),
      state: bad ? 'warn' : 'done',
      at: now,
    })
    t.activity = toolActivity(ev.tool.name)
    t.phase = 'working'
  }

  if (ev.approval) {
    t.steps.push({
      key: 'approval',
      label: 'Asked for your approval',
      detail: ev.approval.summary,
      state: 'warn',
      at: now,
    })
  }

  if (ev.text) {
    finish(t, 'send')
    const w = [...t.steps].reverse().find((s) => s.key === 'write')
    if (!w || w.state !== 'running') {
      t.steps.push({
        key: 'write',
        label: 'Writing the answer',
        detail: w ? undefined : `first words after ${seconds(now - t.startedAt)}`,
        state: 'running',
        at: now,
      })
    }
    t.activity = undefined
    t.phase = 'writing'
  }

  if (ev.done) {
    finish(t, 'send')
    finish(t, 'write')
    const parts = [
      ev.done.steps > 1 ? `${ev.done.steps} model calls` : '',
      usd(ev.done.costUsd),
      ev.done.stopReason && ev.done.stopReason !== 'end_turn'
        ? `stopped: ${ev.done.stopReason.replace(/_/g, ' ')}`
        : '',
    ].filter(Boolean)
    put(t, {
      key: 'done',
      label: `Done in ${seconds(now - t.startedAt)}`,
      detail: parts.join(' · ') || undefined,
      state: 'done',
      at: now,
    })
    t.activity = undefined
    t.phase = 'done'
    t.endedAt = now
  }

  if (ev.error) {
    for (const s of t.steps) if (s.state === 'running') s.state = 'error'
    put(t, {
      key: 'error',
      label: 'Stopped with an error',
      detail: ev.error.message || ev.error.code,
      state: 'error',
      at: now,
    })
    t.activity = undefined
    t.phase = 'error'
    t.endedAt = now
  }
}

/** The reply ended without a done/error event: stopped by the user, or the stream broke. */
export function endTrace(t: AiTrace, how: 'stopped' | 'error', detail = '', now = Date.now()) {
  if (t.phase === 'done' || t.phase === 'error') return
  for (const s of t.steps) if (s.state === 'running') s.state = how === 'error' ? 'error' : 'warn'
  put(t, {
    key: how === 'error' ? 'error' : 'done',
    label: how === 'error' ? 'Stopped with an error' : 'Stopped',
    detail: detail || undefined,
    state: how === 'error' ? 'error' : 'warn',
    at: now,
  })
  t.activity = undefined
  t.phase = how
  t.endedAt = now
}

/** "Reading positions…", "Writing…", "Done in 2.1 s" — the one-line status of a run. */
export function phaseText(t: AiTrace | null | undefined): string {
  if (!t) return ''
  switch (t.phase) {
    case 'sending':
      return 'Waiting for Claude…'
    case 'working':
      return t.activity ?? (t.agent ? `${agentLabel(t.agent)} agent is working…` : 'Working…')
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
