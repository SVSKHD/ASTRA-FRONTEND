import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import TasksView from './TasksView.vue'
import NextUpPanel from '@/components/todo/NextUpPanel.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import ItemPinButton from '@/components/ItemPinButton.vue'
import TreeList from '@/components/TreeList.vue'
import CompletedSection from '@/components/CompletedSection.vue'
describe('Tasks uses the Todo layout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })
  it('shows task Next up and an inline Completed section that respects the hide setting', async () => {
    const app = useAppStore()
    app.addTask('Open task', '')
    app.addTask('Finished task', '')
    app.setTaskStatus(app.tasks[1].id, 'done')
    const wrapper = mount(TasksView, {
      global: { stubs: { NextUpPanel: true, TaskDetail: true, QuickAdd: true, teleport: true } },
    })
    expect(wrapper.findComponent(NextUpPanel).props('collection')).toBe('tasks')
    expect(wrapper.findComponent(CompletedSection).props('collection')).toBe('tasks')
    expect(wrapper.findComponent(CompletedSection).props('count')).toBe(1)
    app.hideCompleted = true
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(CompletedSection).exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('Tasks added filter', () => {
  it('filters recent items, keeps their parents, sorts latest first, and restores default order', async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    const app = useAppStore()
    const stamp = Date.now()
    app.addTask('Old', '')
    app.addTask('New', '')
    app.addTask('Old parent', '')
    app.addTask('New child', '')
    const [old, fresh, parent, child] = app.tasks
    old.createdAt = parent.createdAt = stamp - 10 * 86400000
    fresh.createdAt = stamp - 1000
    child.createdAt = stamp
    child.parentId = parent.id
    old.order = 0
    fresh.order = 1
    parent.order = 2
    const wrapper = mount(TasksView, {
      global: {
        stubs: {
          NextUpPanel: true,
          TaskDetail: true,
          QuickAdd: true,
          TreeList: true,
          teleport: true,
        },
      },
    })
    const menu = wrapper
      .findAllComponents(Dropdown)
      .find((menu) => menu.props('label') === 'Added')!
    const roots = () => wrapper.findComponent(TreeList).props('rootIds')
    expect(roots()).toEqual([old.id, fresh.id, parent.id])
    menu.vm.$emit('select', 'recent')
    await wrapper.vm.$nextTick()
    expect(roots()).toEqual([parent.id, fresh.id])
    menu.vm.$emit('select', 'latest')
    await wrapper.vm.$nextTick()
    expect(roots()).toEqual([parent.id, fresh.id, old.id])
    menu.vm.$emit('select', 'default')
    await wrapper.vm.$nextTick()
    expect(roots()).toEqual([old.id, fresh.id, parent.id])
    wrapper.unmount()
  })
})

it('separates pinned task roots from the unpinned list', async () => {
  localStorage.clear()
  setActivePinia(createPinia())
  const app = useAppStore()
  app.addTask('Keep', '')
  app.addTask('Other', '')
  const [keep, other] = app.tasks
  app.patchTask(keep.id, { pinned: true })
  const wrapper = mount(TasksView, {
    global: { stubs: { NextUpPanel: true, TaskDetail: true, QuickAdd: true, teleport: true } },
  })
  expect(
    wrapper.find('[aria-label="Pinned items"]').findComponent(TreeList).props('rootIds'),
  ).toEqual([keep.id])
  expect(wrapper.findAllComponents(TreeList)[1].props('rootIds')).toEqual([other.id])
  const pinnedHeader = wrapper.find('[aria-label="Pinned items"] .ui-accordion__head')
  const unpinnedHeader = wrapper.find('[aria-label="Unpinned items"] .ui-accordion__head')
  expect(pinnedHeader.attributes('aria-expanded')).toBe('true')
  await pinnedHeader.trigger('click')
  expect(pinnedHeader.attributes('aria-expanded')).toBe('false')
  expect(unpinnedHeader.attributes('aria-expanded')).toBe('true')
  await pinnedHeader.trigger('click')
  await unpinnedHeader.trigger('click')
  expect(unpinnedHeader.attributes('aria-expanded')).toBe('false')
  await unpinnedHeader.trigger('click')
  const pin = wrapper.find('[aria-label="Pinned items"]').findComponent(ItemPinButton)
  await pin.find('button').trigger('click')
  expect(wrapper.find('[aria-label="Pinned items"]').exists()).toBe(false)
  expect(wrapper.findComponent(TreeList).props('rootIds')).toContain(keep.id)
  wrapper.unmount()
})
