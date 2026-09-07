// The shell's arrow keys and a widget's arrow keys are the same four keys, and
// only one of them can win. These are the cases that decide it.
//
// The bug: arrowing along Personal · Business · All in the Finances toolbar
// moved the segment AND switched the whole workspace to another tab, because
// the shell's `document` listener only stood down for INPUT, TEXTAREA, SELECT
// and contenteditable — four ELEMENTS, in a problem that is about ROLES.
import { afterEach, describe, expect, it } from 'vitest'
import { WIDGET_ROLES, handledByWidget } from '@/views/globalKeys'

/** A real element in a real tree, because `closest` is the thing under test. */
function target(html: string, selector = '[data-t]'): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  return host.querySelector(selector) as HTMLElement
}

function press(el: HTMLElement, prevented = false) {
  return { defaultPrevented: prevented, target: el }
}

afterEach(() => (document.body.innerHTML = ''))

describe('the shell stands down', () => {
  it('when the event says somebody already acted on it', () => {
    // The general answer, and the one that needs no list: a widget that handles
    // a key and calls preventDefault is respected whether or not anyone thought
    // about it here.
    expect(handledByWidget(press(target('<button data-t></button>'), true))).toBe(true)
  })

  it('inside a tab strip — the case that started this', () => {
    const el = target('<div role="tablist"><button data-t role="tab">Personal</button></div>')
    expect(handledByWidget(press(el))).toBe(true)
  })

  it('inside every composite widget that owns the arrow keys', () => {
    for (const role of WIDGET_ROLES) {
      const el = target(`<div role="${role}"><button data-t></button></div>`)
      expect(handledByWidget(press(el)), role).toBe(true)
    }
  })

  it('when the widget carries the role itself rather than wrapping it', () => {
    expect(handledByWidget(press(target('<div data-t role="listbox"></div>')))).toBe(true)
  })

  it('while text is being typed, which is what it always did', () => {
    for (const html of [
      '<input data-t />',
      '<textarea data-t></textarea>',
      '<select data-t></select>',
    ]) {
      expect(handledByWidget(press(target(html))), html).toBe(true)
    }
    // By attribute, so it holds for a keypress landing on a node INSIDE the
    // editor — which is where it usually lands — and not only on the host.
    expect(handledByWidget(press(target('<div data-t contenteditable="true"></div>')))).toBe(true)
    const inner = target('<div contenteditable="true"><code data-t>x</code></div>')
    expect(handledByWidget(press(inner))).toBe(true)
  })
})

describe('the shell keeps the key', () => {
  it('on a plain button, so ← / → still step through tabs from anywhere ordinary', () => {
    // The shortcut is the point of the shell. Standing down everywhere would
    // fix the collision by removing the feature.
    expect(handledByWidget(press(target('<button data-t>Add income</button>')))).toBe(false)
  })

  it('on the page body and on ordinary layout', () => {
    expect(handledByWidget(press(target('<div data-t><p>text</p></div>')))).toBe(false)
    expect(handledByWidget(press(target('<main data-t></main>')))).toBe(false)
  })

  it('when there is no target at all', () => {
    expect(handledByWidget({ defaultPrevented: false, target: null })).toBe(false)
  })
})
