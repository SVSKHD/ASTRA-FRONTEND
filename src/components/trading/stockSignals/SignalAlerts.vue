<script setup lang="ts">
// The Alerts tab: the stock-signal monitor's events (crosses, VWAP confirmation,
// portfolio reversals, new candidates, concentration), newest first, filtered by
// type and stock, with read state kept on the server. Clicking one opens that
// stock's chart. When the backend's monitor has not shipped, it says so plainly.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Select from '@/components/ui/Select.vue'
import SearchField from '@/components/ui/SearchField.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Alert from '@/components/ui/Alert.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { ago, dec } from '@/trading/format'
import {
  EVENT_LABEL,
  type StockSignalEvent,
  type StockSignalEventType,
} from '@/trading/stockSignals/alertsApi'
import type { useSignalNotifications } from '@/trading/stockSignals/useSignalNotifications'

const props = defineProps<{
  center: ReturnType<typeof useSignalNotifications>
  now: number
}>()
const emit = defineEmits<{ open: [StockSignalEvent] }>()

const type = ref<'all' | StockSignalEventType>('all')
const stock = ref('')
const onlyUnread = ref(false)
const TYPE_OPTIONS = [
  { value: 'all', label: 'All alerts' },
  ...Object.entries(EVENT_LABEL).map(([value, label]) => ({ value, label })),
]
const ICON: Record<StockSignalEventType, string> = {
  bullish_cross: 'trending-up',
  bearish_cross: 'trending-down',
  vwap_confirmed: 'circle-check',
  trend_reversal: 'repeat',
  new_candidate: 'sparkles',
  concentration: 'pie-chart',
}
const TONE: Record<StockSignalEventType, string> = {
  bullish_cross: 'is-up',
  bearish_cross: 'is-down',
  vwap_confirmed: 'is-up',
  trend_reversal: 'is-warn',
  new_candidate: 'is-info',
  concentration: 'is-warn',
}

const s = computed(() => props.center.state)
const list = computed(() => {
  const q = stock.value.trim().toLowerCase()
  return s.value.events.filter(
    (e) =>
      (type.value === 'all' || e.type === type.value) &&
      (!q || (e.symbol ?? '').toLowerCase().includes(q)) &&
      (!onlyUnread.value || !e.read),
  )
})
const busy = ref(false)
const error = ref('')
async function read(ids: string[] | 'all') {
  busy.value = true
  error.value = ''
  try {
    await props.center.markRead(ids)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
function open(e: StockSignalEvent) {
  if (!e.read) void read([e.id])
  emit('open', e)
}
</script>

<template>
  <section class="sa" aria-label="Signal alerts">
    <Skeleton
      v-if="s.availability === 'unknown'"
      :lines="5"
      height="56px"
      radius="var(--radius-md)"
    />
    <EmptyState
      v-else-if="s.availability === 'unavailable'"
      glyph="🔔"
      title="Signal alerts are not on this server yet"
      description="Crossover, VWAP-confirmation and portfolio alerts come from the backend’s stock-signal monitor, which has not been deployed here. The table, charts and portfolio map work now; alerts appear here as soon as the monitor ships. No sample alerts are shown."
    />
    <template v-else>
      <div class="sa__tools">
        <Select v-model="type" :options="TYPE_OPTIONS" size="sm" aria-label="Alert type" />
        <SearchField
          v-model="stock"
          size="sm"
          placeholder="Filter by stock"
          label="Filter by stock"
        />
        <Button
          size="sm"
          :variant="onlyUnread ? 'tinted' : 'ghost'"
          :aria-pressed="onlyUnread ? 'true' : 'false'"
          @click="onlyUnread = !onlyUnread"
        >
          Unread only
        </Button>
        <span class="sa__right">
          <Button size="sm" variant="ghost" :loading="s.loading" @click="center.refresh()">
            <Icon name="refresh-cw" size="sm" />Refresh
          </Button>
          <Button
            size="sm"
            variant="secondary"
            :disabled="!center.unread.value || busy"
            @click="read('all')"
          >
            Mark all read
          </Button>
        </span>
      </div>
      <Alert
        v-if="s.availability === 'error' || error"
        tone="danger"
        title="Alerts could not be updated"
      >
        {{ error || s.error }}
      </Alert>
      <ol v-if="list.length" class="sa__list">
        <li
          v-for="e in list"
          :key="e.id"
          class="sa__item"
          :class="[TONE[e.type], { 'is-unread': !e.read }]"
        >
          <button type="button" class="sa__open" @click="open(e)">
            <Icon :name="ICON[e.type] as never" size="sm" class="sa__icon" />
            <span class="sa__main">
              <span class="sa__top">
                <b>{{ e.symbol ?? 'Portfolio' }}</b>
                <span>{{ EVENT_LABEL[e.type] ?? e.type }}</span>
                <span v-if="e.timeframe" class="sa__dim">{{ e.timeframe }}</span>
                <span v-if="e.price" class="tp-num sa__dim">@ {{ dec(e.price, 2) }}</span>
              </span>
              <span v-if="e.detail" class="sa__detail">{{ e.detail }}</span>
            </span>
            <span class="sa__when">{{ ago(e.at, now) }}</span>
          </button>
          <Button v-if="!e.read" size="sm" variant="ghost" :disabled="busy" @click="read([e.id])"
            >Mark read</Button
          >
        </li>
      </ol>
      <EmptyState
        v-else
        glyph="✅"
        :title="s.events.length ? 'No alerts match' : 'No alerts yet'"
        :description="
          s.events.length
            ? 'Try another type or stock.'
            : 'When a stock you follow crosses or VWAP confirms, it shows here.'
        "
      />
    </template>
  </section>
</template>

<style scoped>
.sa {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.sa__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}
.sa__right {
  display: inline-flex;
  gap: 4px;
  margin-left: auto;
}
.sa__right :deep(.ui-icon) {
  margin-right: 4px;
}
.sa__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.sa__item {
  --tone: var(--theme-dim);
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding-right: var(--sp-2);
  border: 1px solid var(--theme-border);
  border-left: 3px solid var(--tone);
  border-radius: var(--radius-md);
  background: var(--theme-card);
}
.sa__item.is-up {
  --tone: var(--theme-success);
}
.sa__item.is-down {
  --tone: var(--theme-danger);
}
.sa__item.is-warn {
  --tone: var(--theme-warning);
}
.sa__item.is-info {
  --tone: var(--theme-accent);
}
.sa__item.is-unread {
  background: color-mix(in oklch, var(--theme-accent) 6%, var(--theme-card));
}
.sa__open {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border: 0;
  background: transparent;
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.sa__open:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: -2px;
}
.sa__icon {
  color: var(--tone);
}
.sa__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.sa__top {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: var(--text-sm);
}
.is-unread .sa__top b::after {
  content: ' •';
  color: var(--theme-accent);
}
.sa__detail,
.sa__dim,
.sa__when {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.sa__when {
  white-space: nowrap;
}
</style>
