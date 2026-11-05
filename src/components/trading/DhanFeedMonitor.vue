<script setup lang="ts">
// The Dhan market-data monitor, on the Dhan tab under the status card.
//
// Every value is the server's: the Dhan session (GET /api/v1/dhan/auth/status),
// the feed worker's heartbeat (GET /api/v1/system/integrations, admin), Redis
// reachability (GET /api/system/status, admin), and ticks from the one live
// stream this tab holds (GET /api/trading/stream, src/trading/stream.ts). Times
// are the server's received_at. A price is labelled Live only when
// quoteFreshness() says so; anything else reads Stale, Last known or Market
// closed, so stale data is never shown as fresh.
//
// What the backend does not expose yet is shown as "not reported", never
// guessed: Dhan's own WebSocket state, the feed worker's subscription list and
// the Redis tick pipeline's lag (docs/dhan-integration.md).
//
// The stream is opened by the page, not here: this card reads it and never
// subscribes, so mounting it twice cannot add a listener. Polling stops on
// unmount (usePoll). Read-only: no order can be placed from here.
import { computed, ref, watch } from 'vue'
import Alert from '@/components/ui/Alert.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Select from '@/components/ui/Select.vue'
import Table from '@/components/ui/Table.vue'
import SourceTag from './SourceTag.vue'
import { aureon } from '@/api/client'
import { connectionState } from '@/control/dhanSession'
import { loadIntegrations, type DhanSection } from '@/control/integrations'
import { usePoll, useNow } from '@/control/poll'
import type { SystemStatus } from '@/control/system'
import { feedSummary, marketOpen, newestTick, quoteFreshness } from '@/trading/dhanHealth'
import { ago, dec, when } from '@/trading/format'
import { isAdmin } from '@/trading/session'
import { live, reconnect } from '@/trading/stream'
import { must, useLoad } from '@/trading/useLoad'
import { readWatchlist, symbolFor } from '@/trading/watchlist'

const now = useNow(5_000)
const admin = computed(() => isAdmin())

const session = useLoad(async () => must(await aureon.GET('/api/v1/dhan/auth/status')))
const integration = useLoad(async () => {
  if (!isAdmin()) return null
  const r = await loadIntegrations((p) => aureon.GET(p))
  if (!r.data) throw new Error(`Aureon answered ${r.status}`)
  return (r.data.integrations?.dhan as DhanSection | undefined) ?? null
})
const system = useLoad(async () => {
  if (!isAdmin()) return null
  return must(await aureon.GET('/api/system/status')) as unknown as SystemStatus
})
function refresh() {
  void session.reload()
  void integration.reload()
  void system.reload()
}
usePoll(refresh, 30_000)

const conn = computed(() =>
  session.data.value || session.error.value ? connectionState(session.data.value ?? null) : null,
)
const quotes = computed(() => Object.values(live.quotes))
const summary = computed(() =>
  feedSummary({
    streamStatus: live.status,
    sessionSource: session.data.value?.source ?? null,
    subscribed: live.subscribed.length,
    quotes: quotes.value,
    now: now.value,
  }),
)
const last = computed(() => newestTick(quotes.value))
const open = computed(() => marketOpen(now.value))

const STREAM_LABEL: Record<string, string> = {
  connecting: 'Connecting',
  open: 'Open',
  reconnecting: 'Reconnecting',
  closed: 'Off',
}

const worker = computed(() => {
  if (!admin.value) return { tone: 'info' as const, label: 'Not reported', text: 'Admins only.' }
  if (integration.error.value)
    return { tone: 'info' as const, label: 'Not reported', text: integration.error.value }
  const f = integration.data.value?.feed
  if (!f)
    return {
      tone: 'info' as const,
      label: 'Not checked',
      text: 'The server skips the feed check without a valid session.',
    }
  if (!f.registered)
    return { tone: 'neutral' as const, label: 'Not running', text: 'dhan-feed never registered.' }
  const st = f.state ?? 'unknown'
  const beat = f.age_s != null ? `heartbeat ${Math.round(f.age_s)} s ago` : 'no heartbeat time'
  const tone = ['stale', 'error', 'stopped'].includes(st)
    ? ('danger' as const)
    : st === 'paused'
      ? ('neutral' as const)
      : ('success' as const)
  return { tone, label: st, text: beat }
})

const redis = computed(() => {
  if (!admin.value) return { tone: 'info' as const, label: 'Not reported', text: 'Admins only.' }
  if (system.error.value)
    return { tone: 'info' as const, label: 'Not reported', text: system.error.value }
  const r = system.data.value?.redis
  if (!r) return { tone: 'info' as const, label: 'Not reported', text: 'No Redis section.' }
  return r.ok
    ? {
        tone: 'success' as const,
        label: 'Reachable',
        text: r.latency_ms != null ? `${r.latency_ms} ms ping` : 'Ping answered.',
      }
    : { tone: 'danger' as const, label: 'Unreachable', text: r.error ?? 'Ping failed.' }
})

