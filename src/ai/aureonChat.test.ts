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
  mapCatalog,
  routeOf,
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
      providers: [],
      defaultExternalProvider: 'openrouter',
      globalDailyLimitUsd: null,
    }
    expect(targetFor('1')).toEqual({ provider: 'openrouter', model: OR })
    setTarget(null, { provider: 'ollama', model: 'mistral:7b' })
    expect(targetFor('1')).toEqual({ provider: 'ollama', model: 'mistral:7b' })
    expect(aureonAi.model).toBe('mistral:7b')
    setTarget('2', { provider: 'openrouter', model: OR })
    expect(targetFor('2')).toEqual({ provider: 'openrouter', model: OR })
    // A chat that already has a server conversation and no pick sends neither: the
    // server keeps that conversation's own provider (never forced to local).
    aureonAi.conversations['3'] = 'old-conv'
    expect(targetFor('3')).toBeNull()
  })

  it('explains fallbacks in words', () => {
    expect(fallbackText('filter')).toContain('stays on this server')
    expect(fallbackText('daily_cap_reached')).toContain('budget')
    expect(fallbackText('something_new')).toBe('something new')
    expect(fallbackText(null)).toBe('')
    expect(targetLabel({ provider: 'openrouter', model: OR })).toBe(`OpenRouter · ${OR}`)
  })
})

