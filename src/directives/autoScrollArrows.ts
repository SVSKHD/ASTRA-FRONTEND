import { attachScrollArrows, type ScrollArrows, type ScrollAxis } from './scrollArrows'

// Arrows instead of a scrollbar, everywhere, without touching each scroller.
//
// style.css hides every scrollbar. This finds each element that scrolls — its
// computed overflow is auto or scroll — as it enters the page, and gives it the
// shared arrows (scrollArrows.ts): up/down for a column, left/right for a strip.
// An arrow shows only while there is more that way, so a scroller whose content
// fits shows nothing.
//
// Cost is kept off the hot path: new nodes are collected and looked at once per
// idle moment, each element's style is read once, and a scroller is watched
// with a scroll listener and a ResizeObserver on itself and its direct
// children — never a subtree MutationObserver per scroller.
//
// Skipped: form fields (a textarea scrolls its own text), anything that already
// draws its own arrows (v-scroll-fade, ScrollSection, ScrollArrows — they carry
// `scroll-arrows-target` or `scroll-section__body`), and anything marked
// `data-scroll-arrows="off"`.

interface Entry {
  arrows: ScrollArrows
  schedule: () => void
  ro?: ResizeObserver
  mo?: MutationObserver
  frame?: number
}

const SKIP_TAGS = new Set(['TEXTAREA', 'INPUT', 'SELECT', 'HTML', 'BODY', 'svg', 'SVG', 'IFRAME'])
const OWN_ARROWS = ['scroll-arrows-target', 'scroll-section__body']
const SCROLLS = new Set(['auto', 'scroll'])

/** Which way an element scrolls, from its computed overflow; null when it does not. */
export function scrollAxis(
  el: Element,
  style: Pick<CSSStyleDeclaration, 'overflowX' | 'overflowY'>,
): ScrollAxis | null {
  if (SKIP_TAGS.has(el.tagName)) return null
  if (OWN_ARROWS.some((c) => el.classList.contains(c))) return null
  if ((el as HTMLElement).dataset?.scrollArrows === 'off') return null
  const y = SCROLLS.has(style.overflowY)
  const x = SCROLLS.has(style.overflowX)
  return y && x ? 'both' : y ? 'y' : x ? 'x' : null
}

export function startAutoScrollArrows(root: HTMLElement = document.body): () => void {
  const entries = new Map<HTMLElement, Entry>()
  const pending = new Set<Element>()
  let flush: number | undefined
  const idle: (fn: () => void) => number =
    typeof requestIdleCallback === 'function'
      ? (fn) => requestIdleCallback(fn, { timeout: 250 })
      : (fn) => window.setTimeout(fn, 50)

  function attach(el: HTMLElement, axis: ScrollAxis) {
    const arrows = attachScrollArrows(el, { axis, passive: true })
    const entry: Entry = { arrows, schedule: () => {} }
    entry.schedule = () => {
      if (entry.frame != null) return
      entry.frame = requestAnimationFrame(() => {
        entry.frame = undefined
        arrows.update()
      })
    }
    el.addEventListener('scroll', entry.schedule, { passive: true })
    if (typeof ResizeObserver !== 'undefined') {
      // The scroller's own size, and its children's: content growing inside it
      // changes what is hidden without resizing the scroller.
      const ro = new ResizeObserver(entry.schedule)
      ro.observe(el)
      for (const child of el.children) ro.observe(child)
      entry.ro = ro
      if (typeof MutationObserver !== 'undefined') {
        entry.mo = new MutationObserver((records) => {
          for (const r of records) {
            for (const n of r.addedNodes) if (n instanceof Element) ro.observe(n)
          }
          entry.schedule()
        })
        entry.mo.observe(el, { childList: true })
      }
    }
    entries.set(el, entry)
    arrows.update()
  }

  function detach(el: HTMLElement) {
    const e = entries.get(el)
    if (!e) return
    el.removeEventListener('scroll', e.schedule)
    e.ro?.disconnect()
    e.mo?.disconnect()
    if (e.frame != null) cancelAnimationFrame(e.frame)
    e.arrows.destroy()
    entries.delete(el)
  }

  function consider(el: Element) {
    if (!(el instanceof HTMLElement) || entries.has(el)) return
    const axis = scrollAxis(el, getComputedStyle(el))
    if (axis) attach(el, axis)
  }

  function run() {
    flush = undefined
    // Gone from the page: drop its watchers and its arrows.
    for (const el of [...entries.keys()]) if (!el.isConnected) detach(el)
    for (const node of pending) {
      if (!node.isConnected) continue
      consider(node)
      // Arrows we inserted are buttons, never scrollers; the walk is cheap.
      for (const el of node.querySelectorAll('*')) consider(el)
    }
    pending.clear()
  }

  function queue(node: Element) {
    pending.add(node)
    if (flush == null) flush = idle(run)
  }

  const mo = new MutationObserver((records) => {
    let removed = false
    for (const r of records) {
      for (const n of r.addedNodes) if (n instanceof Element) queue(n)
      if (r.removedNodes.length) removed = true
    }
    if (removed && flush == null) flush = idle(run)
  })
  mo.observe(root, { childList: true, subtree: true })

  const onResize = () => {
    for (const e of entries.values()) e.schedule()
  }
  window.addEventListener('resize', onResize)
  queue(root)

  return () => {
    mo.disconnect()
    window.removeEventListener('resize', onResize)
    for (const el of [...entries.keys()]) detach(el)
  }
}
