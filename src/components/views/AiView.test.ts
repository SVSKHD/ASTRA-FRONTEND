// AiView shows the empty-state suggestion chips, and (with no proxy configured)
// a suggestion still records the turn locally and explains the missing backend.
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AiView from '@/components/views/AiView.vue'
import { useAppStore } from '@/stores/app'
import { vHoverStyle } from '@/directives/hoverStyle'
import { SUGGESTION_CHIPS } from '@/utils/ai'

const global = { directives: { 'hover-style': vHoverStyle } }

describe('<AiView />', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the four suggestion chips in the empty state', () => {
    const wrapper = mount(AiView, { global })
    for (const chip of SUGGESTION_CHIPS) expect(wrapper.text()).toContain(chip)
  })

  it('the New chat button creates a conversation', async () => {
    const app = useAppStore()
    const wrapper = mount(AiView, { global })
    expect(app.aiChats.length).toBe(0)
    await wrapper.find('button[aria-label="New chat"]').trigger('click')
    expect(app.aiChats.length).toBe(1)
  })

  it('clicking a suggestion records the turn and notes the missing proxy', async () => {
    const app = useAppStore()
    const wrapper = mount(AiView, { global })
    const chip = wrapper.findAll('button').find((b) => b.text() === SUGGESTION_CHIPS[0])
    expect(chip).toBeTruthy()
    await chip!.trigger('click')
    await wrapper.vm.$nextTick()

    const chat = app.activeAiChat
    expect(chat).not.toBeNull()
    // A user turn plus an assistant turn.
    expect(chat!.messages[0].role).toBe('user')
    expect(chat!.messages[0].content).toBe(SUGGESTION_CHIPS[0])
    expect(chat!.messages[1].role).toBe('assistant')
    // No proxy configured in the test env → the assistant note explains it.
    expect(chat!.messages[1].content).toContain('AI proxy not configured')
  })
})
