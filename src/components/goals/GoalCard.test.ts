// The card's layout contract (section 19a, acceptances 91 and 92). jsdom does
// not lay anything out, so these assert the CSS rules that make the layout
// correct rather than measuring pixels — which is the level the bug lived at:
// a flex child with no `min-width: 0` and no truncation.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import GoalCard from '@/components/goals/GoalCard.vue'
import type { Goal } from '@/types'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))

const SOURCE = readFileSync(join(process.cwd(), 'src/components/goals/GoalCard.vue'), 'utf8')
// Only the stylesheet — the script block's comment discusses absolute
// positioning, and a prose mention is not a rule.
const STYLES = SOURCE.slice(SOURCE.indexOf('<style'))

function makeGoal(over: Partial<Goal> = {}): Goal {
  return {
    id: 1,
    title: 'goal 1',
    description: '',
    status: 'active',
    targetDate: '',
    startDate: '',
    color: '',
    icon: '',
    source: 'manual',
    sourceUrl: '',
    parentId: null,
    order: 0,
    depth: 0,
    rootId: 1,
    localRev: 0,
    updatedBy: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

function mountCard(goal = makeGoal(), over: Record<string, unknown> = {}) {
  setActivePinia(createPinia())
  return mount(GoalCard, {
    props: {
      goal,
      ratio: 0,
      counts: { checklist: 0, tasks: 0, todos: 0 },
      daysChip: null,
      statusLabel: 'Active',
      menu: [{ value: 'archive', label: 'Archive' }],
      ...over,
    },
    attachTo: document.body,
  })
}

// A CSS declaration inside a named rule, as written in the component's own
// stylesheet. Whitespace-tolerant, so reformatting does not fail the test.
function ruleHas(selector: string, declaration: string): boolean {
  const start = SOURCE.indexOf(`${selector} {`)
  if (start === -1) return false
  const body = SOURCE.slice(start, SOURCE.indexOf('}', start))
  return body.replace(/\s+/g, ' ').includes(declaration)
}

describe('the header is a grid with declared tracks (section 19a)', () => {
  it('has four columns: handle, ring, title block, actions', () => {
    expect(ruleHas('.gcard__head', 'display: grid')).toBe(true)
    expect(ruleHas('.gcard__head', 'grid-template-columns: auto auto 1fr auto')).toBe(true)
  })

  it('renders those four children in that order', () => {
    const head = mountCard().find('.gcard__head')
    const classes = Array.from(head.element.children).map((el) => el.className.split(' ')[0])
    expect(classes).toEqual(['gcard__grip', 'gcard__ring', 'gcard__titleblock', 'gcard__actions'])
  })

  it('reserves the handle column even when the card is not draggable', () => {
    // Otherwise switching sort order shifts every title sideways.
    const head = mountCard(makeGoal(), { draggable: false }).find('.gcard__head')
    expect(head.element.children).toHaveLength(4)
    expect(head.find('.gcard__grip--empty').exists()).toBe(true)
  })

  it('lets the title block shrink — the line the overlap turned on', () => {
    expect(ruleHas('.gcard__titleblock', 'min-width: 0')).toBe(true)
    expect(ruleHas('.gcard__title', 'min-width: 0')).toBe(true)
  })

  it('truncates the title rather than growing the row', () => {
    expect(ruleHas('.gcard__title', 'overflow: hidden')).toBe(true)
    expect(ruleHas('.gcard__title', 'text-overflow: ellipsis')).toBe(true)
    expect(ruleHas('.gcard__title', 'white-space: nowrap')).toBe(true)
  })

  it('keeps the actions in their own column, never wrapping', () => {
    expect(ruleHas('.gcard__actions', 'flex-wrap: nowrap')).toBe(true)
    expect(ruleHas('.gcard__actions', 'white-space: nowrap')).toBe(true)
  })

  it('positions nothing absolutely (acceptance 91)', () => {
    expect(STYLES).not.toMatch(/position:\s*absolute/)
  })
})

describe('uniform height (acceptance 92)', () => {
  it('fills the row height it is given', () => {
    expect(ruleHas('.gcard', 'height: 100%')).toBe(true)
    expect(ruleHas('.gcard', 'flex-direction: column')).toBe(true)
  })

  it('pins the meta row to the bottom so it aligns across cards', () => {
    expect(ruleHas('.gcard__meta', 'margin-top: auto')).toBe(true)
  })

  it('clamps the description to two lines rather than letting it set the height', () => {
    expect(ruleHas('.gcard__desc', '-webkit-line-clamp: 2')).toBe(true)
    expect(ruleHas('.gcard__desc', 'overflow: hidden')).toBe(true)
  })
})

describe('what it renders', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows the goal and its counts', () => {
    const wrapper = mountCard(makeGoal({ title: 'Ship it', description: 'the thing' }), {
      counts: { checklist: 2, tasks: 1, todos: 0 },
    })
    expect(wrapper.find('.gcard__title').text()).toBe('Ship it')
    expect(wrapper.find('.gcard__desc').text()).toBe('the thing')
    expect(wrapper.text()).toContain('2 checklist')
  })

  it('names an untitled goal rather than showing nothing', () => {
    expect(
      mountCard(makeGoal({ title: '' }))
        .find('.gcard__title')
        .text(),
    ).toBe('Untitled goal')
  })

  it('omits the description element entirely when there is none', () => {
    expect(mountCard().find('.gcard__desc').exists()).toBe(false)
  })

  it('reports a menu choice to its parent', async () => {
    const wrapper = mountCard()
    await wrapper.find('[aria-haspopup]').trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Archive')!
      .trigger('click')
    expect(wrapper.emitted('menu')).toEqual([['archive']])
  })
})
