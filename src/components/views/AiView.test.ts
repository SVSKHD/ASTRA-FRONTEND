// AiView shows the empty-state suggestion chips, and (with no proxy configured)
// a suggestion still records the turn locally and explains the missing backend.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AiView from '@/components/views/AiView.vue'
import { useAppStore } from '@/stores/app'
import { vHoverStyle } from '@/directives/hoverStyle'
import { SUGGESTION_CHIPS } from '@/utils/ai'

const global = { directives: { 'hover-style': vHoverStyle } }

describe('<AiView />', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // A local .env may point at /api/ai; these tests are about the unset case.
    vi.stubEnv('VITE_AI_PROXY_URL', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('renders the four suggestion chips in the empty state', () => {
    const wrapper = mount(AiView, { global })
    for (const chip of SUGGESTION_CHIPS) expect(wrapper.text()).toContain(chip)
  })

  it('the New chat button creates a conversation', async () => {
    const app = useAppStore()
    const wrapper = mount(AiView, { global })
    expect(app.aiChats.length).toBe(0)
    const btn = wrapper.findAll('button').find((b) => b.text().includes('New chat'))
    await btn!.trigger('click')
    expect(app.aiChats.length).toBe(1)
  })

  it('renders a plan card and adds its steps under the named todo', async () => {
    const app = useAppStore()
    app.addTodo('Aquakart CRM')
    const parent = app.todos[0]
    const chatId = app.newAiChat()
    app.addAiMessage(chatId, { role: 'user', content: 'Break CRM into steps' })
    app.addAiMessage(chatId, {
      role: 'assistant',
      content:
        'Smallest first:\n```aureon\n{"steps":[{"text":"Fix the filter","mins":25},{"text":"Wire counts","mins":35}],"target":"Aquakart CRM"}\n```\nDone.\n```aureon\n{"followups":["What else is due?"]}\n```',
    })
    const wrapper = mount(AiView, { global })
    expect(wrapper.text()).toContain('Fix the filter')
    expect(wrapper.text()).toContain('25m')
    expect(wrapper.text()).toContain('What else is due?')
    expect(wrapper.text()).not.toContain('```')

    const add = wrapper.findAll('button').find((b) => b.text().includes('Add 2 subtasks'))
    expect(add).toBeTruthy()
    await add!.trigger('click')
    expect(app.todos.filter((t) => t.parentId === parent.id).map((t) => t.text)).toEqual([
      'Fix the filter',
      'Wire counts',
    ])
    expect(wrapper.text()).toContain('Added')
  })

  it('shows what Aureon sees', () => {
    const wrapper = mount(AiView, { global })
    expect(wrapper.text()).toContain('What Aureon sees')
    expect(wrapper.text()).toContain('This month (INR)')
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

describe('<AiView /> — add from a reply', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('opens a prefilled dialog and adds the reply as a calendar block', async () => {
    const app = useAppStore()
    const chatId = app.newAiChat()
    app.addAiMessage(chatId, { role: 'user', content: 'Plan my CRM work' })
    app.addAiMessage(chatId, {
      role: 'assistant',
      content:
        'Do it tomorrow.\n```aureon\n{"actions":[{"type":"event","title":"CRM focus","when":"2030-01-02T10:00","mins":90}]}\n```',
    })
    const wrapper = mount(AiView, { global, attachTo: document.body })
    const cal = wrapper.findAll('button.ai-action').find((b) => b.text() === 'Calendar')
    expect(cal!.classes()).toContain('is-suggested')
    await cal!.trigger('click')
    await wrapper.vm.$nextTick()

    const add = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Add to calendar',
    )
    expect(add).toBeTruthy()
    add!.click()
    await wrapper.vm.$nextTick()

    const task = app.tasks.find((t) => t.title === 'CRM focus')
    expect(task).toBeTruthy()
    expect(task!.startAt).toBe(new Date(2030, 0, 2, 10, 0).getTime())
    expect(task!.durationMins).toBe(90)
    wrapper.unmount()
  })
})
