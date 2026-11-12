// A reply's steps: every step comes from an event the server sent — the agent that
// took it, each tool it used, approvals it asked for, writing, done with cost — or a
// stop or an error.
import { describe, expect, it } from 'vitest'
import { applyEvent, endTrace, phaseText, startTrace } from './steps'

describe('applyEvent', () => {
  it('walks sent → agent → tools → writing → done', () => {
    const t = startTrace(0)
    expect(phaseText(t)).toBe('Waiting for Claude…')
    applyEvent(t, { meta: { conversationId: 'c', agent: 'investments' } }, 100)
    expect(phaseText(t)).toBe('Investments agent is working…')
    applyEvent(t, { tool: { name: 'get_positions', status: 'ok' } }, 400)
    expect(phaseText(t)).toBe('Reading positions…')
    applyEvent(t, { tool: { name: 'get_portfolio_summary', status: 'ok' } }, 600)
    applyEvent(t, { text: 'You hold ' }, 900)
    expect(phaseText(t)).toBe('Writing…')
    applyEvent(t, { text: '3.' }, 950)
    applyEvent(
      t,
      {
        done: {
          conversationId: 'c',
          messageId: 1,
          costUsd: '0.0123',
          steps: 2,
          stopReason: 'end_turn',
          approvals: [],
        },
      },
      2100,
    )
    expect(t.steps.map((s) => [s.key, s.state, s.label])).toEqual([
      ['send', 'done', 'Sent to Aureon'],
      ['agent', 'done', 'Investments agent'],
      ['tool', 'done', 'Read positions'],
      ['tool', 'done', 'Checked the portfolio summary'],
      ['write', 'done', 'Writing the answer'],
      ['done', 'done', 'Done in 2.1 s'],
    ])
    expect(t.steps.at(-1)!.detail).toBe('2 model calls · $0.0123')
    expect(phaseText(t)).toBe('Done in 2.1 s')
  })

  it('records an approval and a refused tool as warnings', () => {
    const t = startTrace(0)
    applyEvent(t, { tool: { name: 'propose_trade', status: 'awaiting_approval' } }, 10)
    applyEvent(t, { approval: { id: 'a', action: 'paper_trade', summary: 'PAPER BUY 5 TCS' } }, 11)
    applyEvent(t, { tool: { name: 'get_positions', status: 'refused' } }, 12)
    expect(t.steps.slice(1).map((s) => [s.label, s.state])).toEqual([
      ['Proposed a trade — awaiting your approval', 'done'],
      ['Asked for your approval', 'warn'],
      ['Read positions (refused)', 'warn'],
    ])
    expect(t.steps[2].detail).toBe('PAPER BUY 5 TCS')
  })

  it('opens a new writing step after a tool interrupts the text', () => {
    const t = startTrace(0)
    applyEvent(t, { text: 'Let me check.' }, 10)
    applyEvent(t, { tool: { name: 'get_positions', status: 'ok' } }, 20)
    applyEvent(t, { text: 'You hold 3.' }, 30)
    expect(t.steps.map((s) => [s.key, s.state])).toEqual([
      ['send', 'done'],
      ['write', 'done'],
      ['tool', 'done'],
      ['write', 'running'],
    ])
  })

  it('marks errors and user stops', () => {
    const t = startTrace(0)
    applyEvent(t, { text: 'Half' }, 10)
    applyEvent(t, { error: { code: 'timeout', message: 'Claude took too long' } }, 20)
    expect(t.phase).toBe('error')
    expect(t.steps.at(-1)).toMatchObject({ key: 'error', detail: 'Claude took too long' })
    expect(t.steps.find((s) => s.key === 'write')!.state).toBe('error')

    const s = startTrace(0)
    applyEvent(s, { text: 'Half' }, 10)
    endTrace(s, 'stopped', '', 30)
    expect(s.phase).toBe('stopped')
    expect(phaseText(s)).toBe('Stopped')
    // A finished trace is not reopened.
    endTrace(t, 'stopped')
    expect(t.phase).toBe('error')
  })
})
