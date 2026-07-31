import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { seedBots } from '@/utils/bots'

describe('AI chat store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('creates a chat, titles it from the first user message, and streams a reply', () => {
    const app = useAppStore()
    const id = app.newAiChat()
    expect(app.activeAiChat?.id).toBe(id)
    expect(app.aiChatById(id)!.title).toBe('New chat')

    app.addAiMessage(id, { role: 'user', content: 'Summarise my overdue todos' })
    expect(app.aiChatById(id)!.title).toBe('Summarise my overdue todos')

    const asst = app.addAiMessage(id, { role: 'assistant', content: '', model: 'claude-opus-4-6' })
    app.appendAiMessageContent(id, asst, 'You have ')
    app.appendAiMessageContent(id, asst, '3 overdue.')
    const msg = app.aiChatById(id)!.messages.find((m) => m.id === asst)!
    expect(msg.content).toBe('You have 3 overdue.')
    expect(msg.model).toBe('claude-opus-4-6')
  })

  it('deletes a chat and re-points the active id', () => {
    const app = useAppStore()
    const a = app.newAiChat()
    const b = app.newAiChat()
    app.selectAiChat(a)
    app.deleteAiChat(a)
    expect(app.aiChatById(a)).toBeUndefined()
    expect(app.aiActiveChatId).toBe(b)
  })
})

describe('Bots store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('toggle shows the pending state until the heartbeat confirms', () => {
    const app = useAppStore()
    app.bots = seedBots(() => Math.floor(Math.random() * 1e9), Date.now())
    const bot = app.bots[0]
    expect(bot.enabled).toBe(false)

    app.toggleBot(bot.id)
    // Optimistically enabled but pending — not yet confirmed running.
    expect(app.botById(bot.id)!.enabled).toBe(true)
    expect(app.botById(bot.id)!.pending).toBe(true)

    vi.advanceTimersByTime(1200)
    expect(app.botById(bot.id)!.pending).toBe(false)
    expect(app.botById(bot.id)!.status).toBe('running')
  })

  it('kill switch disables every enabled bot', () => {
    const app = useAppStore()
    app.bots = seedBots(() => Math.floor(Math.random() * 1e9), Date.now())
    app.bots = app.bots.map((b) => ({ ...b, enabled: true }))
    app.stopAllBots()
    vi.advanceTimersByTime(1200)
    expect(app.bots.every((b) => b.enabled === false)).toBe(true)
  })
})
