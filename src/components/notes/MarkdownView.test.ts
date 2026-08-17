// The rendered note as a component: what it draws, and the two things it does
// when clicked — write a ticked box back to the source (acceptance 82) and keep
// an in-app link inside the app.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MarkdownView from '@/components/notes/MarkdownView.vue'
import { toggleTaskAt } from '@/utils/mdTyping'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

function mountView(source: string, props: Record<string, unknown> = {}) {
  return mount(MarkdownView, { props: { source, ...props }, attachTo: document.body })
}

describe('rendering', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockReset()
  })

  it('renders markdown rather than showing the source', () => {
    const wrapper = mountView('# Title\n\n- one\n- two')
    expect(wrapper.find('h1').text()).toBe('Title')
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('# Title')
  })

  it('renders a table inside its scrolling wrapper', () => {
    const wrapper = mountView('| a | b |\n| - | - |\n| 1 | 2 |')
    expect(wrapper.find('.md-table-wrap').exists()).toBe(true)
    expect(wrapper.findAll('th')).toHaveLength(2)
  })

  it('never renders a script from the source', () => {
    const wrapper = mountView('<script>window.__pwned = 1</script>\n\ntext')
    expect(wrapper.find('script').exists()).toBe(false)
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined()
  })

  it('re-renders when the source changes and not otherwise', async () => {
    const wrapper = mountView('# One')
    expect(wrapper.find('h1').text()).toBe('One')
    await wrapper.setProps({ source: '# Two' })
    expect(wrapper.find('h1').text()).toBe('Two')
  })
})

describe('ticking a checkbox (acceptance 82)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockReset()
  })

  const source = '- [ ] first\n- [x] second\n- [ ] third'

  it('reports which box was clicked, by its order in the note', async () => {
    const wrapper = mountView(source, { interactive: true })
    const boxes = wrapper.findAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(3)
    await boxes[2].trigger('click')
    expect(wrapper.emitted('toggle-task')).toEqual([[2]])
  })

  it('the reported index rewrites the right line of the source', async () => {
    const wrapper = mountView(source, { interactive: true })
    await wrapper.findAll('input[type="checkbox"]')[0].trigger('click')
    const index = wrapper.emitted('toggle-task')![0][0] as number
    expect(toggleTaskAt(source, index)).toBe('- [x] first\n- [x] second\n- [ ] third')
  })

  it('stays inert when the view is not interactive', async () => {
    const wrapper = mountView(source)
    await wrapper.find('input[type="checkbox"]').trigger('click')
    expect(wrapper.emitted('toggle-task')).toBeUndefined()
  })

  it('does not let the DOM change the box — the source does', async () => {
    const wrapper = mountView(source, { interactive: true })
    const box = wrapper.find('input[type="checkbox"]')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    box.element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('links', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockReset()
  })

  it('routes an in-app link instead of reloading', async () => {
    const wrapper = mountView('[goals](https://spasta.online/goals?tab=1)')
    await wrapper.find('a').trigger('click')
    expect(push).toHaveBeenCalledWith('/goals?tab=1')
  })

  it('leaves an external link to the browser, in a new tab', async () => {
    const wrapper = mountView('[out](https://example.com)')
    const anchor = wrapper.find('a')
    expect(anchor.attributes('target')).toBe('_blank')
    expect(anchor.attributes('rel')).toBe('noopener noreferrer')
    await anchor.trigger('click')
    expect(push).not.toHaveBeenCalled()
  })
})
