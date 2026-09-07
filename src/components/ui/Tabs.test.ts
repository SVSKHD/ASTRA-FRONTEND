// `Tabs` is a wrapper now, not a second implementation. These are the two
// things that makes true, and the one thing it must not quietly become.
//
// The merge is the point: two components doing the same interaction with the
// same keyboard and near-identical CSS is two places for a fix to land and one
// of them to be forgotten — which is exactly how the Finances toolbar ended up
// holding two strips that looked like different components.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Tabs from '@/components/ui/Tabs.vue'

const TABS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
]

const source = readFileSync(join(process.cwd(), 'src/components/ui/Tabs.vue'), 'utf8')

describe('Tabs is drawn by the one segmented control', () => {
  it('renders that control rather than markup of its own', () => {
    expect(source).toContain("import SegmentedControl from '@/components/ui/SegmentedControl.vue'")
    expect(
      mount(Tabs, { props: { modelValue: 'a', tabs: TABS } })
        .find('.ui-seg')
        .exists(),
    ).toBe(true)
  })

  it('has no stylesheet, so there is one appearance and not two', () => {
    // The hundred lines that used to live here are the reason the two controls
    // drifted apart. A `<style>` block reappearing is that starting again.
    expect(source).not.toContain('<style')
  })
})

describe('but it is still a tab strip', () => {
  it('announces itself as one — which is the whole reason it still exists', () => {
    const w = mount(Tabs, { props: { modelValue: 'b', tabs: TABS, ariaLabel: 'Panes' } })
    expect(w.get('[role="tablist"]').attributes('aria-label')).toBe('Panes')
    const tabs = w.findAll('[role="tab"]')
    expect(tabs).toHaveLength(2)
    expect(tabs[1].attributes('aria-selected')).toBe('true')
    expect(tabs[0].attributes('aria-selected')).toBe('false')
    // A tab is selected, never checked.
    expect(tabs[1].attributes('aria-checked')).toBeUndefined()
  })

  it('reports the tab that was clicked', async () => {
    const w = mount(Tabs, { props: { modelValue: 'a', tabs: TABS } })
    await w.findAll('[role="tab"]')[1].trigger('click')
    expect(w.emitted('update:modelValue')![0]).toEqual(['b'])
  })

  it('moves with the arrow keys, one tab stop', async () => {
    const w = mount(Tabs, { props: { modelValue: 'a', tabs: TABS }, attachTo: document.body })
    await w.get('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue')![0]).toEqual(['b'])
    w.unmount()
  })
})
