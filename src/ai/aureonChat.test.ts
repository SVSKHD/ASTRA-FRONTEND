// Migration stage 4: the AI tab on Aureon's local Ollama.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AureonChatError,
  MAX_CONTENT,
  aiBackend,
  askOnce,
  aureonAi,
  buildMessages,
  fallbackText,
  listModels,
  setTarget,
  streamChat,
  targetFor,
  targetLabel,
} from './aureonChat'

function sse(events: [string, unknown][]): Response {
  const text = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('')
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder()
      // Split mid-event to prove the parser buffers.
      c.enqueue(enc.encode(': ping\n\n' + text.slice(0, 25)))
      c.enqueue(enc.encode(text.slice(25)))
      c.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const STREAM: [string, unknown][] = [
  ['meta', { conversation_id: 'conv-1', model: 'llama3.1:8b', user_message_ids: [] }],
  ['token', { content: 'Hel' }],
  ['token', { content: 'lo' }],
  ['done', { message_id: 'm', prompt_tokens: 12, completion_tokens: 2 }],
]

beforeEach(() => {
  aureonAi.conversations = {}
  aureonAi.model = ''
  aureonAi.targets = {}
  aureonAi.pending = null
  aureonAi.catalog = null
  aureonAi.usage = null
})
afterEach(() => {
  document.cookie = 'aureon_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

describe('aiBackend', () => {
  it('defaults to Aureon and only accepts proxy explicitly', () => {
    expect(aiBackend(undefined)).toBe('aureon')
    expect(aiBackend('AUREON')).toBe('aureon')
    expect(aiBackend('ollama')).toBe('aureon')
    expect(aiBackend(' Proxy ')).toBe('proxy')
  })
})

describe('buildMessages', () => {
  it('sends only system + the new user turn', () => {
    expect(buildMessages('Be brief.', [], 'Hi', false)).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Hi' },
    ])
  })
  it('carries earlier turns once, as a transcript, when the chat has no Aureon conversation', () => {
    const history = [
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'answer' },
    ]
    const first = buildMessages('Sys', history, 'next', false)
    expect(first[0].content).toContain('Conversation so far:\n\nUser: first\n\nAssistant: answer')
    const later = buildMessages('Sys', history, 'next', true)
    expect(later[0].content).toBe('Sys')
  })
  it('never sends an assistant role and clips to the server limit', () => {
    const msgs = buildMessages(
      'x'.repeat(MAX_CONTENT + 10),
      [],
      'y'.repeat(MAX_CONTENT + 10),
      false,
    )
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user'])
    expect(msgs.every((m) => m.content.length <= MAX_CONTENT)).toBe(true)
  })
})