// backend docs/26-ai-providers.md: Anthropic and Gemini as direct providers next to
// OpenRouter and Ollama, with local Ollama the only fallback.
describe('four providers', () => {
  const CLAUDE = 'claude-test-model'
  const GEMINI = 'gemini-test-model'

  const provider = (p: string, over: Record<string, unknown> = {}) => ({
    provider: p,
    label: p,
    enabled: true,
    configured: true,
    usable: true,
    unavailable_reason: null,
    default_model: null,
    allowed_models: [],
    daily_limit_usd: p === 'ollama' ? null : '1.00',
    cost_source: p === 'ollama' ? 'none' : p === 'openrouter' ? 'provider' : 'configured_price',
    privacy: p === 'ollama' ? 'local' : 'external',
    ...over,
  })

  const CATALOG = {
    default: { provider: 'anthropic', model: CLAUDE },
    local_fallback_model: 'qwen2.5:3b',
    ollama_reachable: true,
    models: [
      {
        provider: 'ollama',
        id: 'qwen2.5:3b',
        label: 'qwen2.5:3b',
        available: true,
        unavailable_reason: null,
        capabilities: ['chat', 'streaming'],
        privacy: 'local',
      },
      {
        provider: 'anthropic',
        id: CLAUDE,
        label: CLAUDE,
        available: true,
        unavailable_reason: null,
        capabilities: ['chat', 'streaming'],
        privacy: 'external',
      },
      {
        provider: 'gemini',
        id: GEMINI,
        label: GEMINI,
        available: false,
        unavailable_reason: 'no_pricing',
        capabilities: ['chat', 'streaming'],
        privacy: 'external',
      },
    ],
    openrouter: {
      enabled: false,
      unavailable_reason: 'disabled',
      research_external_allowed: false,
    },
    providers: [
      provider('ollama', { default_model: 'qwen2.5:3b', allowed_models: ['qwen2.5:3b'] }),
      provider('openrouter', { enabled: false, usable: false, unavailable_reason: 'disabled' }),
      provider('anthropic', { default_model: CLAUDE, allowed_models: [CLAUDE] }),
      provider('gemini', { default_model: GEMINI, allowed_models: [GEMINI] }),
    ],
    default_external_provider: 'anthropic',
    global_daily_limit_usd: '2.00',
  } as unknown as Parameters<typeof mapCatalog>[0]

  it('maps the catalog: models, availability, privacy and every provider', () => {
    const c = mapCatalog(CATALOG)
    expect(c.default).toEqual({ provider: 'anthropic', model: CLAUDE })
    expect(c.providers.map((p) => p.provider)).toEqual([
      'ollama',
      'openrouter',
      'anthropic',
      'gemini',
    ])
    expect(c.providers[1]).toMatchObject({ usable: false, unavailableReason: 'disabled' })
    expect(c.providers[2]).toMatchObject({
      configured: true,
      defaultModel: CLAUDE,
      dailyLimitUsd: '1.00',
      costSource: 'configured_price',
      privacy: 'external',
    })
    expect(c.models.find((m) => m.provider === 'gemini')).toMatchObject({
      available: false,
      unavailableReason: 'no_pricing',
      privacy: 'external',
    })
    expect(c.models[0]).toMatchObject({ privacy: 'local', capabilities: ['chat', 'streaming'] })
    expect(c.defaultExternalProvider).toBe('anthropic')
    expect(c.globalDailyLimitUsd).toBe('2.00')
  })

  it('reads an older server (no providers[], no availability) the way it read it before', () => {
    const c = mapCatalog({
      default: { provider: 'openrouter', model: 'google/x' },
      local_fallback_model: 'qwen2.5:3b',
      ollama_reachable: true,
      models: [
        { provider: 'ollama', id: 'qwen2.5:3b', label: 'qwen2.5:3b' },
        { provider: 'openrouter', id: 'google/x', label: 'google/x' },
      ],
      openrouter: { enabled: true, unavailable_reason: null, research_external_allowed: false },
    } as unknown as Parameters<typeof mapCatalog>[0])
    expect(c.models.every((m) => m.available)).toBe(true)
    expect(c.models.map((m) => m.privacy)).toEqual(['local', 'external'])
    expect(c.providers.map((p) => [p.provider, p.usable])).toEqual([
      ['ollama', true],
      ['openrouter', true],
    ])
    expect(c.providers[1].allowedModels).toEqual(['google/x'])
  })

  it('ignores a provider this app does not know rather than guessing', () => {
    const c = mapCatalog({
      ...CATALOG,
      models: [...CATALOG.models, { ...CATALOG.models[1], provider: 'mystery' }],
    } as unknown as Parameters<typeof mapCatalog>[0])
    expect(c.models.some((m) => (m.provider as string) === 'mystery')).toBe(false)
  })

  it('tracks the requested provider apart from the one that answered', () => {
    const r = routeOf(
      {
        provider: 'ollama',
        model: 'qwen2.5:3b',
        requested_provider: 'anthropic',
        requested_model: CLAUDE,
        fallback_reason: 'no_pricing',
        local_only: false,
      },
      CLAUDE,
    )
    expect(r).toMatchObject({
      provider: 'ollama',
      requestedProvider: 'anthropic',
      requestedModel: CLAUDE,
      fallbackReason: 'no_pricing',
    })
    // An unknown provider is never taken for an external one.
    expect(routeOf({ provider: 'someone-else' }, 'm').provider).toBe('ollama')
  })

  it('sends anthropic and drops the partial Claude text on a fallback reset', async () => {
    let body: Record<string, unknown> = {}
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body))
      return sse([
        [
          'meta',
          {
            conversation_id: 'c',
            provider: 'anthropic',
            model: CLAUDE,
            requested_provider: 'anthropic',
          },
        ],
        ['token', { content: 'partial ' }],
        [
          'fallback',
          { provider: 'ollama', model: 'qwen2.5:3b', reason: 'upstream_error', reset: true },
        ],
        ['token', { content: 'local answer' }],
        [
          'done',
          {
            provider: 'ollama',
            model: 'qwen2.5:3b',
            requested_provider: 'anthropic',
            fallback_reason: 'upstream_error',
          },
        ],
      ])
    }) as unknown as typeof fetch
    let text = ''
    const routes = []
    for await (const ev of streamChat({
      model: CLAUDE,
      provider: 'anthropic',
      system: '',
      history: [],
      prompt: 'p',
      chatKey: '9',
      fetchImpl,
    })) {
      if (ev.reset) text = ''
      if (ev.text) text += ev.text
      if (ev.route) routes.push(ev.route)
    }
    expect(body).toMatchObject({ provider: 'anthropic', model: CLAUDE })
    expect(text).toBe('local answer')
    expect(routes[0].provider).toBe('anthropic')
    // The fallback is local, never another external provider.
    expect(routes.slice(1).every((r) => r.provider === 'ollama')).toBe(true)
    expect(routes.at(-1)).toMatchObject({
      requestedProvider: 'anthropic',
      fallbackReason: 'upstream_error',
    })
  })

  it('keeps a chat on the provider it picked, even when that provider is off', () => {
    aureonAi.catalog = mapCatalog(CATALOG)
    setTarget('7', { provider: 'gemini', model: GEMINI })
    expect(targetFor('7')).toEqual({ provider: 'gemini', model: GEMINI })
    // A new chat takes the server default, a direct provider.
    expect(targetFor('8')).toEqual({ provider: 'anthropic', model: CLAUDE })
  })

  it('names the provider in fallback reasons, without server messages', () => {
    expect(fallbackText('daily_cap_reached', 'anthropic')).toBe("today's Claude budget is used up")
    expect(fallbackText('no_pricing', 'gemini')).toContain('Gemini model has no price')
    expect(fallbackText('refused', 'anthropic')).toContain("Claude's safety filter")
    expect(fallbackText('global_cap_reached', 'gemini')).toContain('shared budget')
    // Old saved replies (no requested provider) read as they did.
    expect(fallbackText('disabled')).toBe('OpenRouter is turned off on the server')
    // Unknown codes are shown as plain words, with nothing but letters and digits.
    expect(fallbackText('weird<b>code</b>')).toBe('weird b code b')
    expect(targetLabel({ provider: 'gemini', model: GEMINI })).toBe(`Gemini · ${GEMINI}`)
  })

  it('shows a disallowed Anthropic model as the server says', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          detail: "model 'claude-x' is not an allowed Anthropic model",
          available: [CLAUDE],
        }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch
    const run = async () => {
      for await (const _ of streamChat({
        model: 'claude-x',
        provider: 'anthropic',
        system: '',
        history: [],
        prompt: 'p',
        chatKey: null,
        fetchImpl,
      }))
        void _
    }
    await expect(run()).rejects.toThrow('not an allowed Anthropic model')
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

