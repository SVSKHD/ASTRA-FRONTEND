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
//
// On Aureon the list is cards, with filters for a symbol or words, a source and
// an IST date range; headlines that arrive while the page is open wait behind a
// "N new" pill instead of shifting what is being read; and an admin gets the
// feed job, its sources and "Refresh now".
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import ListToolbar from '@/components/ListToolbar.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import SearchField from '@/components/ui/SearchField.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import NewsCards from '@/components/news/NewsCards.vue'
import NewsAdmin from '@/components/news/NewsAdmin.vue'
import FeedHealthPanel from '@/components/news/FeedHealthPanel.vue'
import IconForex from '@/components/feedicons/IconForex.vue'
import IconAi from '@/components/feedicons/IconAi.vue'
import IconCode from '@/components/feedicons/IconCode.vue'
import { useStyles } from '@/composables/useStyles'
import { newsOnAureon, useNews } from '@/composables/useNews'
import { useSettings } from '@/composables/useSettings'
import { loadNews, newsFeed, revealNews } from '@/news/feed'
import { filterNews, sourcesOf, termsFor } from '@/news/match'
import { checkSession, isAdmin, tradingSession } from '@/trading/session'
import { countOf } from '@/utils/format'
import type { DateRange } from '@/utils/datePicker'
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
const onAureon = newsOnAureon()

// ---- filters ---------------------------------------------------------------

// `/news?q=XAUUSD` (the trading widgets' "open News") opens already filtered.
const initialQ = useRoute()?.query.q
const query = ref(typeof initialQ === 'string' ? initialQ : '')
const source = ref('')
const days = ref<DateRange | null>({ start: null, end: null })
// On Aureon the shown list is the feed minus what waits behind the pill.
const base = computed(() => {
  if (!onAureon) return news.items.value
  const waiting = new Set(newsFeed.pending.map((i) => i.id))
  return news.items.value.filter((i) => !waiting.has(i.id))
})
const shown = computed(() =>
  filterNews(base.value, {
    q: query.value,
    source: source.value,
    from: days.value?.start ?? undefined,
    to: days.value?.end ?? undefined,
  }),
)
const sources = computed(() => sourcesOf(news.items.value))
const sourceOptions = computed(() => [
  { value: '', label: 'All sources' },
  ...sources.value.map((s) => ({
    value: s.source,
    label: `${s.source || 'Unknown'} (${s.count})`,
  })),
])
const filtering = computed(
  () => !!query.value.trim() || !!source.value || !!days.value?.start || !!days.value?.end,
)
function clearFilters() {
  query.value = ''
  source.value = ''
  days.value = { start: null, end: null }
}
/** The words a symbol search also matches, shown on the cards as "mentions". */
const queryTerms = computed(() => {
  const q = query.value.trim()
  return /^[A-Za-z0-9:._-]{2,20}$/.test(q) ? termsFor(q) : []
})

const fresh = computed(() => (onAureon ? newsFeed.pending.length : 0))

// ---- admin -----------------------------------------------------------------

const showAdmin = ref(false)
const admin = computed(() => onAureon && !!tradingSession.user && isAdmin())
onMounted(() => {
  if (onAureon && !tradingSession.checked) void checkSession()
})

function toggle(category: NewsCategory) {
  const next = chosen.value.includes(category)
    ? chosen.value.filter((c) => c !== category)
    : [...chosen.value, category]
  // Never all three off: an empty filter shows nothing and reads as a bug, so
  // turning the last one off turns the other two back on.
  void store.save({ newsCategories: next.length ? next : CATEGORIES.map((c) => c.key) })
}

const showHealth = ref(false)
// The feed-health panel reads the Firebase pipeline's own record. Aureon's news
// job keeps its errors on the scheduler job instead (the admin strip shows them).
const healthAvailable = !onAureon
const counts = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {}
  for (const item of news.items.value) out[item.category] = (out[item.category] ?? 0) + 1
  return out
})
const categoryStats = computed(() =>
  CATEGORIES.map((category) => {
    const active = chosen.value.includes(category.key)
    const items = news.items.value.filter((item) => item.category === category.key)
    return {
      ...category,
      active,
      count: items.length,
      sources: new Set(items.map((item) => item.source)).size,
    }
  }),
)

// A reading list: there is nothing here to create, so ⌘K and "/n" do
// nothing rather than something surprising.
defineExpose({ focus: () => {} })
</script>

