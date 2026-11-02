<script setup lang="ts">
// Overview: who is running, what was signalled, what the risk agent said, and
// whether the MT5 bot is fresh — with the live feed folding new rows in.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatRow from '@/components/ui/StatRow.vue'
import ModeBadge from './ModeBadge.vue'
import SourceTag from './SourceTag.vue'
import { aureon } from '@/api/client'
import { ago, when } from '@/trading/format'
import { live } from '@/trading/stream'
import { must, useLoad } from '@/trading/useLoad'
import type { Account } from './types'

defineProps<{ accounts: Account[] }>()

const agents = useLoad(async () => must(await aureon.GET('/api/trading/agents')))
const signals = useLoad(async () =>
  must(await aureon.GET('/api/trading/signals', { params: { query: { limit: 10 } } })),
)
const risks = useLoad(async () =>
  must(await aureon.GET('/api/trading/risk-decisions', { params: { query: { limit: 10 } } })),
)
const mt5 = useLoad(async () => must(await aureon.GET('/api/trading/mt5/status')))

const agentRows = computed(() =>
  (agents.data.value ?? []).map((a) => ({ ...a, state: live.agents[a.id]?.state ?? a.state })),
)
const recentSignals = computed(() => {
  const seen = new Set<string>()
  return [...live.signals, ...(signals.data.value?.items ?? [])]
    .filter((s) => s.side !== 'NO_TRADE' && !seen.has(s.id) && seen.add(s.id))
    .slice(0, 8)
})
const recentRisks = computed(() => {
  const seen = new Set<number>()
  return [...live.risks, ...(risks.data.value?.items ?? [])]
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    .slice(0, 8)
})

function stateTone(s: string) {
  return s === 'idle' || s === 'busy'
    ? 'success'
    : s === 'paused'
      ? 'neutral'
      : s === 'stale'
        ? 'warning'
        : 'danger'
}
</script>

<template>
  <div class="tp-page">
    <div class="tp-grid">
      <Card title="Accounts">
        <ul v-if="accounts.length" class="tp-list">
          <li v-for="a in accounts" :key="a.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ a.label || a.account_id }}</span>
              <span class="tp-note">{{ a.broker.toUpperCase() }} · {{ a.base_currency }}</span>
            </div>
            <ModeBadge :mode="a.mode" />
          </li>
        </ul>
        <EmptyState
          v-else
          title="No broker accounts yet"
          description="An admin registers Dhan and MT5 accounts on the server (POST /api/trading/accounts). Until then everything here is market data only."
        />
      </Card>

      <Card title="MT5 bot">
        <p v-if="mt5.loading.value" class="tp-note">Reading the bot's export…</p>
        <EmptyState
          v-else-if="mt5.unsupported.value"
          title="The MT5 bot is not connected"
          description="Set MT5_STATUS_URL or MT5_STATUS_FILE on the server to watch the bot."
        />
        <p v-else-if="mt5.error.value" class="tp-note" role="alert">{{ mt5.error.value }}</p>
        <template v-else-if="mt5.data.value">
          <div class="tp-row">
            <Badge
              :tone="mt5.data.value.ok ? 'success' : 'warning'"
              :label="mt5.data.value.ok ? 'Healthy' : 'Needs attention'"
            />
            <SourceTag source="broker" />
          </div>
          <p class="tp-note">
            {{ mt5.data.value.detail || 'Export fresh and every symbol connected to MT5.' }}
          </p>
          <StatRow
            :stats="[
              { label: 'Export age', value: `${mt5.data.value.age_s} s` },
              { label: 'Symbols', value: String(Object.keys(mt5.data.value.agents).length) },
              { label: 'Mode', value: String(mt5.data.value.bot.mode ?? '—') },
            ]"
          />
        </template>
      </Card>

      <Card title="Agents">
        <ul v-if="agentRows.length" class="tp-list">
          <li v-for="a in agentRows" :key="a.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ a.name }}</span>
              <span class="tp-note">heartbeat {{ ago(a.last_heartbeat_at) }}</span>
            </div>
            <Badge :tone="stateTone(a.state)" :label="a.state" />
          </li>
        </ul>
        <EmptyState
          v-else-if="!agents.loading.value"
          title="No trading agents have reported yet"
          description="They appear once the scheduler, the Dhan feed, the MT5 sync or the research worker start."
        />
      </Card>
    </div>

    <div class="tp-grid">
      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Latest signals</span>
            <SourceTag source="calculated" />
          </div>
        </template>
        <ul v-if="recentSignals.length" class="tp-list">
          <li v-for="s in recentSignals" :key="s.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ s.side }} · instrument {{ s.instrument_id }}</span>
              <span class="tp-note"
                >{{ s.timeframe }} · {{ s.session }} · {{ when(s.candle_time) }}</span
              >
            </div>
          </li>
        </ul>
        <EmptyState
          v-else
          title="No BUY or SELL signals yet"
          description="Signals appear when a strategy version watches an instrument and its rule fires on a closed candle."
        />
      </Card>

      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Risk decisions</span>
            <SourceTag source="calculated" />
          </div>
        </template>
        <ul v-if="recentRisks.length" class="tp-list">
          <li v-for="r in recentRisks" :key="r.id" class="tp-item">
            <div class="tp-main">
              <span class="tp-strong">{{ r.reason }}</span>
              <span class="tp-note">{{ when(r.created_at) }}</span>
            </div>
            <Badge
              :tone="r.approved ? 'success' : 'danger'"
              :label="r.approved ? 'Approved' : 'Rejected'"
            />
          </li>
        </ul>
        <EmptyState
          v-else
          title="No risk decisions yet"
          description="Each BUY or SELL signal is checked against every active account's risk policy. An approval creates nothing on its own."
        />
      </Card>
    </div>
  </div>
</template>
