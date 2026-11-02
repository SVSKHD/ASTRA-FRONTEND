// Visibility-aware polling: `fn` runs every `ms` while the page is visible,
// once more as soon as it becomes visible again, and never while hidden. Used
// wherever the backend has no stream for the data (D-21-4).

import { onScopeDispose, ref } from 'vue'

export function usePoll(fn: () => void | Promise<void>, ms: number): void {
  const visible = () => globalThis.document?.visibilityState !== 'hidden'
  const timer = setInterval(() => {
    if (visible()) void fn()
  }, ms)
  const onVis = () => {
    if (visible()) void fn()
  }
  globalThis.document?.addEventListener('visibilitychange', onVis)
  onScopeDispose(() => {
    clearInterval(timer)
    globalThis.document?.removeEventListener('visibilitychange', onVis)
  })
}

/** A clock that ticks every `ms`, for countdowns and "x s ago". */
export function useNow(ms = 1000) {
  const now = ref(Date.now())
  const timer = setInterval(() => (now.value = Date.now()), ms)
  onScopeDispose(() => clearInterval(timer))
  return now
}

/** "4 min 12 s", "38 s", or "expired". */
export function countdown(iso: string, now: number): string {
  const s = Math.round((new Date(iso).getTime() - now) / 1000)
  if (!Number.isFinite(s)) return '—'
  if (s <= 0) return 'expired'
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${s % 60} s`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}
