// Thinking steps: every step comes from an event the server sent — routed, kept local,
// thought, wrote, fell back, done with tokens/cost/time, or stopped.
import { describe, expect, it, vi } from 'vitest'
import { applyEvent, endTrace, phaseText, startTrace } from './steps'
import { streamChat } from './aureonChat'

const OR = { provider: 'openrouter' as const, model: 'anthropic/claude-x', costUsd: null }

describe('applyEvent', () => {
  it('walks sent → routed → thinking → writing → done', () => {
    const t = startTrace(0, true)
    expect(t.steps.map((s) => s.label)).toEqual(['Sent, asking the model to think'])
    applyEvent(t, { model: OR.model, route: OR }, 100)
    applyEvent(t, { thinking: 'Let me see. ' }, 200)
    applyEvent(t, { thinking: 'The file exports two things.' }, 900)
    expect(t.phase).toBe('thinking')
    expect(phaseText(t, 1200)).toBe('Thinking… 1.0 s')
    applyEvent(t, { text: 'It ' }, 1400)
    applyEvent(t, { text: 'exports…' }, 1500)
    applyEvent(
      t,
      {
        usage: { in: 1200, out: 340 },
        durationMs: 2100,
        reasoningTokens: 90,
        route: { ...OR, costUsd: '0.004100' },
      },
      2100,
    )
    expect(t.thinking).toBe('Let me see. The file exports two things.')
    expect(t.steps.map((s) => [s.key, s.state, s.label])).toEqual([
      ['send', 'done', 'Sent, asking the model to think'],
      ['route', 'done', 'Routed to OpenRouter · anthropic/claude-x'],
      ['think', 'done', 'Thought'],
      ['write', 'done', 'Writing the answer'],
      ['done', 'done', 'Done in 2.1 s'],
    ])
    expect(t.steps[2].detail).toBe('for 1.2 s')
    expect(t.steps[3].detail).toBe('first words after 1.4 s')
    expect(t.steps[4].detail).toBe('1,200 in / 340 out tokens · 90 reasoning · $0.0041')
    expect(phaseText(t)).toBe('Done in 2.1 s')
  })

  it('says why a turn stayed on the server, with the filter categories', () => {
    const t = startTrace(0)
    applyEvent(t, {
      route: {
        provider: 'ollama',
        model: 'qwen2.5:3b',
        requestedProvider: 'openrouter',
        fallbackReason: 'filter',
        localOnly: true,
        filterCategories: ['positions'],
      },
    })
    expect(t.steps.map((s) => [s.label, s.state, s.detail])).toContainEqual([
      'Kept on this server',
      'warn',
      'the message has data that stays on this server (positions)',
    ])
    expect(t.steps.find((s) => s.key === 'route')?.detail).toBe('asked for OpenRouter')
  })

  it('records a mid-reply fallback and drops the half-written step', () => {
    const t = startTrace(0)
    applyEvent(t, { route: OR }, 10)
    applyEvent(t, { text: 'Par' }, 20)
    applyEvent(
      t,
      { reset: true, route: { provider: 'ollama', model: 'qwen', fallbackReason: 'timeout' } },
      30,
    )
    expect(t.steps.some((s) => s.key === 'write')).toBe(false)
    expect(t.steps.find((s) => s.key === 'fallback')).toMatchObject({
      label: 'Fell back to Local · qwen',
      detail: 'OpenRouter timed out',
      state: 'warn',
    })
    applyEvent(t, { text: 'Local answer' }, 40)
    expect(t.phase).toBe('writing')
  })

  it('marks errors and user stops', () => {
    const t = startTrace(0)
    applyEvent(t, { error: 'generation exceeded 120s' }, 5)
    expect(t.phase).toBe('error')
    expect(t.steps.at(-1)).toMatchObject({ key: 'error', detail: 'generation exceeded 120s' })

    const s = startTrace(0)
    applyEvent(s, { text: 'x' }, 5)
    endTrace(s, 'stopped', '', 9)
    expect(s.phase).toBe('stopped')
    expect(s.steps.find((x) => x.key === 'write')?.state).toBe('warn')
  })
})

describe('streamChat thinking', () => {
  it('asks for thinking only when told to, and keeps it out of the answer', async () => {
    const body = (events: [string, unknown][]) =>
      new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(''), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    const fetchImpl = vi.fn(async () =>
      body([
        ['meta', { conversation_id: 'c', provider: 'ollama', model: 'm' }],
        ['thinking', { content: 'hmm' }],
        ['token', { content: 'Hi' }],
        [
          'done',
          {
            prompt_tokens: 3,
            completion_tokens: 1,
            duration_ms: 812,
            reasoning_tokens: 5,
            provider: 'ollama',
            model: 'm',
          },
        ],
      ]),
    ) as unknown as typeof fetch
    const out = []
    for await (const ev of streamChat({
      model: 'm',
      system: '',
      history: [],
      prompt: 'Hi',
      chatKey: null,
      fetchImpl,
      think: true,
    }))
      out.push(ev)
    const sent = JSON.parse(
      String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body),
    )
    expect(sent.think).toBe(true)
    expect(out.filter((e) => e.thinking).map((e) => e.thinking)).toEqual(['hmm'])
    expect(out.filter((e) => e.text).map((e) => e.text)).toEqual(['Hi'])
    expect(out.at(-1)).toMatchObject({ durationMs: 812, reasoningTokens: 5 })

    await (async () => {
      for await (const _ of streamChat({
        model: 'm',
        system: '',
        history: [],
        prompt: 'Hi',
        chatKey: null,
        fetchImpl,
      }))
        void _
    })()
    const plain = JSON.parse(
      String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1].body),
    )
    expect('think' in plain).toBe(false)
  })
})
