import { describe, expect, it } from 'vitest'
import { isTerminal, jobLine, jobTone, pollMs, type ImageJob } from './images'

function job(over: Partial<ImageJob>): ImageJob {
  return {
    id: 'j1',
    status: 'queued',
    progress: 0,
    cancel_requested: false,
    queue_position: null,
    prompt: 'a lighthouse',
    negative_prompt: null,
    seed: 1,
    steps: 25,
    width: 512,
    height: 512,
    model: 'sd-1.5',
    error: null,
    attempts: 0,
    asset_id: null,
    created_at: '2026-11-03T10:00:00Z',
    started_at: null,
    finished_at: null,
    ...over,
  }
}

describe('image jobs', () => {
  it('stops at the backend’s terminal states only', () => {
    expect(isTerminal(job({ status: 'queued' }))).toBe(false)
    expect(isTerminal(job({ status: 'running' }))).toBe(false)
    for (const s of ['done', 'failed', 'cancelled'])
      expect(isTerminal(job({ status: s }))).toBe(true)
    expect(isTerminal(null)).toBe(false)
  })

  it('says where the job is, in the server’s words', () => {
    expect(jobLine(job({ queue_position: 2 }))).toBe('Queued · 2 ahead')
    expect(jobLine(job({ status: 'running', progress: 40 }))).toBe('Generating · 40%')
    expect(jobLine(job({ status: 'running', progress: 40, cancel_requested: true }))).toBe(
      'Stopping · 40%',
    )
    expect(jobLine(job({ status: 'failed', error: 'CUDA out of memory' }))).toBe(
      'Failed: CUDA out of memory',
    )
    expect(jobTone('done')).toBe('success')
    expect(jobTone('running')).toBe('info')
  })

  it('reads a running job back faster than a queued one', () => {
    expect(pollMs(job({ status: 'running' }))).toBeLessThan(pollMs(job({ status: 'queued' })))
  })
})
