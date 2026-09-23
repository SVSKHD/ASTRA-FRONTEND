// Room for a floating detail pane (SlideOver with `size="half"`).
//
// The pane is deliberately NOT part of the tab it belongs to: it is fixed to
// the window, so the tab's own layout — a card grid, a tree, a toolbar — never
// has a column cut out of it and never has to know the pane exists. The cost of
// that is the one thing this file buys back: a pane floating over the right
// half of the window covers the right half of the tab, including the toolbar's
// New and Import buttons, and a button you cannot reach is worse than a column.
//
// So the tab yields the width instead of losing it. While the pane is open the
// view gets a padding equal to the part of itself the pane actually covers, and
// the transition on it is what makes the two read as one movement: the list
// narrows into a column as the pane slides in beside it.
//
// The overlap is measured rather than assumed, because the tab is not the
// window. It sits inside the shell's stage, inset from the edge by a margin
// that changes with the breakpoint, so "half the window" and "half the tab" are
// different numbers and only one of them is the pane's.
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

/** What the drawer leaves between itself and the window's right edge. */
const DRAWER_GAP_PX = 12
/** Below this the drawer goes full width and the tab is covered anyway. */
const MIN_SPLIT_PX = 720

/**
 * @param open   whether the pane is showing.
 * @param width  the pane's current width in px, as SlideOver reports it. The
 *               pane's own width is the only honest input here: it changes with
 *               the mode, with a drag on the grip and with the window, and a
 *               room-making rule that assumed any one of those would be wrong
 *               after the other two.
 */
export function usePaneInset(open: Ref<boolean>, width: Ref<number>) {
  // The view's root element, so the measurement is of the tab itself.
  const host = ref<HTMLElement | null>(null)
  const inset = ref(0)

  function measure(): void {
    const el = host.value
    if (!el || !open.value || typeof window === 'undefined') {
      inset.value = 0
      return
    }
    if (window.innerWidth < MIN_SPLIT_PX) {
      inset.value = 0
      return
    }
    // Padding does not move the border box, so this reading is stable whatever
    // the current inset is — no feedback loop between the two.
    const rect = el.getBoundingClientRect()
    const covered = width.value + DRAWER_GAP_PX
    const clear = window.innerWidth - rect.right
    inset.value = Math.max(0, Math.round(covered - clear))
  }

  let observer: ResizeObserver | undefined
  onMounted(() => {
    measure()
    window.addEventListener('resize', measure)
    if (typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver(() => measure())
    if (host.value) observer.observe(host.value)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', measure)
    observer?.disconnect()
  })
  watch([open, width], () => measure(), { flush: 'post' })

  // Named the same way the drawer's own motion is, so the pane and the space it
  // is given arrive together rather than one chasing the other.
  const style = ref<Record<string, string>>({})
  watch(
    inset,
    (value) => {
      style.value = {
        paddingRight: `${value}px`,
        transition: 'padding-right var(--dur-med) var(--ease-out)',
      }
    },
    { immediate: true },
  )

  return { host, inset, style, measure }
}
