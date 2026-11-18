<script setup lang="ts">
// The Alerts tab: the backend's stock-signal notifications (crosses, VWAP
// confirmation, holding reversals, portfolio trend changes, replacement
// candidates), newest first, filtered by kind and stock, read state on the
// server; and the preferences that decide what arrives. Clicking one opens that
// stock's chart. DevOps notifications are not mixed in.
import { computed, onMounted, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import Select from '@/components/ui/Select.vue'
import SearchField from '@/components/ui/SearchField.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Switch from '@/components/ui/Switch.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SignalNotice from './SignalNotice.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { ago } from '@/trading/format'
import {
  ALL_KINDS,
  KIND_LABEL,
  SIGNAL_TFS,
  fetchPrefs,
  savePrefs,
  type Notification,
  type NotificationKind,
  type Prefs,
} from '@/trading/stockSignals/api'
import type { SignalCenter } from '@/trading/stockSignals/useSignalNotifications'

const props = defineProps<{ center: SignalCenter; now: number }>()
const emit = defineEmits<{ open: [Notification] }>()

const kind = ref<'all' | NotificationKind>('all')
const stock = ref('')
const onlyUnread = ref(false)
const KIND_OPTIONS = [
  { value: 'all', label: 'All alerts' },
  ...ALL_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })),
]
const ICON: Record<string, string> = {
  bullish_cross: 'trending-up',
  bearish_cross: 'trending-down',
  vwap_confirmed: 'circle-check',
  holding_reversal: 'repeat',
  portfolio_trend_change: 'shuffle',
  replacement_candidate: 'sparkles',
}
const TONE: Record<string, string> = {
  bullish_cross: 'is-up',
  bearish_cross: 'is-down',
  vwap_confirmed: 'is-up',
  holding_reversal: 'is-warn',
  portfolio_trend_change: 'is-warn',
  replacement_candidate: 'is-info',
}
function symbolOf(n: Notification): string {
  const inst = (n.payload as { instrument?: { symbol?: unknown } }).instrument
  return typeof inst?.symbol === 'string' ? inst.symbol : ''
}