// Subscriptions: what this tab's stream follows, with each instrument's latest tick.
const watch_ = computed(() => readWatchlist())
const rows = computed(() =>
  live.subscribed.map((id) => {
    const q = live.quotes[id]
    const f = q ? quoteFreshness(q, live.status, now.value) : null
    return {
      id,
      symbol: q?.ref || symbolFor(id, watch_.value),
      ltp: q ? dec(q.ltp) : '—',
      ltt: q?.ltt ? when(q.ltt) : '—',
      volume: q ? dec(q.volume) : '—',
      received: q?.received_at ? ago(q.received_at, now.value) : 'waiting for first tick',
      fresh: f ? f.label : 'No tick yet',
      tone: f?.tone ?? 'neutral',
      note: f?.text ?? 'No tick has arrived for this instrument since the page opened.',
    }
  }),
)
const COLUMNS = [
  { key: 'symbol', label: 'Instrument' },
  { key: 'ltp', label: 'LTP', align: 'right' as const },
  { key: 'ltt', label: 'Exchange time' },
  { key: 'volume', label: 'Volume', align: 'right' as const },
  { key: 'received', label: 'Received' },
  { key: 'fresh', label: 'Freshness' },
]

// Stored candles for one subscribed instrument: history, never presented as live.
const candleFor = ref<number>(0)
watch(
  () => live.subscribed,
  (ids) => {
    if (!ids.includes(candleFor.value)) candleFor.value = ids[0] ?? 0
  },
  { immediate: true },
)
const candleOptions = computed(() =>
  live.subscribed.map((id) => ({ value: String(id), label: symbolFor(id, watch_.value) })),
)
const candles = useLoad(async () => {
  if (!candleFor.value) return []
  return must(
    await aureon.GET('/api/trading/candles', {
      params: { query: { instrument_id: candleFor.value, timeframe: '1m', limit: 5 } },
    }),
  )
}, false)
watch(candleFor, () => void candles.reload(), { immediate: true })
const candleRows = computed(() =>
  [...(candles.data.value ?? [])]
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .map((c) => ({
      id: c.ts,
      ts: when(c.ts),
      o: dec(c.open),
      h: dec(c.high),
      l: dec(c.low),
      c: dec(c.close),
      v: dec(c.volume),
      src: c.is_gap ? `${c.source} (gap)` : c.source,
    })),
)
const newestCandleAge = computed(() => {
  const top = candles.data.value?.reduce<string | null>(
    (m, c) => (!m || Date.parse(c.ts) > Date.parse(m) ? c.ts : m),
    null,
  )
  return top ? ago(top, now.value) : null
})
</script>

