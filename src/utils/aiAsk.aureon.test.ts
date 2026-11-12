// askAi on Aureon (VITE_AI_BACKEND=aureon): the one-off helpers are off there.
// Claude is the only model, and every POST /api/ai/chat is a saved conversation
// charged to the chat budget, so a typo fix would cost an Opus turn.
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function load() {
  vi.resetModules()
  vi.stubEnv('VITE_AI_BACKEND', 'aureon')
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  const mod = await import('./aiAsk')
  return { ...mod, fetchSpy }
}

const target = { provider: 'bytez' as const, model: 'Qwen/Qwen3-4B' }

describe('askAi with VITE_AI_BACKEND=aureon', () => {
  it('says the helpers are unavailable and asks nothing', async () => {
    const { askAi, aiHelpersAvailable, fetchSpy } = await load()
    expect(aiHelpersAvailable()).toBe(false)
    expect(await askAi('S', 'Q', { target })).toBeNull()
    expect(await askAi('S', 'Q', { target, background: true })).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
