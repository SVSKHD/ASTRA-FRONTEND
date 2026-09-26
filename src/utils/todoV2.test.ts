import { describe, expect, it } from 'vitest'
import { buildIndex } from '@/utils/taskTree'
import {
  focusTargetOf,
  nextFocusAfter,
  nextUpOf,
  reviewCandidates,
  weekStart,
  weekStats,
} from '@/utils/todoV2'
import type { Todo } from '@/types'

function todo(id: number, over: Partial<Todo> = {}): Todo {
  return {
    id,
    text: 't' + id,
    done: false,
    status: 'pending',
    tag: '',
    description: '',
    completedAt: null,
    rolledOverAt: null,
    rolloverCount: 0,
    reminderIds: [],
    sourceRef: null,
    linked: [],
    parents: [],
    parentId: null,
    order: id,
    depth: 0,
    rootId: id,
    isPublic: false,
    shareId: null,
    sharedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  } as Todo
}

const done = { status: 'done' as const, done: true }
const list = [
  todo(1),
  todo(11, { parentId: 1, ...done }),
  todo(12, { parentId: 1 }),
  todo(13, { parentId: 1 }),
  todo(14, { parentId: 1 }),
  todo(2),
  todo(3, done),
  todo(31, { parentId: 3 }),
]
const index = buildIndex(list)

describe('focus targets', () => {
  it('focuses the first open subtask, or the todo itself when it has none', () => {
    expect(focusTargetOf(index, 1)).toBe(12)
    expect(focusTargetOf(index, 2)).toBe(2)
    expect(focusTargetOf(index, 99)).toBeNull()
  })
  it('advances to the next open sibling, wrapping', () => {
    expect(nextFocusAfter(index, 12)).toBe(13)
    expect(nextFocusAfter(index, 14)).toBe(12)
    expect(nextFocusAfter(index, 2)).toBeNull()
  })
})

describe('next up', () => {
  const roots = list.filter((t) => t.parentId == null)
  it('takes two open subtasks per open todo and skips done todos', () => {
    expect(nextUpOf(index, roots, new Set()).map((r) => r.sub.id)).toEqual([12, 13])
  })
  it('keeps a row ticked this session in place', () => {
    expect(nextUpOf(index, roots, new Set([11])).map((r) => r.sub.id)).toEqual([11, 12, 13])
  })
})

describe('weekly review', () => {
  it('starts the week on Monday', () => {
    expect(weekStart(new Date(2026, 8, 27, 20)).getDate()).toBe(21)
    expect(weekStart(new Date(2026, 8, 21, 1)).getDate()).toBe(21)
  })
  it('asks about open, live todos rolled over more than twice', () => {
    const got = reviewCandidates([
      todo(1, { rolloverCount: 3 }),
      todo(2, { rolloverCount: 2 }),
      todo(3, { rolloverCount: 5, ...done }),
      todo(4, { rolloverCount: 4, archivedAt: 5 }),
      todo(5, { rolloverCount: 6 }),
    ])
    expect(got.map((t) => t.id)).toEqual([5, 1])
  })
  it('counts this week’s done todos and subtasks separately', () => {
    const now = new Date(2026, 8, 26)
    const at = new Date(2026, 8, 22).getTime()
    const stats = weekStats(
      [
        todo(1, { completedAt: at }),
        todo(2, { completedAt: at, parentId: 1 }),
        todo(3, { completedAt: new Date(2026, 8, 1).getTime() }),
      ],
      now,
    )
    expect(stats).toEqual({ done: 1, subtasksClosed: 1 })
  })
})
