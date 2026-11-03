// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

const post = vi.fn()
const get = vi.fn()
vi.mock('@/api/client', () => ({
  aureon: { POST: (...a: unknown[]) => post(...a), GET: (...a: unknown[]) => get(...a) },
  errorMessage: (_e: unknown, fallback: string) => fallback,
}))

class FakeRecognition {
  static last: FakeRecognition
  lang = ''
  continuous = true
  interimResults = true
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  constructor() {
    FakeRecognition.last = this
  }
  start() {}
  stop() {
    this.onend?.()
  }
  abort() {}
  say(t: string) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: t } }] })
  }
}

const answer = (route: string | null, note: string | null = null) => ({
  data: { intent: route ? 'x' : 'unknown', route, params: {}, source: 'grammar', note },
})

async function setup() {
  const { useVoiceNav } = await import('@/control/voice')
  const went: string[] = []
  const said: string[] = []
  let api!: ReturnType<typeof useVoiceNav>
  mount(
    defineComponent({
      setup() {
        api = useVoiceNav({ go: (r) => went.push(r), say: (m) => said.push(m) })
        return () => h('div')
      },
    }),
  )
  return { api, went, said }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition
})
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  post.mockReset()
  get.mockReset()
  vi.resetModules()
})

describe('safeVoiceRoute', () => {
  it('lets through only the five navigation screens', async () => {
    const { safeVoiceRoute } = await import('@/control/voice')
    for (const ok of [
      '/dev/approvals',
      '/dev/approvals/123',
      '/dev/approvals/0f3a9c2e-1b2c-4d5e-8f90-123456789abc',
      '/dev/repairs',
      '/dev/prs/42',
      '/dev/agents',
    ])
      expect(safeVoiceRoute(ok)).toBe(ok)
    for (const bad of [
      '/trading',
      '/dev/inbox',
      '/dev/approvals/1/approve',
      '/api/v1/approvals/1/approve',
      '/dev/prs/42/merge',
      'https://evil.example/dev/agents',
      '//evil.example',
      '/dev/approvals/../../trading',
      null,
      42,
    ])
      expect(safeVoiceRoute(bad)).toBeNull()
  })
})

describe('useVoiceNav', () => {
  it('listens for one phrase, asks the intent endpoint, and navigates', async () => {
    post.mockResolvedValue(answer('/dev/prs/42'))
    const { api, went } = await setup()
    api.toggle()
    const rec = FakeRecognition.last
    expect(api.state.value).toBe('listening')
    expect(rec.continuous).toBe(false) // one utterance: what iOS Safari supports
    rec.say('open PR 42')
    rec.onend?.()
    await flush()
    expect(post).toHaveBeenCalledWith('/api/v1/voice/intent', {
      body: { transcript: 'open PR 42' },
    })
    expect(went).toEqual(['/dev/prs/42'])
    expect(api.state.value).toBe('idle')
  })

  it('"approve" only opens the request; it never calls anything that acts', async () => {
    post.mockResolvedValue(answer('/dev/approvals/5', 'navigation only: review and act in the app'))
    const { api, went, said } = await setup()
    api.start()
    FakeRecognition.last.say('approve request 5')
    FakeRecognition.last.onend?.()
    await flush()
    expect(went).toEqual(['/dev/approvals/5'])
    expect(said[0]).toMatch(/navigation only/)
    // exactly one request, and it is the read-only intent lookup
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toBe('/api/v1/voice/intent')
    expect(get).not.toHaveBeenCalled()
  })

  it('refuses a route outside the allowlist even if the server sent one', async () => {
    post.mockResolvedValue(answer('/api/v1/approvals/5/approve'))
    const { api, went, said } = await setup()
    api.start()
    FakeRecognition.last.say('buy 100 shares')
    FakeRecognition.last.onend?.()
    await flush()
    expect(went).toEqual([])
    expect(said[0]).toMatch(/try/)
  })

  it('says why when the mic is blocked, and sends nothing', async () => {
    const { api, said } = await setup()
    api.start()
    FakeRecognition.last.onerror?.({ error: 'not-allowed' })
    FakeRecognition.last.onend?.()
    await flush()
    expect(said[0]).toMatch(/blocked/)
    expect(post).not.toHaveBeenCalled()
  })

  it('says why when the browser refuses to start the mic', async () => {
    class Throws extends FakeRecognition {
      start() {
        throw new Error('NotAllowedError')
      }
    }
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = Throws
    const { api, said } = await setup()
    api.start()
    expect(api.state.value).toBe('idle')
    expect(said[0]).toMatch(/microphone/)
  })

  it('is not offered without a recogniser', async () => {
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    const { api } = await setup()
    expect(api.supported).toBe(false)
  })
})
