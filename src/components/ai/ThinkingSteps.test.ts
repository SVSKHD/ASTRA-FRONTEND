// A reply's steps fold into one quiet line ("Reading positions…") and open to every
// step the server reported: the agent, each tool, approvals, done with the cost.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import ThinkingSteps from './ThinkingSteps.vue'
import { applyEvent, startTrace } from '@/ai/steps'

describe('<ThinkingSteps />', () => {
  it('shows the live activity in one line, and every step when opened', async () => {
    const t = reactive(startTrace(Date.now()))
    const w = mount(ThinkingSteps, { props: { trace: t } })
    applyEvent(t, { meta: { conversationId: 'c', agent: 'investments' } })
    applyEvent(t, { tool: { name: 'get_positions', status: 'ok' } })
    await w.vm.$nextTick()
    // Closed by default: the one line is the activity.
    expect(w.get('[data-testid="thinking-toggle"]').attributes('aria-expanded')).toBe('false')
    expect(w.text()).toContain('Reading positions…')

    applyEvent(t, { text: 'You hold 3.' })
    applyEvent(t, {
      done: {
        conversationId: 'c',
        messageId: 1,
        costUsd: '0.0100',
        steps: 2,
        stopReason: 'end_turn',
        approvals: [],
      },
    })
    await w.get('[data-testid="thinking-toggle"]').trigger('click')
    expect(w.findAll('.aits__step').map((s) => s.find('.aits__label').text())).toEqual([
      'Sent to Aureon',
      'Investments agent',
      'Read positions',
      'Writing the answer',
      expect.stringMatching(/^Done in /),
    ])
    expect(w.text()).toContain('2 model calls · $0.0100')
  })
})
