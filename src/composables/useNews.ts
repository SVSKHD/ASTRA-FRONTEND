// The news, read from Firestore (section 39).
//
// The app never fetches a feed. It cannot: publishers do not send CORS headers,
// so every one of those URLs is a browser error from a page and no client code
// fixes it. A scheduled function reads them and writes here; this reads what it
// wrote, over a snapshot, so an item that lands between two runs appears without
// a refresh.
//
// It is also the one collection in this app with NO owner field. `forex` is
// shared by the rules — every signed-in user reads it, only an admin writes it —
// and the news is not anybody's data: one copy serves every account, the demo
// included. That is why there is no uid in the query.

import { computed, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { DocumentData, Unsubscribe } from 'firebase/firestore'
import { loadFirestore } from '@/firebase'
import type { NewsCategory, NewsItem } from '@/types'

export const NEWS_COLLECTION = 'forex'
/** The pipeline's own diagnosis lives here; it is not a headline. */
export const HEALTH_DOC = '_health'
/** A reading list, not an archive. Older items exist; nobody scrolls to them. */
const PAGE = 60

function millis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis(): number }).toMillis()
  }
  return typeof value === 'number' ? value : 0
}

export function readNews(id: string, data: DocumentData): NewsItem {
  return {
    id,
    title: String(data.title ?? ''),
    link: String(data.link ?? ''),
    source: String(data.source ?? ''),
    category: (data.category as NewsCategory) ?? 'code',
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    publishedAt: millis(data.publishedAt),
    fetchedAt: millis(data.fetchedAt),
  }
}

export function useNews(categories: MaybeRefOrGetter<NewsCategory[]>) {
  const wanted = computed(() => {
    const list = toValue(categories)
    return list.length ? list : (['forex', 'ai', 'code'] as NewsCategory[])
  })

  const items = ref<NewsItem[]>([])
  const loading = ref(true)
  const error = ref('')
  let unsub: Unsubscribe | null = null
  let token = 0

  function detach(): void {
    unsub?.()
    unsub = null
  }

  async function attach(): Promise<void> {
    detach()
    const mine = ++token
    const cats = wanted.value
    loading.value = true
    const cloud = await loadFirestore()
    if (!cloud || mine !== token) {
      if (!cloud) {
        error.value = 'The news feed is unreachable.'
        loading.value = false
      }
      return
    }
    const { db, fs } = cloud
    unsub = fs.onSnapshot(
      // An `in` on the category with a descending time order: one query for one
      // to three categories, served by the (category, publishedAt) index. The
      // health document carries no category, so it cannot match — which is why
      // it needs no exclusion here.
      fs.query(
        fs.collection(db, NEWS_COLLECTION),
        fs.where('category', 'in', cats),
        fs.orderBy('publishedAt', 'desc'),
        fs.limit(PAGE),
      ),
      (snap) => {
        if (mine !== token) return
        items.value = snap.docs.map((d) => readNews(d.id, d.data()))
        loading.value = false
      },
      (err) => {
        console.error('[Astra] News listener failed:', err)
        error.value = 'Live news stopped. Reload to reconnect.'
        loading.value = false
      },
    )
  }

  watch(wanted, () => void attach(), { immediate: true })
  onUnmounted(detach)

  return { items, loading, error }
}

/**
 * The day's forex headlines that mention something this desk trades.
 *
 * Filtered here rather than queried, because the Trades tab already holds the
 * month's news for its own strip and a second query for one day's subset would
 * be a second listener on the same rows.
 *
 * A word on what this is NOT: RSS publishes when something is WRITTEN. A Fed
 * release appears after the decision, not before it. Nothing here is a schedule,
 * and the strip that renders it says so.
 */
export function forexFor(items: NewsItem[], ymd: string, tags: string[] = []): NewsItem[] {
  if (!ymd) return []
  const from = Date.parse(`${ymd}T00:00:00Z`) - 330 * 60_000
  const to = from + 86_400_000
  return items.filter(
    (item) =>
      item.category === 'forex' &&
      item.publishedAt >= from &&
      item.publishedAt < to &&
      (tags.length === 0 || item.tags.some((t) => tags.includes(t))),
  )
}
