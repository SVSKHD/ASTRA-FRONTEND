// The admin approval inbox (Prompt 11): every PENDING_RISK paper intent across
// all accounts, and the count the Paper tab shows on its label. One reactive
// copy shared by the tab bar and the Paper page, so they never disagree.
//
// Refreshed by `useLiveRefresh`: when the live stream reports a new risk
// decision or signal, and every 15 s while the tab is visible as a backstop for
// a stream that is down.

import { onScopeDispose, reactive, watch } from 'vue'
import { aureon } from '@/api/client'
import { live } from '@/trading/stream'
import { isAdmin } from '@/trading/session'
import { must } from '@/trading/useLoad'
import type { Intent } from '@/trading/paper'

export const REFRESH_MS = 15_000

export const inbox = reactive({
  items: [] as Intent[],
  loading: false,
  error: '',
})

export async function loadInbox(): Promise<void> {
  if (!isAdmin()) {
    inbox.items = []
    return
  }
  inbox.loading = true
  try {
    inbox.items = must(
      await aureon.GET('/api/trading/order-intents', {
        params: { query: { status: 'PENDING_RISK', limit: 200 } },
      }),
    ).items
    inbox.error = ''
  } catch (e) {
    inbox.error = (e as Error).message
  } finally {
    inbox.loading = false
  }
}

/**
 * Call `refresh` when the stream reports a new risk decision or signal, and on a
 * 15 s timer while the page is visible. Stops with the calling scope.
 */
export function useLiveRefresh(refresh: () => void, everyMs = REFRESH_MS): void {
  const newest = () => `${live.risks[0]?.id ?? ''}|${live.signals[0]?.id ?? ''}`
  const stop = watch(newest, (now, before) => {
    if (now !== before) refresh()
  })
  const timer = setInterval(() => {
    if (globalThis.document?.visibilityState !== 'hidden') refresh()
  }, everyMs)
  onScopeDispose(() => {
    stop()
    clearInterval(timer)
  })
}
