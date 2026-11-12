// The AI tab's client for Claude through Aureon (POST /api/ai/chat, backend
// docs/26): one message and an optional agent go out, named SSE events come back,
// and the server's error codes are shown in fixed words.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  agentFor,
  agentLabel,
  aiBackend,
  AureonChatError,
  aureonAi,
  errorText,
  readEvent,
  setAgent,
  streamChat,
  toolActivity,
  toolDone,
  usd,
  type ChatEvent,
} from './aureonChat'

function sse(events: [string, unknown][]): Response {
  const text = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('')
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder()
      // A ping comment first, and a split mid-event, to prove the parser buffers.
      c.enqueue(enc.encode(': ping\n\n' + text.slice(0, 25)))
      c.enqueue(enc.encode(text.slice(25)))
      c.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const CONV = '7d9f2c1e-0000-4000-8000-000000000001'
const STREAM: [string, unknown][] = [
  ['meta', { conversation_id: CONV, agent: 'investments' }],
  ['tool', { name: 'get_positions', status: 'ok' }],
  ['text', { delta: 'You hold ' }],
  ['text', { delta: '3 positions.' }],
  [
    'done',
    {
      conversation_id: CONV,
      message_id: 41,
      cost_usd: '0.0123',
      steps: 2,
      stop_reason: 'end_turn',
      approvals: [],
      text: 'You hold 3 positions.',
    },
  ],
]

async function collect(
  opts: Partial<Parameters<typeof streamChat>[0]> & { fetchImpl: typeof fetch },
): Promise<ChatEvent[]> {
  const out: ChatEvent[] = []
  for await (const ev of streamChat({ message: 'hi', chatKey: '5', ...opts })) out.push(ev)
  return out
}

beforeEach(() => {
  aureonAi.conversations = {}
  aureonAi.agents = {}
  aureonAi.pending = 'auto'
})
afterEach(() => {
  document.cookie = 'aureon_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

describe('aiBackend', () => {
  it('defaults to Aureon and only accepts proxy explicitly', () => {
    expect(aiBackend(undefined)).toBe('aureon')
    expect(aiBackend('AUREON')).toBe('aureon')
    expect(aiBackend(' Proxy ')).toBe('proxy')
  })
})

describe('streamChat', () => {
  it('sends only the message (and the agent), with the CSRF header and the cookie', async () => {
    document.cookie = 'aureon_csrf=tok123'
    const calls: [string, RequestInit][] = []
    const fetchImpl = (async (u: string, init: RequestInit) => {
      calls.push([u, init])
      return sse(STREAM)
    }) as unknown as typeof fetch
    await collect({ fetchImpl, agent: 'investments', message: 'what do I hold?' })
    const [url, init] = calls[0]
    expect(url).toBe('/api/ai/chat')
    expect(init.credentials).toBe('include')
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok123')
    // No system prompt, no history, no data block: the server owns all of that.
    expect(JSON.parse(String(init.body))).toEqual({
      message: 'what do I hold?',
      agent: 'investments',
    })
  })

  it('reads every event and remembers the conversation for the next turn', async () => {
    const bodies: Record<string, unknown>[] = []
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return sse(STREAM)
    }) as unknown as typeof fetch
    const out = await collect({ fetchImpl })
    expect(out).toEqual([
      { meta: { conversationId: CONV, agent: 'investments' } },
      { tool: { name: 'get_positions', status: 'ok' } },
      { text: 'You hold ' },
      { text: '3 positions.' },
      {
        done: {
          conversationId: CONV,
          messageId: 41,
          costUsd: '0.0123',
          steps: 2,
          stopReason: 'end_turn',
          approvals: [],
          text: 'You hold 3 positions.',
        },
      },
    ])
    expect(aureonAi.conversations['5']).toBe(CONV)
    // Auto sends no agent; the second turn continues the conversation.
    expect(bodies[0]).toEqual({ message: 'hi' })
    await collect({ fetchImpl, message: 'and?' })
    expect(bodies[1]).toEqual({ message: 'and?', conversation_id: CONV })
  })

  it('passes an approval through and ends on an error event', async () => {
    const fetchImpl = (async () =>
      sse([
        ['meta', { conversation_id: CONV, agent: 'investments' }],
        ['approval', { id: 'ap-1', action: 'paper_trade', summary: 'PAPER BUY 5 TCS' }],
        ['error', { code: 'budget_exceeded', message: 'monthly cap' }],
        ['text', { delta: 'never read' }],
      ])) as unknown as typeof fetch
    const out = await collect({ fetchImpl })
    expect(out[1]).toEqual({
      approval: { id: 'ap-1', action: 'paper_trade', summary: 'PAPER BUY 5 TCS' },
    })
    expect(out.at(-1)).toEqual({ error: { code: 'budget_exceeded', message: 'monthly cap' } })
    expect(out.some((e) => e.text)).toBe(false)
  })

  it('turns a JSON error before the stream into words, never the server message', async () => {
    const fetchImpl = (async () =>
      json(503, {
        detail: { code: 'ai_not_configured', message: 'ANTHROPIC_API_KEY unset (internal)' },
      })) as unknown as typeof fetch
    const err = await collect({ fetchImpl }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AureonChatError)
    expect((err as AureonChatError).status).toBe(503)
    expect((err as AureonChatError).code).toBe('ai_not_configured')
    expect((err as Error).message).toContain('Settings → AI')
    expect((err as Error).message).not.toContain('internal')
  })

  it('forgets a conversation the server no longer has and sends the turn fresh', async () => {
    aureonAi.conversations['5'] = 'gone-conv'
    const bodies: Record<string, unknown>[] = []
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return bodies.length === 1
        ? json(404, { detail: { code: 'not_found', message: 'conversation not found' } })
        : sse(STREAM)
    }) as unknown as typeof fetch
    await collect({ fetchImpl })
    expect(bodies).toEqual([{ message: 'hi', conversation_id: 'gone-conv' }, { message: 'hi' }])
    expect(aureonAi.conversations['5']).toBe(CONV)
  })
})

