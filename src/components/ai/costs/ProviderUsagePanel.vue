<script setup lang="ts">
// Spend and calls per AI provider (backend docs/26-ai-providers.md), only as the server
// counted them:
//
//   today   GET /api/ai/usage?provider=   each external provider's spend against its own
//                                         cap, and the total against the shared cap
//   window  GET /api/v1/ai/usage?days=    admin: per provider over the range — calls that
//                                         succeeded and failed, local fallbacks, turns kept
//                                         local by the data filter, tokens, cost, latency;
//                                         and today's reserved spend per provider
//
// A counter the server could not read shows as "unavailable", never as 0. Claude and
// Gemini cost is the operator's configured price × tokens; OpenRouter's is what it billed.
import { computed } from 'vue'
import Card from '@/components/ui/Card.vue'
import {
  num,
  providerName,
  rollupByProvider,
  usd,
  type ProviderSpend,
  type ProviderUsage,
  type TodayUsage,
} from '@/ai/costs'

const props = defineProps<{
  /** Today per external provider (every signed-in user). */
  today: TodayUsage[]
  /** The admin's window, or null for everyone else. */
  usage: ProviderUsage | null
  days: number
}>()

const spend = computed(() => {
  const by = new Map<string, ProviderSpend>()
  for (const p of props.usage?.providers ?? []) by.set(p.provider, p)
  return by
})

const rows = computed(() =>
  props.today.map((t) => {
    const s = spend.value.get(t.provider)
    const limit = num(t.limit_usd)
    return {
      provider: t.provider,
      name: providerName(t.provider),
      available: t.available,
      spent: t.available ? usd(t.spent_usd) : 'unavailable',
      limit: limit > 0 ? usd(t.limit_usd) : 'no budget — stays local',
      pct:
        t.available && limit > 0 ? Math.min(100, Math.round((num(t.spent_usd) / limit) * 100)) : 0,
      capReached: t.cap_reached,
      calls: t.calls,
      failures: t.failures,
      tokens: t.prompt_tokens + t.completion_tokens,
      reserved: s ? (s.reserved_usd == null ? 'unavailable' : usd(s.reserved_usd)) : null,
    }
  }),
)

/** The shared cap across providers: admin figure first, else what /api/ai/usage said. */
const global = computed(() => {
  const limit =
    props.usage?.global_limit_usd ??
    props.today.find((t) => t.global_limit_usd != null)?.global_limit_usd
  const spent =
    props.usage?.global_spent_today_usd ??
    props.today.find((t) => t.global_spent_usd != null)?.global_spent_usd
  return {
    limit: limit == null ? null : usd(limit),
    spent: spent == null ? null : usd(spent),
  }
})

const windowRows = computed(() => (props.usage ? rollupByProvider(props.usage.items) : []))
const tok = (n: number) => n.toLocaleString('en-US')
</script>

<template>
  <Card title="By provider" data-testid="provider-usage">
    <p class="tp-note" data-testid="global-cap">
      All external providers today:
      <template v-if="global.spent">{{ global.spent }}</template>
      <template v-else>spend unavailable</template>
      <template v-if="global.limit"> of the shared {{ global.limit }} cap</template>
      <template v-else> · no shared cap (each provider’s own cap applies)</template>
    </p>

    <ul v-if="rows.length" class="pu__list">
      <li v-for="r in rows" :key="r.provider" class="pu__row" :data-provider="r.provider">
        <span class="tp-strong">{{ r.name }}</span>
        <div
          class="pu__bar"
          role="meter"
          :aria-label="`${r.name} spend today`"
          :aria-valuenow="r.pct"
          aria-valuemin="0"
          aria-valuemax="100"
          :class="{ 'is-full': r.capReached }"
        >
          <span class="pu__fill" :style="{ width: r.pct + '%' }" />
        </div>
        <span class="tp-note">
          {{ r.spent }} of {{ r.limit }}
          <template v-if="r.reserved !== null"> · reserved {{ r.reserved }}</template>
          · {{ r.calls }} calls · {{ r.failures }} failed · {{ tok(r.tokens) }} tokens
          <template v-if="r.capReached"> · cap reached, replies stay local</template>
          <template v-if="!r.available"> · counter unreadable, replies stay local</template>
        </span>
      </li>
    </ul>
    <p v-else class="tp-note">No external provider reported today’s usage.</p>

    <template v-if="usage">
      <h3 class="pu__h3">Last {{ days }} day{{ days === 1 ? '' : 's' }}</h3>
      <div v-if="windowRows.length" class="pu__scroll">
        <table class="pu__table" data-testid="provider-window">
          <thead>
            <tr>
              <th scope="col">Provider</th>
              <th scope="col">Succeeded</th>
              <th scope="col">Failed</th>
              <th scope="col">Fell back</th>
              <th scope="col">Kept local</th>
              <th scope="col">Tokens in / out</th>
              <th scope="col">Cost</th>
              <th scope="col">Avg latency</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="w in windowRows" :key="w.provider" :data-provider="w.provider">
              <td>{{ providerName(w.provider) }}</td>
              <td class="tp-num">{{ w.succeeded }}</td>
              <td class="tp-num">{{ w.failed }}</td>
              <td class="tp-num">{{ w.fallbacks }}</td>
              <td class="tp-num">{{ w.localOnly }}</td>
              <td class="tp-num">{{ tok(w.promptTokens) }} / {{ tok(w.completionTokens) }}</td>
              <td class="tp-num">{{ usd(w.costUsd) }}</td>
              <td class="tp-num">
                {{ w.avgLatencyMs == null ? '—' : `${(w.avgLatencyMs / 1000).toFixed(1)} s` }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="tp-note">No model calls in this range.</p>
      <p class="tp-note">
        “Fell back” is an external call answered by the local model instead; “kept local” is a turn
        the server’s privacy filter never sent out.
      </p>
    </template>
  </Card>
</template>

<style scoped>
.pu__list {
  display: grid;
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.pu__row {
  display: grid;
  grid-template-columns: minmax(0, 8rem) minmax(4rem, 8rem) minmax(0, 1fr);
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
@media (max-width: 640px) {
  .pu__row {
    grid-template-columns: minmax(0, 1fr) minmax(4rem, 8rem);
  }
  .pu__row > .tp-note {
    grid-column: 1 / -1;
  }
}
.pu__bar {
  position: relative;
  height: 6px;
  border-radius: var(--radius-pill);
  overflow: hidden;
  background: color-mix(in oklch, var(--text-secondary) 20%, transparent);
}
.pu__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--theme-accent);
}
.pu__bar.is-full .pu__fill {
  background: var(--theme-danger);
}
.pu__h3 {
  margin: var(--sp-3) 0 var(--sp-1);
  font-size: var(--text-sm);
}
.pu__scroll {
  overflow-x: auto;
  min-width: 0;
}
.pu__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-xs);
}
.pu__table th,
.pu__table td {
  padding: 4px var(--sp-2);
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid var(--glass-border);
}
.pu__table th {
  color: var(--text-secondary);
  font-weight: var(--weight-semibold);
}
</style>
