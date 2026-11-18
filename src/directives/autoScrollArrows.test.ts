import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrollAxis, startAutoScrollArrows } from './autoScrollArrows'
import { attachScrollArrows } from './scrollArrows'

const style = (overflowY: string, overflowX = 'visible') => ({ overflowX, overflowY })
const div = (cls = '') => {
  const el = document.createElement('div')
  if (cls) el.className = cls
  return el
}

describe('scrollAxis', () => {
  it('reads the way an element scrolls from its overflow', () => {
    expect(scrollAxis(div(), style('auto'))).toBe('y')
    expect(scrollAxis(div(), style('hidden', 'auto'))).toBe('x')
    expect(scrollAxis(div(), style('scroll', 'scroll'))).toBe('both')
    expect(scrollAxis(div(), style('visible'))).toBeNull()
    expect(scrollAxis(div(), style('hidden'))).toBeNull()
  })

  it('leaves form fields and scrollers with their own arrows alone', () => {
    expect(scrollAxis(document.createElement('textarea'), style('auto'))).toBeNull()
    expect(scrollAxis(div('scroll-arrows-target'), style('auto'))).toBeNull()
    expect(scrollAxis(div('scroll-section__body'), style('auto'))).toBeNull()
    const off = div()
    off.dataset.scrollArrows = 'off'
    expect(scrollAxis(off, style('auto'))).toBeNull()
  })
})

describe('startAutoScrollArrows', () => {
  let stop: (() => void) | undefined
  afterEach(() => {
    stop?.()
    stop = undefined
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('takes over a scroller that arrives later, and lets go once it leaves', async () => {
    vi.stubGlobal('requestIdleCallback', (fn: () => void) => setTimeout(fn, 0))
    stop = startAutoScrollArrows(document.body)
    const el = div()
    el.style.overflowY = 'auto'
    document.body.appendChild(el)
    await vi.waitFor(() => expect(el.classList.contains('scroll-arrows-target')).toBe(true))
    el.remove()
    // The page changed again: the departed scroller is dropped.
    document.body.appendChild(div())
    await vi.waitFor(() => expect(el.classList.contains('scroll-arrows-target')).toBe(false))
  })
})

describe('left/right arrows', () => {
  it('show toward the side there is more on', () => {
    const parent = div()
    const el = div()
    parent.appendChild(el)
    document.body.appendChild(parent)
    const geom = { scrollLeft: 0, scrollWidth: 900, clientWidth: 300, clientHeight: 40 }
    for (const [k, v] of Object.entries(geom))
      Object.defineProperty(el, k, { configurable: true, writable: true, value: v })
    Object.defineProperty(el, 'offsetParent', { configurable: true, value: parent })
    const labels = () =>
      [...parent.querySelectorAll('.scroll-arrow')]
        .map((b) => (b as HTMLElement).dataset.dir)
        .sort()

    const a = attachScrollArrows(el, { axis: 'x', passive: true })
    a.update()
    expect(labels()).toEqual(['right'])
    expect((parent.querySelector('.scroll-arrow') as HTMLElement).tabIndex).toBe(-1)
    ;(el as unknown as { scrollLeft: number }).scrollLeft = 300
    a.update()
    expect(labels()).toEqual(['left', 'right'])
    ;(el as unknown as { scrollLeft: number }).scrollLeft = 600
    a.update()
    expect(labels()).toEqual(['left'])
    a.destroy()
    expect(labels()).toEqual([])
    parent.remove()
  })
})
