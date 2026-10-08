// Progress cards: work in flight, reported in the bottom-right corner, above the alert tray.
//
// This replaced the two-pixel bar across the top of the viewport. A bar could
// only say "something is happening"; a card says what, how far it has got, and
// that it finished — and several at once stack as a cascade instead of all
// meaning the same line.
//
// Anything can report into it, with no component in hand (the store's bulk
// delete does):
//
//   const job = startProgress({ id: 'bulk-delete', title: 'Deleting todos', total: 40 })
//   job.update({ done: 12, detail: '12 of 40' })
//   job.finish('Deleted 40 todos')      // or job.fail('…')
//
// THE TIMING CONTRACT is the save ring's and the old bar's: a card appears only
// once its work has run for SHOW_DELAY_MS — so a job that is over in a blink
// never flashes on screen — and once shown it stays at least MIN_VISIBLE_MS.
// A finished card holds its tick for DONE_HOLD_MS, then joins the dismissal
// queue, which lets cards go ONE AT A TIME (DISMISS_GAP_MS apart), so a burst
// of jobs finishing together leaves as a sequence rather than a blink. A failed
// card stays until it is closed.
import { reactive } from 'vue'

export const SHOW_DELAY_MS = 200
export const MIN_VISIBLE_MS = 400
export const DONE_HOLD_MS = 1400
export const DISMISS_GAP_MS = 320

export type ProgressState = 'running' | 'done' | 'failed'

export interface ProgressJob {
  id: string
  title: string
  detail: string
  /** Units finished, with `total`; both null for work with no measure. */
  done: number | null
  total: number | null
  state: ProgressState
  /** Past its show delay: drawn as a card. */
  visible: boolean
  startedAt: number
  shownAt: number
}

export interface ProgressHandle {
  readonly id: string
  update(patch: { done?: number; total?: number; detail?: string; title?: string }): void
  finish(detail?: string): void
  fail(detail?: string): void
}

export const progressJobs = reactive<ProgressJob[]>([])

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const dismissQueue: string[] = []
let dismissing = false
let seq = 0

function find(id: string): ProgressJob | undefined {
  return progressJobs.find((j) => j.id === id)
}
function clearTimer(id: string) {
  clearTimeout(timers.get(id))
  timers.delete(id)
}
function removeNow(id: string) {
  clearTimer(id)
  const i = progressJobs.findIndex((j) => j.id === id)
  if (i !== -1) progressJobs.splice(i, 1)
}

// One card leaves, then the next after a beat, until the queue is empty.
function pumpDismissals() {
  if (dismissing) return
  const next = dismissQueue.shift()
  if (next == null) return
  dismissing = true
  // Revived since it was queued (the same id started again): skip it.
  if (find(next)?.state === 'done') removeNow(next)
  setTimeout(() => {
    dismissing = false
    pumpDismissals()
  }, DISMISS_GAP_MS)
}
function queueDismiss(id: string) {
  if (!dismissQueue.includes(id)) dismissQueue.push(id)
  pumpDismissals()
}

function settle(id: string, state: 'done' | 'failed', detail?: string) {
  const job = find(id)
  if (!job || job.state !== 'running') return
  clearTimer(id)
  // Never seen: it was quick, so there is nothing to report and nothing to take
  // down. A failure is still worth a card.
  if (!job.visible && state === 'done') return removeNow(id)
  const apply = () => {
    const j = find(id)
    if (!j) return
    j.state = state
    j.visible = true
    if (detail != null) j.detail = detail
    if (state === 'done') {
      if (j.total != null) j.done = j.total
      timers.set(
        id,
        setTimeout(() => queueDismiss(id), DONE_HOLD_MS),
      )
    }
  }
  const owed = job.visible ? MIN_VISIBLE_MS - (Date.now() - job.shownAt) : 0
  if (owed > 0) timers.set(id, setTimeout(apply, owed))
  else apply()
}

// A card is drawn only once its work has outlasted the show delay.
function scheduleShow(id: string) {
  timers.set(
    id,
    setTimeout(() => {
      const j = find(id)
      if (!j || j.state !== 'running') return
      j.visible = true
      j.shownAt = Date.now()
      timers.delete(id)
    }, SHOW_DELAY_MS),
  )
}

export function startProgress(opts: {
  id?: string
  title: string
  detail?: string
  total?: number | null
  done?: number | null
}): ProgressHandle {
  const id = opts.id ?? 'job-' + ++seq
  const existing = find(id)
  if (existing) {
    // The same work starting again (another sync): pick the card back up.
    clearTimer(id)
    const q = dismissQueue.indexOf(id)
    if (q !== -1) dismissQueue.splice(q, 1)
    existing.title = opts.title
    existing.detail = opts.detail ?? ''
    existing.total = opts.total ?? null
    existing.done = opts.done ?? (opts.total != null ? 0 : null)
    existing.state = 'running'
    if (!existing.visible) scheduleShow(id)
  } else {
    progressJobs.push({
      id,
      title: opts.title,
      detail: opts.detail ?? '',
      total: opts.total ?? null,
      done: opts.done ?? (opts.total != null ? 0 : null),
      state: 'running',
      visible: false,
      startedAt: Date.now(),
      shownAt: 0,
    })
    scheduleShow(id)
  }
  return {
    id,
    update(patch) {
      const j = find(id)
      if (!j) return
      if (patch.title != null) j.title = patch.title
      if (patch.detail != null) j.detail = patch.detail
      if (patch.total != null) j.total = patch.total
      if (patch.done != null) j.done = patch.done
    },
    finish: (detail) => settle(id, 'done', detail),
    fail: (detail) => settle(id, 'failed', detail),
  }
}

/** The card's close button: take it down now, whatever its state. */
export function dismissProgress(id: string): void {
  const q = dismissQueue.indexOf(id)
  if (q !== -1) dismissQueue.splice(q, 1)
  removeNow(id)
}

/** For tests: forget every job and timer. */
export function resetProgress(): void {
  for (const id of [...timers.keys()]) clearTimer(id)
  dismissQueue.length = 0
  dismissing = false
  progressJobs.splice(0)
}
