import type { Directive } from 'vue'

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
type FadeEl = HTMLElement & {
  __fadeUpdate?: () => void
  __fadeRo?: ResizeObserver
  __fadeMo?: MutationObserver
  __fadeFrame?: number
}

const EDGE_PX = 28

function update(el: FadeEl) {
  const { scrollTop, scrollHeight, clientHeight } = el
  const above = scrollTop > 1
  const below = scrollTop + clientHeight < scrollHeight - 1
  el.style.setProperty('--fade-top', above ? EDGE_PX + 'px' : '0px')
  el.style.setProperty('--fade-bottom', below ? EDGE_PX + 'px' : '0px')
}

export const vScrollFade: Directive<FadeEl> = {
  mounted(el) {
    el.classList.add('scroll-fade')
    const schedule = () => {
      if (el.__fadeFrame != null) return
      el.__fadeFrame = requestAnimationFrame(() => {
        el.__fadeFrame = undefined
        update(el)
      })
    }
    el.__fadeUpdate = schedule
    el.addEventListener('scroll', schedule, { passive: true })
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
    if (el.__fadeUpdate) el.removeEventListener('scroll', el.__fadeUpdate)
    el.__fadeRo?.disconnect()
    el.__fadeMo?.disconnect()
    if (el.__fadeFrame != null) cancelAnimationFrame(el.__fadeFrame)
  },
}
