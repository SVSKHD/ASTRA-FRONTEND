// The collision, end to end: a real segmented control inside a real listener on
// `document`, arrowed the way a reader arrows it.
//
// The unit tests either side of this one check the two halves — the control
// stops the key, the shell stands down. This checks the thing that was actually
// broken, which is what happens when both are in the same page: pressing → on
// Personal · Business · All moved the segment AND ran the shell's tab shortcut
// underneath it, so choosing a scope threw you onto another tab.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { handledByWidget } from '@/views/globalKeys'

const SCOPES = [
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
  { value: 'all', label: 'All' },
]

/** What the workspace binds on `document`: ←/→ step through the app's tabs. */
let cycled: number[] = []
function shellShortcut(e: KeyboardEvent) {
  if (handledByWidget(e)) return
  if (e.key === 'ArrowRight') cycled.push(1)
  else if (e.key === 'ArrowLeft') cycled.push(-1)
}

beforeEach(() => {
  cycled = []
  document.addEventListener('keydown', shellShortcut)
})
afterEach(() => {
  document.removeEventListener('keydown', shellShortcut)
  document.body.innerHTML = ''
})

function mountScopes() {
  return mount(SegmentedControl, {
    props: { modelValue: 'personal', options: SCOPES, as: 'tablist', ariaLabel: 'Which money' },
    attachTo: document.body,
  })
}

describe('arrowing along the scope strip', () => {
  it('moves the selection', async () => {
    const w = mountScopes()
    await w.get('.ui-seg').trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue')![0]).toEqual(['business'])
    w.unmount()
  })

  it('does NOT also switch the workspace tab', async () => {
    // The regression. One press must have one answer.
    const w = mountScopes()
    await w.get('.ui-seg').trigger('keydown', { key: 'ArrowRight' })
    await w.get('.ui-seg').trigger('keydown', { key: 'ArrowLeft' })
    expect(cycled).toEqual([])
    w.unmount()
  })
})

describe('the second guard, on its own', () => {
  it('stands down for a widget that never stopped the key at all', () => {
    // The control's `.stop` is the first guard, and the test above covers it —
    // note that an event bubbling out of the control is caught by that, so it
    // cannot also be used to test this.
    //
    // So this is a hand-rolled strip: it carries `role="tablist"` and does NOT
    // stop propagation, which is every widget written before this rule existed
    // and every one written carelessly after it. The shell has to recognise it
    // by role and let the key alone regardless.
    const strip = document.createElement('div')
    strip.setAttribute('role', 'tablist')
    const tab = document.createElement('button')
    tab.setAttribute('role', 'tab')
    strip.append(tab)
    document.body.append(strip)

    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(cycled).toEqual([])
  })
})

describe('the shortcut still works where nothing owns the key', () => {
  it('runs from a plain button, which is the point of having it', async () => {
    const btn = document.createElement('button')
    document.body.append(btn)
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(cycled).toEqual([1])
  })
})
