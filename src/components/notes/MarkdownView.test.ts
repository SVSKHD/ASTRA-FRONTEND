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

describe('code fences (acceptance 83)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockReset()
  })

  it('puts a language label and a copy button above the fence', async () => {
    const wrapper = mountView('```ts\nconst x = 1\n```')
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('.md-fence-head').text()).toContain('typescript')
    expect(wrapper.find('.md-fence-copy').exists()).toBe(true)
  })

  it('copies the code, not the label or the markers', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const wrapper = mountView('```js\nconst x = 1\n```')
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.find('.md-fence-copy').trigger('click')
    expect(writeText).toHaveBeenCalledWith('const x = 1\n')
  })

  it('adds no fence chrome to a note without code', async () => {
    const wrapper = mountView('# Title\n\njust prose')
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('.md-fence-head').exists()).toBe(false)
  })
})

describe('long notes', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockReset()
  })

  const long = Array.from(
    { length: 400 },
    (_, i) => `Paragraph number ${i} ${'x'.repeat(200)}`,
  ).join('\n\n')

  it('renders part of a very long note and offers the rest', () => {
    const wrapper = mountView(long)
    expect(wrapper.text()).toContain('Paragraph number 0')
    expect(wrapper.text()).not.toContain('Paragraph number 399')
    expect(wrapper.find('button').text()).toContain('Show the rest')
  })

  it('renders the whole note once asked', async () => {
    const wrapper = mountView(long)
    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toContain('Paragraph number 399')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('offers nothing extra for an ordinary note', () => {
    const wrapper = mountView('# Title\n\nshort')
    expect(wrapper.find('button').exists()).toBe(false)
  })
})

describe('images', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockReset()
  })

  it('opens a lightbox on click and closes it again', async () => {
    const wrapper = mountView('![shot](https://example.com/a.png)')
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await wrapper.find('img.md-img').trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    await dialog.trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('degrades a broken image to its alt text', async () => {
    const wrapper = mountView('![the diagram](https://example.com/missing.png)')
    await new Promise((r) => setTimeout(r, 0))
    wrapper.find('img.md-img').element.dispatchEvent(new Event('error'))
    expect(wrapper.find('.md-img-broken').text()).toBe('the diagram')
    expect(wrapper.find('img.md-img').exists()).toBe(false)
  })
})

describe('search highlighting', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockReset()
  })

  it('marks the term where the reader is looking', async () => {
    const wrapper = mountView('The quarterly plan is quarterly.', { highlight: 'quarterly' })
    await new Promise((r) => setTimeout(r, 0))
    const hits = wrapper.findAll('mark.md-hit')
    expect(hits).toHaveLength(2)
    expect(hits[0].text()).toBe('quarterly')
    // The surrounding text is untouched.
    expect(wrapper.text()).toContain('The quarterly plan is quarterly.')
  })

  it('marks case-insensitively but shows the original casing', async () => {
    const wrapper = mountView('Quarterly plan', { highlight: 'quarter' })
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('mark.md-hit').text()).toBe('Quarter')
  })

  it('never marks inside a code fence', async () => {
    const wrapper = mountView('```\nconst quarterly = 1\n```', { highlight: 'quarterly' })
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('mark.md-hit').exists()).toBe(false)
  })

  it('ignores a term too short to be a search', async () => {
    const wrapper = mountView('a plan', { highlight: 'a' })
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('mark.md-hit').exists()).toBe(false)
  })

  it('cannot inject markup through the term', async () => {
    const wrapper = mountView('text with <b>bold</b> written out', {
      highlight: '<b>bold</b>',
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('b').exists()).toBe(false)
    expect(wrapper.find('mark.md-hit').text()).toBe('<b>bold</b>')
  })
})
