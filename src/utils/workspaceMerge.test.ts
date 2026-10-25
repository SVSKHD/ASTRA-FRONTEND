import { describe, expect, it } from 'vitest'
import { mergeList, mergeWorkspace } from '@/utils/workspaceMerge'

const SYNC = 1000

describe('mergeList', () => {
  it('keeps the copy edited last when an item is on both sides', () => {
    const local = [{ id: 1, text: 'device', updatedAt: 1500 }]
    const remote = [{ id: 1, text: 'cloud', updatedAt: 1200 }]
    expect(mergeList(local, remote, SYNC)).toEqual(local)
    expect(mergeList(remote, local, SYNC)).toEqual(local)
  })

  it('keeps an item added offline, and one added on another device', () => {
    const local = [
      { id: 1, updatedAt: 500 },
      { id: 2, createdAt: 1400, updatedAt: 1400 },
    ]
    const remote = [
      { id: 1, updatedAt: 500 },
      { id: 3, createdAt: 1300, updatedAt: 1300 },
    ]
    expect(mergeList(local, remote, SYNC).map((i) => i.id)).toEqual([1, 2, 3])
  })

  it('drops an item deleted on either side since the sync', () => {
    // 2 was deleted in the cloud; 3 was deleted on this device.
    const local = [
      { id: 1, updatedAt: 500 },
      { id: 2, updatedAt: 600 },
    ]
    const remote = [
      { id: 1, updatedAt: 500 },
      { id: 3, updatedAt: 700 },
    ]
    expect(mergeList(local, remote, SYNC).map((i) => i.id)).toEqual([1])
  })

  it('keeps an item edited elsewhere even though this device never had that edit', () => {
    const local = [{ id: 1, updatedAt: 500 }]
    const remote = [
      { id: 1, updatedAt: 500 },
      { id: 9, updatedAt: 2000 },
    ]
    expect(mergeList(local, remote, SYNC).map((i) => i.id)).toEqual([1, 9])
  })
})

describe('mergeWorkspace', () => {
  it('merges item lists and lets the device win on plain values', () => {
    const local = {
      todos: [{ id: 1, text: 'offline edit', updatedAt: 1500 }],
      security: { pinHash: 'device' },
      hideCompleted: true,
    }
    const remote = {
      todos: [
        { id: 1, text: 'old', updatedAt: 900 },
        { id: 2, text: 'from phone', updatedAt: 1100 },
      ],
      security: { pinHash: 'cloud' },
      hideCompleted: false,
      ownerId: 'u1',
    }
    expect(mergeWorkspace(local, remote, SYNC)).toEqual({
      todos: [
        { id: 1, text: 'offline edit', updatedAt: 1500 },
        { id: 2, text: 'from phone', updatedAt: 1100 },
      ],
      security: { pinHash: 'device' },
      hideCompleted: true,
      ownerId: 'u1',
    })
  })

  it('treats an emptied list as an item list when the other side has items', () => {
    const local = { goals: [] as unknown[] }
    const remote = { goals: [{ id: 5, updatedAt: 1200 }] }
    // Added in the cloud after the sync: kept.
    expect(mergeWorkspace(local, remote, SYNC).goals).toEqual([{ id: 5, updatedAt: 1200 }])
  })
})