<template>
  <Card data-testid="dhan-feed-monitor">
    <template #header>
      <div class="tp-head">
        <span class="tp-title">Market data feed</span>
        <div class="tp-row">
          <Badge :tone="summary.tone" :label="summary.label" data-testid="feed-summary" />
          <Button
            size="sm"
            variant="ghost"
            :disabled="live.status === 'connecting'"
            title="Close and reopen this tab's live stream with the same subscriptions"
            @click="reconnect()"
            >Reconnect stream</Button
          >
          <Button
            size="sm"
            variant="ghost"
            :loading="session.loading.value || integration.loading.value"
            @click="refresh"
            >Refresh</Button
          >
        </div>
      </div>
    </template>

    <!-- Inline in the card, and lifted to the page's warnings strip while it lasts. -->
    <p
      class="dfm__summary"
      :class="`is-${summary.tone}`"
      :role="summary.tone === 'danger' || summary.tone === 'warning' ? 'alert' : 'status'"
      data-testid="feed-alert"
    >
      {{ summary.text }}
      <template v-if="summary.level === 'unauthorized'">
        An admin reconnects Dhan from the banner above or Control center → Settings.</template
      >
    </p>
    <Alert v-if="summary.level === 'interrupted' || summary.level === 'unauthorized'" tone="danger"
      >Dhan market data: {{ summary.text }}</Alert
    >
    <dl class="dfm__grid">
      <div class="dfm__cell">
        <dt>Dhan authentication</dt>
        <dd>
          <Badge v-if="conn" :tone="conn.tone" :label="conn.label" />
          <span v-else class="tp-note">Checking…</span>
        </dd>
      </div>
      <div class="dfm__cell">
        <dt>Live stream (browser ↔ Aureon)</dt>
        <dd>
          <Badge
            :tone="
              live.status === 'open' ? 'success' : live.status === 'connecting' ? 'info' : 'danger'
            "
            :label="STREAM_LABEL[live.status]"
          />
          <span v-if="live.status === 'open' && live.openedAt" class="tp-note"
            >since {{ ago(live.openedAt, now) }}</span
          >
        </dd>
      </div>
      <div class="dfm__cell">
        <dt>Feed worker (Dhan WebSocket)</dt>
        <dd>
          <Badge :tone="worker.tone" :label="worker.label" />
          <span class="tp-note">{{ worker.text }}</span>
        </dd>
      </div>
      <div class="dfm__cell">
        <dt>Redis</dt>
        <dd>
          <Badge :tone="redis.tone" :label="redis.label" />
          <span class="tp-note">{{ redis.text }}</span>
        </dd>
      </div>
      <div class="dfm__cell">
        <dt>Last tick</dt>
        <dd>
          <template v-if="last">
            <span class="tp-strong">{{ last.ref || symbolFor(last.instrument_id) }}</span>
            <span class="tp-note"
              >{{ dec(last.ltp) }} · received {{ when(last.received_at) }} ({{
                ago(last.received_at, now)
              }})</span
            >
          </template>
          <span v-else class="tp-note">None since this page opened.</span>
        </dd>
      </div>
      <div class="dfm__cell">
        <dt>Market (NSE cash, IST)</dt>
        <dd>
          <Badge :tone="open ? 'success' : 'neutral'" :label="open ? 'Open' : 'Closed'" />
          <span class="tp-note">09:15–15:30 Mon–Fri; exchange holidays not known here.</span>
        </dd>
      </div>
    </dl>

    <div class="tp-head">
      <span class="tp-strong">Subscriptions ({{ live.subscribed.length }})</span>
      <SourceTag source="broker" />
    </div>
    <ul v-if="rows.length" class="tp-list dfm__subs" aria-label="Subscribed instruments">
      <li v-for="r in rows" :key="r.id" class="tp-item" :data-instrument="r.id">
        <div class="tp-main">
          <span class="tp-strong">{{ r.symbol }} · {{ r.ltp }}</span>
          <span class="tp-note"
            >exchange {{ r.ltt }} · vol {{ r.volume }} · received {{ r.received }}</span
          >
        </div>
        <Badge :tone="r.tone" :label="r.fresh" :title="r.note" />
      </li>
    </ul>
    <Table
      v-if="rows.length"
      class="dfm__table"
      :columns="COLUMNS"
      :rows="rows"
      caption="Subscribed instruments and their latest tick"
    />
    <EmptyState
      v-if="!rows.length"
      title="This page follows no instruments"
      description="Add instruments on the Watchlist & charts tab; the live stream subscribes to them once per tab."
    />
    <p class="tp-note">
      These are this tab's stream subscriptions. The feed worker's own subscription list is not
      reported by the server.
    </p>

    <div class="tp-head">
      <span class="tp-strong">Stored candles (1m)</span>
      <div class="tp-row">
        <Select
          v-if="candleOptions.length"
          :model-value="String(candleFor)"
          :options="candleOptions"
          size="sm"
          aria-label="Instrument for candles"
          @update:model-value="candleFor = Number($event)"
        />
        <SourceTag source="broker" />
      </div>
    </div>
    <p v-if="candles.error.value" class="tp-note" role="alert">{{ candles.error.value }}</p>
    <template v-else-if="candleRows.length">
      <p class="tp-note">History, not live: the newest stored candle is {{ newestCandleAge }}.</p>
      <Table
        :columns="[
          { key: 'ts', label: 'Candle' },
          { key: 'o', label: 'O', align: 'right' },
          { key: 'h', label: 'H', align: 'right' },
          { key: 'l', label: 'L', align: 'right' },
          { key: 'c', label: 'C', align: 'right' },
          { key: 'v', label: 'Vol', align: 'right' },
          { key: 'src', label: 'Source' },
        ]"
        :rows="candleRows"
        caption="Latest stored 1-minute candles"
      />
    </template>
    <p v-else-if="candleFor && !candles.loading.value" class="tp-note">
      No 1-minute candles stored for this instrument.
    </p>
    <p class="tp-note">Read-only: orders cannot be placed, changed or cancelled from here.</p>
  </Card>
</template>

<style scoped>
.dfm__summary {
  margin: 0;
  padding: var(--sp-2) var(--sp-3);
  border-left: 3px solid var(--glass-border);
  border-radius: var(--radius-sm, 4px);
  background: var(--glass-card);
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.dfm__summary.is-danger {
  border-left-color: var(--theme-danger);
}

.dfm__summary.is-warning {
  border-left-color: var(--theme-warning);
}

.dfm__summary.is-success {
  border-left-color: var(--theme-success);
}

.dfm__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  gap: var(--sp-3);
  margin: 0;
}

.dfm__cell {
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
}

.dfm__cell dt {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.dfm__cell dd {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: center;
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

/* Phones get a list; from 768 px up, a table. */
.dfm__table {
  display: none;
}

@media (min-width: 768px) {
  .dfm__subs {
    display: none;
  }

  .dfm__table {
    display: block;
  }
}
</style>
