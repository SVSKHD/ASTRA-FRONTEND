// Glass tooltips for every `title` in the app.
//
// The browser's native title bubble is a small black box drawn by the OS: it
// ignores the theme, cannot be rounded or blurred, and appears after a delay the
// page does not control. Rather than rewrite the hundreds of `title="…"`
// attributes the components carry, one delegated listener takes them over:
//
//   hover / keyboard focus on an element with a title
//     → the title is moved aside (data-glass-tip) so the native bubble never
//       shows, and after a short delay one shared glass tooltip appears above
//       the element (below it when there is no room), clamped to the viewport;
//   leaving, pressing, scrolling or Escape
//     → the tooltip fades out and the title attribute is put back, so the DOM
//       (tests, screen readers, anything reading `title`) is unchanged at rest.
//
// Touch is ignored: a tap is not a hover, and a tooltip that sticks after a tap
// covers what the finger was reaching for.

const SHOW_DELAY_MS = 350
const GAP_PX = 8
const EDGE_PX = 8
const TIP_ID = 'glass-tip'

let tipEl: HTMLDivElement | null = null
let current: HTMLElement | null = null
let showTimer: ReturnType<typeof setTimeout> | undefined
let uninstallFn: (() => void) | null = null

function ensureTip(): HTMLDivElement {
  if (tipEl && tipEl.isConnected) return tipEl
  tipEl = document.createElement('div')
  tipEl.className = 'glass-tip'
  tipEl.id = TIP_ID
  tipEl.setAttribute('role', 'tooltip')
  document.body.appendChild(tipEl)
  return tipEl
}

function targetOf(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null
  return node.closest<HTMLElement>('[title]:not([title=""]), [data-glass-tip]')
}

function textOf(el: HTMLElement): string {
  return (el.getAttribute('title') ?? el.dataset.glassTip ?? '').trim()
}

// Move the title aside so the native bubble cannot appear while ours is up.
function stash(el: HTMLElement) {
  const title = el.getAttribute('title')
  if (title != null) {
    el.dataset.glassTip = title
    el.removeAttribute('title')
  }
}
function restore(el: HTMLElement) {
  const saved = el.dataset.glassTip
  if (saved != null) {
    if (!el.hasAttribute('title')) el.setAttribute('title', saved)
    delete el.dataset.glassTip
  }
  if (el.dataset.glassTipAria) {
    el.removeAttribute('aria-describedby')
    delete el.dataset.glassTipAria
  }
}

function place(el: HTMLElement, tip: HTMLDivElement) {
  const r = el.getBoundingClientRect()
  const t = tip.getBoundingClientRect()
  let top = r.top - t.height - GAP_PX
  let placement: 'top' | 'bottom' = 'top'
  if (top < EDGE_PX) {
    top = r.bottom + GAP_PX
    placement = 'bottom'
  }
  const maxLeft = Math.max(EDGE_PX, window.innerWidth - t.width - EDGE_PX)
  const left = Math.min(Math.max(EDGE_PX, r.left + r.width / 2 - t.width / 2), maxLeft)
  tip.style.left = `${Math.round(left)}px`
  tip.style.top = `${Math.round(top)}px`
  tip.dataset.placement = placement
}

function show(el: HTMLElement) {
  const text = textOf(el)
  if (!text) return
  stash(el)
  current = el
  clearTimeout(showTimer)
  showTimer = setTimeout(() => {
    if (current !== el || !el.isConnected) return
    const tip = ensureTip()
    tip.textContent = text
    tip.classList.remove('is-visible')
    // Measure off-screen first so placement uses the real size of this text.
    tip.style.left = '0px'
    tip.style.top = '-9999px'
    place(el, tip)
    if (!el.hasAttribute('aria-describedby')) {
      el.setAttribute('aria-describedby', TIP_ID)
      el.dataset.glassTipAria = '1'
    }
    requestAnimationFrame(() => {
      if (current === el) tip.classList.add('is-visible')
    })
  }, SHOW_DELAY_MS)
}

function hide() {
  clearTimeout(showTimer)
  const el = current
  current = null
  if (el) restore(el)
  tipEl?.classList.remove('is-visible')
}

/** Install once at app start. Returns an uninstaller (used by tests). */
export function installGlassTooltips(): () => void {
  if (uninstallFn) return uninstallFn
  if (typeof document === 'undefined') return () => {}

  const onOver = (e: Event) => {
    if ((e as PointerEvent).pointerType === 'touch') return
    const el = targetOf(e.target)
    if (el === current) return
    if (current) hide()
    if (el) show(el)
  }
  const onOut = (e: Event) => {
    if (!current) return
    const to = (e as PointerEvent).relatedTarget as Node | null
    if (to && current.contains(to)) return
    hide()
  }
  const onFocusIn = (e: Event) => {
    const el = targetOf(e.target)
    if (!el || el !== e.target) return
    if (current) hide()
    show(el)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') hide()
  }

  document.addEventListener('pointerover', onOver, true)
  document.addEventListener('pointerout', onOut, true)
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('focusout', hide, true)
  document.addEventListener('pointerdown', hide, true)
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('scroll', hide, true)
  window.addEventListener('blur', hide)

  uninstallFn = () => {
    hide()
    document.removeEventListener('pointerover', onOver, true)
    document.removeEventListener('pointerout', onOut, true)
    document.removeEventListener('focusin', onFocusIn, true)
    document.removeEventListener('focusout', hide, true)
    document.removeEventListener('pointerdown', hide, true)
    document.removeEventListener('keydown', onKey, true)
    window.removeEventListener('scroll', hide, true)
    window.removeEventListener('blur', hide)
    tipEl?.remove()
    tipEl = null
    uninstallFn = null
  }
  return uninstallFn
}
