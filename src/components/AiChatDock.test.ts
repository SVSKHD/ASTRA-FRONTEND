// The chat dock's contract: a reply asked on the AI tab keeps streaming after
// the tab is left, the dock shows its progress from any other tab, pops as
// "Reply ready" when it lands, and "Open chat" goes back to that conversation.
// Hidden while the AI tab itself is showing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AiChatDock from '@/components/AiChatDock.vue'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useAiChat } from '@/composables/useAiChat'

vi.mock('@/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/supabase')>()),
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
  },
}))

// A fetch whose SSE body the test feeds by hand.
function streamingFetch() {
  const encoder = new TextEncoder()
  let ctrl!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start: (c) => (ctrl = c) })
  const fetchMock = vi.fn(async () => new Response(body, { status: 200 }))
  return {
    fetchMock,
    push: (data: unknown) => ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)),
    end: () => ctrl.close(),
  }
}

describe('<AiChatDock />', () => {
  // A dock left mounted keeps calling its own store's actions, and each call
  // makes that test's pinia the active one again.
  enableAutoUnmount(afterEach)
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubEnv('VITE_AI_PROXY_URL', '/api/ai')
  })
  afterEach(() => {
    useAiChat().stop()
    useAiChat().dismiss()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('follows a reply from another tab and pops when it lands', async () => {
    const app = useAppStore()
    const ui = useUiStore()
    const sse = streamingFetch()
    vi.stubGlobal('fetch', sse.fetchMock)

    ui.setTab('ai')
    const done = useAiChat().send('What is overdue?')
    await flushPromises()

    const wrapper = mount(AiChatDock)
    expect(wrapper.find('.ai-dock').exists()).toBe(false) // on the AI tab itself

    ui.setTab('todo')
    await flushPromises()
    expect(wrapper.text()).toContain('Thinking…')

    sse.push({ text: 'Two todos are ' })
    sse.push({ text: 'overdue.' })
    await flushPromises()
    expect(wrapper.text()).toContain('Writing…')
    expect(wrapper.text()).toContain('Two todos are overdue.')
    expect(wrapper.text()).toContain('Stop')

    sse.push({ usage: { in: 12, out: 5 } })
    sse.end()
    await done
    await flushPromises()
    expect(wrapper.find('.ai-dock--done').exists()).toBe(true)
    expect(wrapper.text()).toContain('Reply ready')

    const reply = app.activeAiChat!.messages[1]
    expect(reply.content).toBe('Two todos are overdue.')
    expect(reply.tokensIn).toBe(12)
    expect(reply.tokensOut).toBe(5)

    const [, init] = sse.fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token')
  })

  it('"Open chat" returns to the AI tab on that conversation', async () => {
    const app = useAppStore()
    const ui = useUiStore()
    const sse = streamingFetch()
    vi.stubGlobal('fetch', sse.fetchMock)

    const done = useAiChat().send('Hello')
    const chatId = app.aiActiveChatId
    sse.push({ text: 'Hi.' })
    sse.end()
    await done

    app.newAiChat() // somewhere else meanwhile
    ui.setTab('finances')
    const wrapper = mount(AiChatDock)
    await flushPromises()

    const open = wrapper.findAll('button').find((b) => b.text() === 'Open chat')!
    await open.trigger('click')
    expect(ui.tab).toBe('ai')
    expect(app.aiActiveChatId).toBe(chatId)
  })

  it('reports a proxy error in the bubble and the dock', async () => {
    const app = useAppStore()
    const ui = useUiStore()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 }),
      ),
    )
    ui.setTab('todo')
    await useAiChat().send('Hello')
    const wrapper = mount(AiChatDock)
    await flushPromises()
    expect(wrapper.text()).toContain('Reply failed')
    expect(app.activeAiChat!.messages[1].content).toContain('GEMINI_API_KEY is not configured.')
  })
})
