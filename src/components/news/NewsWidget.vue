<script setup lang="ts">
// A few headlines about some symbols, for the trading screens: XAUUSD/USD on
// MT5, the instruments held on Dhan ("news for my positions"). Read from the
// app-wide feed (src/news/feed.ts), so any number of these cost one request.
//
// "About" means the headline contains one of the symbol's words (termsFor in
// src/news/match.ts): the server does no tagging, and the card says "mentions".
import { computed } from 'vue'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import NewsCards from '@/components/news/NewsCards.vue'
import { allNews, loadNews, useNewsFeed } from '@/news/feed'
import { aboutAny, termsFor } from '@/news/match'

const props = withDefaults(
  defineProps<{
    title: string
    /** Symbols as the broker writes them (XAUUSD, NSE:RELIANCE-EQ). */
    symbols: string[]
    limit?: number
  }>(),
  { limit: 5 },
)

const feed = useNewsFeed()
const terms = computed(() => [...new Set(props.symbols.flatMap(termsFor))])
const matching = computed(() => allNews().filter((i) => aboutAny(i, terms.value)))
const items = computed(() => matching.value.slice(0, props.limit))
const newsLink = computed(() =>
  props.symbols.length === 1 ? `/news?q=${encodeURIComponent(props.symbols[0])}` : '/news',
)
</script>

<template>
  <Card :title="title">
    <p v-if="!symbols.length" class="nw__note">No open positions, so no news to match.</p>
    <template v-else>
      <div v-if="!feed.loaded && !feed.error" aria-hidden="true" class="nw__skel">
        <Skeleton v-for="n in 3" :key="n" height="48px" radius="var(--radius-card)" />
      </div>
      <template v-else>
        <p v-if="feed.error" class="nw__note" role="alert">
          {{ feed.error }}
          <Button size="sm" variant="ghost" @click="loadNews()">Retry</Button>
        </p>
        <NewsCards
          v-if="!feed.error || items.length"
          :items="items"
          :terms="terms"
          compact
          empty-title="No matching headlines"
          :empty-text="`Nothing in the feed mentions ${symbols.join(', ')} right now. The feed covers the sources configured on the server.`"
        />
        <p class="nw__note">
          {{ matching.length > items.length ? `${matching.length} in all · ` : '' }}matched on the
          words in each headline ·
          <RouterLink :to="newsLink">open News</RouterLink>
        </p>
      </template>
    </template>
  </Card>
</template>

<style scoped>
.nw__skel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.nw__note {
  margin: var(--sp-2) 0 0;
  min-width: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  color: var(--text-secondary, var(--theme-dim));
  overflow-wrap: anywhere;
}
.nw__note a {
  color: var(--theme-accent);
}
</style>
