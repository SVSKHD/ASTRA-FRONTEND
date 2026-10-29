import { ICON_SIZES, ICON_VIEWBOX, registerIcon } from '@/components/ui/icons'

// The up/down arrows every v-scroll-fade column gets in place of a scrollbar —
// the same arrows as ScrollSection and ScrollArrows, for scrollers that are a
// plain element rather than a component. An arrow shows only while there is
// more that way; a tap scrolls most of a page.
//
// The buttons are siblings of the scroller, absolutely positioned against the
// same box the scroller's own offsets are measured from (its offsetParent), so
// no wrapper element or `position: relative` is needed at the call site. They
// are inserted only while shown: a column that fits — and every test, where
// jsdom lays nothing out — has no extra nodes.

export interface ScrollArrows {
  update: () => void
  destroy: () => void
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function makeButton(dir: 1 | -1, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'scroll-arrow ' + (dir < 0 ? 'scroll-arrow--up' : 'scroll-arrow--down')
  btn.setAttribute('aria-label', dir < 0 ? 'Scroll up' : 'Scroll down')
  btn.title = dir < 0 ? 'Scroll up' : 'Scroll down'
  const svg = document.createElementNS(SVG_NS, 'svg')
  const px = String(ICON_SIZES.sm)
  svg.setAttribute('class', 'ui-icon')
  svg.setAttribute('width', px)
  svg.setAttribute('height', px)
  svg.setAttribute('viewBox', ICON_VIEWBOX)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const use = document.createElementNS(SVG_NS, 'use')
  use.setAttribute('href', '#i-chevron-down')
  svg.appendChild(use)
  btn.appendChild(svg)
  btn.addEventListener('click', onClick)
  return btn
}

export function attachScrollArrows(el: HTMLElement): ScrollArrows {
  el.classList.add('scroll-arrows-target')
  void registerIcon('chevron-down').catch(() => {})
  const page = (dir: 1 | -1) =>
    el.scrollBy({ top: dir * el.clientHeight * 0.8, behavior: 'smooth' })
  const up = makeButton(-1, () => page(-1))
  const down = makeButton(1, () => page(1))

  function place(btn: HTMLButtonElement, show: boolean, top: number, left: number) {
    if (!show) {
      btn.remove()
      return
    }
    if (btn.parentNode !== el.parentNode) el.parentNode?.insertBefore(btn, el.nextSibling)
    btn.style.top = top + 'px'
    btn.style.left = left + 'px'
  }

  function update() {
    // Hidden (v-show, a closed tab) or detached: nothing to point at.
    const visible = el.isConnected && el.offsetParent != null && el.clientHeight > 0
    const { scrollTop, scrollHeight, clientHeight } = el
    const above = visible && scrollTop > 1
    const below = visible && scrollTop + clientHeight < scrollHeight - 1
    const center = el.offsetLeft + el.clientWidth / 2
    place(up, above, el.offsetTop + 6, center)
    place(down, below, el.offsetTop + clientHeight - 34, center)
  }

  return {
    update,
    destroy() {
      up.remove()
      down.remove()
      el.classList.remove('scroll-arrows-target')
    },
  }
}
