import { it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NoteCommands from './NoteCommands.vue'
it('documents formatting and saving commands in a collapsible reference', () => {
  const wrapper = mount(NoteCommands)
  expect(wrapper.find('.ui-accordion__head').attributes('aria-expanded')).toBe('false')
  expect(wrapper.find('.ui-accordion__head').text()).toBe('Formatting commands')
  expect(wrapper.text()).toContain('Ctrl+B')
  expect(wrapper.text()).toContain('Ctrl / Command + Enter')
  expect(wrapper.findAll('li')).toHaveLength(14)
  wrapper.unmount()
})
