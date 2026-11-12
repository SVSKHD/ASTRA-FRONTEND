// The AI tab on Claude (VITE_AI_BACKEND=aureon, the default): an agent picker
// instead of a model picker, the answering agent and the turn's cost under each
// reply, approvals inline with a link to review them, and none of the controls
// for data the server now reads itself.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.hoisted(() => vi.stubEnv('VITE_AI_BACKEND', 'aureon'))
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AiView from '@/components/views/AiView.vue'
import { useAppStore } from '@/stores/app'
import { aureonAi } from '@/ai/aureonChat'
import { vHoverStyle } from '@/directives/hoverStyle'

const global = {
  directives: { 'hover-style': vHoverStyle },
  stubs: { RouterLink: RouterLinkStub },
}

describe('<AiView /> on Claude', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    aureonAi.agents = {}
    aureonAi.conversations = {}
    aureonAi.pending = 'auto'
  })
  afterEach(() => vi.unstubAllEnvs())

  it('picks an agent, not a model, and drops the data controls', () => {
    const w = mount(AiView, { global })
    const picker = w.get('[data-testid="agent-picker"]')
    expect(picker.text()).toContain('Auto')
    expect(picker.text()).toContain('Investments')
    expect(picker.text()).toContain('Business')
    expect(picker.text()).toContain('General')
    expect(w.text()).not.toContain('Use my data')
    expect(w.find('aside[aria-label="What Aureon sees"]').exists()).toBe(false)
    expect(w.text()).not.toContain('Work on an existing todo or task')
    // The one-off helpers (typo fix) are hidden: they would cost an Opus turn each.
    expect(w.find('button[aria-label="Fix typos in my items"]').exists()).toBe(false)
  })

  it('shows the agent, the cost and an approval to review under a reply', () => {
    const app = useAppStore()
    const id = app.newAiChat()
    app.addAiMessage(id, { role: 'user', content: 'Buy 5 TCS?' })
    app.addAiMessage(id, {
      role: 'assistant',
      content: 'I proposed a paper trade.',
      agent: 'investments',
      costUsd: '0.0412',
      approvals: [{ id: 'ap-1', action: 'paper_trade', summary: 'PAPER BUY 5 TCS at 3900' }],
    })
    const w = mount(AiView, { global })
    expect(w.get('[data-testid="agent-badge"]').text()).toBe('Investments')
    expect(w.get('[data-testid="reply-cost"]').text()).toBe('$0.0412')
    const card = w.get('[data-testid="approval-card"]')
    expect(card.text()).toContain('Awaiting your approval')
    expect(card.text()).toContain('PAPER BUY 5 TCS at 3900')
    expect(card.findComponent(RouterLinkStub).props('to')).toEqual({
      path: '/dev/ai-approvals',
      query: { id: 'ap-1' },
    })
    // No model badge for a Claude reply: the agent is the one choice there is.
    expect(w.find('[data-testid="reply-model"]').exists()).toBe(false)
  })

  it('shows a suggested reminder as a card that adds nothing until confirmed', async () => {
    const app = useAppStore()
    const id = app.newAiChat()
    app.addAiMessage(id, { role: 'user', content: 'Remind me to call Ravi tomorrow at 10' })
    app.addAiMessage(id, {
      role: 'assistant',
      content: 'I suggested a reminder.',
      agent: 'general',
      suggestions: [
        { kind: 'reminder', fields: { title: 'Call Ravi', date: '2026-11-13', time: '10:00' } },
      ],
    })
    const before = app.reminders.length
    const w = mount(AiView, { global, attachTo: document.body })
    const card = w.get('[data-testid="suggestion-card"]')
    expect(card.text()).toContain('Suggested')
    expect(card.text()).toContain('Reminder · Call Ravi · 2026-11-13, 10:00')
    await card.get('button').trigger('click')
    // The usual Add dialog, prefilled; still nothing created.
    expect(document.body.textContent ?? '').toContain('Add from this reply')
    const title = [...document.body.querySelectorAll('input')].find(
      (i) => (i as HTMLInputElement).value === 'Call Ravi',
    )
    expect(title).toBeTruthy()
    expect(app.reminders.length).toBe(before)
    w.unmount()
  })

  it('stores the agent picked for the open chat', async () => {
    const app = useAppStore()
    const id = app.newAiChat()
    const w = mount(AiView, { global })
    const control = w.findComponent({ name: 'SegmentedControl' })
    control.vm.$emit('update:modelValue', 'business')
    await w.vm.$nextTick()
    expect(aureonAi.agents[String(id)]).toBe('business')
    expect(w.get('[data-testid="agent-note"]').text()).toContain('Aquakart')
  })

  it('attaches files, says photos are not redacted, and sends their ids', async () => {
    const posts: { url: string; body: unknown }[] = []
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/api/ai/attachments')) {
        const file = (init?.body as FormData).get('file') as File
        return new Response(
          JSON.stringify({ id: `id-${file.name}`, name: file.name, kind: 'image',
                           media_type: 'image/png', size: file.size }), // prettier-ignore
          { status: 201, headers: { 'content-type': 'application/json' } },
        )
      }
      posts.push({ url: u, body: JSON.parse(String(init?.body ?? '{}')) })
      return new Response('event: done\ndata: {"conversation_id":"c1","text":"A chart."}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    })
    const app = useAppStore()
    app.newAiChat()
    const w = mount(AiView, { global, attachTo: document.body })
    const input = w.get('input[type="file"]')
    const png = new File([new Uint8Array([137, 80, 78, 71])], 'chart.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [png], configurable: true })
    await input.trigger('change')
    await vi.waitFor(() => expect(w.text()).toContain('chart.png'))
    await vi.waitFor(() => expect(w.text()).not.toContain('uploading…'))
    expect(w.get('[data-testid="unredacted-note"]').text()).toContain('not redacted')
    // A refused file is shown with its reason and never uploaded.
    const exe = new File(['MZ'], 'setup.exe')
    Object.defineProperty(input.element, 'files', { value: [exe], configurable: true })
    await input.trigger('change')
    await vi.waitFor(() => expect(w.text()).toContain('setup.exe'))
    // Send with no text: the files alone are enough.
    await w.get('button[aria-label="Send (Enter)"]').trigger('click')
    await vi.waitFor(() => expect(posts.length).toBe(1))
    expect(posts[0].body).toMatchObject({ attachments: ['id-chart.png'] })
    await vi.waitFor(() => expect(w.find('[data-testid="pending-files"]').exists()).toBe(false))
    w.unmount()
    vi.unstubAllGlobals()
  })
})
