// Where each tab was scrolled to (section 42).
//
// THE TIMING IS THE WHOLE PROBLEM. Restoring on mount restores against an empty
// page: the tab paints its toolbar, the month's rows are still in flight, the
// document is four hundred pixels tall, and `scrollTo(2400)` is silently
// clamped to the bottom of nothing. A frame later the rows land, the page grows
// to four thousand pixels, and the reader is at the top wondering why.
//
// So the offset is applied when the view says it is READY — the same
// `data-ready` flag the screenshot harness waits for, and for the same reason:
// it is the only signal that means the data is actually on the page. It is read
// with a MutationObserver rather than a timeout, because "how long does a month
// take to arrive" has no answer that is right on both a cached load and a cold
// one.
//
// Per tab, in `sessionStorage`, which is the correct lifetime: where you were
// on Finances is a fact about this browser tab in this sitting, not a
// preference to sync to another machine.

import { onUnmounted, watch, type Ref } from 'vue'
import { sessionRead, sessionWrite } from '@/composables/useTradeRoute'
import { shellScroller } from '@/components/shell/shellKeys'
import type { TabKey } from '@/types'

const KEY = 'astra:scroll'
/** Nothing is restored past this — a stale offset into a month with two rows. */
const READY_TIMEOUT_MS = 8_000

export const scrollKey = (tab: TabKey) => `${KEY}:${tab}`

export function readOffset(tab: TabKey): number {
  const raw = Number(sessionRead(scrollKey(tab)))
  return Number.isFinite(raw) && raw > 0 ? raw : 0
}

/**
 * `tab` is the tab on screen. Every change parks the outgoing tab's offset and
 * arms a restore for the incoming one.
 */
export function useScrollMemory(tab: Ref<TabKey>) {
  if (typeof window === 'undefined') return

  // WHAT SCROLLS CHANGED (section 44). The document used to be the scrollport;
  // in the shell it is the content region, because the strip and the bar must
  // stay where they are while the month goes past. So the offset is read and
  // written on whichever element is actually scrolling — the shell's content
  // area when there is a shell, the window when there is not (the share page,
  // the screenshot stage). Reading `window.scrollY` inside a shell would record
  // zero forever and restore to the top every time.
  const port = () => shellScroller.value
  const readTop = () => port()?.scrollTop ?? window.scrollY
  const scrollTo = (top: number) => {
    const el = port()
    if (el) el.scrollTo({ top, behavior: 'auto' })
    else window.scrollTo({ top, behavior: 'auto' })
  }
  // The scroll event does not bubble from an element to the window, so the
  // listener has to go on the element once it exists.
  let listening: HTMLElement | Window | null = null
  function listen() {
    const next: HTMLElement | Window = port() ?? window
    if (listening === next) return
    listening?.removeEventListener('scroll', remember)
    next.addEventListener('scroll', remember, { passive: true })
    listening = next
  }

  let frame = 0
  let observer: MutationObserver | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let current: TabKey | null = null

  function remember(): void {
    if (!current) return
    // rAF-coalesced: a scroll fires dozens of events per gesture and none of
    // them needs its own write to storage.
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (current) sessionWrite(scrollKey(current), String(Math.round(readTop())))
    })
  }

  function disarm(): void {
    observer?.disconnect()
    observer = null
    clearTimeout(timer)
  }

  /** True once something on the page says it has its data. */
  const isReady = () => !!document.querySelector('[data-ready="true"]')

  function restore(to: TabKey): void {
    disarm()
    const offset = readOffset(to)
    if (!offset) {
      // A tab never scrolled starts at the top, which is also what a reader
      // expects of a tab they have not been on.
      scrollTo(0)
      return
    }
    const apply = () => {
      disarm()
      scrollTo(offset)
    }
    if (isReady()) {
      // Ready already (a cached tab): still a frame late, so the rows are laid
      // out before the offset is measured against them.
      requestAnimationFrame(apply)
      return
    }
    observer = new MutationObserver(() => {
      if (isReady()) requestAnimationFrame(apply)
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-ready'],
    })
    // A tab that never becomes ready — an error state, a listener that failed —
    // gives up rather than restoring on a page that never filled.
    timer = setTimeout(disarm, READY_TIMEOUT_MS)
  }

  listen()
  // The shell's content element arrives a tick after this composable is set up
  // (the shell provides a ref and fills it on mount), so the listener follows it.
  watch(shellScroller, () => listen())

  watch(
    tab,
    (next, previous) => {
      if (previous && previous !== next) {
        // Park the outgoing tab at where it actually is, not at where the
        // throttled write last got to.
        sessionWrite(scrollKey(previous), String(Math.round(readTop())))
      }
      current = next
      restore(next)
    },
    { immediate: true },
  )

  onUnmounted(() => {
    listening?.removeEventListener('scroll', remember)
    listening = null
    if (frame) cancelAnimationFrame(frame)
    disarm()
  })
}
