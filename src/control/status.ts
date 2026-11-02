// Badge tones for the statuses the control center shows. A tone sits on a
// badge (glyph + label), never on body text.

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export function runTone(status?: string | null, conclusion?: string | null): Tone {
  if (conclusion === 'success') return 'success'
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure')
    return 'danger'
  if (conclusion === 'cancelled' || conclusion === 'skipped' || conclusion === 'neutral')
    return 'neutral'
  if (status === 'in_progress' || status === 'queued' || status === 'waiting') return 'info'
  return 'neutral'
}

export function approvalTone(status: string): Tone {
  switch (status) {
    case 'pending':
      return 'warning'
    case 'executed':
    case 'approved':
      return 'success'
    case 'failed':
    case 'invalidated':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function verdictTone(v?: string | null): Tone {
  if (v === 'APPROVED') return 'success'
  if (v === 'CHANGES_REQUESTED') return 'warning'
  if (v === 'BLOCKED') return 'danger'
  return 'neutral'
}

export function repairTone(s: string): Tone {
  if (s === 'pr_opened' || s === 'tests_passed' || s === 'resolved') return 'success'
  if (s === 'failed' || s === 'tests_failed' || s === 'open') return 'danger'
  if (s === 'blocked' || s === 'recovering' || s === 'repair_queued') return 'warning'
  if (s === 'queued' || s === 'running' || s === 'patch_ready') return 'info'
  return 'neutral'
}

export function agentTone(s: string): Tone {
  if (s === 'idle' || s === 'busy' || s === 'running') return 'success'
  if (s === 'paused') return 'neutral'
  if (s === 'stale') return 'warning'
  return 'danger'
}