<template>
  <div :style="panelStyle" :data-ready="ready && !news.loading.value ? 'true' : 'false'">
    <ListToolbar title="News">
      <template #left>
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
      </template>
      <template #actions>
        <Button v-if="healthAvailable" variant="ghost" size="sm" @click="showHealth = !showHealth">
          {{ showHealth ? 'Hide feeds' : 'Feeds' }}
        </Button>
        <Button
          v-if="admin"
          variant="ghost"
          size="sm"
          :aria-pressed="showAdmin"
          @click="showAdmin = !showAdmin"
        >
          {{ showAdmin ? 'Hide sources' : 'Sources & refresh' }}
        </Button>
      </template>
    </ListToolbar>

    <Alert v-if="news.error.value" tone="danger">{{ news.error.value }}</Alert>

    <div class="nv__scroll">
      <!-- Said once, at the top, where somebody deciding what to do with this
           list will read it. -->
      <p class="nv__note">
        {{
          filtering
            ? `${countOf(shown.length, 'headline')} of ${base.length} match.`
            : `${countOf(base.length, 'headline')} from the feeds, newest first.`
        }}
        Times are when the publisher posted, not when anything is scheduled — this is a reading
        list, not an economic calendar.
      </p>

      <section class="nv__categories" aria-label="News categories">
        <button
          v-for="category in categoryStats"
          :key="category.key"
          type="button"
          class="nv__category"
          :class="[`is-${category.key}`, { 'is-active': category.active }]"
          :aria-pressed="category.active"
          @click="toggle(category.key)"
        >
          <span class="nv__categoryIcon" aria-hidden="true">
            <component :is="category.icon" :size="16" />
          </span>
          <span class="nv__categoryCopy">
            <strong>{{ category.label }}</strong>
            <span>
              {{
                category.active
                  ? category.count
                    ? `${countOf(category.count, 'headline')} · ${countOf(category.sources, 'source')}`
                    : 'No headlines in this pull'
                  : 'Hidden'
              }}
            </span>
          </span>
        </button>
      </section>

      <FeedHealthPanel v-if="healthAvailable && showHealth" />
      <NewsAdmin v-if="admin && showAdmin" :sources="sources" />

      <section class="nv__filters" aria-label="Filter headlines">
        <SearchField
          v-model="query"
          size="sm"
          label="Symbol or words"
          placeholder="Symbol (XAUUSD) or words"
        />
        <Select v-model="source" :options="sourceOptions" size="sm" aria-label="Source" />
        <GlassDatePicker
          v-model="days"
          mode="range"
          size="sm"
          clearable
          timezone="Asia/Kolkata"
          placeholder="Any day (IST)"
          label="Days (IST)"
        />
        <Button
          v-if="filtering"
          size="sm"
          variant="ghost"
          data-testid="news-clear"
          @click="clearFilters"
          >Clear</Button
        >
      </section>

      <div v-if="fresh" class="nv__fresh">
        <Button size="sm" variant="primary" data-testid="news-fresh" @click="revealNews"
          >{{ countOf(fresh, 'new headline') }} · show</Button
        >
      </div>

      <div
        v-if="news.loading.value && !news.items.value.length"
        class="nv__skel"
        aria-hidden="true"
      >
        <Skeleton v-for="n in 4" :key="n" height="72px" radius="var(--radius-card)" />
      </div>
      <NewsCards
        v-else
        :items="shown"
        :terms="queryTerms"
        :empty-title="filtering ? 'Nothing matches' : 'No headlines yet'"
        :empty-text="
          filtering
            ? 'Try another symbol, source or day, or clear the filters.'
            : 'The server pulls the feeds on a schedule; the first pull fills this in.'
        "
      />
      <div v-if="onAureon && news.error.value" class="nv__retry">
        <Button size="sm" variant="ghost" @click="loadNews()">Try again</Button>
      </div>
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
.nv__categories {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-2);
}
.nv__category {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  color: var(--text-primary, var(--theme-text));
  text-align: left;
  cursor: pointer;
}
.nv__category:not(.is-active) {
  opacity: 0.58;
}
.nv__categoryIcon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: var(--text-secondary, var(--theme-dim));
  background: color-mix(in oklch, currentcolor 14%, transparent);
  border: 1px solid color-mix(in oklch, currentcolor 35%, transparent);
}
.nv__category.is-forex .nv__categoryIcon {
  color: var(--accent, var(--theme-accent));
}
.nv__category.is-ai .nv__categoryIcon {
  color: var(--theme-info, var(--theme-accent));
}
.nv__category.is-code .nv__categoryIcon {
  color: var(--text-muted, var(--theme-dim));
}
.nv__categoryCopy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.nv__categoryCopy strong {
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}
.nv__categoryCopy span {
  min-width: 0;
  color: var(--text-secondary, var(--theme-dim));
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  overflow-wrap: anywhere;
}
/* The count rides inside the filter it belongs to rather than beside it: two
   numbers with a gap between them read as two controls. */
.nv__count {
  margin-left: var(--sp-1);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-2xs);
  opacity: 0.75;
}
.nv__filters {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: var(--sp-2);
  align-items: end;
  min-width: 0;
}
/* Stays in view while the list scrolls under it: new headlines are one tap away. */
.nv__fresh {
  position: sticky;
  top: var(--sp-2);
  z-index: 2;
  display: flex;
  justify-content: center;
}
.nv__skel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.nv__retry {
  display: flex;
  justify-content: center;
}
@media (max-width: 760px) {
  .nv__categories {
    grid-template-columns: 1fr;
  }
  .nv__filters {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
