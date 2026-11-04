import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ aureon: { GET: get } }))
vi.mock('@/control/api', () => ({
  must: (r: { data?: unknown; response: { ok: boolean } }) => {
    if (!r.response.ok || !r.data) throw new Error('bad')
    return r.data
  },
}))

import {
  imageWatch,
  onImageFinished,
  readImageJob,
  resetImageWatch,
  resumeImageJob,
  watchImageJob,
} from './watch'
import type { ImageJob } from '@/control/images'

const job = (status: string, over: Partial<ImageJob> = {}) =>
  ({ id: 'j1', status, progress: 0, prompt: 'a cat', queue_position: 0, ...over }) as ImageJob
const answer = (j: ImageJob) => ({ data: j, response: { ok: true, status: 200 } })

describe('the app-wide image watch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetImageWatch()
    get.mockReset()
    localStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  it('follows a job to the end and announces it once', async () => {
    const done = vi.fn()
    onImageFinished(done)
    watchImageJob(job('queued'))
    expect(localStorage.getItem('cc.images.job')).toBe('j1')

    get.mockResolvedValueOnce(answer(job('running', { progress: 50 })))
    await vi.advanceTimersByTimeAsync(4_000)
    expect(imageWatch.job?.status).toBe('running')

    get.mockResolvedValueOnce(answer(job('done', { asset_id: 'a1' })))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(imageWatch.job?.status).toBe('done')
    expect(done).toHaveBeenCalledTimes(1)
    expect(imageWatch.finished?.status).toBe('done')
    expect(localStorage.getItem('cc.images.job')).toBeNull()

    // Over: no more reads.
    await vi.advanceTimersByTimeAsync(20_000)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('keeps watching through a dropped read', async () => {
    watchImageJob(job('running'))
    get.mockRejectedValueOnce(new Error('offline'))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(imageWatch.error).toMatch(/offline/)
    get.mockResolvedValueOnce(answer(job('failed', { error: 'OOM' })))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(imageWatch.finished?.error).toBe('OOM')
  })

  it('resumes a remembered job and drops one that is gone', async () => {
    localStorage.setItem('cc.images.job', 'j9')
    get.mockResolvedValueOnce({ data: undefined, response: { ok: false, status: 404 } })
    resumeImageJob()
    await vi.runOnlyPendingTimersAsync()
    expect(get).toHaveBeenCalledWith('/api/images/jobs/{job_id}', {
      params: { path: { job_id: 'j9' } },
    })
    expect(imageWatch.job).toBeNull()
    expect(localStorage.getItem('cc.images.job')).toBeNull()
    await readImageJob()
  })
})
