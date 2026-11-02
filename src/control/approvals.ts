// The approval inbox: one shared, reactive copy of the pending requests, read
// by the nav badge and by the Inbox module so the two never disagree.
//
// Two backends (D-21-3):
// • the approval engine (backend Phase 20): GET /api/v1/approvals/inbox, kept
//   live by the SSE stream /api/v1/approvals/stream. Any event reloads the list.
// • before Phase 20: GET /api/v1/approvals?status=pending, polled every 15 s
//   while the page is visible.
// Which one is decided by probing the inbox endpoint once: a 404 means legacy.

import { reactive } from 'vue'
import { aureon } from '@/api/client'
import { apiUrl } from '@/api/config'
import { openStream, type StreamHandle, type StreamStatus } from '@/api/sse'
import { must, rawGet, type Schemas } from '@/control/api'

export type Approval = Schemas['ApprovalOut']
export const POLL_MS = 15_000
export const STREAM_EVENTS = [
  'hello',
  'approval',
  'approval.requested',
  'approval.decided',
  'approval.updated',
  'approval.expired',
]

export const approvals = reactive({
  items: [] as Approval[],
  mode: 'unknown' as 'unknown' | 'engine' | 'legacy',
  stream: 'closed' as StreamStatus,
  loading: false,
  loaded: false,
  error: '',
})

let handle: StreamHandle | null = null
let timer: ReturnType<typeof setInterval> | null = null

function itemsOf(body: unknown): Approval[] {
  if (Array.isArray(body)) return body as Approval[]
  const items = (body as { items?: unknown } | null)?.items
  return Array.isArray(items) ? (items as Approval[]) : []
}

async function detect(): Promise<void> {
  if (approvals.mode !== 'unknown') return
  try {
    await rawGet('/api/v1/approvals/inbox', { limit: 1 })
    approvals.mode = 'engine'
  } catch {
    approvals.mode = 'legacy'
  }
}

export async function loadApprovals(): Promise<void> {
  approvals.loading = true
  try {
    await detect()
    approvals.items =
      approvals.mode === 'engine'
        ? itemsOf(await rawGet('/api/v1/approvals/inbox', { limit: 200 }))
        : must(
            await aureon.GET('/api/v1/approvals', {
              params: { query: { status: 'pending', limit: 200 } },
            }),
          ).items
    approvals.error = ''
  } catch (e) {
    approvals.error = (e as Error).message
  } finally {
    approvals.loading = false
    approvals.loaded = true
  }
}

/** Load, then keep the list live: the stream when the engine has one, else polling. */
export async function startApprovals(seam: { EventSourceImpl?: typeof EventSource } = {}) {
  await loadApprovals()
  if (approvals.mode === 'engine' && !handle) {
    handle = openStream(apiUrl('/api/v1/approvals/stream'), {
      events: STREAM_EVENTS,
      onEvent: (e) => {
        if (e.event !== 'hello') void loadApprovals()
      },
      onStatus: (s) => (approvals.stream = s),
      ...seam,
    })
  }
  if (!timer) {
    // The backstop runs in both modes; with a stream it only catches expiries.
    timer = setInterval(() => {
      if (globalThis.document?.visibilityState !== 'hidden') void loadApprovals()
    }, POLL_MS)
  }
}

export function stopApprovals(): void {
  handle?.close()
  handle = null
  if (timer) clearInterval(timer)
  timer = null
}

/** Test seam: forget the probe and the list. */
export function resetApprovals(): void {
  stopApprovals()
  approvals.items = []
  approvals.mode = 'unknown'
  approvals.loaded = false
  approvals.error = ''
}
