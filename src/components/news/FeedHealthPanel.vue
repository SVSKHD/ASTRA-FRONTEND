<script setup lang="ts">
// Which sources are actually alive (section 39, extended in 44).
//
// A feed that dies fails silently: the category simply has fewer items in it,
// and nothing anywhere says which publisher stopped answering. So the pull
// records what each feed returned and this reads it back.
//
// FOUR STAGES, NOT ONE VERDICT. "Is the feed working" is four questions with
// four different fixes, and collapsing them loses the one thing a reader needs:
//
//   status   did the request get a 200 at all          → a dead URL
//   parsed   did the body parse as a feed              → an HTML page where the
//                                                        XML used to be
//   items    how many entries came back                → an empty feed
//   written  how many documents reached `forex`        → a failed write
//
// The last column is the one that matters and it is the one that did not
// exist: `written` used to be the number of documents BUILT, so a run whose
// every commit failed reported nineteen-for-nineteen healthy.
//
// "Run a pull now" is here because the alternative to it is waiting up to
// fifteen minutes and then reading Cloud Logging, and a diagnosis nobody can
// take in under fifteen minutes is a diagnosis nobody takes.
import { onUnmounted, ref } from 'vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { loadFirestore } from '@/firebase'
import { HEALTH_DOC, NEWS_COLLECTION, pullNewsNow } from '@/composables/useNews'
import { countOf } from '@/utils/format'
import type { Unsubscribe } from 'firebase/firestore'
import type { FeedHealth } from '@/types'

const feeds = ref<FeedHealth[]>([])
const at = ref(0)
const skipped = ref(0)
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
    skipped.value = typeof data?.skipped === 'number' ? data.skipped : 0
    const stamp = data?.at as { toMillis?: () => number } | undefined
    at.value = stamp?.toMillis ? stamp.toMillis() : 0
  })
})

onUnmounted(detach)

const pulling = ref(false)
const pullError = ref('')
async function runPull(): Promise<void> {
  pulling.value = true
  pullError.value = ''
  try {
    await pullNewsNow()
    // Nothing to do with the answer: the snapshot above delivers the same
    // health document the call just wrote, so the table updates itself.
  } catch (err) {
    pullError.value = err instanceof Error ? err.message : 'The pull could not be started.'
  } finally {
    pulling.value = false
  }
}

/**
 * The first stage that failed, named.
 *
 * Order matters: a feed that 404s has no parse to report on, and a feed that
 * did not parse has no item count worth believing. Saying the FIRST thing that
 * went wrong is the difference between a diagnosis and a list of symptoms.
 */
function verdict(feed: FeedHealth): string {
  if (feed.status && feed.status !== 200) return `HTTP ${feed.status}`
  if (feed.error) return feed.error
  if (!feed.status) return 'no response'
  if (feed.parsed === false) return 'did not parse'
  if (!feed.items) return 'no items'
  if (!feed.written) return 'nothing written'
  return 'ok'
}

function tone(feed: FeedHealth): string {
  if (verdict(feed) === 'ok') return 'is-ok'
  // Reached and parsed but produced nothing is a warning; anything earlier in
  // the chain is a failure.
  return feed.status === 200 && feed.parsed !== false ? 'is-warn' : 'is-bad'
}

/** The stage counts, as one compact string per row. */
function stages(feed: FeedHealth): string {
  const usable = feed.usable ?? feed.written
  return `${feed.items} → ${usable} → ${feed.written}`
}
</script>

<template>
  <section class="fhp">
    <header class="fhp__head">
      <h3 class="ui-label">Feeds</h3>
      <p class="fhp__note">
        {{ at ? `Last pull ${new Date(at).toLocaleString()}` : 'No pull recorded yet' }}
        <template v-if="skipped"> · {{ countOf(skipped, 'feed') }} skipped as dead</template>
      </p>
      <Button size="sm" variant="ghost" :state="pulling ? 'working' : 'idle'" @click="runPull">
        Run a pull now
      </Button>
    </header>

    <Alert v-if="pullError" tone="danger" dismissible @dismiss="pullError = ''">
      {{ pullError }}
    </Alert>

    <EmptyState
      v-if="!feeds.length"
      title="No pull has run yet"
      description="pullNews records what every feed answered. If this stays empty, the function is not deployed — nothing in this repository ran `firebase deploy --only functions` until the deploy workflow was added, and a scheduled function that was never deployed has no schedule."
    />

    <template v-else>
      <p class="fhp__note fhp__legend">
        Items → usable → written. The last number is what actually reached the
        <span class="ui-mono">forex</span> collection.
      </p>
      <ul class="fhp__list">
        <li v-for="feed in feeds" :key="feed.url" class="fhp__row" :class="tone(feed)">
          <span class="fhp__source" :title="feed.url">{{ feed.source }}</span>
          <span class="fhp__cat">{{ feed.category }}</span>
          <span class="fhp__status ui-mono">{{ feed.status || '—' }}</span>
          <span class="fhp__items ui-mono">{{ stages(feed) }}</span>
          <span class="fhp__verdict">{{ verdict(feed) }}</span>
        </li>
      </ul>
    </template>
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
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
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
.fhp__legend {
  flex: 1 1 24ch;
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
  grid-template-columns: minmax(0, 1fr) auto auto auto auto;
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
.fhp__items,
.fhp__status {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
  font-variant-numeric: tabular-nums;
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

/* At 390px five columns is four too many: the row becomes two lines, with the
   source and its verdict on the first and the numbers underneath. */
@media (max-width: 620px) {
  .fhp__row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .fhp__cat,
  .fhp__status,
  .fhp__items {
    grid-column: 1 / -1;
  }
  .fhp__cat,
  .fhp__status {
    display: inline;
  }
}
</style>
