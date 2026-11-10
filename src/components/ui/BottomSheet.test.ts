// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import BottomSheet from '@/components/ui/BottomSheet.vue'

// The phone's More menu was dead to the touch: the sheet rendered inside the
// tab bar's `pointer-events: none` <nav>, inherited it, and every tap fell
// through to the page beneath. These pin the cure — the sheet lives at <body>.

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

function mountInDeadParent(open = true) {
  const isOpen = ref(open)
  const Host = defineComponent({
    setup: () => () =>
      h('nav', { class: 'dead-parent', style: 'pointer-events: none' }, [
        h(
          BottomSheet,
          { open: isOpen.value, title: 'More', onClose: () => (isOpen.value = false) },
          () => h('button', { class: 'item' }, 'Notes'),
        ),
      ]),
  })
  wrapper = mount(Host, { attachTo: document.body })
  return isOpen
}

describe('BottomSheet', () => {
  it('renders at <body>, outside a pointer-events: none parent', async () => {
    mountInDeadParent()
    await nextTick()
    const sheet = document.querySelector('.ui-sheet')
    const parent = document.querySelector('.dead-parent')
    expect(sheet).not.toBeNull()
    expect(parent?.contains(sheet)).toBe(false)
    expect(sheet?.parentElement).toBe(document.body)
    expect(document.querySelector('.ui-sheet .item')?.textContent).toBe('Notes')
  })

  it('closes from its × and its scrim', async () => {
    const isOpen = mountInDeadParent()
    await nextTick()
    ;(document.querySelector('.ui-sheet__x') as HTMLElement).click()
    await nextTick()
    expect(isOpen.value).toBe(false)
    expect(document.querySelector('.ui-sheet')).toBeNull()

    isOpen.value = true
    await nextTick()
    ;(document.querySelector('.ui-sheet__scrim') as HTMLElement).click()
    await nextTick()
    expect(isOpen.value).toBe(false)
  })

  it('states its own pointer events instead of inheriting them', () => {
    const css = readFileSync(resolve(__dirname, 'BottomSheet.vue'), 'utf8')
    for (const rule of ['.ui-sheet__scrim {', '.ui-sheet {']) {
      const at = css.indexOf(rule)
      expect(css.slice(at, css.indexOf('}', at))).toContain('pointer-events: auto')
    }
  })
})
