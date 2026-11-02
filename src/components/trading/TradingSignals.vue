<script setup lang="ts">
// Signals from the versioned strategies, newest first, with the local AI's
// explanation on demand. The explanation is text only; it cannot create or
// approve anything. "Send to paper" turns a signal into a PAPER order intent,
// risk-checked on the server and filled (simulated) only after admin approval.
import { computed, reactive, ref, watch } from 'vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Pagination from '@/components/ui/Pagination.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import ApprovalControls from './ApprovalControls.vue'
import SourceTag from './SourceTag.vue'
import { aureon } from '@/api/client'
import { dec, when } from '@/trading/format'
import { live } from '@/trading/stream'
import { must, useLoad } from '@/trading/useLoad'
import type { components } from '@/api/client'
import type { Account } from './types'

defineProps<{ accounts: Account[] }>()

type Analysis = components['schemas']['AiAnalysisOut']
const PAGE = 25
const page = ref(1)
const side = ref('ALL')
const SIDES = ['ALL', 'BUY', 'SELL', 'NO_TRADE'].map((v) => ({
  value: v,
  label: v === 'NO_TRADE' ? 'No trade' : v === 'ALL' ? 'All' : v,
}))

const list = useLoad(async () =>
  must(
    await aureon.GET('/api/trading/signals', {
      params: {
        query: {
          limit: PAGE,
          offset: (page.value - 1) * PAGE,
          ...(side.value !== 'ALL' ? { side: side.value as 'BUY' } : {}),
        },
      },
    }),
  ),
)
watch([page, side], () => void list.reload())
watch(side, () => (page.value = 1))

const rows = computed(() => {
  const fresh =
    page.value === 1
      ? live.signals.filter((s) => side.value === 'ALL' || s.side === side.value)
      : []
  const seen = new Set<string>()
  return [...fresh, ...(list.data.value?.items ?? [])].filter(
    (s) => !seen.has(s.id) && seen.add(s.id),
  )
})

const open = reactive<Record<string, Analysis[] | 'loading' | string>>({})
const queued = reactive<Record<string, string>>({})

async function showAnalyses(id: string) {
  open[id] = 'loading'
  try {
    open[id] = must(
      await aureon.GET('/api/trading/ai-analyses', { params: { query: { signal_id: id } } }),
    )
  } catch (e) {
    open[id] = (e as Error).message
  }
}
async function explain(id: string) {
  queued[id] = 'Queuing…'
  try {
    const r = must(
      await aureon.POST('/api/trading/signals/{signal_id}/explain', {
        params: { path: { signal_id: id } },
      }),
    )
    queued[id] =
      `Queued (position ${r.position}). The local model answers in a minute or two — refresh the explanation then.`
  } catch (e) {
    queued[id] = (e as Error).message
  }
}

function inputsOf(s: object): string {
  return 'inputs' in s ? inputsLine(s.inputs as Record<string, unknown>) : ''
}
function analysesOf(id: string): Analysis[] {
  const v = open[id]
  return Array.isArray(v) ? v : []
}
function inputsLine(inputs: Record<string, unknown> | undefined): string {
  if (!inputs) return ''
  const parts: string[] = []
  for (const k of ['close', 'ema_fast', 'ema_slow', 'code_ref', 'version']) {
    if (inputs[k] !== undefined && inputs[k] !== null)
      parts.push(
        `${k} ${typeof inputs[k] === 'string' ? dec(inputs[k] as string, 4) : String(inputs[k])}`,
      )
  }
  return parts.join(' · ')
}
</script>

<template>
  <div class="tp-page">
    <Card>
      <template #header>
        <div class="tp-head">
          <span class="tp-title">Signals</span>
          <div class="tp-row">
            <SegmentedControl v-model="side" :options="SIDES" size="sm" aria-label="Side" />
            <SourceTag source="calculated" />
          </div>
        </div>
      </template>
      <Alert v-if="list.error.value" tone="warning">{{ list.error.value }}</Alert>
      <ul v-if="rows.length" class="tp-list">
        <li v-for="s in rows" :key="s.id" class="tp-item sig">
          <div class="tp-main">
            <span class="tp-strong">
              {{ s.side === 'NO_TRADE' ? 'No trade' : s.side }} · instrument {{ s.instrument_id }} ·
              {{ s.timeframe }}
            </span>
            <span class="tp-note">
              Candle {{ when(s.candle_time) }} · {{ s.session }}
              <template v-if="inputsOf(s)"> · {{ inputsOf(s) }}</template>
            </span>
            <span v-if="queued[s.id]" class="tp-note" role="status">{{ queued[s.id] }}</span>
            <div v-if="open[s.id]" class="sig__ai">
              <p v-if="open[s.id] === 'loading'" class="tp-note">Loading explanations…</p>
              <p v-else-if="typeof open[s.id] === 'string'" class="tp-note" role="alert">
                {{ open[s.id] }}
              </p>
              <template v-else>
                <p v-if="!analysesOf(s.id).length" class="tp-note">
                  No explanation yet. Ask the local AI for one.
                </p>
                <article v-for="a in analysesOf(s.id)" :key="a.id" class="sig__analysis">
                  <span class="tp-strong">{{ a.summary }}</span>
                  <p class="tp-note">{{ a.content }}</p>
                  <span class="tp-note"
                    >{{ a.model }} · {{ when(a.created_at) }} · explanation only, not advice</span
                  >
                </article>
              </template>
            </div>
          </div>
          <div class="sig__actions">
            <div class="tp-row">
              <Button size="sm" variant="ghost" @click="showAnalyses(s.id)">Explanations</Button>
              <Button size="sm" variant="secondary" @click="explain(s.id)">Explain with AI</Button>
            </div>
            <ApprovalControls v-if="s.side !== 'NO_TRADE'" :signal="s" :accounts="accounts" />
          </div>
        </li>
      </ul>
      <EmptyState
        v-else-if="!list.loading.value"
        title="No signals match"
        description="Signals appear when an active strategy version watches an instrument and timeframe (Strategies & backtests)."
      />
      <Pagination
        v-if="(list.data.value?.total ?? 0) > PAGE"
        v-model:page="page"
        :page-count="Math.ceil((list.data.value?.total ?? 0) / PAGE)"
      />
    </Card>
  </div>
</template>

<style scoped>
.sig {
  align-items: flex-start;
}
.sig__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--sp-1);
  min-width: 0;
}
.sig__ai {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding-top: var(--sp-1);
  min-width: 0;
}
.sig__analysis {
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: pre-wrap;
  min-width: 0;
}
</style>
