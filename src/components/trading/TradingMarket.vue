<script setup lang="ts">
// Watchlists and charts: pick instruments from the server's instrument master,
// keep them in a per-device watchlist, and chart stored candles with the
// technical-analysis agent's EMAs. Quotes for the watchlist arrive live.
import { computed, onMounted, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import StatRow from '@/components/ui/StatRow.vue'
import TextInput from '@/components/ui/TextInput.vue'
import CandleChart from './CandleChart.vue'
import SourceTag from './SourceTag.vue'
import { aureon } from '@/api/client'
import { ago, dec } from '@/trading/format'
import { connect, live } from '@/trading/stream'
import { must, useLoad } from '@/trading/useLoad'
import type { Instrument } from './types'

const KEY = 'aureon.trading.watchlist'
interface Watched {
  id: number
  symbol: string
  broker: string
}
function readList(): Watched[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as Watched[]
  } catch {
    return []
  }
}
const watchlist = ref<Watched[]>(readList())
watch(
  watchlist,
  (w) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(w))
    } catch {
      /* private window */
    }
    connect(w.map((x) => x.id))
  },
  { deep: true },
)
onMounted(() => connect(watchlist.value.map((x) => x.id)))

const query = ref('')
const results = ref<Instrument[]>([])
const searching = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
watch(query, (q) => {
  clearTimeout(timer)
  if (q.trim().length < 2) {
    results.value = []
    return
  }
  timer = setTimeout(async () => {
    searching.value = true
    try {
      const r = must(
        await aureon.GET('/api/trading/instruments', {
          params: { query: { q: q.trim(), limit: 10 } },
        }),
      )
      results.value = r.items
    } catch {
      results.value = []
    } finally {
      searching.value = false
    }
  }, 300)
})
function add(i: Instrument) {
  if (!watchlist.value.some((w) => w.id === i.id))
    watchlist.value.push({ id: i.id, symbol: i.symbol, broker: i.broker })
  selected.value = i.id
  query.value = ''
}
function remove(id: number) {
  watchlist.value = watchlist.value.filter((w) => w.id !== id)
  if (selected.value === id) selected.value = watchlist.value[0]?.id ?? 0
}

const selected = ref<number>(watchlist.value[0]?.id ?? 0)
const timeframe = ref('15m')
const TFS = ['1m', '5m', '15m', '1h', '1d'].map((t) => ({ value: t, label: t }))

const candles = useLoad(async () => {
  if (!selected.value) return []
  return must(
    await aureon.GET('/api/trading/candles', {
      params: {
        query: {
          instrument_id: selected.value,
          timeframe: timeframe.value as '15m',
          limit: 200,
        },
      },
    }),
  )
}, false)
const indicators = useLoad(async () => {
  if (!selected.value) return []
  return must(
    await aureon.GET('/api/trading/indicators', {
      params: {
        query: { instrument_id: selected.value, timeframe: timeframe.value as '15m', limit: 500 },
      },
    }),
  )
}, false)
watch(
  [selected, timeframe],
  () => {
    void candles.reload()
    void indicators.reload()
  },
  { immediate: true },
)

const realCandles = computed(() => (candles.data.value ?? []).filter((c) => !c.is_gap))
const lines = computed(() => {
  const rows = indicators.data.value ?? []
  const emas = [...new Set(rows.map((r) => r.name).filter((n) => n.startsWith('ema:')))].sort(
    (a, b) => Number(a.slice(4)) - Number(b.slice(4)),
  )
  return emas.slice(0, 2).map((name) => ({
    name: `EMA ${name.slice(4)}`,
    points: rows
      .filter((r) => r.name === name)
      .map((r) => ({ ts: r.ts, value: (r.values.value as string | null) ?? null })),
  }))
})
const latest = computed(() => {
  const byName = new Map<string, Record<string, unknown>>()
  for (const r of indicators.data.value ?? []) if (!byName.has(r.name)) byName.set(r.name, r.values)
  const v = (name: string, key = 'value') => {
    const hit = [...byName.entries()].find(([n]) => n.startsWith(name))
    return hit ? String(hit[1][key] ?? '—') : '—'
  }
  return [
    {
      label: 'MACD',
      value: dec(v('macd:', 'macd'), 4),
      note: `signal ${dec(v('macd:', 'signal'), 4)}`,
    },
    { label: 'ATR', value: dec(v('atr:'), 4) },
    { label: 'VWAP', value: dec(v('vwap:'), 4) },
    { label: 'Structure', value: v('structure:', 'trend') },
  ]
})
const quote = computed(() => (selected.value ? live.quotes[selected.value] : undefined))
const current = computed(() => watchlist.value.find((w) => w.id === selected.value))
</script>

