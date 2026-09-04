<script setup lang="ts">
// The News tab (section 39).
//
// Three filters over one list. Not three tabs and not three columns: the
// question is "what happened", the categories are a way of narrowing it, and a
// reader who wants all three should not have to look in three places for them.
//
// WHAT THIS IS NOT. RSS publishes when something is WRITTEN. A Fed release
// appears in this list after the decision, an arXiv paper after it is posted,
// and nothing here knows what is scheduled for tomorrow. So this is a reading
// list, never a calendar, and the copy says so where somebody might otherwise
// assume — because a trader planning a session around a timestamp that means
// "when the publisher pressed send" is planning around nothing.
import { computed, ref } from 'vue'
import ListToolbar from '@/components/ListToolbar.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import NewsTable from '@/components/news/NewsTable.vue'
import FeedHealthPanel from '@/components/news/FeedHealthPanel.vue'
import IconForex from '@/components/feedicons/IconForex.vue'
import IconAi from '@/components/feedicons/IconAi.vue'
import IconCode from '@/components/feedicons/IconCode.vue'
import { useStyles } from '@/composables/useStyles'
import { useNews } from '@/composables/useNews'
import { useSettings } from '@/composables/useSettings'
import { countOf } from '@/utils/format'
import type { NewsCategory } from '@/types'

const { panelStyle } = useStyles()
const store = useSettings()
const { settings, ready } = store

const CATEGORIES: { key: NewsCategory; label: string; icon: unknown }[] = [
  { key: 'forex', label: 'Forex', icon: IconForex },
  { key: 'ai', label: 'AI', icon: IconAi },
  { key: 'code', label: 'Code', icon: IconCode },
]

// The chosen set lives in settings, so it follows the account to another
// machine — it is a durable preference, not a view state (section 33).
const chosen = computed(() => settings.value.newsCategories)
const news = useNews(() => chosen.value)

function toggle(category: NewsCategory) {
  const next = chosen.value.includes(category)
    ? chosen.value.filter((c) => c !== category)
    : [...chosen.value, category]
  // Never all three off: an empty filter shows nothing and reads as a bug, so
  // turning the last one off turns the other two back on.
  void store.save({ newsCategories: next.length ? next : CATEGORIES.map((c) => c.key) })
}

const showHealth = ref(false)
const counts = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {}
  for (const item of news.items.value) out[item.category] = (out[item.category] ?? 0) + 1
  return out
})
</script>

<template>
  <div :style="panelStyle" :data-ready="ready && !news.loading.value ? 'true' : 'false'">
    <ListToolbar title="News">
      <template #actions>
        <Button
          v-for="c in CATEGORIES"
          :key="c.key"
          size="sm"
          :variant="chosen.includes(c.key) ? 'primary' : 'ghost'"
          :aria-pressed="chosen.includes(c.key)"
          @click="toggle(c.key)"
        >
          <component :is="c.icon" :size="14" />
          {{ c.label }}
          <span v-if="counts[c.key]" class="nv__count">{{ counts[c.key] }}</span>
        </Button>
        <Button variant="ghost" size="sm" @click="showHealth = !showHealth">
          {{ showHealth ? 'Hide feeds' : 'Feeds' }}
        </Button>
      </template>
    </ListToolbar>

    <Alert v-if="news.error.value" tone="danger">{{ news.error.value }}</Alert>

    <div class="nv__scroll">
      <!-- Said once, at the top, where somebody deciding what to do with this
           list will read it. -->
      <p class="nv__note">
        {{ countOf(news.items.value.length, 'headline') }} from the feeds, newest first. Times are
        when the publisher posted, not when anything is scheduled — this is a reading list, not an
        economic calendar.
      </p>

      <FeedHealthPanel v-if="showHealth" />

      <NewsTable :items="news.items.value" />
    </div>
  </div>
</template>

<style scoped>
.nv__scroll {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  padding-bottom: var(--sp-4);
}
.nv__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
/* The count rides inside the filter it belongs to rather than beside it: two
   numbers with a gap between them read as two controls. */
.nv__count {
  margin-left: var(--sp-1);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-2xs);
  opacity: 0.75;
}
</style>
