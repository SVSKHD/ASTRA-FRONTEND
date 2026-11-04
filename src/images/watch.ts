// The image job being watched, app-wide (GET /api/images/jobs/{id}).
//
// It used to live inside the image page, so leaving the page stopped the
// watch and nobody heard that the image was done. Now one watcher runs for the
// whole app: the page shows it, and when the job ends — wherever you are — an
// in-app notice appears and, if you turned it on, a browser notification.
//
// The job id is remembered per browser, so a reload picks the watch up again.

import { reactive } from 'vue'
import { aureon } from '@/api/client'
import { must } from '@/control/api'
import { isTerminal, pollMs, type ImageJob } from '@/control/images'

const JOB_KEY = 'cc.images.job'
const NOTIFY_KEY = 'images.notify'

export const imageWatch = reactive({
  job: null as ImageJob | null,
  error: '',
  /** The job that just ended while watched, until dismissed. */
  finished: null as ImageJob | null,
})

type Listener = (job: ImageJob) => void
const listeners = new Set<Listener>()
/** Called once per watched job that ends (done, failed or cancelled). */
export function onImageFinished(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(JOB_KEY, id)
    else localStorage.removeItem(JOB_KEY)
  } catch {
    /* private window: the watch lasts for this visit */
  }
}
function remembered(): string | null {
  try {
    return localStorage.getItem(JOB_KEY)
  } catch {
    return null
  }
}

let timer: ReturnType<typeof setTimeout> | undefined

function schedule() {
  clearTimeout(timer)
  const j = imageWatch.job
  if (!j || isTerminal(j)) return
  timer = setTimeout(() => void readImageJob(), pollMs(j))
}

/** Start watching a job the server just answered with. */
export function watchImageJob(j: ImageJob): void {
  imageWatch.job = j
  imageWatch.error = ''
  remember(isTerminal(j) ? null : j.id)
  schedule()
}

function finish(j: ImageJob) {
  remember(null)
  imageWatch.finished = j
  void notifyBrowser(j)
  for (const fn of listeners) {
    try {
      fn(j)
    } catch {
      /* a listener's failure is its own */
    }
  }
}

export async function readImageJob(id = imageWatch.job?.id): Promise<void> {
  if (!id) return
  // Hidden tab: do not read, just look again later.
  if (globalThis.document?.visibilityState === 'hidden') return schedule()
  const was = imageWatch.job
  try {
    const r = await aureon.GET('/api/images/jobs/{job_id}', { params: { path: { job_id: id } } })
    if (r.response.status === 404 || r.response.status === 401) {
      // Gone, or not ours to see any more (signed out): stop watching.
      imageWatch.job = null
      remember(null)
      return
    }
    const next = must(r)
    imageWatch.job = next
    imageWatch.error = ''
    if (isTerminal(next)) {
      // Only a job seen running/queued by this watch "finishes"; one that was
      // already over when resumed is just shown.
      if (was && was.id === next.id && !isTerminal(was)) finish(next)
      else remember(null)
      return
    }
  } catch (e) {
    // Keep watching: a dropped read is not a failed job.
    imageWatch.error = `Could not read the job: ${(e as Error).message}. Retrying…`
  }
  schedule()
}

/** Pick up the job this browser was watching (on app start, on the page). */
export function resumeImageJob(): void {
  const saved = remembered()
  if (!saved || imageWatch.job?.id === saved) return
  // Seed as queued so its end counts as finishing under this watch.
  imageWatch.job = { id: saved, status: 'queued' } as ImageJob
  void readImageJob(saved)
}

function onVisible() {
  const j = imageWatch.job
  if (globalThis.document?.visibilityState !== 'hidden' && j && !isTerminal(j)) {
    clearTimeout(timer)
    void readImageJob()
  }
}
globalThis.document?.addEventListener('visibilitychange', onVisible)

/** Tests only. */
export function resetImageWatch(): void {
  clearTimeout(timer)
  imageWatch.job = null
  imageWatch.error = ''
  imageWatch.finished = null
  listeners.clear()
}

// ---- browser notifications --------------------------------------------------

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}
export function browserNotifyOn(): boolean {
  try {
    return (
      notificationsSupported() &&
      Notification.permission === 'granted' &&
      localStorage.getItem(NOTIFY_KEY) === '1'
    )
  } catch {
    return false
  }
}
/** Ask (from a tap) and remember the choice. Resolves to whether it is on. */
export async function setBrowserNotify(on: boolean): Promise<boolean> {
  try {
    if (!on) {
      localStorage.removeItem(NOTIFY_KEY)
      return false
    }
    if (!notificationsSupported()) return false
    const p =
      Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission
    if (p !== 'granted') return false
    localStorage.setItem(NOTIFY_KEY, '1')
    return true
  } catch {
    return false
  }
}

export function finishText(j: ImageJob): string {
  if (j.status === 'done') return 'Your image is ready.'
  if (j.status === 'failed') return `Image failed${j.error ? `: ${j.error}` : '.'}`
  return 'Image job cancelled.'
}

async function notifyBrowser(j: ImageJob) {
  if (!browserNotifyOn()) return
  const title = finishText(j)
  const options = { body: j.prompt, tag: `image-${j.id}` }
  try {
    // iOS (installed app) and Android only show notifications from the service worker.
    const reg = await navigator.serviceWorker?.getRegistration?.()
    if (reg) {
      await reg.showNotification(title, options)
      return
    }
    new Notification(title, options)
  } catch {
    /* the in-app notice still shows */
  }
}
