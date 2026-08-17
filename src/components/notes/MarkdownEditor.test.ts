// The editor as a component: the source is the source of truth, the preview is
// derived from it, and the layout choice is remembered rather than reset.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MarkdownEditor from '@/components/notes/MarkdownEditor.vue'
import { useAppStore } from '@/stores/app'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function mountEditor(modelValue = '') {
  return mount(MarkdownEditor, {
    props: { modelValue },
    attachTo: document.body,
    global: { directives: { 'hover-style': {} } },
  })
}

describe('layout', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('opens split — source and preview together', () => {
    const wrapper = mountEditor('# Title')
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('.md').exists()).toBe(true)
  })

  it('shows only the source in edit mode', async () => {
    const wrapper = mountEditor('# Title')
    useAppStore().setNoteEditorMode('edit')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('.md').exists()).toBe(false)
  })

  it('shows only the rendering in preview mode', async () => {
    const wrapper = mountEditor('# Title')
    useAppStore().setNoteEditorMode('preview')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.find('.md h1').text()).toBe('Title')
  })

  it('remembers the choice on the store, so it survives reopening the note', async () => {
    const wrapper = mountEditor('x')
    const app = useAppStore()
    const buttons = wrapper.findAll('button[aria-pressed]')
    await buttons[1].trigger('click')
    expect(app.noteEditorMode).toBe('preview')
    wrapper.unmount()
    const second = mountEditor('x')
    expect(second.find('textarea').exists()).toBe(false)
  })
})

describe('editing', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('emits the typed source, unmodified', async () => {
    const wrapper = mountEditor('')
    const area = wrapper.find('textarea')
    area.element.value = '# Typed'
    await area.trigger('input')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['# Typed'])
  })

  it('applies a toolbar action to the selection', async () => {
    const wrapper = mountEditor('word')
    const area = wrapper.find('textarea')
    area.element.setSelectionRange(0, 4)
    await wrapper.findAll('button[title^="Bold"]')[0].trigger('click')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['**word**'])
  })

  it('continues a list on Enter rather than leaving a bare newline', async () => {
    const wrapper = mountEditor('- one')
    const area = wrapper.find('textarea')
    area.element.setSelectionRange(5, 5)
    await area.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['- one\n- '])
  })

  it('finishes the note on Cmd+Enter instead of continuing a list', async () => {
    const wrapper = mountEditor('- one')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', metaKey: true })
    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('offers every documented shortcut on the toolbar', () => {
    const titles = mountEditor()
      .findAll('button[title]')
      .map((b) => b.attributes('title'))
      .join(' ')
    for (const shortcut of [
      'Ctrl+B',
      'Ctrl+I',
      'Ctrl+E',
      'Ctrl+K',
      'Ctrl+1',
      'Ctrl+2',
      'Ctrl+3',
      'Ctrl+Shift+8',
      'Ctrl+Shift+9',
      'Ctrl+Shift+.',
    ]) {
      expect(titles, shortcut).toContain(shortcut)
    }
  })
})

describe('preview cost (acceptance 84)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  it('does not re-render the preview on every keystroke', async () => {
    const wrapper = mountEditor('start')
    const before = wrapper.find('.md').html()
    for (const value of ['# a', '# ab', '# abc']) {
      await wrapper.setProps({ modelValue: value })
    }
    // Still the pre-typing rendering: nothing has been parsed yet.
    expect(wrapper.find('.md').html()).toBe(before)
    vi.advanceTimersByTime(150)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.md h1').text()).toBe('abc')
  })

  it('shows the current text immediately when the preview is switched on', async () => {
    setActivePinia(createPinia())
    const app = useAppStore()
    app.setNoteEditorMode('edit')
    const wrapper = mountEditor('# Fresh')
    app.setNoteEditorMode('split')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.md h1').text()).toBe('Fresh')
  })
})
