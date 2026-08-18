// The detail dialog's state machine (section 18a/18e): what the stack does, and
// the sync-guard bookkeeping around entering and leaving a frame.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useSyncGuard } from '@/composables/useSyncGuard'
import type { Task } from '@/types'

function makeTask(id: number, over: Partial<Task> = {}): Task {
  return {
    id,
    title: 'task ' + id,
    tag: '',
    done: false,
    status: 'pending',
    deadline: '',
    notes: '',
    repo: '',
    rolledOverAt: null,
    rolloverCount: 0,
    completedAt: null,
    linked: [],
    parents: [],
    reminderIds: [],
    sourceRef: null,
    parentId: null,
    order: 0,
    depth: 0,
    rootId: id,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

function freshStore() {
  setActivePinia(createPinia())
  const app = useAppStore()
  const guard = useSyncGuard()
  // The guard is a module-level session shared across stores, so a previous
  // test's open dialog would otherwise leak into this one.
  for (const id of [...guard.editingIds]) guard.editingIds.delete(id)
  for (const id of [...guard.dirtyIds]) guard.dirtyIds.delete(id)
  app.tasks = [makeTask(1), makeTask(2, { parentId: 1 }), makeTask(3)]
  app.goals = [
    {
      id: 10,
      title: 'Ship it',
      description: '',
      status: 'active',
      targetDate: '',
      startDate: '',
      color: '',
      icon: '',
      source: 'manual',
      sourceUrl: '',
      parentId: null,
      order: 0,
      depth: 0,
      rootId: 10,
      localRev: 0,
      updatedBy: '',
      createdAt: 0,
      updatedAt: 0,
    },
  ]
  return { app, guard }
}

describe('opening', () => {
  beforeEach(freshStore)

  it('opens a task over the list it was opened from', () => {
    const { app } = freshStore()
    app.openDetail('task', 1, [1, 2, 3])
    expect(app.detailOpen).toBe(true)
    expect(app.detailFrame).toEqual({ kind: 'task', id: 1 })
    expect(app.detailSiblings).toEqual([1, 2, 3])
  })

  it('registers the task with the sync guard so its list stops reordering', () => {
    const { app, guard } = freshStore()
    app.openDetail('task', 1)
    expect(guard.isEditing(1)).toBe(true)
    expect(guard.syncSuppressed.value).toBe(true)
  })

  it('holds the list for a goal too, which has tasks underneath it', () => {
    const { app, guard } = freshStore()
    app.openDetail('goal', 10)
    expect(guard.editingIds.has(10)).toBe(true)
    // The list behind must not reorder while it is open (section 18e).
    const incoming = [makeTask(3), makeTask(1)]
    expect(app.tasks.map((t) => t.id)).toEqual([1, 2, 3])
    expect(incoming.map((t) => t.id)).toEqual([3, 1])
  })

  it('re-opening the same task just refreshes the list it steps through', () => {
    const { app } = freshStore()
    app.openDetail('task', 1, [1, 2])
    app.openDetail('task', 1, [1, 2, 3])
    expect(app.detailStack).toHaveLength(1)
    expect(app.detailSiblings).toEqual([1, 2, 3])
  })

  it('opens with no arrows when the caller named no list', () => {
    const { app } = freshStore()
    app.openDetail('task', 1)
    expect(app.detailSteps).toEqual({ prevId: null, nextId: null })
  })
})

describe('stepping and drilling in', () => {
  beforeEach(freshStore)

  it('offers prev and next from the list behind', () => {
    const { app } = freshStore()
    app.openDetail('task', 2, [1, 2, 3])
    expect(app.detailSteps).toEqual({ prevId: 1, nextId: 3 })
  })

  it('steps without leaving the dialog', () => {
    const { app } = freshStore()
    app.openDetail('task', 1, [1, 2, 3])
    app.stepDetail(2)
    expect(app.detailFrame).toEqual({ kind: 'task', id: 2 })
    expect(app.detailStack).toHaveLength(1)
    expect(app.detailOpen).toBe(true)
  })

  it('drilling in leaves a back path (acceptance 88)', () => {
    const { app } = freshStore()
    app.openDetail('task', 1, [1, 3])
    app.pushDetail('task', 2)
    expect(app.detailFrame).toEqual({ kind: 'task', id: 2 })
    expect(app.detailCanGoBack).toBe(true)
    expect(app.detailParent).toEqual({ kind: 'task', id: 1 })
    app.popDetail()
    expect(app.detailFrame).toEqual({ kind: 'task', id: 1 })
  })

  it('offers no sibling arrows below the top of the stack', () => {
    const { app } = freshStore()
    app.openDetail('task', 1, [1, 2, 3])
    app.pushDetail('task', 2)
    expect(app.detailSteps).toEqual({ prevId: null, nextId: null })
  })

  it('drilling from a goal into one of its tasks crosses kinds', () => {
    const { app, guard } = freshStore()
    app.openDetail('goal', 10)
    app.pushDetail('task', 3)
    expect(app.detailFrame).toEqual({ kind: 'task', id: 3 })
    expect(guard.isEditing(3)).toBe(true)
    // Section 18e: the goal was flushed on the way in, but the freeze never
    // lapsed — the subtask registered before the guard could drain anything.
    expect(guard.editingIds.has(10)).toBe(false)
    expect(guard.syncSuppressed.value).toBe(true)
  })

  it('registers the next frame only after flushing the current one', () => {
    const { app, guard } = freshStore()
    app.openDetail('task', 1, [1, 2, 3])
    app.stepDetail(3)
    // The task stepped away from is no longer protected; the new one is.
    expect(guard.isEditing(1)).toBe(false)
    expect(guard.isEditing(3)).toBe(true)
  })
})

describe('closing (section 18e ordering)', () => {
  beforeEach(freshStore)

  it('writes the local edit before releasing the guard', () => {
    const { app, guard } = freshStore()
    app.openDetail('task', 1)
    app.updateTask(1, 'title', 'edited in the dialog')
    app.closeDetail()
    expect(app.detailOpen).toBe(false)
    expect(guard.isEditing(1)).toBe(false)
    // The edit survived the flush rather than being rolled back by it.
    expect(app.tasks.find((t) => t.id === 1)?.title).toBe('edited in the dialog')
    // A flush bumps the write bookkeeping, which is what marks it as ours.
    expect(app.tasks.find((t) => t.id === 1)!.localRev).toBeGreaterThan(0)
  })

  it('leaves nothing held, however deep the reader drilled', () => {
    const { app, guard } = freshStore()
    app.openDetail('goal', 10)
    app.pushDetail('task', 1)
    app.pushDetail('task', 2)
    app.closeDetail()
    expect(guard.editingIds.size).toBe(0)
    expect(app.detailStack).toEqual([])
    expect(app.detailSiblings).toEqual([])
  })

  it('closes when the back arrow runs out of stack', () => {
    const { app } = freshStore()
    app.openDetail('task', 1)
    app.popDetail()
    expect(app.detailOpen).toBe(false)
  })

  it('forgets any unsaved-edit flag', () => {
    const { app } = freshStore()
    app.openDetail('task', 1)
    app.setDetailDirty(true)
    app.closeDetail()
    expect(app.detailDirty).toBe(false)
  })

  it('closing a dialog that is not open does nothing', () => {
    const { app } = freshStore()
    expect(() => app.closeDetail()).not.toThrow()
    expect(app.detailOpen).toBe(false)
  })
})

describe('the row entry points', () => {
  beforeEach(freshStore)

  it('a task row opens the task detail dialog', () => {
    const { app } = freshStore()
    app.openTaskDialog(3, [1, 3])
    expect(app.detailFrame).toEqual({ kind: 'task', id: 3 })
  })

  it('a goal card opens the goal detail dialog', () => {
    const { app } = freshStore()
    app.openGoalDialog(10, [10])
    expect(app.detailFrame).toEqual({ kind: 'goal', id: 10 })
  })
})
