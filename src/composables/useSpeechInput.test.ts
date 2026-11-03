// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

// A stand-in recogniser the test drives by hand.
class FakeRecognition {
  static last: FakeRecognition
  lang = ''
  continuous = false
  interimResults = false
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
  say(chunks: [string, boolean][]) {
    this.onresult?.({
      resultIndex: 0,
      results: chunks.map(([t, isFinal]) => ({ isFinal, 0: { transcript: t } })),
    })
  }
}

async function setup(initial = '') {
  const { useSpeechInput } = await import('@/composables/useSpeechInput')
  let text = initial
  const errors: string[] = []
  let api!: ReturnType<typeof useSpeechInput>
  mount(
    defineComponent({
      setup() {
        api = useSpeechInput({
          current: () => text,
          onText: (t) => (text = t),
          onError: (m) => errors.push(m),
        })
        return () => h('div')
      },
    }),
  )
  return { api, text: () => text, errors }
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  vi.resetModules()
})

describe('useSpeechInput', () => {
  it('is not offered where the browser has no recogniser', async () => {
    const { api } = await setup()
    expect(api.supported).toBe(false)
  })

  it('adds what is said after what was typed, live, and stops cleanly', async () => {
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition
    const { api, text } = await setup('Plan:')
    api.toggle()
    expect(api.listening.value).toBe(true)
    FakeRecognition.last.say([['book flights', false]])
    expect(text()).toBe('Plan: book flights')
    FakeRecognition.last.say([['book flights to Goa', true]])
    expect(text()).toBe('Plan: book flights to Goa')
    api.toggle()
    expect(api.listening.value).toBe(false)
  })

  it('explains a blocked microphone', async () => {
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition
    const { api, errors } = await setup()
    api.start()
    FakeRecognition.last.onerror?.({ error: 'not-allowed' })
    expect(errors[0]).toMatch(/blocked/)
  })

  it('says so when the browser refuses to start the mic', async () => {
    class Throws extends FakeRecognition {
      start() {
        throw new Error('NotAllowedError')
      }
    }
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = Throws
    const { api, errors } = await setup()
    api.start()
    expect(api.listening.value).toBe(false)
    expect(errors[0]).toMatch(/microphone/)
  })
})
