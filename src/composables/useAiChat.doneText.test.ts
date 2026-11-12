// A reply whose text events never arrived (an older server, or a proxy that dropped
// them) still shows: `done` carries the whole answer, and the chat uses it only when
// nothing was streamed, so a normal reply is never doubled.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const script = vi.hoisted(() => ({ events: [] as unknown[] }))
vi.mock('@/ai/aureonChat', async (orig) => {
  const real = await orig<typeof import('@/ai/aureonChat')>()
  return {
    ...real,
    aiBackend: () => 'aureon',
    async *streamChat() {
      for (const e of script.events) yield e
    },
  }
})

import { useAiChat } from '@/composables/useAiChat'
import { useAppStore } from '@/stores/app'

const done = (text: string) => ({
  done: {
    conversationId: 'c1',
    messageId: 2,
    costUsd: '0.0001',
    steps: 1,
    stopReason: 'end_turn',
    approvals: [],
    text,
  },
})

function lastAssistant(): string {
  const app = useAppStore()
  const chat = app.aiChatById(app.aiActiveChatId!)!
  return [...chat.messages].reverse().find((m) => m.role === 'assistant')?.content ?? ''
}

describe('useAiChat on Aureon: the answer from done', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('shows done.text when no text event came', async () => {
    script.events = [{ meta: { conversationId: 'c1', agent: 'general' } }, done('Hello there.')]
    await useAiChat().send('hi')
    expect(lastAssistant()).toBe('Hello there.')
  })

  it('does not repeat an answer that was streamed', async () => {
    script.events = [
      { meta: { conversationId: 'c1', agent: 'general' } },
      { text: 'Hello ' },
      { text: 'there.' },
      done('Hello there.'),
    ]
    await useAiChat().send('hi')
    expect(lastAssistant()).toBe('Hello there.')
  })
})
