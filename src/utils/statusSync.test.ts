import { describe, expect, it } from 'vitest'
import { burstCounts, overlayStatus, statusKey, type LocalStatus } from '@/utils/statusSync'
import type { ItemStatus } from '@/types'

const item = (id: number, status: ItemStatus, updatedAt = 100) => ({
  id,
  status,
  done: status === 'done',
  completedAt: null as number | null,
  updatedAt,
})
const tick = (status: ItemStatus, at = 200): LocalStatus => ({
  status,
  done: status === 'done',
  completedAt: status === 'done' ? at : null,
  at,
})

describe('overlayStatus', () => {
  it('restores ticks a stale snapshot would undo', () => {
    const pending = new Map([
      [statusKey('todos', 1), tick('done')],
      [statusKey('todos', 2), tick('done')],
    ])
    const { items, restored } = overlayStatus(
      [item(1, 'pending'), item(2, 'pending'), item(3, 'pending')],
      'todos',
      pending,
    )
    expect(restored).toBe(true)
    expect(items.map((t) => t.status)).toEqual(['done', 'done', 'pending'])
    expect(items[0].done).toBe(true)
    expect(pending.size).toBe(2)
  })

  it('drops a tick once the server has it', () => {
    const pending = new Map([[statusKey('todos', 1), tick('done')]])
    const incoming = [item(1, 'done', 200)]
    const { items, restored } = overlayStatus(incoming, 'todos', pending)
    expect(restored).toBe(false)
    expect(items).toBe(incoming)
    expect(pending.size).toBe(0)
  })

  it('lets a newer edit from elsewhere win', () => {
    const pending = new Map([[statusKey('tasks', 1), tick('done', 200)]])
    const { items, restored } = overlayStatus([item(1, 'pending', 300)], 'tasks', pending)
    expect(restored).toBe(false)
    expect(items[0].status).toBe('pending')
    expect(pending.size).toBe(0)
  })

  it('forgets ticks on deleted items and leaves the other collection alone', () => {
    const pending = new Map([
      [statusKey('todos', 9), tick('done')],
      [statusKey('tasks', 1), tick('done')],
    ])
    overlayStatus([item(1, 'pending')], 'todos', pending)
    expect([...pending.keys()]).toEqual(['tasks:1'])
  })
})

describe('burstCounts', () => {
  it('counts moved, reopened and saved', () => {
    const burst = new Map<string, ItemStatus>([
      ['todos:1', 'done'],
      ['todos:2', 'done'],
      ['tasks:3', 'pending'],
    ])
    expect(burstCounts(burst, new Set(['todos:2']))).toEqual({
      done: 2,
      reopened: 1,
      total: 3,
      saved: 2,
    })
  })
})
