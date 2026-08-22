// The editor as a component: the source is the source of truth, the preview is
// derived from it, and the layout choice is remembered rather than reset.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import NoteEditor from '@/components/notes/NoteEditor.vue'
import { useAppStore } from '@/stores/app'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function mountEditor(modelValue = '') {
  return mount(NoteEditor, {
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

// Section 22d: the same editor, inside a dialog.
describe('compact mode', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function mountCompact(modelValue = '') {
    return mount(NoteEditor, {
      props: { modelValue, compact: true },
      attachTo: document.body,
      global: { directives: { 'hover-style': {} } },
    })
  }

  it('draws one row of tools and files the rest behind an overflow', () => {
    const wrapper = mountCompact()
    const titles = wrapper.findAll('button[title]').map((b) => b.attributes('title'))
    expect(titles.some((t) => t?.startsWith('Bold'))).toBe(true)
    // Table lives in the overflow menu, not on the bar.
    expect(titles.some((t) => t?.startsWith('Table'))).toBe(false)
    expect(wrapper.findComponent({ name: 'Dropdown' }).exists()).toBe(true)
  })

  it('still reaches every action through that overflow', async () => {
    const wrapper = mountCompact('word')
    const menu = wrapper.findComponent({ name: 'Dropdown' })
    const labels = (menu.props('items') as { label: string }[]).map((i) => i.label)
    expect(labels.some((l) => l.startsWith('Table'))).toBe(true)
    wrapper.find('textarea').element.setSelectionRange(0, 4)
    menu.vm.$emit('select', 'bold')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['**word**'])
  })

  it('offers no Split — half of half a dialog is not a column', () => {
    const labels = mountCompact()
      .findAll('button')
      .map((b) => b.text())
    expect(labels).not.toContain('Split')
    expect(labels).toContain('Preview')
  })

  it('never rewrites the notes view preference when previewing in a dialog', async () => {
    const app = useAppStore()
    app.setNoteEditorMode('split')
    const wrapper = mountCompact('# Title')
    // A stored Split is narrowed on the way out, not overwritten.
    expect(wrapper.find('textarea').exists()).toBe(true)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Preview')!
      .trigger('click')
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(app.noteEditorMode).toBe('split')
  })
})
