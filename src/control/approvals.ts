// The approval inbox: one shared, reactive copy of the pending requests, read
// by the nav badge and by the Inbox module so the two never disagree.
//
// Two backends (D-21-8):
// • the approval engine (backend Phase 20): GET /api/v1/approvals/inbox (what
//   THIS admin can act on, with the re-auth mode), kept live by the SSE stream
//   /api/v1/approvals/stream. Any `approval` event re-reads the inbox.
// • an older server: GET /api/v1/approvals?status=pending, polled.
// The 15 s visibility-aware poll runs in both modes as the backstop.

import { reactive } from 'vue'
import { aureon } from '@/api/client'
import { apiUrl } from '@/api/config'
import { openStream, type StreamHandle, type StreamStatus } from '@/api/sse'
import { must, type Schemas } from '@/control/api'

/** An inbox item; `reauth` is absent when the list came from an older server. */
// Named with its module since the AI approvals (/api/ai/approvals) added a second ApprovalOut.
export type Approval = Schemas['app__schemas__approvals__ApprovalOut'] & { reauth?: string }
export const POLL_MS = 15_000
export const STREAM_EVENTS = ['hello', 'approval', 'bye']

export const approvals = reactive({
  items: [] as Approval[],
  mode: 'unknown' as 'unknown' | 'engine' | 'legacy',
  stream: 'closed' as StreamStatus,
  /** When this session's re-auth stamp lapses (engine only). */
  stampExpiresAt: null as string | null,
  loading: false,
  loaded: false,
  error: '',
})

let handle: StreamHandle | null = null
let timer: ReturnType<typeof setInterval> | null = null

export async function loadApprovals(): Promise<void> {
  approvals.loading = true
  try {
    if (approvals.mode !== 'legacy') {
      const r = await aureon.GET('/api/v1/approvals/inbox')
      if (r.response.status === 404) approvals.mode = 'legacy'
      else {
        const inbox = must(r)
        approvals.mode = 'engine'
        approvals.items = inbox.items
        approvals.stampExpiresAt = inbox.reauth_stamp_expires_at ?? null
      }
    }
    if (approvals.mode === 'legacy') {
      approvals.items = must(
        await aureon.GET('/api/v1/approvals', {
          params: { query: { status: 'pending', limit: 200 } },
        }),
      ).items
    }
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
        if (e.event === 'approval') void loadApprovals()
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
  approvals.stampExpiresAt = null
  approvals.loaded = false
  approvals.error = ''
}
