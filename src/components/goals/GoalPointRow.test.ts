// A point row (section 20b, acceptances 101, 103 and 104).
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import GoalPointRow from '@/components/goals/GoalPointRow.vue'
import type { GoalChecklistItem } from '@/types'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

const SOURCE = readFileSync(join(process.cwd(), 'src/components/goals/GoalPointRow.vue'), 'utf8')
function ruleHas(selector: string, declaration: string): boolean {
  const start = SOURCE.indexOf(`${selector} {`)
  if (start === -1) return false
  return SOURCE.slice(start, SOURCE.indexOf('}', start)).replace(/\s+/g, ' ').includes(declaration)
}

const LONG = 'truthiness, == vs ===, and the whole coercion table read in one sitting'

function makePoint(over: Partial<GoalChecklistItem> = {}): GoalChecklistItem {
  return {
    id: 1,
    goalId: 10,
    text: 'A point',
    done: false,
    order: 0,
    estimateMins: null,
    spentMins: 0,
    dueAt: '',
    startAt: '',
    tags: [],
    startedAt: null,
    completedAt: null,
    timerStartedAt: null,
    localRev: 0,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

function mountRow(point = makePoint(), over: Record<string, unknown> = {}) {
  setActivePinia(createPinia())
  return mount(GoalPointRow, {
    props: { point, spent: 0, ...over },
    attachTo: document.body,
  })
}

describe('the text (acceptance 101)', () => {
  it('is a textarea, so a long point is not cut off', () => {
    const field = mountRow(makePoint({ text: LONG })).find('.gpr__text')
    expect(field.element.tagName).toBe('TEXTAREA')
    expect((field.element as HTMLTextAreaElement).value).toBe(LONG)
  })

  it('never scrolls inside itself, and wraps rather than running off the edge', () => {
    // Asserted against AutoTextarea's stylesheet, which is where the rules live.
    const shared = readFileSync(join(process.cwd(), 'src/components/ui/AutoTextarea.vue'), 'utf8')
    const body = shared.slice(
      shared.indexOf('.atx {'),
      shared.indexOf('}', shared.indexOf('.atx {')),
    )
    expect(body).toContain('overflow: hidden')
    expect(body).toContain('resize: none')
    expect(body).toContain('white-space: pre-wrap')
    expect(body).toContain('word-break: break-word')
  })

  it('reports every keystroke', async () => {
    const wrapper = mountRow()
    await wrapper.find('.gpr__text').setValue('edited')
    expect(wrapper.emitted('update:text')).toEqual([['edited']])
  })

  it('commits on plain Enter rather than growing the point', async () => {
    const wrapper = mountRow()
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    wrapper.find('.gpr__text').element.dispatchEvent(event)
    expect(wrapper.emitted('commit')).toHaveLength(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves Shift+Enter to insert a newline', async () => {
    const wrapper = mountRow()
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    wrapper.find('.gpr__text').element.dispatchEvent(event)
    expect(wrapper.emitted('commit')).toBeUndefined()
    expect(event.defaultPrevented).toBe(false)
  })

  it('puts back what was there on Escape', async () => {
    const wrapper = mountRow(makePoint({ text: 'original' }))
    const field = wrapper.find('.gpr__text')
    await field.trigger('focus')
    await field.setValue('half typed')
    await field.trigger('keydown', { key: 'Escape' })
    const emitted = wrapper.emitted('update:text') as string[][]
    expect(emitted[emitted.length - 1]).toEqual(['original'])
  })

  it('dims and strikes a finished point without hiding it', () => {
    const wrapper = mountRow(makePoint({ text: LONG, done: true }))
    expect(wrapper.find('.gpr__text').classes()).toContain('atx--done')
    expect((wrapper.find('.gpr__text').element as HTMLTextAreaElement).value).toBe(LONG)
  })
})

describe('the layout (acceptances 103 and 104)', () => {
  it('is a three-track grid: checkbox, text, controls', () => {
    expect(ruleHas('.gpr', 'display: grid')).toBe(true)
    expect(ruleHas('.gpr', 'grid-template-columns: auto 1fr auto')).toBe(true)
  })

  it('aligns the checkbox to the first line, not the middle of the row', () => {
    // On a three-line point a centred checkbox floats halfway down it.
    expect(ruleHas('.gpr', 'align-items: start')).toBe(true)
  })

  it('separates rows with a hairline rather than boxing each one', () => {
    expect(ruleHas('.gpr', 'border-bottom: 1px solid')).toBe(true)
  })

  it('shows no input chrome at rest — only a focused row is a field', () => {
    const shared = readFileSync(join(process.cwd(), 'src/components/ui/AutoTextarea.vue'), 'utf8')
    const rest = shared.slice(
      shared.indexOf('.atx {'),
      shared.indexOf('}', shared.indexOf('.atx {')),
    )
    expect(rest).toContain('border: 1px solid transparent')
    expect(rest).toContain('background: transparent')
    const focus = shared.slice(shared.indexOf('.atx:focus {'))
    expect(focus.slice(0, focus.indexOf('}'))).toContain('border-color: var(--theme-accent)')
  })

  it('keeps the controls on one line, never wrapping into the text', () => {
    expect(ruleHas('.gpr__controls', 'flex-wrap: nowrap')).toBe(true)
  })
})

describe('the controls', () => {
  it('shows an estimate as plain text and opens a field on click', async () => {
    const wrapper = mountRow(makePoint({ estimateMins: 180 }))
    expect(wrapper.find('.gpr__estimate').text()).toBe('3h')
    expect(wrapper.find('.gpr__mins').exists()).toBe(false)
    await wrapper.find('.gpr__estimate').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.gpr__mins').exists()).toBe(true)
  })

  it('reports a new estimate on blur', async () => {
    const wrapper = mountRow()
    await wrapper.find('.gpr__estimate').trigger('click')
    await wrapper.vm.$nextTick()
    // The estimate is a NumberInput now: the class is on the control, the field
    // is inside it, and the value reaches the row through the model rather than
    // being read back off the element on blur.
    const field = wrapper.find('.gpr__mins input')
    await field.setValue('45')
    await field.trigger('blur')
    expect(wrapper.emitted('update:estimate')).toEqual([[45]])
  })

  it('clears the estimate when the field is emptied', async () => {
    const wrapper = mountRow(makePoint({ estimateMins: 45 }))
    await wrapper.find('.gpr__estimate').trigger('click')
    await wrapper.vm.$nextTick()
    const field = wrapper.find('.gpr__mins input')
    await field.setValue('')
    await field.trigger('blur')
    expect(wrapper.emitted('update:estimate')).toEqual([[null]])
  })

  it('ticks, times and deletes', async () => {
    const wrapper = mountRow()
    await wrapper.find('.gpr__box').trigger('click')
    await wrapper
      .findAll('.gpr__mini')
      .find((b) => b.text().includes('▶'))!
      .trigger('click')
    await wrapper.find('[aria-label="Delete point"]').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
    expect(wrapper.emitted('toggle-timer')).toHaveLength(1)
    expect(wrapper.emitted('remove')).toHaveLength(1)
  })

  it('collapses to one button on touch, where there is no hover', async () => {
    const wrapper = mountRow(makePoint(), { mobile: true })
    const more = wrapper.find('.gpr__more')
    expect(more.exists()).toBe(true)
    expect(more.attributes('aria-expanded')).toBe('false')
    await more.trigger('click')
    expect(wrapper.find('.gpr__more').attributes('aria-expanded')).toBe('true')
  })

  it('has no ⋯ on a pointer device — the row reveals them on hover', () => {
    expect(mountRow().find('.gpr__more').exists()).toBe(false)
  })
})
