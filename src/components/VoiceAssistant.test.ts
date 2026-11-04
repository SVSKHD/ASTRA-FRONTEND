// The global mic, with the browser's recogniser replaced by a fake that
// "hears" a scripted phrase — the audio is mocked; everything after it is real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const post = vi.hoisted(() => vi.fn())
const get = vi.hoisted(() => vi.fn())
const push = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({
  aureon: { POST: post, GET: get },
  errorMessage: (_: unknown, f: string) => f,
  onUnauthorized: () => {},
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

import VoiceAssistant from '@/components/VoiceAssistant.vue'
import { tradingSession } from '@/trading/session'

type Handler = ((e: unknown) => void) | null
class FakeRecognition {
  static last: FakeRecognition | null = null
  static script: { phrase?: string; error?: string } = {}
  lang = ''
  continuous = false
  interimResults = false
  onresult: Handler = null
  onerror: Handler = null
  onend: (() => void) | null = null
  started = false
  constructor() {
    FakeRecognition.last = this
  }
  start() {
    this.started = true
  }
  stop() {
    const { phrase, error } = FakeRecognition.script
    if (error) this.onerror?.({ error })
    else if (phrase)
      this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: phrase } }] })
    this.onend?.()
  }
  abort() {}
}

function mountMic() {
  return mount(VoiceAssistant, { global: { stubs: { Icon: true } } })
}
async function say(w: ReturnType<typeof mountMic>, phrase: string) {
  FakeRecognition.script = { phrase }
  const mic = w.get('[data-testid="voice-mic"]')
  // Hold to talk: press, wait past the hold threshold, release.
  await mic.trigger('pointerdown')
  vi.advanceTimersByTime(500)
  await mic.trigger('pointerup')
  await flushPromises()
}

describe('<VoiceAssistant />', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition =
      FakeRecognition
    post.mockReset()
    get.mockReset()
    push.mockReset()
    Object.assign(tradingSession, { checked: true, user: null, role: '', error: '' })
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  })

  it('hears a phrase, shows transcript, intent and reply, and opens the screen', async () => {
    const w = mountMic()
    await say(w, 'open the news')
    expect(FakeRecognition.last?.started).toBe(true)
    const result = w.get('[data-testid="voice-result"]').text()
    expect(result).toContain('“open the news”')
    expect(result).toContain('open_news')
    expect(result).toContain('Opening News.')
    expect(push).toHaveBeenCalledWith('/news')
    expect(post).not.toHaveBeenCalled()
  })

  it('stays read-only: an approval becomes "open it in Spasta" and navigation', async () => {
    Object.assign(tradingSession, { user: { email: 'a@x' }, role: 'admin' })
    post.mockResolvedValue({
      data: { intent: 'open_approval', route: '/dev/approvals/12', source: 'grammar', note: null },
      response: { status: 200 },
    })
    const w = mountMic()
    await say(w, 'approve request 12')
    expect(post).toHaveBeenCalledWith('/api/v1/voice/intent', {
      body: { transcript: 'approve request 12' },
    })
    expect(w.text()).toContain('open it in Spasta')
    expect(push).toHaveBeenCalledWith('/dev/approvals/12')
  })

  it('explains a refused mic with steps, and the text box still works', async () => {
    FakeRecognition.script = { error: 'not-allowed' }
    const w = mountMic()
    const mic = w.get('[data-testid="voice-mic"]')
    await mic.trigger('pointerdown')
    vi.advanceTimersByTime(500)
    await mic.trigger('pointerup')
    await flushPromises()
    expect(w.text()).toMatch(/Microphone access is blocked/)
    expect(w.findAll('.va__steps li').length).toBeGreaterThan(1)
    await w.get('#voice-text').setValue('show images')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/images')
  })

  it('offers typing when the browser has no recogniser', async () => {
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    const w = mountMic()
    await w.get('[data-testid="voice-mic"]').trigger('pointerdown')
    expect(w.text()).toContain('no speech recognition')
    expect(w.find('#voice-text').exists()).toBe(true)
  })
})