describe('streamChat', () => {
  it('posts with cookies + CSRF, streams text, remembers the conversation', async () => {
    document.cookie = 'aureon_csrf=c1'
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return sse(STREAM)
    }) as unknown as typeof fetch
    const out = []
    for await (const ev of streamChat({
      model: 'llama3.1:8b',
      system: 'S',
      history: [],
      prompt: 'Hi',
      chatKey: '7',
      fetchImpl,
    }))
      out.push(ev)
    expect(calls[0].url).toBe('/api/chat')
    expect(calls[0].init.credentials).toBe('include')
    expect((calls[0].init.headers as Record<string, string>)['X-CSRF-Token']).toBe('c1')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      model: 'llama3.1:8b',
      messages: [
        { role: 'system', content: 'S' },
        { role: 'user', content: 'Hi' },
      ],
    })
    expect(out).toEqual([
      {
        model: 'llama3.1:8b',
        route: {
          provider: 'ollama',
          model: 'llama3.1:8b',
          fallbackReason: null,
          localOnly: false,
          costUsd: null,
          filterCategories: [],
        },
      },
      { text: 'Hel' },
      { text: 'lo' },
      { usage: { in: 12, out: 2 } },
    ])
    expect(aureonAi.conversations['7']).toBe('conv-1')

    // The next turn continues the same server conversation.
    await streamChat({
      model: 'm',
      system: 'S',
      history: [],
      prompt: 'More',
      chatKey: '7',
      fetchImpl,
    }).next()
    expect(JSON.parse(String(calls[1].init.body)).conversation_id).toBe('conv-1')
  })

  it('turns HTTP failures into readable errors', async () => {
    const respond = (status: number, body: unknown) =>
      (async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        })) as unknown as typeof fetch
    const run = (fetchImpl: typeof fetch) =>
      streamChat({
        model: 'x',
        system: '',
        history: [],
        prompt: 'p',
        chatKey: '9',
        fetchImpl,
      }).next()
    await expect(run(respond(401, {}))).rejects.toThrow('Sign in to Aureon')
    await expect(run(respond(404, { available: ['qwen2.5:7b'] }))).rejects.toThrow(
      'Installed: qwen2.5:7b',
    )
    await expect(run(respond(429, {}))).rejects.toBeInstanceOf(AureonChatError)
    // A stale conversation id is forgotten on 404.
    aureonAi.conversations['9'] = 'gone'
    await expect(run(respond(404, { detail: 'conversation not found' }))).rejects.toThrow()
    expect(aureonAi.conversations['9']).toBeUndefined()
  })

  it('reports a model error event', async () => {
    const fetchImpl = (async () =>
      sse([
        ['error', { code: 'model_error', message: 'runner crashed' }],
      ])) as unknown as typeof fetch
    const out = []
    for await (const ev of streamChat({
      model: 'x',
      system: '',
      history: [],
      prompt: 'p',
      chatKey: null,
      fetchImpl,
    }))
      out.push(ev)
    expect(out).toEqual([{ error: 'runner crashed' }])
  })
})

describe('askOnce', () => {
  it('collects the answer and starts no remembered conversation', async () => {
    let body: Record<string, unknown> = {}
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body))
      return sse(STREAM)
    }) as unknown as typeof fetch
    expect(await askOnce('S', 'Q', { model: 'm', fetchImpl })).toBe('Hello')
    expect(aureonAi.conversations).toEqual({})
    // The prompt helpers never leave the local model.
    expect(body.provider).toBe('ollama')
  })
})

