// The toolbar's density and its two shapes (section 19c).
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
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

describe('the one-line layout', () => {
  it('puts search, status and sort on one row', () => {
    const wrapper = mountToolbar()
    const filters = wrapper.find('.gtb__filters')
    expect(filters.find('input[type="search"]').exists()).toBe(true)
    expect(filters.findAll('select')).toHaveLength(2)
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
    const [status, sort] = wrapper.findAll('select')
    await status.setValue('paused')
    await sort.setValue('progress')
    expect(wrapper.emitted('update:status')).toEqual([['paused']])
    expect(wrapper.emitted('update:sort')).toEqual([['progress']])
  })
})

describe('on a phone', () => {
  it('turns the status filter into a chip scroller', () => {
    const wrapper = mountToolbar({ mobile: true })
    const chips = wrapper.findAll('.gtb__chip')
    expect(chips.length).toBeGreaterThan(1)
    expect(chips.map((c) => c.text())).toContain('Paused')
    // The status select is gone; sort keeps one, since it has no default worth
    // showing as a chip row of its own.
    expect(wrapper.findAll('select')).toHaveLength(1)
  })

  it('marks the selected chip for assistive technology', () => {
    const wrapper = mountToolbar({ mobile: true, status: 'done' })
    const selected = wrapper
      .findAll('.gtb__chip')
      .filter((c) => c.attributes('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0].text()).toBe('Done')
  })

  it('filters from a chip tap', async () => {
    const wrapper = mountToolbar({ mobile: true })
    await wrapper
      .findAll('.gtb__chip')
      .find((c) => c.text() === 'Paused')!
      .trigger('click')
    expect(wrapper.emitted('update:status')).toEqual([['paused']])
  })
})
