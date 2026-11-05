<script setup lang="ts">
// Actual usage — what OpenRouter reported as billed for each reply, summed by the
// server from its message table. Never an estimate: the estimator is a separate card,
// and says so.
import { computed, ref } from 'vue'
import Card from '@/components/ui/Card.vue'
import { dailySeries, num, providerName, usd, type UsageHistory } from '@/ai/costs'

const props = defineProps<{ history: UsageHistory }>()

const series = computed(() => dailySeries(props.history))
const max = computed(() => Math.max(0, ...series.value.map((d) => d.cost)))
const total = computed(() => series.value.reduce((s, d) => s + d.cost, 0))
const calls = computed(() => series.value.reduce((s, d) => s + d.calls, 0))
const hover = ref<number | null>(null)
const shown = computed(() => (hover.value == null ? null : series.value[hover.value]))

const tokens = (r: { prompt_tokens: number; completion_tokens: number }) =>
  (r.prompt_tokens + r.completion_tokens).toLocaleString()
const byProvider = computed(() =>
  [...props.history.by_provider].sort((a, b) => num(b.cost_usd) - num(a.cost_usd)),
)
const providerMax = computed(() => Math.max(0, ...byProvider.value.map((p) => num(p.cost_usd))))
const byModel = computed(() =>
  [...props.history.by_model].sort((a, b) => num(b.cost_usd) - num(a.cost_usd)),
)
const byAgent = computed(() =>
  [...props.history.by_agent].sort((a, b) => num(b.cost_usd) - num(a.cost_usd)),
)
const agentName = (a: string) => (a.startsWith('chat:') ? `Chat (${a.slice(5)})` : a)
const short = (day: string) => day.slice(5)
</script>

<template>
  <div class="up">
    <div class="up__tiles">
      <div class="up__tile">
        <span class="tp-note">Today</span>
        <span class="up__big tp-num">{{ usd(history.today.cost_usd) }}</span>
        <span class="tp-note"
          >{{ history.today.calls }} calls · {{ tokens(history.today) }} tokens</span
        >
      </div>
      <div class="up__tile">
        <span class="tp-note">{{ history.month.month }}</span>
        <span class="up__big tp-num">{{ usd(history.month.cost_usd) }}</span>
        <span class="tp-note"
          >{{ history.month.calls }} calls · {{ tokens(history.month) }} tokens</span
        >
      </div>
      <div class="up__tile">
        <span class="tp-note">{{ history.from }} → {{ history.to }}</span>
        <span class="up__big tp-num">{{ usd(total) }}</span>
        <span class="tp-note">{{ calls }} calls</span>
      </div>
    </div>

    <Card title="Daily spend (billed)">
      <div v-if="max > 0" class="up__chart-wrap">
        <p class="up__readout tp-note" aria-live="polite">
          <template v-if="shown"
            >{{ shown.day }} · {{ usd(shown.cost) }} · {{ shown.calls }} calls</template
          >
          <template v-else>Peak {{ usd(max) }} a day. Hover or tap a bar for the day.</template>
        </p>
        <div class="up__chart" role="list" aria-label="Spend per day" data-testid="daily-chart">
          <button
            v-for="(d, i) in series"
            :key="d.day"
            type="button"
            role="listitem"
            class="up__col"
            :class="{ 'is-on': hover === i }"
            :aria-label="`${d.day}: ${usd(d.cost)}, ${d.calls} calls`"
            @mouseenter="hover = i"
            @mouseleave="hover = null"
            @focus="hover = i"
            @blur="hover = null"
            @click="hover = hover === i ? null : i"
          >
            <span
              class="up__bar"
              :style="{ height: `${d.cost > 0 ? Math.max(3, (d.cost / max) * 100) : 0}%` }"
            />
          </button>
        </div>
        <div class="up__axis tp-note" aria-hidden="true">
          <span>{{ short(history.from) }}</span>
          <span>{{ short(history.to) }}</span>
        </div>
      </div>
      <p v-else class="tp-note">No billed usage in this range. Local replies cost nothing.</p>
    </Card>

    <div class="up__grid">
      <Card title="By provider">
        <ul v-if="byProvider.length" class="up__list">
          <li v-for="p in byProvider" :key="p.provider" class="up__li">
            <div class="up__lihead">
              <span class="tp-strong">{{ providerName(p.provider) }}</span>
              <span class="tp-num">{{ usd(p.cost_usd) }}</span>
            </div>
            <div class="up__hbar">
              <span
                :style="{
                  width: `${providerMax > 0 ? (num(p.cost_usd) / providerMax) * 100 : 0}%`,
                }"
              />
            </div>
            <span class="tp-note">{{ p.calls }} calls · {{ tokens(p) }} tokens</span>
          </li>
        </ul>
        <p v-else class="tp-note">No replies in this range.</p>
      </Card>

      <Card title="By agent">
        <table v-if="byAgent.length" class="up__table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Calls</th>
              <th>Tokens</th>
              <th>Billed</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in byAgent" :key="a.agent">
              <td>{{ agentName(a.agent) }}</td>
              <td class="tp-num">{{ a.calls }}</td>
              <td class="tp-num">{{ tokens(a) }}</td>
              <td class="tp-num">{{ usd(a.cost_usd) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="tp-note">No agent reported token use in this range.</p>
      </Card>
    </div>

    <Card title="By model">
      <div v-if="byModel.length" class="up__scroll">
        <table class="up__table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Provider</th>
              <th>Calls</th>
              <th>In</th>
              <th>Out</th>
              <th>Billed</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in byModel" :key="`${m.provider}|${m.model}`">
              <td class="up__model">{{ m.model }}</td>
              <td>{{ providerName(m.provider) }}</td>
              <td class="tp-num">{{ m.calls }}</td>
              <td class="tp-num">{{ m.prompt_tokens.toLocaleString() }}</td>
              <td class="tp-num">{{ m.completion_tokens.toLocaleString() }}</td>
              <td class="tp-num">{{ usd(m.cost_usd) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="tp-note">No replies in this range.</p>
    </Card>
  </div>
</template>

<style scoped>
.up {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.up__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--sp-3);
}
.up__tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border, var(--theme-border));
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg, transparent);
}
.up__big {
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.up__chart-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.up__readout {
  margin: 0;
  min-height: 1.4em;
}
.up__chart {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 140px;
  min-width: 0;
  border-bottom: 1px solid var(--theme-border);
}
.up__col {
  flex: 1 1 0;
  display: flex;
  align-items: flex-end;
  height: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.up__bar {
  width: 100%;
  border-radius: 4px 4px 0 0;
  background: var(--theme-accent);
  opacity: 0.8;
}
.up__col.is-on .up__bar {
  opacity: 1;
}
.up__col:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.up__axis {
  display: flex;
  justify-content: space-between;
}
.up__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--sp-3);
}
.up__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
.up__li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.up__lihead {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-2);
}
.up__hbar {
  height: 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--text-secondary) 15%, transparent);
  overflow: hidden;
}
.up__hbar > span {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--theme-accent);
}
.up__scroll {
  overflow-x: auto;
  min-width: 0;
}
.up__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-xs);
}
.up__table th,
.up__table td {
  padding: 6px var(--sp-2);
  text-align: left;
  border-bottom: 1px solid var(--theme-border);
  white-space: nowrap;
}
.up__table th {
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
}
.up__model {
  min-width: 0;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
