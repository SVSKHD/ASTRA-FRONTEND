<script setup lang="ts">
// Headlines as cards: phone-first, one per row, each a link out.
//
// What a card shows is what the feed stores — source, time (IST), headline,
// link — plus the words of `terms` the headline mentions. The server keeps no
// summary, sentiment or importance, so a card has no slot pretending to.
//
// EVERY CARD IS A LINK OUT: the piece belongs on the page of whoever wrote it.
import Chip from '@/components/ui/Chip.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { istStamp, mentions } from '@/news/match'
import { useNow } from '@/control/poll'
import type { NewsItem } from '@/types'

withDefaults(
  defineProps<{
    items: NewsItem[]
    /** Words to show as "mentions" chips (a symbol's terms, a search). */
    terms?: string[]
    compact?: boolean
    emptyTitle?: string
    emptyText?: string
  }>(),
  {
    terms: () => [],
    compact: false,
    emptyTitle: 'No headlines',
    emptyText: 'Nothing in the feed matches.',
  },
)

const now = useNow(60_000)
</script>

<template>
  <ul v-if="items.length" class="ncards" :class="{ 'is-compact': compact }">
    <li v-for="item in items" :key="item.id" class="ncard">
      <a class="ncard__link" :href="item.link" target="_blank" rel="noopener noreferrer">
        <span class="ncard__meta">
          <span class="ncard__source">{{ item.source || 'Unknown source' }}</span>
          <span aria-hidden="true">·</span>
          <time
            :datetime="item.publishedAt ? new Date(item.publishedAt).toISOString() : undefined"
            >{{ istStamp(item.publishedAt, now) }}</time
          >
        </span>
        <span class="ncard__title">{{ item.title }}</span>
      </a>
      <span
        v-if="mentions(item.title, terms).length || item.tags.length"
        class="ncard__chips"
        :aria-label="`Mentions ${mentions(item.title, terms).join(', ')}`"
      >
        <Chip
          v-for="m in mentions(item.title, terms)"
          :key="m"
          :label="m"
          size="sm"
          tone="accent"
        />
        <Chip v-for="t in item.tags" :key="`t-${t}`" :label="t" size="sm" />
      </span>
    </li>
  </ul>
  <EmptyState v-else :title="emptyTitle" :description="emptyText" />
</template>

<style scoped>
.ncards {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ncard {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border, var(--glass-border));
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg, var(--glass-card));
}
.is-compact .ncard {
  padding: var(--sp-2) var(--sp-3);
}
.ncard__link {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}
.ncard__link:hover .ncard__title,
.ncard__link:focus-visible .ncard__title {
  text-decoration: underline;
}
.ncard__link:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 4px;
  border-radius: var(--radius-sm, 6px);
}
.ncard__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  min-width: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  color: var(--text-secondary, var(--theme-dim));
}
.ncard__source {
  min-width: 0;
  font-weight: var(--weight-semibold);
  overflow-wrap: anywhere;
}
.ncard__title {
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
  overflow-wrap: anywhere;
}
.is-compact .ncard__title {
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
}
.ncard__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  min-width: 0;
}
</style>
