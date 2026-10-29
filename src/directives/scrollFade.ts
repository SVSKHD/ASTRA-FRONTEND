import type { Directive } from 'vue'
import { attachScrollArrows, type ScrollArrows } from './scrollArrows'

// v-scroll-fade: a scrolling column's content fades out at an edge where there
// is more to see, instead of being cut off by a hard line. The top fade appears
// only once the column is scrolled; the bottom one only while something is
// still below. Where nothing is hidden there is no fade, so a short list and
// the top of a long one read exactly as they did.
//
// The fade is a mask (the `.scroll-fade` rule in style.css) driven by two
// custom properties set here, so the background behind the column — the glass,
// the starfield — shows through where the content fades.
//
// Scroll moves the edges; a resize or a change of content (a section opening,
// a row arriving) can too, so both are watched.
//
// The column also has no scrollbar: up/down arrows (scrollArrows.ts) sit on
// its edges while there is more that way, the app-wide way of saying "this
// scrolls". `v-scroll-fade.noarrows` keeps the fade alone, for a scroller that
// draws its own arrows.
type FadeEl = HTMLElement & {
  __fadeUpdate?: () => void
  __fadeRo?: ResizeObserver
  __fadeMo?: MutationObserver
  __fadeFrame?: number
  __fadeArrows?: ScrollArrows
}

const EDGE_PX = 28

function update(el: FadeEl) {
  const { scrollTop, scrollHeight, clientHeight } = el
  const above = scrollTop > 1
  const below = scrollTop + clientHeight < scrollHeight - 1
  el.style.setProperty('--fade-top', above ? EDGE_PX + 'px' : '0px')
  el.style.setProperty('--fade-bottom', below ? EDGE_PX + 'px' : '0px')
  el.__fadeArrows?.update()
}

export const vScrollFade: Directive<FadeEl> = {
  mounted(el, binding) {
    el.classList.add('scroll-fade')
    if (!binding.modifiers.noarrows) el.__fadeArrows = attachScrollArrows(el)
    const schedule = () => {
      if (el.__fadeFrame != null) return
      el.__fadeFrame = requestAnimationFrame(() => {
        el.__fadeFrame = undefined
        update(el)
      })
    }
    el.__fadeUpdate = schedule
    el.addEventListener('scroll', schedule, { passive: true })
    // The arrows sit by offset, so a window resize that moves the column
    // without resizing it still has to move them.
    window.addEventListener('resize', schedule)
    if (typeof ResizeObserver !== 'undefined') {
      el.__fadeRo = new ResizeObserver(schedule)
      el.__fadeRo.observe(el)
    }
    if (typeof MutationObserver !== 'undefined') {
      el.__fadeMo = new MutationObserver(schedule)
      el.__fadeMo.observe(el, { childList: true, subtree: true })
    }
    update(el)
  },
  updated(el) {
    el.__fadeUpdate?.()
  },
  beforeUnmount(el) {
    if (el.__fadeUpdate) {
      el.removeEventListener('scroll', el.__fadeUpdate)
      window.removeEventListener('resize', el.__fadeUpdate)
    }
    el.__fadeArrows?.destroy()
    el.__fadeRo?.disconnect()
    el.__fadeMo?.disconnect()
    if (el.__fadeFrame != null) cancelAnimationFrame(el.__fadeFrame)
  },
}