describe('providers (OpenRouter via the server)', () => {
  const OR = 'google/gemini-2.5-flash-lite'

  async function collect(events: [string, unknown][], extra: Record<string, unknown> = {}) {
    const bodies: Record<string, unknown>[] = []
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return sse(events)
    }) as unknown as typeof fetch
    const out = []
    for await (const ev of streamChat({
      model: OR,
      provider: 'openrouter',
      system: '',
      history: [],
      prompt: 'p',
      chatKey: '5',
      fetchImpl,
      ...extra,
    }))
      out.push(ev)
    return { out, bodies }
  }

  it('sends the provider and model and reads who answered', async () => {
    const { out, bodies } = await collect([
      ['meta', { conversation_id: 'c', provider: 'openrouter', model: OR, local_only: false }],
      ['token', { content: 'hi' }],
      [
        'done',
        {
          prompt_tokens: 3,
          completion_tokens: 1,
          provider: 'openrouter',
          model: OR,
          cost_usd: '0.00001',
        },
      ],
    ])
    expect(bodies[0]).toMatchObject({ provider: 'openrouter', model: OR })
    expect(out[0].route).toMatchObject({ provider: 'openrouter', model: OR, localOnly: false })
    expect(out[2].route).toMatchObject({ provider: 'openrouter', costUsd: '0.00001' })
    expect(out[2].usage).toEqual({ in: 3, out: 1 })
  })

  it('marks a turn the filter kept local', async () => {
    const { out } = await collect([
      [
        'meta',
        {
          conversation_id: 'c',
          provider: 'ollama',
          model: 'qwen2.5:3b',
          requested_provider: 'openrouter',
          fallback_reason: 'filter',
          local_only: true,
          filter_categories: ['finance'],
        },
      ],
      [
        'done',
        { provider: 'ollama', model: 'qwen2.5:3b', fallback_reason: 'filter', local_only: true },
      ],
    ])
    expect(out[0]).toMatchObject({
      model: 'qwen2.5:3b',
      route: {
        provider: 'ollama',
        requestedProvider: 'openrouter',
        fallbackReason: 'filter',
        localOnly: true,
      },
    })
  })

  it('passes a mid-reply fallback on, with a reset', async () => {
    const { out } = await collect([
      ['meta', { conversation_id: 'c', provider: 'openrouter', model: OR }],
      ['token', { content: 'half' }],
      [
        'fallback',
        {
          provider: 'ollama',
          model: 'qwen2.5:3b',
          reason: 'rate_limited',
          local_only: false,
          reset: true,
        },
      ],
      ['token', { content: 'local' }],
      ['done', { provider: 'ollama', model: 'qwen2.5:3b', fallback_reason: 'rate_limited' }],
    ])
    expect(out[2]).toMatchObject({
      reset: true,
      model: 'qwen2.5:3b',
      route: { provider: 'ollama', fallbackReason: 'rate_limited', localOnly: false },
    })
    expect(out[4].route?.fallbackReason).toBe('rate_limited')
  })

  it('shows a disallowed OpenRouter model as the server says', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          detail: "model 'x/y' is not an allowed OpenRouter model",
          available: [OR],
        }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch
    aureonAi.conversations['5'] = 'keep'
    await expect(collect([], { fetchImpl })).rejects.toThrow('not an allowed OpenRouter model')
    expect(aureonAi.conversations['5']).toBe('keep') // not mistaken for a deleted conversation
  })

  it('picks per chat: its own, then legacy-local, then pending, then the server default', () => {
    expect(targetFor(null)).toBeNull()
    aureonAi.catalog = {
      default: { provider: 'openrouter', model: OR },
      localFallbackModel: 'qwen2.5:3b',
      ollamaReachable: true,
      models: [],
      openrouterOff: null,
    }
    expect(targetFor('1')).toEqual({ provider: 'openrouter', model: OR })
    setTarget(null, { provider: 'ollama', model: 'mistral:7b' })
    expect(targetFor('1')).toEqual({ provider: 'ollama', model: 'mistral:7b' })
    expect(aureonAi.model).toBe('mistral:7b')
    setTarget('2', { provider: 'openrouter', model: OR })
    expect(targetFor('2')).toEqual({ provider: 'openrouter', model: OR })
    // A chat that already talked to the server before providers existed stays local.
    aureonAi.conversations['3'] = 'old-conv'
    expect(targetFor('3')).toEqual({ provider: 'ollama', model: 'mistral:7b' })
  })

  it('explains fallbacks in words', () => {
    expect(fallbackText('filter')).toContain('stays on this server')
    expect(fallbackText('daily_cap_reached')).toContain('budget')
    expect(fallbackText('something_new')).toBe('something new')
    expect(fallbackText(null)).toBe('')
    expect(targetLabel({ provider: 'openrouter', model: OR })).toBe(`OpenRouter · ${OR}`)
  })
})

describe('listModels', () => {
  it('lists the server models and picks the first when none is chosen', async () => {
    vi.resetModules()
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            models: [
              {
                name: 'qwen2.5:7b',
                size: 4.7e9,
                family: 'qwen2',
                parameter_size: '7.6B',
                quantization: 'Q4_K_M',
                modified_at: null,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    const mod = await import('./aureonChat')
    const models = await mod.listModels()
    expect(models[0]).toMatchObject({ name: 'qwen2.5:7b', parameterSize: '7.6B' })
    expect(mod.aureonAi.model).toBe('qwen2.5:7b')
    vi.unstubAllGlobals()
  })
})

void listModels
