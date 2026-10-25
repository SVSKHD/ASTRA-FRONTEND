import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
const state = vi.hoisted(() => ({ save: vi.fn() }))
const settings = ref({ tradeBookRules: '' })
vi.mock('@/composables/useSettings', () => ({
  useSettings: () => ({
    settings,
    ready: ref(true),
    uid: ref('owner'),
    error: ref(''),
    save: state.save,
  }),
}))
import TradeRulesDialog from './TradeRulesDialog.vue'
import RulesEditor from './RulesEditor.vue'
import UnsavedSheet from '@/components/ui/UnsavedSheet.vue'
import { useUiStore } from '@/stores/ui'
const mountDialog = () =>
  mount(TradeRulesDialog, {
    global: { stubs: { teleport: true, RulesEditor: true, UnsavedSheet: true } },
  })
const button = (wrapper: ReturnType<typeof mountDialog>, text: string) =>
  wrapper.findAll('button').find((b) => b.text() === text)!

describe('personal trade book rules', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    settings.value = { tradeBookRules: '' }
    state.save.mockReset()
    useUiStore().tradeRulesOpen = true
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the editor straight away and saves on its own after typing stops', async () => {
    state.save.mockImplementation(async (patch) => {
      settings.value = patch
      return true
    })
    const wrapper = mountDialog()
    const editor = wrapper.findComponent(RulesEditor)
    expect(editor.exists()).toBe(true)
    editor.vm.$emit('update:modelValue', '# My rules\n\n- [ ] Check my setup')
    await wrapper.vm.$nextTick()
    expect(state.save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    expect(state.save).toHaveBeenCalledWith({
      tradeBookRules: '# My rules\n\n- [ ] Check my setup',
    })
    expect(wrapper.text()).toContain('Saved')
    wrapper.unmount()
  })

  it('saves pending changes on Done', async () => {
    state.save.mockImplementation(async (patch) => {
      settings.value = patch
      return true
    })
    const wrapper = mountDialog()
    wrapper.findComponent(RulesEditor).vm.$emit('update:modelValue', '- [ ] Wait for close')
    await wrapper.vm.$nextTick()
    await button(wrapper, 'Done').trigger('click')
    await flushPromises()
    expect(state.save).toHaveBeenCalledWith({ tradeBookRules: '- [ ] Wait for close' })
    expect(useUiStore().tradeRulesOpen).toBe(false)
    wrapper.unmount()
  })

  it('keeps a failed draft and asks before discarding it', async () => {
    settings.value.tradeBookRules = 'Saved rules'
    state.save.mockResolvedValue(false)
    const wrapper = mountDialog()
    wrapper.findComponent(RulesEditor).vm.$emit('update:modelValue', 'Unsaved rules')
    await wrapper.vm.$nextTick()
    await button(wrapper, 'Done').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(RulesEditor).props('modelValue')).toBe('Unsaved rules')
    expect(wrapper.find('[role="alert"]').text()).toContain('Could not save')
    expect(wrapper.findComponent(UnsavedSheet).props('open')).toBe(true)
    expect(useUiStore().tradeRulesOpen).toBe(true)
    wrapper.findComponent(UnsavedSheet).vm.$emit('discard')
    expect(useUiStore().tradeRulesOpen).toBe(false)
    expect(settings.value.tradeBookRules).toBe('Saved rules')
    wrapper.unmount()
  })
})