describe('replyBadge: who wrote a reply', () => {
  it('claims nothing without a route', async () => {
    const { replyBadge } = await import('@/ai/aureonChat')
    expect(replyBadge(undefined, 'qwen2.5:3b')).toBeNull()
  })

  it('labels a plain local answer as Local, with the model', async () => {
    const { replyBadge } = await import('@/ai/aureonChat')
    const b = replyBadge({ provider: 'ollama', fallbackReason: null }, 'qwen2.5:3b')
    expect(b?.kind).toBe('local')
    expect(b?.title).toContain('qwen2.5:3b')
  })

  it('names the external provider that answered', async () => {
    const { replyBadge } = await import('@/ai/aureonChat')
    const b = replyBadge({ provider: 'gemini', requestedProvider: 'gemini' }, 'gemini-2.5-flash')
    expect(b).toMatchObject({ kind: 'external', label: 'Gemini · gemini-2.5-flash' })
    expect(b?.title).toContain('gemini-2.5-flash')
  })

  it('says so when Gemini was picked but switched off and the local model answered', async () => {
    const { replyBadge } = await import('@/ai/aureonChat')
    const b = replyBadge(
      { provider: 'ollama', requestedProvider: 'gemini', fallbackReason: 'disabled' },
      'qwen2.5:3b',
    )
    expect(b?.kind).toBe('fallback')
    expect(b?.label).toBe('Gemini → local · Gemini is turned off on the server')
    expect(b?.title).toContain('instead of Gemini')
  })

  it('names the model, and a switch from one external provider to another', async () => {
    const { replyBadge } = await import('@/ai/aureonChat')
    expect(
      replyBadge({ provider: 'gemini', requestedProvider: 'gemini' }, 'models/gemini-2.5-flash')
        ?.label,
    ).toBe('Gemini · gemini-2.5-flash')
    const sw = replyBadge(
      { provider: 'openrouter', requestedProvider: 'gemini', fallbackReason: 'upstream_error' },
      'google/gemini-2.5-flash',
    )
    expect(sw).toMatchObject({ kind: 'external', label: 'Gemini → OpenRouter · gemini-2.5-flash' })
    expect(sw?.title).toContain('instead of Gemini: Gemini had an error')
    const fromField = replyBadge({ provider: 'openrouter', fromProvider: 'gemini' }, 'x/y')
    expect(fromField?.label).toBe('Gemini → OpenRouter · y')
    expect(replyBadge({ provider: 'ollama' }, 'qwen2.5:3b')?.label).toBe('Local · qwen2.5:3b')
  })

  it('keeps the plain local label when external AI is simply off and none was asked for', async () => {
    const { replyBadge } = await import('@/ai/aureonChat')
    expect(replyBadge({ provider: 'ollama', fallbackReason: 'disabled' })?.kind).toBe('local')
  })
})

