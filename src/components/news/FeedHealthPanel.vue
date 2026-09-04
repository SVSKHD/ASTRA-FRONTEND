<script setup lang="ts">
// Which sources are actually alive (section 39).
//
// A feed that dies fails silently: the category simply has fewer items in it,
// and nothing anywhere says which publisher stopped answering. So the pull
// records what each feed returned — status, item count, error — and this reads
// it back.
//
// It is the answer to "which feeds returned 200 and how many items each
// produced" as a live panel rather than as a number somebody wrote down once,
// which matters because the answer changes without anybody touching the code.
import { onUnmounted, ref } from 'vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { loadFirestore } from '@/firebase'
import { HEALTH_DOC, NEWS_COLLECTION } from '@/composables/useNews'
import { countOf } from '@/utils/format'
import type { Unsubscribe } from 'firebase/firestore'
import type { FeedHealth } from '@/types'

const feeds = ref<FeedHealth[]>([])
const at = ref(0)
let live: Unsubscribe | null = null

function detach(): void {
  live?.()
  live = null
}

// One document, watched only while the panel is open — which is the whole
// reason this is a panel rather than a permanent strip.
void loadFirestore().then((cloud) => {
  if (!cloud) return
  const { db, fs } = cloud
  live = fs.onSnapshot(fs.doc(db, NEWS_COLLECTION, HEALTH_DOC), (snap) => {
    const data = snap.data()
    feeds.value = Array.isArray(data?.feeds) ? (data.feeds as FeedHealth[]) : []
    const stamp = data?.at as { toMillis?: () => number } | undefined
    at.value = stamp?.toMillis ? stamp.toMillis() : 0
  })
})

onUnmounted(detach)

/** A 200 that parsed to nothing is a dead feed wearing a live one's clothes. */
function verdict(feed: FeedHealth): string {
  if (feed.error) return feed.error
  if (feed.status !== 200) return `HTTP ${feed.status || '—'}`
  return feed.items ? 'ok' : 'no items'
}

function tone(feed: FeedHealth): string {
  if (feed.status === 200 && feed.items > 0) return 'is-ok'
  return feed.status === 200 ? 'is-warn' : 'is-bad'
}
</script>

<template>
  <section class="fhp">
    <header class="fhp__head">
      <h3 class="ui-label">Feeds</h3>
      <p class="fhp__note">
        {{ at ? `Last pull ${new Date(at).toLocaleString()}` : 'No pull recorded yet' }}
      </p>
    </header>

    <EmptyState
      v-if="!feeds.length"
      title="No pull has run yet"
      description="pullNews records what every feed answered; the first scheduled run fills this in."
    />

    <ul v-else class="fhp__list">
      <li v-for="feed in feeds" :key="feed.url" class="fhp__row" :class="tone(feed)">
        <span class="fhp__source">{{ feed.source }}</span>
        <span class="fhp__cat">{{ feed.category }}</span>
        <span class="fhp__items ui-mono">{{ countOf(feed.items, 'item') }}</span>
        <span class="fhp__verdict">{{ verdict(feed) }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.fhp {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
}
.fhp__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.fhp__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.fhp__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.fhp__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: baseline;
  gap: var(--sp-3);
  min-width: 0;
  padding: 2px 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.fhp__source {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fhp__cat,
.fhp__items {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
}
/* The verdict is the coloured half of the pair, and the words carry it too:
   "ok", "no items", "HTTP 404" all read without the colour. */
.fhp__verdict {
  min-width: 0;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
}
.fhp__row.is-ok .fhp__verdict {
  color: var(--theme-success);
}
.fhp__row.is-warn .fhp__verdict {
  color: var(--theme-warning);
}
.fhp__row.is-bad .fhp__verdict {
  color: var(--theme-danger);
}
</style>
