import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

const load = () => import('@/utils/aiSettings')

describe('aiSettings', () => {
  it('starts on Bytez with each provider’s default model', async () => {
    const s = await load()
    expect(s.chatTarget()).toEqual({ provider: 'bytez', model: 'Qwen/Qwen3-4B' })
  })

  it('keeps a model per provider across a switch, and remembers it', async () => {
    const s = await load()
    s.setAiProvider('openrouter')
    s.setAiModel('anthropic/claude-haiku-5.5')
    s.setAiProvider('bytez')
    expect(s.chatTarget().model).toBe('Qwen/Qwen3-4B')
    s.setAiProvider('openrouter')
    expect(s.chatTarget()).toEqual({ provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' })
    await nextTick()

    vi.resetModules()
    const again = await load()
    expect(again.chatTarget()).toEqual({
      provider: 'openrouter',
      model: 'anthropic/claude-haiku-5.5',
    })
  })

  it('refuses an image model for the chat', async () => {
    const s = await load()
    s.setAiProvider('openrouter')
    expect(s.setAiModel('google/gemini-2.5-flash-image')).toBe(false)
    expect(s.setAiModel('openai/gpt-5-image-mini')).toBe(false)
    expect(s.chatTarget().model).toBe('google/gemini-2.5-flash')
    expect(s.setAiModel('anthropic/claude-haiku-5.5')).toBe(true)
  })

  it('ignores a malformed model id', async () => {
    const s = await load()
    s.setAiModel('not a model')
    expect(s.chatTarget().model).toBe('Qwen/Qwen3-4B')
  })

  it('proofreads on the cheapest OpenRouter model, whatever chat uses', async () => {
    const s = await load()
    s.setAiProvider('openrouter')
    s.setAiModel('anthropic/claude-opus-5.5')
    expect(s.proofreadTarget()).toEqual({
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash-lite',
    })
  })
})
