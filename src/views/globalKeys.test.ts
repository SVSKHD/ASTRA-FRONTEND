// The shell's arrow keys and a widget's arrow keys are the same four keys, and
// only one of them can win. These are the cases that decide it.
//
// The bug: arrowing along Personal · Business · All in the Finances toolbar
// moved the segment AND switched the whole workspace to another tab, because
// the shell's `document` listener only stood down for INPUT, TEXTAREA, SELECT
// and contenteditable — four ELEMENTS, in a problem that is about ROLES.
import { afterEach, describe, expect, it } from 'vitest'
import {
  NEW_ITEM_SEQUENCE_MS,
  WIDGET_ROLES,
  anyOverlayOpen,
  armsNewItem,
  firesNewItem,
  handledByWidget,
  type ShellOverlays,
} from '@/views/globalKeys'

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

describe('accidental tab changes', () => {
  it('stands down on an accordion toggle that kept focus after a click', () => {
    const el = target('<button data-t aria-expanded="true">Completed · 3</button>')
    expect(handledByWidget(press(el))).toBe(true)
    // Closed counts too — the attribute, not its value, marks the disclosure.
    const shut = target('<div role="button" data-t aria-expanded="false"></div>')
    expect(handledByWidget(press(shut))).toBe(true)
  })

  it('stands down inside a region that owns its keys', () => {
    const el = target('<div data-own-keys><div class="row"><span data-t>Row</span></div></div>')
    expect(handledByWidget(press(el))).toBe(true)
  })

  it('reads the last click when the key lands on <body>', () => {
    // Clicking a plain row does not move focus, so the key's target is <body>.
    const row = target('<div data-own-keys><div data-t class="row">Row</div></div>')
    expect(handledByWidget(press(document.body), row)).toBe(true)
    // A click somewhere ordinary leaves the shortcut working.
    const plain = target('<nav><button data-t>Todos</button></nav>')
    expect(handledByWidget(press(document.body), plain)).toBe(false)
    expect(handledByWidget(press(document.body))).toBe(false)
  })

  it('does not let a stale click override a focused element', () => {
    const row = target('<div data-own-keys><div data-t>Row</div></div>')
    const btn = target('<button data-t>Add income</button>', 'button')
    expect(handledByWidget(press(btn), row)).toBe(false)
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

describe('"/" then "n" — a new one of whatever the tab makes', () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    ({ key: k, metaKey: false, ctrlKey: false, altKey: false, ...mods }) as KeyboardEvent

  const NOTHING_OPEN: ShellOverlays = {
    detailDialog: false,
    itemDialog: false,
    noteView: false,
    taskView: false,
    share: false,
    notesDrawer: false,
    themePanel: false,
    securityPanel: false,
    githubPanel: false,
    avatarMenu: false,
    goalHelp: false,
  }

  it('arms on a bare slash only', () => {
    expect(armsNewItem(key('/'))).toBe(true)
    expect(armsNewItem(key('/', { metaKey: true }))).toBe(false)
    expect(armsNewItem(key('n'))).toBe(false)
  })

  it('fires on the n that follows, in either case', () => {
    const armed = 1_000
    expect(firesNewItem(key('n'), armed, armed + 10)).toBe(true)
    expect(firesNewItem(key('N'), armed, armed + 10)).toBe(true)
  })

  it('does not fire on an n that arrives alone', () => {
    // 0 is "never armed". Without this the sequence would be no sequence at
    // all and every stray n would open a create form.
    expect(firesNewItem(key('n'), 0, 5_000)).toBe(false)
  })

  it('lets the slash go stale, so yesterday\u2019s keypress cannot fire it', () => {
    const armed = 1_000
    expect(firesNewItem(key('n'), armed, armed + NEW_ITEM_SEQUENCE_MS - 1)).toBe(true)
    expect(firesNewItem(key('n'), armed, armed + NEW_ITEM_SEQUENCE_MS)).toBe(false)
  })

  it('stands down for a modified n, which belongs to the browser', () => {
    const armed = 1_000
    expect(firesNewItem(key('n', { metaKey: true }), armed, armed + 10)).toBe(false)
    expect(firesNewItem(key('n', { ctrlKey: true }), armed, armed + 10)).toBe(false)
  })

  it('is refused while anything is open over the tab', () => {
    expect(anyOverlayOpen(NOTHING_OPEN)).toBe(false)
    for (const k of Object.keys(NOTHING_OPEN) as (keyof ShellOverlays)[]) {
      // Each one on its own is enough: a create form arriving on top of what
      // somebody is reading is the failure this guard exists for.
      expect(anyOverlayOpen({ ...NOTHING_OPEN, [k]: true })).toBe(true)
    }
  })
})
