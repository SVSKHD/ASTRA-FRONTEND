import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { draftKey } from '@/utils/drafts'

describe('draft primitives (store)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('saveDraft stores a keyed record stamped with this device', () => {
    const app = useAppStore()
    app.saveDraft('todo', null, { text: 'buy milk' })
    const rec = app.draftFor('todo', null)
    expect(rec).not.toBeNull()
    expect(rec!.entityType).toBe('todo')
    expect(rec!.entityId).toBeNull()
    expect(rec!.payload).toEqual({ text: 'buy milk' })
    expect(rec!.deviceLabel).toBe(app.deviceLabel)
    expect(rec!.updatedAt).toBeGreaterThan(0)
    expect(app.drafts[draftKey('todo', null)]).toBe(rec)
  })

  it('a create and an edit draft of the same type occupy different slots', () => {
    const app = useAppStore()
    app.saveDraft('task', null, { title: 'new one' })
    app.saveDraft('task', 42, { title: 'editing 42' })
    expect(app.draftFor('task', null)!.payload).toEqual({ title: 'new one' })
    expect(app.draftFor('task', 42)!.payload).toEqual({ title: 'editing 42' })
  })

  it('stores a copy so a later mutation of the source cannot rewrite the draft', () => {
    const app = useAppStore()
    const payload = { text: 'first' }
    app.saveDraft('todo', 1, payload)
    payload.text = 'mutated'
    expect(app.draftFor('todo', 1)!.payload).toEqual({ text: 'first' })
  })

  it('deleteDraft removes the slot and is a no-op when absent', () => {
    const app = useAppStore()
    app.saveDraft('note', 5, { body: 'x' })
    expect(app.draftFor('note', 5)).not.toBeNull()
    app.deleteDraft('note', 5)
    expect(app.draftFor('note', 5)).toBeNull()
    // Deleting again does not throw.
    expect(() => app.deleteDraft('note', 5)).not.toThrow()
  })
})
