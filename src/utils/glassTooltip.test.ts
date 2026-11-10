// The glass tooltip takes over native `title` bubbles: hovering shows the shared
// glass tip and hides the title attribute (so the OS bubble cannot appear);
// leaving restores the attribute exactly as it was.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installGlassTooltips } from '@/utils/glassTooltip'

function hover(type: 'pointerover' | 'pointerout', target: Element, related?: Element) {
  const e = new MouseEvent(type, { bubbles: true, relatedTarget: related ?? null })
  target.dispatchEvent(e)
}

describe('glass tooltips', () => {
  let uninstall: () => void
  let button: HTMLButtonElement

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    button = document.createElement('button')
    button.setAttribute('title', 'Move to Deadlines')
    button.innerHTML = '<span class="icon">📅</span>'
    document.body.appendChild(button)
    uninstall = installGlassTooltips()
  })
  afterEach(() => {
    uninstall()
    vi.useRealTimers()
  })

  it('shows the glass tip on hover and suppresses the native title', () => {
    hover('pointerover', button.querySelector('.icon')!)
    // The native title is moved aside immediately, before the delay.
    expect(button.hasAttribute('title')).toBe(false)
    vi.advanceTimersByTime(400)
    vi.runOnlyPendingTimers()
    const tip = document.querySelector('.glass-tip')
    expect(tip?.textContent).toBe('Move to Deadlines')
    expect(tip?.getAttribute('role')).toBe('tooltip')
  })

  it('restores the title attribute when the pointer leaves', () => {
    hover('pointerover', button)
    vi.advanceTimersByTime(400)
    hover('pointerout', button, document.body)
    expect(button.getAttribute('title')).toBe('Move to Deadlines')
    expect(document.querySelector('.glass-tip')?.classList.contains('is-visible')).toBe(false)
  })

  it('does not hide when moving between children of the same element', () => {
    hover('pointerover', button)
    hover('pointerout', button, button.querySelector('.icon')!)
    expect(button.hasAttribute('title')).toBe(false)
  })

  it('hides on Escape and ignores elements without a title', () => {
    const plain = document.createElement('div')
    document.body.appendChild(plain)
    hover('pointerover', plain)
    vi.advanceTimersByTime(400)
    expect(document.querySelector('.glass-tip')).toBeNull()

    hover('pointerover', button)
    vi.advanceTimersByTime(400)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(button.getAttribute('title')).toBe('Move to Deadlines')
  })

  // A tap focuses the tapped button; that focus must not bring the tooltip up
  // (on a phone it stuck over the More sheet). Keyboard focus still does.
  function at<T extends Event>(e: T, t: number, extra: object = {}): T {
    Object.defineProperty(e, 'timeStamp', { value: t })
    for (const [k, v] of Object.entries(extra)) Object.defineProperty(e, k, { value: v })
    return e
  }
  const focusIn = (t: number) =>
    button.dispatchEvent(at(new FocusEvent('focusin', { bubbles: true }), t))
  const press = (t: number, pointerType: string) =>
    button.dispatchEvent(at(new MouseEvent('pointerdown', { bubbles: true }), t, { pointerType }))

  it('shows on keyboard focus', () => {
    focusIn(5000)
    vi.advanceTimersByTime(400)
    expect(document.querySelector('.glass-tip')?.textContent).toBe('Move to Deadlines')
  })

  it('does not show on the focus a finger or Pencil tap gives the button', () => {
    for (const type of ['touch', 'pen']) {
      press(1000, type)
      focusIn(1020)
      vi.advanceTimersByTime(400)
      expect(document.querySelector('.glass-tip')).toBeNull()
      expect(button.getAttribute('title')).toBe('Move to Deadlines')
    }
    // A mouse click's focus is not suppressed by an earlier tap long ago.
    press(1000, 'touch')
    focusIn(9000)
    vi.advanceTimersByTime(400)
    expect(document.querySelector('.glass-tip')?.textContent).toBe('Move to Deadlines')
  })
})