describe('routeOf: never the requested model on another provider’s reply', () => {
  it('keeps the requested model only when the asked provider answered', () => {
    expect(routeOf({ provider: 'gemini' }, 'gemini-2.5-flash', 'gemini').model).toBe(
      'gemini-2.5-flash',
    )
    // Gemini was asked, the local model answered, and the server named no model.
    expect(routeOf({ provider: 'ollama' }, 'gemini-2.5-flash', 'gemini').model).toBe('')
    expect(routeOf({ provider: 'ollama', model: 'qwen2.5:3b' }, 'gemini-x', 'gemini').model).toBe(
      'qwen2.5:3b',
    )
  })

  it('streams an empty model for a fallback that does not name one', async () => {
    const fetchImpl = (async () =>
      sse([
        ['meta', { conversation_id: 'c', provider: 'gemini', model: 'gemini-x' }],
        ['fallback', { provider: 'ollama', reason: 'upstream_error', reset: true }],
        ['token', { content: 'hi' }],
        ['done', { provider: 'ollama', model: 'qwen2.5:3b', fallback_reason: 'upstream_error' }],
      ])) as unknown as typeof fetch
    const models: string[] = []
    for await (const ev of streamChat({
      model: 'gemini-x',
      provider: 'gemini',
      system: '',
      history: [],
      prompt: 'p',
      chatKey: null,
      fetchImpl,
    })) {
      if (ev.model !== undefined) models.push(ev.model)
    }
    // Asked Gemini; unknown during the fallback; the done event names qwen.
    expect(models).toEqual(['gemini-x', '', 'qwen2.5:3b'])
  })
})

describe('a fallback names the provider that actually failed', () => {
  it('server default → Gemini → error: says Gemini, not OpenRouter', async () => {
    const fetchImpl = (async () =>
      sse([
        ['meta', { conversation_id: 'c', provider: 'gemini', model: 'gemini-3.5-flash-lite' }],
        ['fallback', { provider: 'ollama', model: 'qwen2.5:3b', reason: 'upstream_error' }],
        ['token', { content: 'hi' }],
        ['done', { provider: 'ollama', model: 'qwen2.5:3b', fallback_reason: 'upstream_error' }],
      ])) as unknown as typeof fetch
    const routes = []
    // No provider sent: the chat is on the server default.
    for await (const ev of streamChat({
      model: '',
      system: '',
      history: [],
      prompt: 'p',
      chatKey: null,
      fetchImpl,
    })) {
      if (ev.route) routes.push(ev.route)
    }
    const fell = routes[1]
    expect(fell).toMatchObject({
      provider: 'ollama',
      requestedProvider: 'gemini',
      requestedModel: 'gemini-3.5-flash-lite',
    })
    expect(fallbackText(fell.fallbackReason, fell.requestedProvider)).toBe('Gemini had an error')
    expect(routes.at(-1)?.requestedProvider).toBe('gemini')
  })
})
