<script setup lang="ts">
// Market-data health, check by check (src/trading/marketHealth.ts). Compact on
// the Explorer (one line of badges, details on demand), full on the Overview.
// Whatever the backend cannot report reads "Not reported", never OK, and a
// Dhan login never stands in for market-data readiness. Read-only.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import { aureon } from '@/api/client'
import { useNow } from '@/control/poll'
import { LEVEL_LABEL, LEVEL_TONE } from '@/trading/dhanHealth'
import { DOC, marketChecks, type MarketCheck } from '@/trading/marketHealth'
import { must, useLoad } from '@/trading/useLoad'

const props = withDefaults(
  defineProps<{
    compact?: boolean
    /** An instrument whose stored daily candles stand in for "historical candles". */
    probe?: { id: number; symbol: string } | null
  }>(),
  { compact: false, probe: null },
)

const now = useNow(30_000)

const session = useLoad(async () => must(await aureon.GET('/api/v1/dhan/auth/status')))
const feed = useLoad(async () => must(await aureon.GET('/api/v1/dhan/feed/health')))
const master = useLoad(async () =>
  must(
    await aureon.GET('/api/trading/instruments', {
      params: { query: { broker: 'dhan', limit: 1, offset: 0 } },
    }),
  ),
)
const agents = useLoad(async () => must(await aureon.GET('/api/trading/agents')))
const candles = useLoad(async () => {
  const p = props.probe
  if (!p) return null
  const rows = must(
    await aureon.GET('/api/trading/candles', {
      params: { query: { instrument_id: p.id, timeframe: '1d', limit: 1 } },
    }),
  )
  const real = rows.filter((r) => !r.is_gap)
  return { symbol: p.symbol, count: real.length, newest: real.at(-1)?.ts ?? null }
}, false)
watch(
  () => props.probe?.id,
  () => void candles.reload(),
  { immediate: true },
)

function refresh() {
  void session.reload()
  void feed.reload()
  void master.reload()
  void agents.reload()
  void candles.reload()
}

const loading = computed(
  () => session.loading.value || feed.loading.value || master.loading.value || agents.loading.value,
)

const checks = computed(() =>
  marketChecks({
    session: (session.data.value as Parameters<typeof marketChecks>[0]['session']) ?? null,
    sessionError: session.error.value,
    feed: feed.data.value ?? null,
    feedError: feed.error.value,
    masterTotal: typeof master.data.value?.total === 'number' ? master.data.value.total : null,
    masterError: master.error.value,
    candles: candles.data.value ?? null,
    candlesError: candles.error.value,
    agents: Array.isArray(agents.data.value) ? agents.data.value : null,
    agentsError: agents.error.value,
    now: now.value,
  }),
)

const badgeOf = (c: MarketCheck) => c.badge ?? LEVEL_LABEL[c.level]
const unknownCount = computed(() => checks.value.filter((c) => c.level === 'unknown').length)
const open = ref(false)
</script>

<template>
  <section v-if="compact" class="mh mh--compact" aria-label="Market-data health">
    <div class="mh__strip">
      <span class="mh__title">Market data</span>
      <ul class="mh__chips">
        <li v-for="c in checks" :key="c.key" class="mh__chip" :title="c.text">
          <span class="mh__chip-label">{{ c.label }}</span>
          <Badge :tone="LEVEL_TONE[c.level]" :label="badgeOf(c)" />
        </li>
      </ul>
      <Button
        size="sm"
        variant="ghost"
        :aria-expanded="open ? 'true' : 'false'"
        @click="open = !open"
      >
        {{ open ? 'Hide details' : 'Details' }}
      </Button>
    </div>
    <ul v-if="open" class="tp-list mh__details">
      <li v-for="c in checks" :key="c.key" class="tp-item">
        <div class="tp-main">
          <span class="tp-strong">{{ c.label }}</span>
          <span class="tp-note">{{ c.text }}</span>
        </div>
        <Badge :tone="LEVEL_TONE[c.level]" :label="badgeOf(c)" />
      </li>
    </ul>
  </section>

  <Card v-else>
    <template #header>
      <div class="tp-head">
        <span class="tp-title">Market-data health</span>
        <Button size="sm" variant="ghost" :loading="loading" @click="refresh">Refresh</Button>
      </div>
    </template>
    <p class="tp-note">
      Each check stands alone. "Not reported" means the backend cannot say yet ({{ DOC }} §7) — it
      is not OK. A Dhan login is not market-data readiness.
      <template v-if="unknownCount"
        >{{ unknownCount }} of {{ checks.length }} not reported.</template
      >
    </p>
    <ul class="tp-list" aria-label="Market-data checks">
      <li v-for="c in checks" :key="c.key" class="tp-item" :data-check="c.key">
        <div class="tp-main">
          <span class="tp-strong">{{ c.label }}</span>
          <span class="tp-note">{{ c.text }}</span>
        </div>
        <Badge :tone="LEVEL_TONE[c.level]" :label="badgeOf(c)" />
      </li>
    </ul>
  </Card>
</template>

<style scoped>
.mh {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  background: var(--glass-bg);
}
.mh__strip {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.mh__title {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.mh__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1) var(--sp-3);
  flex: 1 1 0;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.mh__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  cursor: help;
}
.mh__chip-label {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
  white-space: nowrap;
}
.mh__details {
  border-top: 1px solid var(--glass-border);
  padding-top: var(--sp-1);
}
</style>