describe('readEvent', () => {
  it('ignores unknown events, empty text and bad JSON', () => {
    expect(readEvent('ping', '{}')).toBeNull()
    expect(readEvent('text', '{"delta":""}')).toBeNull()
    expect(readEvent('meta', 'not json')).toBeNull()
  })
})

describe('agents', () => {
  it('keeps a pick per chat; a new chat takes the pending pick', () => {
    expect(agentFor(null)).toBe('auto')
    setAgent(null, 'business')
    expect(agentFor('9')).toBe('business')
    setAgent('9', 'general')
    expect(agentFor('9')).toBe('general')
    setAgent('9', 'auto')
    expect(aureonAi.agents['9']).toBeUndefined()
    // A chat that already has a conversation and no pick stays on Auto.
    aureonAi.conversations['10'] = CONV
    expect(agentFor('10')).toBe('auto')
  })

  it('names agents, including ones the picker does not offer', () => {
    expect(agentLabel('investments')).toBe('Investments')
    expect(agentLabel('report')).toBe('Report')
    expect(agentLabel(null)).toBe('')
  })
})

describe('words', () => {
  it('says each error code plainly', () => {
    expect(errorText('budget_exceeded')).toContain('budget')
    expect(errorText('ai_paused')).toContain('paused')
    expect(errorText('rate_limited')).toContain('Too many')
    expect(errorText(null, 401)).toContain('Sign in')
    expect(errorText('weird<b>code</b>')).toBe('weird b code b')
  })

  it('describes tools while they work and once done', () => {
    expect(toolActivity('get_positions')).toBe('Reading positions…')
    expect(toolDone('get_portfolio_summary', 'ok')).toBe('Checked the portfolio summary')
    expect(toolDone('propose_trade', 'awaiting_approval')).toBe(
      'Proposed a trade — awaiting your approval',
    )
    expect(toolDone('get_positions', 'refused')).toBe('Read positions (refused)')
    expect(toolActivity('some_new_tool')).toBe('Using some new tool…')
  })

  it('shows costs small', () => {
    expect(usd('0.0123')).toBe('$0.0123')
    expect(usd(1.2)).toBe('$1.20')
    expect(usd(null)).toBe('')
  })
})