<template>
  <div class="tp-page">
    <div class="tp-grid tm">
      <Card title="Watchlist">
        <TextInput
          v-model="query"
          type="search"
          size="sm"
          placeholder="Search instruments (2+ letters)"
          aria-label="Search instruments"
        />
        <ul v-if="results.length" class="tp-list" aria-label="Search results">
          <li v-for="r in results" :key="r.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ r.symbol }}</span>
              <span class="tp-note"
                >{{ r.broker.toUpperCase() }} · {{ r.instrument_type }} ·
                {{ r.exchange || r.segment || '' }}</span
              >
            </div>
            <Button size="sm" variant="secondary" @click="add(r)">Add</Button>
          </li>
        </ul>
        <p v-else-if="searching" class="tp-note">Searching…</p>
        <ul v-if="watchlist.length" class="tp-list">
          <li v-for="w in watchlist" :key="w.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ w.symbol }}</span>
              <span class="tp-note">
                {{ w.broker.toUpperCase() }}
                <template v-if="live.quotes[w.id]">
                  · {{ dec(live.quotes[w.id].ltp) }}
                  {{ live.quotes[w.id].stale ? '(stale)' : '' }}
                </template>
              </span>
            </div>
            <div class="tp-row">
              <Button
                size="sm"
                :variant="selected === w.id ? 'tinted' : 'ghost'"
                @click="selected = w.id"
              >
                Chart
              </Button>
              <Button
                size="sm"
                variant="ghost"
                :aria-label="`Remove ${w.symbol}`"
                @click="remove(w.id)"
              >
                Remove
              </Button>
            </div>
          </li>
        </ul>
        <EmptyState
          v-else
          title="Your watchlist is empty"
          description="Search the instrument master above and add what you follow. The list stays on this device."
        />
      </Card>

      <Card class="tm__chart">
        <template #header>
          <div class="tp-head">
            <span class="tp-title">{{ current?.symbol ?? 'Chart' }}</span>
            <div class="tp-row">
              <SegmentedControl
                v-model="timeframe"
                :options="TFS"
                size="sm"
                aria-label="Timeframe"
              />
              <SourceTag source="broker" />
            </div>
          </div>
        </template>
        <EmptyState
          v-if="!selected"
          title="Pick an instrument to chart"
          description="Charts use the candles the market-data agent stored."
        />
        <template v-else>
          <p v-if="quote" class="tp-note">
            Live {{ dec(quote.ltp) }} · {{ ago(quote.received_at) }}
            {{ quote.stale ? '· feed stale' : '' }} (broker-reported)
          </p>
          <p v-if="candles.error.value" class="tp-note" role="alert">{{ candles.error.value }}</p>
          <CandleChart v-else-if="realCandles.length" :candles="realCandles" :lines="lines" />
          <EmptyState
            v-else-if="!candles.loading.value"
            title="No candles stored for this timeframe"
            description="The market-data agent fills them for instruments a strategy version watches, or the Dhan backfill job does."
          />
          <div class="tp-head">
            <span class="tp-note">Indicators (latest closed candle)</span>
            <SourceTag source="calculated" />
          </div>
          <StatRow :stats="latest" />
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.tm {
  grid-template-columns: minmax(min(100%, 300px), 1fr) minmax(0, 2.4fr);
}
@media (max-width: 900px) {
  .tm {
    grid-template-columns: minmax(0, 1fr);
  }
}
.tm__chart {
  min-width: 0;
}
</style>
