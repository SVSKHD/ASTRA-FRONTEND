import { ICON_SIZES, ICON_VIEWBOX, registerIcon } from '@/components/ui/icons'

// The arrows every scroller gets in place of a scrollbar — the same arrows as
// ScrollSection and ScrollArrows, for scrollers that are a plain element rather
// than a component. An arrow shows only while there is more that way; a tap
// scrolls most of a page. Up/down for a column, left/right for a strip.
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

export type ScrollAxis = 'y' | 'x' | 'both'

export interface ScrollArrowOptions {
  /** Which way the element scrolls. Default: up/down only. */
  axis?: ScrollAxis
  /**
   * Leave the arrows out of the tab order. For arrows added automatically
   * (autoScrollArrows): the scroller itself still scrolls from the keyboard,
   * and a page full of them would bury the controls a Tab is meant to reach.
   */
  passive?: boolean
}

type Dir = 'up' | 'down' | 'left' | 'right'

const SVG_NS = 'http://www.w3.org/2000/svg'
const LABEL: Record<Dir, string> = {
  up: 'Scroll up',
  down: 'Scroll down',
  left: 'Scroll left',
  right: 'Scroll right',
}
/** The button's size, so an arrow sits inside the scroller's edge. */
const SIZE = 28
const GAP = 6

function makeButton(dir: Dir, passive: boolean, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = `scroll-arrow scroll-arrow--${dir}`
  btn.setAttribute('aria-label', LABEL[dir])
  btn.title = LABEL[dir]
  if (passive) btn.tabIndex = -1
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

export function attachScrollArrows(
  el: HTMLElement,
  options: ScrollArrowOptions = {},
): ScrollArrows {
  const axis = options.axis ?? 'y'
  const passive = !!options.passive
  const vertical = axis !== 'x'
  const horizontal = axis !== 'y'
  el.classList.add('scroll-arrows-target')
  void registerIcon('chevron-down').catch(() => {})

  const pageY = (dir: 1 | -1) =>
    el.scrollBy({ top: dir * el.clientHeight * 0.8, behavior: 'smooth' })
  const pageX = (dir: 1 | -1) =>
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  const buttons: Partial<Record<Dir, HTMLButtonElement>> = {}
  if (vertical) {
    buttons.up = makeButton('up', passive, () => pageY(-1))
    buttons.down = makeButton('down', passive, () => pageY(1))
  }
  if (horizontal) {
    buttons.left = makeButton('left', passive, () => pageX(-1))
    buttons.right = makeButton('right', passive, () => pageX(1))
  }

  function place(btn: HTMLButtonElement | undefined, show: boolean, top: number, left: number) {
    if (!btn) return
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
    const { scrollTop, scrollHeight, clientHeight, scrollLeft, scrollWidth, clientWidth } = el
    const centerX = el.offsetLeft + clientWidth / 2
    const centerY = el.offsetTop + clientHeight / 2
    if (vertical) {
      place(buttons.up, visible && scrollTop > 1, el.offsetTop + GAP, centerX)
      place(
        buttons.down,
        visible && scrollTop + clientHeight < scrollHeight - 1,
        el.offsetTop + clientHeight - SIZE - GAP,
        centerX,
      )
    }
    if (horizontal) {
      // scrollLeft is negative in a right-to-left scroller; its magnitude is the distance in.
      const x = Math.abs(scrollLeft)
      place(buttons.left, visible && x > 1, centerY, el.offsetLeft + GAP + SIZE / 2)
      place(
        buttons.right,
        visible && x + clientWidth < scrollWidth - 1,
        centerY,
        el.offsetLeft + clientWidth - GAP - SIZE / 2,
      )
    }
  }

  return {
    update,
    destroy() {
      for (const b of Object.values(buttons)) b?.remove()
      el.classList.remove('scroll-arrows-target')
    },
  }
}
