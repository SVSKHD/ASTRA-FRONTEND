import { describe, expect, it } from 'vitest'
import { attachScrollArrows } from './scrollArrows'

// jsdom lays nothing out, so the scroller's geometry is set by hand.
function scroller(geom: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
  const parent = document.createElement('div')
  const el = document.createElement('div')
  parent.appendChild(el)
  document.body.appendChild(parent)
  for (const [key, value] of Object.entries(geom)) {
    Object.defineProperty(el, key, { configurable: true, writable: true, value })
  }
  Object.defineProperty(el, 'offsetParent', { configurable: true, value: parent })
  return { parent, el }
}
const arrows = (parent: HTMLElement) =>
  [...parent.querySelectorAll('.scroll-arrow')].map((b) => b.getAttribute('aria-label'))

describe('scroll arrows', () => {
  it('hides the bar and shows only the arrow there is more toward', () => {
    const { parent, el } = scroller({ scrollTop: 0, scrollHeight: 900, clientHeight: 300 })
    const a = attachScrollArrows(el)
    a.update()
    expect(el.classList.contains('scroll-arrows-target')).toBe(true)
    expect(arrows(parent)).toEqual(['Scroll down'])
    ;(el as unknown as { scrollTop: number }).scrollTop = 300
    a.update()
    expect(arrows(parent).sort()).toEqual(['Scroll down', 'Scroll up'])
    ;(el as unknown as { scrollTop: number }).scrollTop = 600
    a.update()
    expect(arrows(parent)).toEqual(['Scroll up'])
    a.destroy()
    expect(arrows(parent)).toEqual([])
    expect(el.classList.contains('scroll-arrows-target')).toBe(false)
    parent.remove()
  })

  it('adds nothing when the content fits', () => {
    const { parent, el } = scroller({ scrollTop: 0, scrollHeight: 300, clientHeight: 300 })
    attachScrollArrows(el).update()
    expect(parent.children).toHaveLength(1)
    parent.remove()
  })
})
