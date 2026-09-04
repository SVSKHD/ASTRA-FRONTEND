// A figure that counts to its new value (section 28b).
//
// Only three numbers in the app use this — Balance, Secured and Total profit —
// and the reason is narrow: those three change as a *consequence* of something
// the reader just did, several rows away from where they did it. A balance that
// silently reads 31150 instead of 30150 has told nobody anything; one that runs
// up to it says "this is what your trade did" without a word of copy.
//
// It is deliberately not a general animation utility. It animates on CHANGE and
// never on mount — a screen that counts every figure up from zero on load is a
// dashboard performing rather than reporting — and it hands back the plain
// current value, so the caller formats it exactly as it formats a static one.

import { onUnmounted, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

/** Long enough to read as motion, short enough not to be waited on. */
export const COUNT_MS = 320

/** Fast then settling — the shape a number "arriving" has. */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return 1 - (1 - clamped) ** 3
}

/** The value at a point in the roll. Pure, so the curve is testable. */
export function countAt(from: number, to: number, progress: number): number {
  return from + (to - from) * easeOutCubic(progress)
}

export function prefersReducedMotion(): boolean {
  return globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function useCountUp(source: MaybeRefOrGetter<number>, ms = COUNT_MS): Ref<number> {
  const display = ref(toValue(source))
  let frame = 0

  function cancel() {
    if (frame) globalThis.cancelAnimationFrame?.(frame)
    frame = 0
  }

  watch(
    () => toValue(source),
    (next) => {
      cancel()
      // Reduced motion, or an environment with no frames to ask for (a test, a
      // server render): the number simply is what it is.
      if (prefersReducedMotion() || typeof globalThis.requestAnimationFrame !== 'function') {
        display.value = next
        return
      }
      const from = display.value
      const started = performance.now()
      const step = (now: number) => {
        const progress = Math.min(1, (now - started) / ms)
        display.value = countAt(from, next, progress)
        // The last frame is assigned exactly rather than eased to, so the
        // figure on screen is the figure, not 31149.9998.
        if (progress < 1) frame = globalThis.requestAnimationFrame(step)
        else {
          display.value = next
          frame = 0
        }
      }
      frame = globalThis.requestAnimationFrame(step)
    },
  )

  onUnmounted(cancel)
  return display
}
