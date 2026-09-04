// The three states a save has, and the timing that makes them readable
// (sections 41–42).
//
// The problem this solves is not "show a spinner". It is that a save which
// finishes in 80ms and a save which finishes in 3 seconds are the same event to
// the code and completely different events to the person watching, and the
// naive rendering — bind a spinner to `busy` — is wrong for both. Fast, and it
// flashes something nobody can read and half the readers see as a glitch. Slow,
// and it appears instantly, which is right, but then vanishes on completion
// with nothing said about whether the thing was saved.
//
// So there are three rules, and each of them has a number because a number is
// the only way to be right about this:
//
//   • RING_DELAY_MS — nothing is shown for the first 150ms. Under that, a save
//     is instantaneous as far as anybody is concerned, and a loader is a
//     distraction about work that is already done.
//   • MIN_VISIBLE_MS — once shown, it stays 400ms. A ring that appears at 150ms
//     and leaves at 190ms is a flicker, and a flicker reads as a fault.
//   • CHECK_HOLD_MS — success is held 600ms before returning to idle. The
//     confirmation IS the feedback; a check that appears and leaves in one frame
//     confirms nothing.
//
// Failure has no timer at all. It stays until it is acknowledged, because the
// one state that must not disappear on its own is the one that means the thing
// you asked for did not happen.

import { onUnmounted, readonly, ref } from 'vue'

export type SaveState = 'idle' | 'working' | 'done' | 'failed'

export const RING_DELAY_MS = 150
export const MIN_VISIBLE_MS = 400
export const CHECK_HOLD_MS = 600

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function useSaveState() {
  const state = ref<SaveState>('idle')
  const timers = new Set<ReturnType<typeof setTimeout>>()

  function later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }

  function clearAll() {
    for (const id of timers) clearTimeout(id)
    timers.clear()
  }

  /** Dismiss a failure. Nothing else is dismissible; nothing else lingers. */
  function acknowledge() {
    if (state.value === 'failed') state.value = 'idle'
  }

  /**
   * Run the save and drive the three states around it.
   *
   * The task's OWN resolution is the success signal, whatever that means to the
   * caller — for a trade it is the local capture, not a server acknowledgement.
   * This composable does not know or care which; it only knows that resolving
   * is a check and throwing is the error glyph.
   */
  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    clearAll()
    state.value = 'idle'
    let shownAt = 0
    const reveal = later(() => {
      shownAt = Date.now()
      state.value = 'working'
    }, RING_DELAY_MS)

    let result: T | undefined
    let failed = false
    try {
      result = await task()
    } catch (error) {
      failed = true
      console.error('[Astra] Save failed:', error)
    }

    clearTimeout(reveal)
    timers.delete(reveal)
    // The floor, and only if the ring was actually shown. A save that beat the
    // 150ms never owes anybody 400ms of anything.
    if (shownAt) {
      const owed = MIN_VISIBLE_MS - (Date.now() - shownAt)
      if (owed > 0) await wait(owed)
    }

    if (failed) {
      state.value = 'failed'
      return undefined
    }
    state.value = 'done'
    later(() => {
      if (state.value === 'done') state.value = 'idle'
    }, CHECK_HOLD_MS)
    return result
  }

  onUnmounted(clearAll)

  return { state: readonly(state), run, acknowledge }
}
