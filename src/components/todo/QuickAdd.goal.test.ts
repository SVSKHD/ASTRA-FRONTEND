import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import QuickAdd from './QuickAdd.vue'

describe('Quick Add on Milestones', () => {
  it('makes a milestone with its tag and target date, and no reminder', async () => {
    setActivePinia(createPinia())
    const app = useAppStore()
    const wrapper = mount(QuickAdd, { props: { collection: 'goals' } })
    await wrapper.find('input').setValue('Learn Rust by dec 31 5pm #Learning !high')
    // Only what a milestone uses is offered back: the tag, and the date as a target.
    const chips = wrapper.findAll('.qa__chips > *').map((c) => c.text())
    expect(chips).toEqual(['Learning', expect.stringMatching(/^Target /)])
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })

    expect(app.goals).toHaveLength(1)
    expect(app.goals[0]).toMatchObject({ title: 'Learn Rust', tag: 'Learning' })
    expect(app.goals[0].targetDate).toMatch(/-12-31$/)
    expect(app.reminders).toHaveLength(0)
    expect(wrapper.emitted('added')).toEqual([[app.goals[0].id]])
    wrapper.unmount()
  })

  it('puts a new milestone at the top of the manual order', async () => {
    setActivePinia(createPinia())
    const app = useAppStore()
    app.addGoal({ title: 'Existing', order: 5 })
    const wrapper = mount(QuickAdd, { props: { collection: 'goals' } })
    await wrapper.find('input').setValue('Newest')
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    const newest = app.goals.find((g) => g.title === 'Newest')!
    expect(newest.order).toBeLessThan(5)
    wrapper.unmount()
  })
})
