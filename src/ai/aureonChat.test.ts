// Migration stage 4: the AI tab on Aureon's local Ollama.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AureonChatError,
  MAX_CONTENT,
  aiBackend,
  askOnce,
  aureonAi,
  buildMessages,
  listModels,
  streamChat,
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
})
afterEach(() => {
  document.cookie = 'aureon_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

describe('aiBackend', () => {
  it('defaults to the proxy', () => {
    expect(aiBackend(undefined)).toBe('proxy')
    expect(aiBackend('AUREON')).toBe('aureon')
    expect(aiBackend('ollama')).toBe('proxy')
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
      { model: 'llama3.1:8b' },
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
    const fetchImpl = (async () => sse(STREAM)) as unknown as typeof fetch
    expect(await askOnce('S', 'Q', { model: 'm', fetchImpl })).toBe('Hello')
    expect(aureonAi.conversations).toEqual({})
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
