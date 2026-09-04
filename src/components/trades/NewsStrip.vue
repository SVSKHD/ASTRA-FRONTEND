<script setup lang="ts">
// The day's forex headlines, on the Trades tab (section 39).
//
// Collapsed by default and small when open. It answers one question — "what was
// being written about gold on the day I traded it" — and it is deliberately not
// more than that: the Trades tab is about a month of trades, and a news panel
// that competes with the calendar for attention is a news panel in the wrong
// place.
//
// IT IS NOT A CALENDAR, and the copy says so where it might be mistaken for one.
// RSS timestamps say when a publisher pressed send: a Fed release appears after
// the decision, not before it. Planning a session around one of these times is
// planning around nothing, and this component would be the thing that invited
// it, so it is the thing that has to disown it.
import { computed, ref } from 'vue'
import IconForex from '@/components/feedicons/IconForex.vue'
import { countOf } from '@/utils/format'
import { forexFor } from '@/composables/useNews'
import { IST, hhmmOn } from '@/utils/tradeTime'
import type { NewsItem } from '@/types'

const props = withDefaults(
  defineProps<{
    items: NewsItem[]
    /** The day the calendar is filtered to; '' means no day is selected. */
    day: string
    /** Which keyword tags to keep. Empty keeps every forex item that day. */
    tags?: string[]
  }>(),
  { tags: () => [] },
)

const open = ref(false)
const matching = computed(() => forexFor(props.items, props.day, props.tags))
</script>

<template>
  <section v-if="day" class="nstrip">
    <button type="button" class="nstrip__head" :aria-expanded="open" @click="open = !open">
      <IconForex :size="14" />
      <span class="nstrip__label">
        {{ countOf(matching.length, 'forex headline') }} on {{ day }}
      </span>
      <span class="nstrip__chev" aria-hidden="true">{{ open ? '−' : '+' }}</span>
    </button>

    <div v-if="open" class="nstrip__body">
      <p v-if="!matching.length" class="nstrip__note">Nothing in the feeds for that day.</p>
      <ul v-else class="nstrip__list">
        <li v-for="item in matching" :key="item.id" class="nstrip__row">
          <span class="nstrip__time ui-mono">{{ hhmmOn(IST, item.publishedAt) }}</span>
          <span class="nstrip__source">{{ item.source }}</span>
          <a class="nstrip__title" :href="item.link" target="_blank" rel="noopener noreferrer">{{
            item.title
          }}</a>
        </li>
      </ul>
      <p class="nstrip__note">
        Times are when the piece was published, not when anything was scheduled — this is a reading
        list, not an economic calendar.
      </p>
    </div>
  </section>
</template>

<style scoped>
.nstrip {
  min-width: 0;
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
}
.nstrip__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border: 0;
  background: none;
  cursor: pointer;
  color: var(--text-secondary, var(--theme-dim));
  font: inherit;
  font-size: var(--text-xs);
  text-align: left;
}
.nstrip__label {
  flex: 1;
  min-width: 0;
}
.nstrip__chev {
  font-family: var(--font-mono);
}
.nstrip__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: 0 var(--sp-3) var(--sp-3);
}
.nstrip__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.nstrip__row {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: baseline;
  gap: var(--sp-2);
  min-width: 0;
}
.nstrip__time,
.nstrip__source,
.nstrip__note {
  min-width: 0;
  margin: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  color: var(--text-muted, var(--theme-dim));
}
.nstrip__note {
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.nstrip__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  color: var(--text-primary, var(--theme-text));
  text-decoration: none;
}
.nstrip__title:hover,
.nstrip__title:focus-visible {
  text-decoration: underline;
}
</style>
