// A single shared 1-second clock behind every live reminder countdown — the Up
// next band, the Overview tile and the row bell chips all read the same ref, so
// fire-time checks run on ONE interval rather than per card (as the spec
// requires). Module-scoped and refcounted: the interval starts when the first
// consumer mounts and stops when the last unmounts, and it pauses while the tab
// is hidden so a backgrounded app isn't ticking every second for nothing.

import { onScopeDispose, ref } from 'vue'

const nowMs = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
let consumers = 0
let visibilityBound = false

function tick() {
  nowMs.value = Date.now()
}

function onVisibility() {
  if (document.visibilityState === 'visible') {
    tick() // catch up immediately on resume rather than waiting a second
    ensureRunning()
  } else {
    stop()
  }
}

function ensureRunning() {
  if (timer != null) return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  timer = setInterval(tick, 1000)
}

function stop() {
  if (timer != null) {
    clearInterval(timer)
    timer = undefined
  }
}

function start() {
  consumers++
  if (consumers === 1) {
    tick()
    ensureRunning()
    if (typeof document !== 'undefined' && !visibilityBound) {
      document.addEventListener('visibilitychange', onVisibility)
      visibilityBound = true
    }
  }
}

function release() {
  consumers = Math.max(0, consumers - 1)
  if (consumers === 0) {
    stop()
    if (typeof document !== 'undefined' && visibilityBound) {
      document.removeEventListener('visibilitychange', onVisibility)
      visibilityBound = false
    }
  }
}

// Subscribe the calling component/composable scope to the shared clock. Returns
// the reactive millisecond ref; automatically released when the scope disposes.
export function useReminderClock() {
  start()
  onScopeDispose(release)
  return { nowMs }
}
