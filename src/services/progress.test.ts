import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DISMISS_GAP_MS,
  DONE_HOLD_MS,
  MIN_VISIBLE_MS,
  SHOW_DELAY_MS,
  dismissProgress,
  progressJobs,
  resetProgress,
  startProgress,
} from '@/services/progress'

const visible = () => progressJobs.filter((j) => j.visible).map((j) => j.id)

describe('progress cards', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetProgress()
  })
  afterEach(() => {
    resetProgress()
    vi.useRealTimers()
  })

  it('a job over within the show delay never becomes a card', () => {
    const job = startProgress({ id: 'quick', title: 'Quick' })
    vi.advanceTimersByTime(SHOW_DELAY_MS - 50)
    job.finish()
    vi.advanceTimersByTime(5000)
    expect(progressJobs).toHaveLength(0)
  })

  it('shows after the delay, fills, ticks, then leaves on its own', () => {
    const job = startProgress({ id: 'del', title: 'Deleting', total: 10 })
    vi.advanceTimersByTime(SHOW_DELAY_MS)
    expect(visible()).toEqual(['del'])
    job.update({ done: 4 })
    expect(progressJobs[0].done).toBe(4)

    vi.advanceTimersByTime(MIN_VISIBLE_MS)
    job.finish('Done')
    expect(progressJobs[0]).toMatchObject({ state: 'done', done: 10, detail: 'Done' })
    vi.advanceTimersByTime(DONE_HOLD_MS + 10)
    expect(progressJobs).toHaveLength(0)
  })

  it('holds a card that finished too soon for its minimum time on screen', () => {
    const job = startProgress({ id: 'blink', title: 'Blink' })
    vi.advanceTimersByTime(SHOW_DELAY_MS)
    job.finish()
    expect(progressJobs[0].state).toBe('running')
    vi.advanceTimersByTime(MIN_VISIBLE_MS)
    expect(progressJobs[0].state).toBe('done')
  })

  it('several finishing together leave one at a time', () => {
    const jobs = ['a', 'b', 'c'].map((id) => startProgress({ id, title: id }))
    vi.advanceTimersByTime(SHOW_DELAY_MS + MIN_VISIBLE_MS)
    for (const j of jobs) j.finish()
    vi.advanceTimersByTime(DONE_HOLD_MS)
    expect(progressJobs).toHaveLength(2)
    vi.advanceTimersByTime(DISMISS_GAP_MS)
    expect(progressJobs).toHaveLength(1)
    vi.advanceTimersByTime(DISMISS_GAP_MS)
    expect(progressJobs).toHaveLength(0)
  })

  it('a failed card stays until it is closed', () => {
    const job = startProgress({ id: 'bad', title: 'Import' })
    vi.advanceTimersByTime(SHOW_DELAY_MS + MIN_VISIBLE_MS)
    job.fail('Could not reach the server')
    vi.advanceTimersByTime(60_000)
    expect(progressJobs[0]).toMatchObject({ state: 'failed' })
    dismissProgress('bad')
    expect(progressJobs).toHaveLength(0)
  })

  it('the same work starting again picks its card back up', () => {
    const first = startProgress({ id: 'sync', title: 'Syncing' })
    vi.advanceTimersByTime(SHOW_DELAY_MS + MIN_VISIBLE_MS)
    first.finish()
    startProgress({ id: 'sync', title: 'Syncing' })
    vi.advanceTimersByTime(DONE_HOLD_MS + DISMISS_GAP_MS * 2)
    expect(progressJobs).toHaveLength(1)
    expect(progressJobs[0].state).toBe('running')
  })
})
