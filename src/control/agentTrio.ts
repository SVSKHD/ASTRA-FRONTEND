// Health of the News, Image and Voice agents, for the agents page.
//
// Each comes from a different place, because they are different things on
// the server:
//   News  — the scheduler job `news-pull` (GET /api/scheduler/jobs).
//   Image — the registered agent `imaging` (GET /api/agents) and its last run
//           (GET /api/agents/imaging/runs).
//   Voice — has no server agent: speech is recognised in the browser and the
//           server only resolves a transcript. So its card reports this
//           browser: recogniser present, HTTPS, and the last command here.

import type { components } from '@/api/client'
import type { Tone } from '@/control/status'

type Job = components['schemas']['ScheduledJobOut']
type Agent = components['schemas']['AgentOut']
type Run = components['schemas']['app__schemas__agents__RunOut']

export type Health = 'healthy' | 'degraded' | 'down' | 'unknown'

export interface TrioCard {
  health: Health
  /** ISO time or ms of the last run/command, if any. */
  lastRun: string | number | null
  lastError: string | null
  note: string
}

export const HEALTH_TONE: Record<Health, Tone> = {
  healthy: 'success',
  degraded: 'warning',
  down: 'danger',
  unknown: 'neutral',
}

export function newsCard(jobs: Job[] | null | undefined, jobId = 'news-pull'): TrioCard {
  if (!jobs) return { health: 'unknown', lastRun: null, lastError: null, note: 'Not read yet.' }
  const j = jobs.find((x) => x.id === jobId)
  if (!j) {
    return {
      health: 'down',
      lastRun: null,
      lastError: null,
      note: 'Not scheduled: the server has no news feed URLs (NEWS_FEED_URLS).',
    }
  }
  const failing = j.last_status === 'failed' || j.consecutive_failures > 0
  return {
    health: j.paused
      ? 'degraded'
      : failing
        ? j.last_status === 'failed'
          ? 'down'
          : 'degraded'
        : j.last_run_at
          ? 'healthy'
          : 'unknown',
    lastRun: j.last_run_at ?? null,
    lastError: j.last_error ?? null,
    note: j.paused
      ? 'Paused by an admin.'
      : j.running
        ? 'Pulling the feeds now.'
        : `Runs on ${j.cron}${j.consecutive_failures ? ` · ${j.consecutive_failures} failed in a row` : ''}.`,
  }
}

export function imageCard(
  agents: Agent[] | null | undefined,
  lastRun: Run | null | undefined,
  agentId = 'imaging',
): TrioCard {
  if (!agents) return { health: 'unknown', lastRun: null, lastError: null, note: 'Not read yet.' }
  const a = agents.find((x) => x.id === agentId)
  if (!a) {
    return {
      health: 'down',
      lastRun: null,
      lastError: null,
      note: 'The image worker has never registered: it is not running on the server.',
    }
  }
  const runFailed = !!lastRun && (lastRun.status === 'failed' || !!lastRun.error)
  const health: Health =
    a.state === 'stale' || a.state === 'error' || a.state === 'failed'
      ? 'down'
      : a.state === 'paused' || runFailed
        ? 'degraded'
        : 'healthy'
  return {
    health,
    lastRun: lastRun?.started_at ?? a.last_activity_at ?? null,
    lastError: lastRun?.error ?? null,
    note: `Worker ${a.state}${a.seconds_since_heartbeat != null ? ` · heartbeat ${Math.round(a.seconds_since_heartbeat)} s ago` : ''}.`,
  }
}

export interface VoiceSnapshot {
  supported: boolean
  secure: boolean
  commands: number
  lastAt: number
  lastIntent: string
  lastError: string
  lastErrorAt: number
}

export function voiceCard(v: VoiceSnapshot): TrioCard {
  if (!v.secure) {
    return {
      health: 'down',
      lastRun: v.lastAt || null,
      lastError: 'Not HTTPS: the browser will not open the mic.',
      note: 'In this browser.',
    }
  }
  const recentError = !!v.lastError && v.lastErrorAt >= v.lastAt
  return {
    health: !v.supported ? 'degraded' : recentError ? 'degraded' : 'healthy',
    lastRun: v.lastAt || null,
    lastError: recentError ? v.lastError : null,
    note: !v.supported
      ? 'No speech recognition in this browser: commands can still be typed.'
      : v.commands
        ? `${v.commands} command${v.commands === 1 ? '' : 's'} this session · last “${v.lastIntent}”.`
        : 'No command yet this session.',
  }
}