const s = computed(() => props.center.state)
const list = computed(() => {
  const q = stock.value.trim().toLowerCase()
  return s.value.items.filter(
    (n) =>
      (kind.value === 'all' || n.kind === kind.value) &&
      (!q || symbolOf(n).toLowerCase().includes(q) || n.title.toLowerCase().includes(q)) &&
      (!onlyUnread.value || !n.read_at),
  )
})
const busy = ref(false)
const error = ref('')
async function read(ids: number[] | 'all') {
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
function open(n: Notification) {
  if (!n.read_at) void read([n.id])
  emit('open', n)
}

// --- preferences ------------------------------------------------------------------------------
const prefs = ref<Prefs | null>(null)
const prefsOpen = ref(false)
const prefsBusy = ref(false)
const prefsMsg = ref('')
onMounted(async () => {
  try {
    prefs.value = await fetchPrefs()
  } catch {
    /* shown when opened */
  }
})
function toggle<T>(list: T[] | undefined, v: T, on: boolean): T[] {
  const cur = list ?? []
  return on ? [...new Set([...cur, v])] : cur.filter((x) => x !== v)
}
async function save() {
  if (!prefs.value) return
  prefsBusy.value = true
  prefsMsg.value = ''
  try {
    prefs.value = await savePrefs(prefs.value)
    prefsMsg.value = 'Saved.'
  } catch (e) {
    prefsMsg.value = (e as Error).message
  } finally {
    prefsBusy.value = false
  }
}
</script>

<template>
  <section class="sa" aria-label="Signal alerts">
    <div class="sa__tools">
      <Select v-model="kind" :options="KIND_OPTIONS" size="sm" aria-label="Alert type" />
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
        >Unread only</Button
      >
      <span class="sa__right">
        <span class="sa__live" :class="`is-${s.stream}`">{{
          s.stream === 'open' ? 'Live' : s.stream === 'reconnecting' ? 'Reconnecting…' : 'Polling'
        }}</span>
        <Button size="sm" variant="ghost" :aria-expanded="prefsOpen" @click="prefsOpen = !prefsOpen"
          ><Icon name="settings" size="sm" />Preferences</Button
        >
        <Button
          size="sm"
          variant="secondary"
          :disabled="!center.unread.value || busy"
          @click="read('all')"
          >Mark all read</Button
        >
      </span>
    </div>

    <section v-if="prefsOpen" class="sa__prefs" aria-label="Alert preferences">
      <p v-if="!prefs" class="sa__dim">The preferences could not be read.</p>
      <template v-else>
        <Switch v-model="prefs.enabled" label="Signal alerts on" />
        <div class="sa__group">
          <span class="sa__label">What to send</span>
          <Checkbox
            v-for="k in ALL_KINDS"
            :key="k"
            :model-value="(prefs.kinds ?? []).includes(k)"
            :label="KIND_LABEL[k]"
            @update:model-value="(on: boolean) => (prefs!.kinds = toggle(prefs!.kinds, k, on))"
          />
          <span class="sa__dim">None ticked means all.</span>
        </div>
        <div class="sa__group">
          <span class="sa__label">Timeframes</span>
          <Checkbox
            v-for="t in SIGNAL_TFS"
            :key="t"
            :model-value="(prefs.timeframes ?? []).includes(t)"
            :label="t"
            @update:model-value="
              (on: boolean) => (prefs!.timeframes = toggle(prefs!.timeframes, t, on))
            "
          />
          <span class="sa__dim">None ticked means all.</span>
        </div>
        <Checkbox
          v-model="prefs.all_market"
          label="Every stock in the market, not only my watchlists and holdings"
        />
        <Checkbox
          v-model="prefs.confirmed_only"
          label="Only VWAP-confirmed crossovers (skip pending ones)"
        />
        <div class="sa__row">
          <Button size="sm" variant="primary" :loading="prefsBusy" @click="save"
            >Save preferences</Button
          >
          <span class="sa__dim" role="status">{{ prefsMsg }}</span>
        </div>
      </template>
    </section>

    <SignalNotice v-if="s.error || error" tone="danger" title="Alerts could not be updated">{{
      error || s.error
    }}</SignalNotice>
    <Skeleton v-if="s.loading && !s.loaded" :lines="5" height="56px" radius="var(--radius-md)" />
    <ol v-else-if="list.length" class="sa__list">
      <li
        v-for="n in list"
        :key="n.id"
        class="sa__item"
        :class="[TONE[n.kind] ?? '', { 'is-unread': !n.read_at }]"
      >
        <button type="button" class="sa__open" @click="open(n)">
          <Icon :name="(ICON[n.kind] ?? 'bell') as never" size="sm" class="sa__icon" />
          <span class="sa__main">
            <span class="sa__top">
              <b>{{ symbolOf(n) || n.title }}</b>
              <span>{{ KIND_LABEL[n.kind as NotificationKind] ?? n.kind }}</span>
              <span v-if="n.timeframe" class="sa__dim">{{ n.timeframe }}</span>
            </span>
            <span class="sa__detail">{{ n.body }}</span>
          </span>
          <span class="sa__when">{{ ago(n.created_at, now) }}</span>
        </button>
        <Button v-if="!n.read_at" size="sm" variant="ghost" :disabled="busy" @click="read([n.id])"
          >Mark read</Button
        >
      </li>
    </ol>
    <EmptyState
      v-else
      glyph="✅"
      :title="s.items.length ? 'No alerts match' : 'No alerts yet'"
      :description="
        s.items.length
          ? 'Try another type or stock.'
          : 'When a stock in your watchlists or holdings crosses, confirms or reverses, it shows here. Preferences decide which.'
      "
    />
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
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.sa__right :deep(.ui-icon) {
  margin-right: 4px;
}
.sa__live {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.sa__live.is-open {
  color: var(--theme-success);
}
.sa__prefs {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-card);
  background: var(--theme-card);
}
.sa__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-1) var(--sp-3);
}
.sa__label {
  flex-basis: 100%;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.sa__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
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
