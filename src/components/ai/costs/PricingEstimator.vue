<script setup lang="ts">
// Provider and model comparison, and the estimator — both from the server's versioned
// pricing catalog. Prices change: the version and when it was fetched are always on
// screen, an older version can be picked to compare, and every number here is labelled
// an estimate (the billed numbers are the usage cards above).
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { VENDORS } from '@/ai/providers'
import {
  compare,
  perM,
  usd,
  type EstimateInput,
  type PricingCatalog,
  type PricingVersion,
} from '@/ai/costs'
import { ago } from '@/trading/format'

const props = defineProps<{
  catalog: PricingCatalog
  versions: PricingVersion[]
  admin: boolean
  refreshing: boolean
  /** The last N days' workload, per call, to seed the estimator (null = no usage yet). */
  observed: EstimateInput | null
}>()
const emit = defineEmits<{ version: [v: string]; refresh: [] }>()

const w = ref<EstimateInput>({
  jobsPerMonth: 300,
  callsPerJob: 3,
  inputTokens: 2000,
  outputTokens: 500,
})
const asText = (n: number) => String(n)
function setField(k: keyof EstimateInput, v: string | number) {
  const n = Number(v)
  w.value = { ...w.value, [k]: Number.isFinite(n) && n >= 0 ? n : 0 }
}
function useObserved() {
  if (props.observed) w.value = { ...props.observed }
}

const vendor = ref('all')
const vendorOptions = computed(() => {
  const present = new Set(props.catalog.models.map((m) => m.vendor))
  return [
    { value: 'all', label: 'All providers' },
    ...(present.has('local') ? [{ value: 'local', label: 'Local (Ollama)' }] : []),
    ...VENDORS.filter((v) => present.has(v.prefixes[0].replace('/', ''))).map((v) => ({
      value: v.prefixes[0].replace('/', ''),
      label: `${v.name} (${v.company})`,
    })),
    ...[...present]
      .filter((v) => v !== 'local' && !VENDORS.some((x) => x.prefixes[0] === `${v}/`))
      .map((v) => ({ value: v, label: v })),
  ]
})
const rows = computed(() =>
  compare(
    props.catalog.models.filter((m) => vendor.value === 'all' || m.vendor === vendor.value),
    w.value,
  ),
)
const calls = computed(() => w.value.jobsPerMonth * w.value.callsPerJob)

const version = ref(props.catalog.version ?? '')
watch(
  () => props.catalog.version,
  (v) => (version.value = v ?? ''),
)
const versionOptions = computed(() =>
  props.versions.map((v, i) => ({
    value: v.version,
    label: `${v.version}${i === 0 ? ' (latest)' : ''} · ${v.models_count} models`,
  })),
)
</script>

<template>
  <Card title="Pricing and estimator" data-testid="pricing">
    <div class="pe__meta">
      <span class="tp-note" data-testid="pricing-version">
        <template v-if="catalog.version">
          Catalog {{ catalog.version }} · from {{ catalog.source }} · fetched
          {{ ago(catalog.fetched_at) }} · {{ catalog.currency }} per million tokens
        </template>
        <template v-else>No prices fetched yet: only local models are listed.</template>
      </span>
      <Badge v-if="catalog.stale" tone="warning" label="Prices may be out of date" />
    </div>
    <div class="pe__controls">
      <Select
        v-if="versionOptions.length > 1"
        :model-value="version"
        :options="versionOptions"
        size="sm"
        aria-label="Catalog version"
        @update:model-value="emit('version', String($event))"
      />
      <Select v-model="vendor" :options="vendorOptions" size="sm" aria-label="Provider" />
      <Button v-if="admin" size="sm" variant="ghost" :loading="refreshing" @click="emit('refresh')">
        Fetch latest prices
      </Button>
    </div>

    <fieldset class="pe__inputs">
      <legend class="tp-strong">Your workload</legend>
      <TextInput
        :model-value="asText(w.jobsPerMonth)"
        label="Agent jobs per month"
        type="number"
        size="sm"
        data-testid="est-jobs"
        @update:model-value="setField('jobsPerMonth', $event)"
      />
      <TextInput
        :model-value="asText(w.callsPerJob)"
        label="Calls per job"
        type="number"
        size="sm"
        data-testid="est-calls"
        @update:model-value="setField('callsPerJob', $event)"
      />
      <TextInput
        :model-value="asText(w.inputTokens)"
        label="Avg input tokens per call"
        type="number"
        size="sm"
        data-testid="est-in"
        @update:model-value="setField('inputTokens', $event)"
      />
      <TextInput
        :model-value="asText(w.outputTokens)"
        label="Avg output tokens per call"
        type="number"
        size="sm"
        data-testid="est-out"
        @update:model-value="setField('outputTokens', $event)"
      />
    </fieldset>
    <div class="pe__controls">
      <span class="tp-note">{{ calls.toLocaleString() }} calls a month.</span>
      <Button
        v-if="observed"
        size="sm"
        variant="ghost"
        data-testid="est-observed"
        @click="useObserved"
      >
        Use my last 30 days
      </Button>
    </div>

    <div class="pe__scroll">
      <table class="pe__table" data-testid="pricing-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Input / M</th>
            <th>Output / M</th>
            <th>Context</th>
            <th>Estimated / month</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="`${r.model.provider}|${r.model.model}`">
            <td class="pe__model">
              <span class="tp-strong">{{ r.model.label }}</span>
              <span class="tp-note">{{ r.model.model }}</span>
            </td>
            <td class="tp-num">{{ perM(r.model, 'input') }}</td>
            <td class="tp-num">{{ perM(r.model, 'output') }}</td>
            <td class="tp-num">
              {{ r.model.context_length ? r.model.context_length.toLocaleString() : '—' }}
            </td>
            <td class="tp-num">{{ r.monthly === null ? 'not priced' : usd(r.monthly) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="tp-note">
      Estimates multiply the catalog's prices by the workload above. They leave out caching,
      reasoning tokens and price changes; the billed numbers are in the usage cards.
    </p>
  </Card>
</template>

<style scoped>
.pe__meta,
.pe__controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
  margin-bottom: var(--sp-2);
}
.pe__meta .tp-note {
  min-width: 0;
  overflow-wrap: anywhere;
}
.pe__inputs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--sp-2);
  min-width: 0;
  margin: 0 0 var(--sp-2);
  padding: 0;
  border: 0;
}
.pe__inputs legend {
  margin-bottom: var(--sp-1);
}
.pe__scroll {
  overflow-x: auto;
  min-width: 0;
}
.pe__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-xs);
}
.pe__table th,
.pe__table td {
  padding: 6px var(--sp-2);
  text-align: left;
  border-bottom: 1px solid var(--theme-border);
  white-space: nowrap;
}
.pe__table th {
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
}
.pe__model {
  display: flex;
  flex-direction: column;
  max-width: 280px;
}
.pe__model > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
