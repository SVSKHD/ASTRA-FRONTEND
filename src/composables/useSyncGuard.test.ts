import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSyncGuard } from '@/composables/useSyncGuard'
import type { Task } from '@/types'

// useSyncGuard is store-free, but its resolve path constructs no store; a pinia is
// set up only because the composable is normally used alongside one.
function task(over: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'base',
    tag: '',
    done: false,
    status: 'pending',
    deadline: '',
    notes: 'base',
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
    rootId: 1,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 100,
    ...over,
  }
}

describe('useSyncGuard', () => {
  it('freezes the list while a dialog is open and merges on close', () => {
    setActivePinia(createPinia())
    const g = useSyncGuard()
    const base = task()
    g.beginEdit(1, base)
    expect(g.syncSuppressed.value).toBe(true)

    // A remote snapshot lands mid-edit: it must be held, not applied.
    const current = [base]
    const incoming = [task({ title: 'their title', notes: 'their notes', updatedAt: 200 })]
    expect(g.reconcileTasks(current, incoming)).toBe(current) // frozen — unchanged

    // The user edited the title; close resolves the held remote against it.
    g.markTouched(1, 'title')
    const localEdited = task({ title: 'my title', notes: 'base', updatedAt: 150 })
    const { conflict, heldTasks } = g.resolveOnClose(1, localEdited)

    expect(heldTasks).toBe(incoming) // the held list is handed back to apply
    expect(conflict?.merged.title).toBe('my title') // touched → local kept
    expect(conflict?.merged.notes).toBe('their notes') // untouched → remote applied
    expect(conflict?.hasConflict).toBe(true) // remote also changed the title
    expect(g.remoteVersionOf(1)?.title).toBe('their title') // available for "view remote"
    expect(g.syncSuppressed.value).toBe(false) // released after close

    g.clearConflict(1)
  })

  it('applies incoming normally when nothing is being edited', () => {
    setActivePinia(createPinia())
    const g = useSyncGuard()
    const incoming = [task({ title: 'fresh' })]
    expect(g.reconcileTasks([task()], incoming)).toBe(incoming)
  })
})
