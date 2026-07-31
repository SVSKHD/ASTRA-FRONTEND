// Exercises the useDraft lifecycle inside a real mounted component (so onMounted,
// the deep form watch and the target-key watch all run), driving the store's
// draft primitives underneath. Timers are faked so the debounced autosave and the
// post-restore release tick are deterministic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useDraft, type UseDraftOptions } from '@/composables/useDraft'

type Api = ReturnType<typeof useDraft>

function mountDraft(
  form: Ref<Record<string, unknown>>,
  type: Ref<string> | string,
  id: Ref<number | null> | number | null,
  options: UseDraftOptions = {},
) {
  let api!: Api
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useDraft(type, id, form, options)
        return () => h('div')
      },
    }),
  )
  return { wrapper, api: () => api }
}

describe('useDraft', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('autosaves the form as a draft after the debounce, skipping the initial state', async () => {
    const app = useAppStore()
    const form = ref<Record<string, unknown>>({ text: '' })
    const { wrapper } = mountDraft(form, 'todo', null, {
      isEmpty: (p) => !String(p.text ?? '').trim(),
    })

    // Empty initial form: nothing saved yet.
    vi.advanceTimersByTime(1000)
    expect(app.draftFor('todo', null)).toBeNull()

    form.value = { text: 'half typed' }
    await wrapper.vm.$nextTick()
    // Not yet — still inside the debounce window.
    expect(app.draftFor('todo', null)).toBeNull()
    vi.advanceTimersByTime(800)
    expect(app.draftFor('todo', null)!.payload).toEqual({ text: 'half typed' })
  })

  it('restores a newer create draft silently and exposes it as hasDraft', async () => {
    const app = useAppStore()
    app.saveDraft('todo', null, { text: 'unsaved earlier' })
    const form = ref<Record<string, unknown>>({ text: '' })
    const { api } = mountDraft(form, 'todo', null)

    // onMounted evaluate() applied the draft into the form.
    expect(form.value.text).toBe('unsaved earlier')
    expect(api().hasDraft.value).toBe(true)
    expect(api().restoredAt.value).toBeGreaterThan(0)
    expect(api().fromOtherDevice.value).toBe(false)
  })

  it('discard deletes the draft and reverts to the baseline', async () => {
    const app = useAppStore()
    app.saveDraft('todo', 1, { text: 'draft body' })
    const form = ref<Record<string, unknown>>({ text: 'saved body' })
    const { api } = mountDraft(form, 'todo', 1, {
      entityUpdatedAt: () => 0,
      baseline: () => ({ text: 'saved body' }),
    })

    expect(form.value.text).toBe('draft body') // restored on mount
    api().discard()
    expect(app.draftFor('todo', 1)).toBeNull()
    expect(form.value.text).toBe('saved body')
    expect(api().hasDraft.value).toBe(false)
  })

  it('clear drops the draft on a successful save', () => {
    const app = useAppStore()
    app.saveDraft('note', 3, { body: 'x' })
    const form = ref<Record<string, unknown>>({ body: 'x' })
    const { api } = mountDraft(form, 'note', 3, { entityUpdatedAt: () => 0 })
    api().clear()
    expect(app.draftFor('note', 3)).toBeNull()
  })

  it('prompts (does not auto-apply) for a draft from another device', () => {
    const app = useAppStore()
    // Forge a draft that looks like it came from a different device.
    app.drafts = {
      'task:new': {
        entityType: 'task',
        entityId: null,
        payload: { title: 'from my phone' },
        updatedAt: Date.now(),
        deviceLabel: 'iPhone · zzzz',
      },
    }
    const form = ref<Record<string, unknown>>({ title: '' })
    const { api } = mountDraft(form, 'task', null)

    expect(api().fromOtherDevice.value).toBe(true)
    expect(api().hasDraft.value).toBe(true)
    // Not applied until the user chooses "Use".
    expect(form.value.title).toBe('')
    api().applyDraft()
    expect(form.value.title).toBe('from my phone')
    expect(api().fromOtherDevice.value).toBe(false)
  })

  it('follows the target when the entity id changes', async () => {
    const app = useAppStore()
    app.saveDraft('todo', 2, { text: 'draft for two' })
    const form = ref<Record<string, unknown>>({ text: 'one' })
    const id = ref<number | null>(1)
    const { wrapper, api } = mountDraft(form, 'todo', id)

    // Slot 1 has no draft.
    expect(api().hasDraft.value).toBe(false)

    // Point at entity 2, which has a stored draft.
    id.value = 2
    await wrapper.vm.$nextTick()
    expect(form.value.text).toBe('draft for two')
    expect(api().hasDraft.value).toBe(true)
  })
})
