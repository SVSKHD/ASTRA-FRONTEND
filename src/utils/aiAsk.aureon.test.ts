// askAi on Aureon (VITE_AI_BACKEND=aureon): asked-for work runs on the local
// model; as-you-type proofreading (background) is off there.
import { afterEach, describe, expect, it, vi } from 'vitest'

function sse(text: string): Response {
  return new Response(
    `event: meta\ndata: {"conversation_id":"c","model":"m"}\n\nevent: token\ndata: {"content":${JSON.stringify(text)}}\n\nevent: done\ndata: {}\n\n`,
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function load(answer: string) {
  vi.resetModules()
  vi.stubEnv('VITE_AI_BACKEND', 'aureon')
  const fetchSpy = vi.fn(async () => sse(answer))
  vi.stubGlobal('fetch', fetchSpy)
  const { askAi } = await import('./aiAsk')
  const { aureonAi } = await import('@/ai/aureonChat')
  return { askAi, aureonAi, fetchSpy }
}

const target = { provider: 'bytez' as const, model: 'Qwen/Qwen3-4B' }

describe('askAi with VITE_AI_BACKEND=aureon', () => {
  it('answers through /api/chat with the local model', async () => {
    const { askAi, aureonAi, fetchSpy } = await load('{"ok":true}')
    aureonAi.model = 'qwen2.5:7b'
    expect(await askAi('S', 'Q', { target })).toBe('{"ok":true}')
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/chat')
    expect(JSON.parse(String(init.body)).model).toBe('qwen2.5:7b')
  })

  it('skips background proofreading and runs nothing without a model', async () => {
    const { askAi, aureonAi, fetchSpy } = await load('x')
    aureonAi.model = 'qwen2.5:7b'
    expect(await askAi('S', 'Q', { target, background: true })).toBeNull()
    aureonAi.model = ''
    expect(await askAi('S', 'Q', { target })).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
