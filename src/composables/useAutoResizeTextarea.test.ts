// The auto-growing textarea (section 20b, acceptances 101 and 102).
//
// jsdom has no layout, so `scrollHeight` is stubbed to stand in for the browser:
// it reports a height proportional to the number of lines the content would
// wrap to. That is enough to check the part that actually goes wrong — whether
// the height is reset before it is measured, and whether it is measured at all
// at the moments it needs to be.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { rowKeyAction, useAutoResizeTextarea } from '@/composables/useAutoResizeTextarea'

const LINE = 21
let restoreScrollHeight: PropertyDescriptor | undefined

beforeEach(() => {
  restoreScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      // A browser reports the content height only when the element is free to
      // report it. An element pinned to a fixed height reports that height —
      // which is precisely why the composable resets to `auto` first.
      if (this.style.height && this.style.height !== 'auto') return parseInt(this.style.height, 10)
      const lines = Math.max(1, Math.ceil((this.value || '').length / 40))
      return lines * LINE
    },
  })
})
afterEach(() => {
  if (restoreScrollHeight) {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', restoreScrollHeight)
  }
})

function harness(value: string, options: Parameters<typeof useAutoResizeTextarea>[0] = {}) {
  const model = ref(value)
  let api!: ReturnType<typeof useAutoResizeTextarea>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useAutoResizeTextarea({ watch: () => model.value, ...options })
        return () =>
          h('textarea', {
            ref: api.el,
            value: model.value,
            onInput: (event: Event) => {
              model.value = (event.target as HTMLTextAreaElement).value
              api.onInput()
            },
          })
      },
    }),
    { attachTo: document.body },
  )
  return { wrapper, model, api, field: () => wrapper.find('textarea') }
}

const heightOf = (wrapper: { find: (s: string) => { element: Element } }) =>
  parseInt((wrapper.find('textarea').element as HTMLTextAreaElement).style.height, 10)

describe('sizing to the content', () => {
  it('is one line tall for one line of text', () => {
    const { wrapper } = harness('short')
    expect(heightOf(wrapper)).toBe(LINE)
  })

  it('starts at the full height of stored text, not at one line (acceptance 101)', () => {
    // A three-line point rendered one line tall is the truncation being fixed.
    const { wrapper } = harness('x'.repeat(120))
    expect(heightOf(wrapper)).toBe(3 * LINE)
  })

  it('grows as the text does (acceptance 102)', async () => {
    const { wrapper, field } = harness('short')
    await field().setValue('x'.repeat(90))
    expect(heightOf(wrapper)).toBe(3 * LINE)
  })

  it('shrinks again when the text is cut back', async () => {
    // The height is reset to `auto` before measuring; without that the field
    // could only ever grow.
    const { wrapper, field } = harness('x'.repeat(120))
    expect(heightOf(wrapper)).toBe(3 * LINE)
    await field().setValue('short')
    expect(heightOf(wrapper)).toBe(LINE)
  })

  it('respects a minimum height so a list of empty rows keeps its rhythm', () => {
    const { wrapper } = harness('', { minHeight: 40 })
    expect(heightOf(wrapper)).toBe(40)
  })
})

describe('re-measuring when it was not typed in', () => {
  it('follows a value replaced from elsewhere', async () => {
    const { wrapper, model } = harness('short')
    model.value = 'x'.repeat(120)
    await nextTick()
    await nextTick()
    expect(heightOf(wrapper)).toBe(3 * LINE)
  })

  it('re-measures when the window resizes, because the text rewraps', () => {
    const { wrapper, api } = harness('x'.repeat(120))
    const spy = vi.spyOn(api, 'resize')
    void spy
    // Narrower window, same text, more lines.
    ;(wrapper.find('textarea').element as HTMLTextAreaElement).value = 'x'.repeat(200)
    window.dispatchEvent(new Event('resize'))
    expect(heightOf(wrapper)).toBe(5 * LINE)
  })

  it('stops listening once it is gone', () => {
    const { wrapper } = harness('short')
    const remove = vi.spyOn(window, 'removeEventListener')
    wrapper.unmount()
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
    remove.mockRestore()
  })

  it('does nothing at all without an element', () => {
    const api = useAutoResizeTextarea()
    expect(() => api.resize()).not.toThrow()
  })
})

describe('the keyboard contract for a row', () => {
  const key = (k: string, mods: Record<string, boolean> = {}) => ({
    key: k,
    shiftKey: false,
    ...mods,
  })

  it('commits on plain Enter — these are checklist lines, not paragraphs', () => {
    expect(rowKeyAction(key('Enter'))).toBe('commit')
  })

  it('puts a newline in on Shift+Enter', () => {
    expect(rowKeyAction(key('Enter', { shiftKey: true }))).toBe('newline')
  })

  it('reverts on Escape', () => {
    expect(rowKeyAction(key('Escape'))).toBe('revert')
  })

  it('leaves ⌘↵ and friends to whatever surrounds the row', () => {
    expect(rowKeyAction(key('Enter', { metaKey: true }))).toBe('none')
    expect(rowKeyAction(key('Enter', { ctrlKey: true }))).toBe('none')
    expect(rowKeyAction(key('Enter', { altKey: true }))).toBe('none')
  })

  it('ignores every other key', () => {
    expect(rowKeyAction(key('a'))).toBe('none')
    expect(rowKeyAction(key('Tab'))).toBe('none')
  })
})
