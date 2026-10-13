import { beforeEach, describe, expect, it, vi } from 'vitest'
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
import NoteEditor from '@/components/notes/NoteEditor.vue'
import MarkdownView from '@/components/notes/MarkdownView.vue'
import UnsavedSheet from '@/components/ui/UnsavedSheet.vue'
import { useUiStore } from '@/stores/ui'
const mountDialog = () =>
  mount(TradeRulesDialog, {
    global: { stubs: { teleport: true, NoteEditor: true, MarkdownView: true, UnsavedSheet: true } },
  })
describe('personal trade book rules', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    settings.value = { tradeBookRules: '' }
    state.save.mockReset()
    useUiStore().tradeRulesOpen = true
  })
  it('creates rules and returns to reading mode after a successful save', async () => {
    state.save.mockImplementation(async (patch) => {
      settings.value = patch
      return true
    })
    const wrapper = mountDialog()
    expect(wrapper.findComponent(NoteEditor).exists()).toBe(true)
    wrapper.findComponent(NoteEditor).vm.$emit('update:modelValue', '# My rules\n- Check my setup')
    await wrapper.vm.$nextTick()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Save rules')!
      .trigger('click')
    await flushPromises()
    expect(state.save).toHaveBeenCalledWith({ tradeBookRules: '# My rules\n- Check my setup' })
    expect(wrapper.findComponent(MarkdownView).props('source')).toBe('# My rules\n- Check my setup')
    expect(wrapper.findComponent(NoteEditor).exists()).toBe(false)
    wrapper.unmount()
  })
  it('keeps a failed draft and asks before discarding changes', async () => {
    settings.value.tradeBookRules = 'Saved rules'
    state.save.mockResolvedValue(false)
    const wrapper = mountDialog()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Edit rules')!
      .trigger('click')
    wrapper.findComponent(NoteEditor).vm.$emit('update:modelValue', 'Unsaved rules')
    await wrapper.vm.$nextTick()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Save rules')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(NoteEditor).props('modelValue')).toBe('Unsaved rules')
    expect(wrapper.find('[role="alert"]').text()).toContain('Could not save')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Close')!
      .trigger('click')
    expect(wrapper.findComponent(UnsavedSheet).props('open')).toBe(true)
    expect(useUiStore().tradeRulesOpen).toBe(true)
    wrapper.findComponent(UnsavedSheet).vm.$emit('discard')
    expect(useUiStore().tradeRulesOpen).toBe(false)
    expect(settings.value.tradeBookRules).toBe('Saved rules')
    wrapper.unmount()
  })
})
