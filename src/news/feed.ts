// Aureon's news, read once for the whole app (GET /api/public/forex).
//
// The News tab and every widget (MT5, Dhan, "news for my positions") share
// this one copy and one timer, started by the first view that needs it and
// stopped when the last one goes. The server has no news stream, so this polls
// — every two minutes while the page is visible, and at once when it becomes
// visible again. The job behind it pulls the feeds every 30 min by default.
//
// New items do not jump into a list somebody is reading: they wait in
// `pending` until "N new" is tapped (the tab) — widgets show them straight away.

import { onScopeDispose, reactive } from 'vue'
import { aureon } from '@/api/client'
import type { NewsItem } from '@/types'

export const NEWS_POLL_MS = 2 * 60_000
/** The scheduler job that pulls the feeds (backend app/workers/scheduler.py). */
export const NEWS_JOB = 'news-pull'
const LIMIT = 200

export const newsFeed = reactive({
  items: [] as NewsItem[],
  pending: [] as NewsItem[],
  loading: false,
  loaded: false,
  error: '',
  /** When the feed was last read successfully, ms. */
  readAt: 0,
})

/** Everything known, newest first: shown + waiting. For widgets. */
export function allNews(): NewsItem[] {
  return newsFeed.pending.length ? [...newsFeed.pending, ...newsFeed.items] : newsFeed.items
}

/** Merge a fresh read: first read shows all; after that, unseen ids wait in `pending`. */
export function mergeNews(fresh: NewsItem[]): void {
  if (!newsFeed.loaded) {
    newsFeed.items = fresh
    newsFeed.pending = []
    newsFeed.loaded = true
    return
  }
  const seen = new Set([...newsFeed.items, ...newsFeed.pending].map((i) => i.id))
  const added = fresh.filter((i) => !seen.has(i.id))
  if (added.length) newsFeed.pending = [...added, ...newsFeed.pending]
}

export function revealNews(): void {
  if (!newsFeed.pending.length) return
  newsFeed.items = [...newsFeed.pending, ...newsFeed.items].sort(
    (a, b) => b.publishedAt - a.publishedAt,
  )
  newsFeed.pending = []
}

/** One item of Aureon's public forex feed: `{title, link, published, source}`. */
export function readAureonNews(id: string, data: Record<string, unknown>): NewsItem {
  const published = Date.parse(String(data.published ?? ''))
  return {
    id,
    title: String(data.title ?? ''),
    link: String(data.link ?? ''),
    source: String(data.source ?? ''),
    // The Aureon job pulls forex feeds only; it does not tag.
    category: 'forex',
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    publishedAt: Number.isFinite(published) ? published : 0,
    fetchedAt: 0,
  }
}

let inflight: Promise<void> | null = null
export function loadNews(): Promise<void> {
  if (inflight) return inflight
  newsFeed.loading = true
  inflight = (async () => {
    try {
      const { data, response } = await aureon.GET('/api/public/forex', {
        params: { query: { limit: LIMIT } },
      })
      if (!data) {
        throw new Error(
          response.status === 429
            ? 'Too many reads; trying again shortly.'
            : `HTTP ${response.status}`,
        )
      }
      mergeNews(data.map((d) => readAureonNews(d.doc_id, d.data)))
      newsFeed.error = ''
      newsFeed.readAt = Date.now()
    } catch (err) {
      newsFeed.error = `The news feed is unreachable (${(err as Error).message}). It is read again in two minutes.`
    } finally {
      newsFeed.loading = false
      inflight = null
    }
  })()
  return inflight
}

let users = 0
let timer: ReturnType<typeof setInterval> | null = null
function onVisible() {
  if (globalThis.document?.visibilityState === 'visible') void loadNews()
}

/** Keep the feed fresh while the calling component (or scope) is alive. */
export function useNewsFeed() {
  users++
  if (users === 1) {
    void loadNews()
    timer = setInterval(() => {
      if (globalThis.document?.visibilityState !== 'hidden') void loadNews()
    }, NEWS_POLL_MS)
    globalThis.document?.addEventListener('visibilitychange', onVisible)
  }
  onScopeDispose(() => {
    users--
    if (users === 0) {
      if (timer) clearInterval(timer)
      timer = null
      globalThis.document?.removeEventListener('visibilitychange', onVisible)
    }
  })
  return newsFeed
}

/** Tests only: forget everything. */
export function resetNewsFeed(): void {
  newsFeed.items = []
  newsFeed.pending = []
  newsFeed.loading = false
  newsFeed.loaded = false
  newsFeed.error = ''
  newsFeed.readAt = 0
}
