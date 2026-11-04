// The thinking steps fold into one line, open by themselves while the model reasons,
// and list every step the server reported.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import ThinkingSteps from './ThinkingSteps.vue'
import { applyEvent, startTrace } from '@/ai/steps'

describe('<ThinkingSteps />', () => {
  it('opens while thinking, folds when the answer starts, and lists the steps', async () => {
    const t = reactive(startTrace(Date.now(), true))
    const w = mount(ThinkingSteps, { props: { trace: t } })
    applyEvent(t, { route: { provider: 'ollama', model: 'qwen3' } })
    applyEvent(t, { thinking: 'Reading the diff.' })
    await w.vm.$nextTick()
    expect(w.get('[data-testid="thinking-toggle"]').attributes('aria-expanded')).toBe('true')
    expect(w.get('[data-testid="thinking-text"]').text()).toBe('Reading the diff.')
    expect(w.text()).toContain('Thinking…')

    applyEvent(t, { text: 'Answer' })
    await w.vm.$nextTick()
    expect(w.get('[data-testid="thinking-toggle"]').attributes('aria-expanded')).toBe('false')

    applyEvent(t, { usage: { in: 10, out: 2 }, durationMs: 1500 })
    await w.get('[data-testid="thinking-toggle"]').trigger('click')
    expect(w.text()).toContain('Done in 1.5 s')
    expect(w.findAll('.aits__step').map((s) => s.find('.aits__label').text())).toEqual([
      'Sent, asking the model to think',
      'Routed to Local · qwen3',
      'Thought',
      'Writing the answer',
      'Done in 1.5 s',
    ])
  })
})
