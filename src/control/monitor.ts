// The Actions monitor (GET /api/v1/github/actions/monitor): host deploys (the
// deploy poller's `deployer` agent runs) and GitHub Actions CI runs on one
// timeline. The server already normalises `status`; these helpers only map it
// to a badge and print a duration.

import type { Tone } from '@/control/status'

export function monitorTone(status: string): Tone {
  switch (status) {
    case 'success':
      return 'success'
    case 'failure':
      return 'danger'
    case 'running':
    case 'queued':
      return 'info'
    default:
      return 'neutral'
  }
}

/** "850 ms", "42 s", "3 min 05 s", "1 h 02 min"; "—" when unknown. */
export function duration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

export const KIND_LABEL: Record<string, string> = { deploy: 'Deploy', ci: 'CI' }
