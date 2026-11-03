// The image studio's pure parts (POST /api/images/generate and friends).
//
// The API only queues: the image worker on the server generates, and the job
// is read back until it reaches a terminal state. A job is `done` only when
// the server says so and names the asset — nothing here assumes success.

import type { components } from '@/api/client'
import type { Tone } from '@/control/status'

export type ImageJob = components['schemas']['app__schemas__images__JobOut']
export type ImageAsset = components['schemas']['AssetOut']

/** The backend's job statuses (app/models/imaging.py JOB_STATUSES). */
export const TERMINAL = new Set(['done', 'failed', 'cancelled'])

export function isTerminal(job: Pick<ImageJob, 'status'> | null | undefined): boolean {
  return !!job && TERMINAL.has(job.status)
}

export function jobTone(status: string): Tone {
  switch (status) {
    case 'done':
      return 'success'
    case 'failed':
      return 'danger'
    case 'cancelled':
      return 'neutral'
    default:
      return 'info'
  }
}

/**
 * The sizes and step cap the backend ships with (IMAGE_ALLOWED_SIZES,
 * IMAGE_MAX_STEPS in app/core/config.py). No endpoint publishes them, so a
 * server configured differently answers 422 with its own list, which the page
 * shows as it is.
 */
export const SIZES = ['512x512', '512x768', '768x512'] as const
export const MAX_STEPS = 50
export const DEFAULT_STEPS = 25

/** How often a live job is read back, ms: quicker while it runs, slower while queued. */
export function pollMs(job: Pick<ImageJob, 'status'> | null | undefined): number {
  return job?.status === 'running' ? 2_000 : 4_000
}

/** "Queued · 2 ahead", "Running · 40%", "Done", "Failed: …". */
export function jobLine(job: ImageJob): string {
  switch (job.status) {
    case 'queued':
      return job.queue_position
        ? `Queued · ${job.queue_position} ahead`
        : 'Queued · next for the worker'
    case 'running':
      return job.cancel_requested ? `Stopping · ${job.progress}%` : `Generating · ${job.progress}%`
    case 'done':
      return 'Done'
    case 'failed':
      return job.error ? `Failed: ${job.error}` : 'Failed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return job.status
  }
}
