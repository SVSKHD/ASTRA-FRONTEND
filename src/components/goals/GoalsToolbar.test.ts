// The toolbar's density and its two shapes (section 19c).
import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import GoalsToolbar from '@/components/goals/GoalsToolbar.vue'

const SOURCE = readFileSync(join(process.cwd(), 'src/components/goals/GoalsToolbar.vue'), 'utf8')
function ruleHas(selector: string, declaration: string): boolean {
  const start = SOURCE.indexOf(`${selector} {`)
  if (start === -1) return false
  return SOURCE.slice(start, SOURCE.indexOf('}', start)).replace(/\s+/g, ' ').includes(declaration)
}

function mountToolbar(over: Record<string, unknown> = {}) {
  return mount(GoalsToolbar, {
    props: { search: '', status: 'all', sort: 'order', showFilters: true, ...over },
    attachTo: document.body,
  })
}

// The listbox opens in a portal at body level — that is the point of it — so a
// choice is made through the document rather than through the wrapper.
function pickOption(label: string) {
  const option = Array.from(document.querySelectorAll('.ui-lb__opt')).find(
    (el) => el.querySelector('.ui-lb__label')?.textContent?.trim() === label,
  )
  if (!option) throw new Error(`no option labelled "${label}"`)
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
}

describe('the one-line layout', () => {
  it('puts search, status and sort on one row', () => {
    const wrapper = mountToolbar()
    const filters = wrapper.find('.gtb__filters')
    expect(filters.find('input[type="search"]').exists()).toBe(true)
    // Two listboxes, not two native selects: the toolbar is library controls
    // now, so it is themed and portalled like everything beside it.
    expect(filters.findAll('.ui-sel')).toHaveLength(2)
    expect(filters.findAll('select')).toHaveLength(0)
  })

  it('sizes the controls to their content rather than to the screen', () => {
    // Three full-width controls were the whole complaint.
    expect(ruleHas('.gtb__search', 'width: 320px')).toBe(true)
    expect(ruleHas('.gtb__select', 'width: auto')).toBe(true)
  })

  it('offers no filters on an empty tab', () => {
    const wrapper = mountToolbar({ showFilters: false })
    expect(wrapper.find('.gtb__filters').exists()).toBe(false)
    // The actions stay: an empty tab is exactly where "new" and "import" matter.
    expect(wrapper.find('.gtb__new').exists()).toBe(true)
  })
})

describe('the actions', () => {
  it('collapses the two import buttons into one menu', async () => {
    const wrapper = mountToolbar()
    expect(wrapper.findAll('button').filter((b) => b.text() === 'Paste JSON')).toHaveLength(0)
    await wrapper.find('[aria-haspopup]').trigger('click')
    const labels = wrapper.findAll('button').map((b) => b.text())
    expect(labels).toContain('Paste JSON')
    expect(labels).toContain('Import from a link')
  })

  it('both ways in lead to the same place, because they always did', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('[aria-haspopup]').trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Paste JSON')!
      .trigger('click')
    expect(wrapper.emitted('import')).toHaveLength(1)
  })

  it('creates a goal', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('.gtb__new').trigger('click')
    expect(wrapper.emitted('new')).toHaveLength(1)
  })
})

describe('the controls report changes', () => {
  it('passes the search event up for the view to debounce', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('input[type="search"]').setValue('plan')
    expect(wrapper.emitted('update:search')).toHaveLength(1)
  })

  it('submits on Enter', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('input[type="search"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit-search')).toHaveLength(1)
  })

  it('reports a status and a sort choice', async () => {
    const wrapper = mountToolbar()
    const [status, sort] = wrapper.findAll('.ui-sel__trigger')
    await status.trigger('click')
    await flushPromises()
    pickOption('Paused')
    await sort.trigger('click')
    await flushPromises()
    pickOption('By progress')
    expect(wrapper.emitted('update:status')).toEqual([['paused']])
    expect(wrapper.emitted('update:sort')).toEqual([['progress']])
    wrapper.unmount()
  })
})

describe('on a phone', () => {
  // The chips ARE the library's tab strip — one component for every
  // sub-navigation in the app, rather than a hand-rolled row per surface. So
  // these assert on what the strip renders, not on a class this file owns.
  it('turns the status filter into a chip scroller', () => {
    const wrapper = mountToolbar({ mobile: true })
    const chips = wrapper.findAll('.gtb__chips [role="tab"]')
    expect(chips.length).toBeGreaterThan(1)
    expect(chips.map((c) => c.text())).toContain('Paused')
    // The status select is gone; sort keeps one, since it has no default worth
    // showing as a chip row of its own.
    expect(wrapper.findAll('.ui-sel')).toHaveLength(1)
  })

  it('marks the selected chip for assistive technology', () => {
    const wrapper = mountToolbar({ mobile: true, status: 'done' })
    const selected = wrapper
      .findAll('.gtb__chips [role="tab"]')
      .filter((c) => c.attributes('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0].text()).toBe('Done')
  })

  it('filters from a chip tap', async () => {
    const wrapper = mountToolbar({ mobile: true })
    await wrapper
      .findAll('.gtb__chips [role="tab"]')
      .find((c) => c.text() === 'Paused')!
      .trigger('click')
    expect(wrapper.emitted('update:status')).toEqual([['paused']])
  })
})

// Section 23: the way back into the help, once the empty state is gone.
describe('the help button', () => {
  it('is in the toolbar, named for what it opens', () => {
    const button = mountToolbar().find('.gtb__help')
    expect(button.exists()).toBe(true)
    expect(button.attributes('aria-label')).toBe('How to add a goal')
  })

  it('is there whether or not the tab has any goals', () => {
    // The question is asked most often by somebody who already has goals —
    // exactly when an empty-state hint has gone.
    expect(mountToolbar({ showFilters: false }).find('.gtb__help').exists()).toBe(true)
    expect(mountToolbar({ showFilters: true }).find('.gtb__help').exists()).toBe(true)
  })

  it('asks its host to open the panel rather than owning one', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('.gtb__help').trigger('click')
    expect(wrapper.emitted('help')).toHaveLength(1)
  })
})
