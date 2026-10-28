<script setup lang="ts">
// A milestone's KPIs: what is being measured, how far along each one is, and a
// one-field way to log today's number.
//
// Each KPI is a row — name, "42 / 150 problems", the change since last time, a
// progress bar and the sparkline — with a quick-log field beside it, because a
// tracker that needs a dialog per entry is a tracker nobody updates. History
// opens under the row on demand. Adding a KPI starts from examples, since an
// empty "Name / Start / Target" form says nothing about what a KPI is for.
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import TextInput from '@/components/ui/TextInput.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Icon from '@/components/ui/Icon.vue'
import KpiSparkline from '@/components/goals/KpiSparkline.vue'
import { formatKpiValue, kpiCurrent, kpiRatio, kpiTrend } from '@/utils/milestoneTracking'
import type { Kpi } from '@/types'

const props = defineProps<{ goalId: number }>()
const app = useAppStore()

const kpis = computed<Kpi[]>(() => app.goals.find((g) => g.id === props.goalId)?.kpis ?? [])

// Starters for the add form: each one fills the fields in, ready to adjust.
const EXAMPLES: { name: string; unit: string; start: number; target: number }[] = [
  { name: 'Problems solved', unit: 'problems', start: 0, target: 150 },
  { name: 'Projects shipped', unit: 'projects', start: 0, target: 3 },
  { name: 'Mock interviews', unit: 'interviews', start: 0, target: 10 },
  { name: 'Hours practised', unit: 'h', start: 0, target: 100 },
  { name: 'Quiz score', unit: '%', start: 40, target: 90 },
]

// --- adding --------------------------------------------------------------------
const adding = ref(false)
const form = ref({ name: '', unit: '', start: 0 as number | null, target: null as number | null })
function openAdd(example?: (typeof EXAMPLES)[number]) {
  form.value = example ? { ...example } : { name: '', unit: '', start: 0, target: null }
  adding.value = true
}
const canAdd = computed(() => form.value.name.trim() !== '' && form.value.target != null)
function submitAdd() {
  if (!canAdd.value) return
  app.addKpi(props.goalId, {
    name: form.value.name,
    unit: form.value.unit.trim(),
    start: form.value.start ?? 0,
    target: form.value.target ?? 0,
  })
  adding.value = false
}

// --- logging -------------------------------------------------------------------
// One draft per KPI, so typing in one row never shows up in another.
const drafts = ref<Record<number, number | null>>({})
function log(k: Kpi) {
  const v = drafts.value[k.id]
  if (v == null) return
  app.logKpi(props.goalId, k.id, v)
  drafts.value = { ...drafts.value, [k.id]: null }
}
// +1 is the commonest entry by far ("solved one more"), so it is one press.
function bump(k: Kpi) {
  const step = k.target >= k.start ? 1 : -1
  app.logKpi(props.goalId, k.id, kpiCurrent(k) + step)
}

const openHistory = ref<number | null>(null)
const fmtWhen = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

function trendText(k: Kpi): { text: string; tone: 'up' | 'down' | 'flat' } | null {
  const t = kpiTrend(k)
  if (t == null) return null
  if (t === 0) return { text: '0', tone: 'flat' }
  return {
    text: formatKpiValue(Math.abs(t)),
    tone: t > 0 ? 'up' : 'down',
  }
}
</script>

<template>
  <div class="mkpi">
    <div v-for="k in kpis" :key="k.id" class="mkpi__row">
      <div class="mkpi__head">
        <span class="mkpi__name">{{ k.name || 'Untitled KPI' }}</span>
        <span class="mkpi__value">
          <strong>{{ formatKpiValue(kpiCurrent(k)) }}</strong>
          <span class="mkpi__dim"> / {{ formatKpiValue(k.target) }} {{ k.unit }}</span>
        </span>
        <span
          v-if="trendText(k)"
          class="mkpi__trend"
          :class="`mkpi__trend--${trendText(k)!.tone}`"
          title="Change since the previous entry"
        >
          <Icon
            :name="
              trendText(k)!.tone === 'up'
                ? 'trending-up'
                : trendText(k)!.tone === 'down'
                  ? 'trending-down'
                  : 'minus'
            "
            size="xs"
          />{{ trendText(k)!.text }}
        </span>
        <span class="mkpi__pct">{{ Math.round(kpiRatio(k) * 100) }}%</span>
      </div>

      <div class="mkpi__body">
        <ProgressBar class="mkpi__bar" size="sm" solid :value="kpiRatio(k)" :max="1" />
        <KpiSparkline
          v-if="k.entries.length"
          :values="[k.start, ...k.entries.map((e) => e.value)]"
          :target="k.target"
          :width="96"
          :height="24"
        />
      </div>

      <form class="mkpi__log" @submit.prevent="log(k)">
        <NumberInput
          size="sm"
          class="mkpi__num"
          :placeholder="`Now: ${formatKpiValue(kpiCurrent(k))}`"
          :aria-label="`Log a value for ${k.name}`"
          :model-value="drafts[k.id] ?? null"
          @update:model-value="drafts = { ...drafts, [k.id]: $event }"
        />
        <button type="submit" class="mkpi__btn" :disabled="drafts[k.id] == null">Log</button>
        <button
          type="button"
          class="mkpi__btn"
          :title="`Log ${formatKpiValue(kpiCurrent(k) + (k.target >= k.start ? 1 : -1))}`"
          @click="bump(k)"
        >
          {{ k.target >= k.start ? '+1' : '−1' }}
        </button>
        <button
          type="button"
          class="mkpi__btn mkpi__btn--ghost"
          :aria-expanded="openHistory === k.id"
          @click="openHistory = openHistory === k.id ? null : k.id"
        >
          History · {{ k.entries.length }}
        </button>
        <button
          type="button"
          class="mkpi__icon"
          :aria-label="`Delete KPI ${k.name}`"
          title="Delete KPI"
          @click="app.removeKpi(goalId, k.id)"
        >
          <Icon name="trash" size="xs" />
        </button>
      </form>

      <ul v-if="openHistory === k.id" class="mkpi__history">
        <li v-if="!k.entries.length" class="mkpi__dim">
          Nothing logged yet — started at {{ formatKpiValue(k.start) }} {{ k.unit }}.
        </li>
        <li v-for="e in [...k.entries].reverse()" :key="e.id" class="mkpi__entry">
          <span class="mkpi__dim">{{ fmtWhen(e.at) }}</span>
          <strong>{{ formatKpiValue(e.value) }}</strong>
          <span class="mkpi__dim">{{ k.unit }}</span>
          <span v-if="e.note" class="mkpi__note">{{ e.note }}</span>
          <button
            type="button"
            class="mkpi__icon"
            aria-label="Delete entry"
            title="Delete entry"
            @click="app.removeKpiEntry(goalId, k.id, e.id)"
          >
            <Icon name="x" size="xs" />
          </button>
        </li>
      </ul>
    </div>

    <!-- Nothing yet: say what a KPI is, with examples that fill the form in. -->
    <div v-if="!kpis.length && !adding" class="mkpi__empty">
      <span class="mkpi__dim">
        Track numbers that prove progress — e.g. problems solved, projects shipped, a quiz score.
      </span>
    </div>

    <form v-if="adding" class="mkpi__form" @submit.prevent="submitAdd">
      <TextInput
        size="sm"
        class="mkpi__formname"
        placeholder="KPI name — e.g. Problems solved"
        aria-label="KPI name"
        :model-value="form.name"
        @update:model-value="form.name = $event"
      />
      <NumberInput
        size="sm"
        placeholder="Start"
        aria-label="Starting value"
        :model-value="form.start"
        @update:model-value="form.start = $event"
      />
      <NumberInput
        size="sm"
        placeholder="Target"
        aria-label="Target value"
        :model-value="form.target"
        @update:model-value="form.target = $event"
      />
      <TextInput
        size="sm"
        placeholder="Unit — e.g. problems"
        aria-label="Unit"
        :model-value="form.unit"
        @update:model-value="form.unit = $event"
      />
      <div class="mkpi__formactions">
        <button type="submit" class="mkpi__btn mkpi__btn--primary" :disabled="!canAdd">
          Add KPI
        </button>
        <button type="button" class="mkpi__btn mkpi__btn--ghost" @click="adding = false">
          Cancel
        </button>
      </div>
    </form>

    <div v-if="!adding" class="mkpi__starters">
      <button type="button" class="mkpi__btn" @click="openAdd()">
        <Icon name="plus" size="xs" /> Add KPI
      </button>
      <button
        v-for="ex in EXAMPLES.filter((x) => !kpis.some((k) => k.name === x.name))"
        :key="ex.name"
        type="button"
        class="mkpi__chip"
        :title="`${ex.start} → ${ex.target} ${ex.unit}`"
        @click="openAdd(ex)"
      >
        {{ ex.name }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.mkpi {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.mkpi__row {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in oklch, var(--theme-dim) 18%, transparent);
  background: color-mix(in oklch, var(--theme-text) 3%, transparent);
}
.mkpi__head {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  min-width: 0;
}
.mkpi__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
.mkpi__value {
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.mkpi__dim {
  color: var(--theme-dim);
  font-size: var(--text-xs);
}
.mkpi__pct {
  min-width: 3ch;
  text-align: right;
  color: var(--theme-accent);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.mkpi__trend {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
}
.mkpi__trend--up {
  color: var(--theme-success);
}
.mkpi__trend--down {
  color: var(--theme-danger);
}
.mkpi__trend--flat {
  color: var(--theme-dim);
}
.mkpi__body {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.mkpi__bar {
  flex: 1;
  min-width: 0;
}
.mkpi__log {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  flex-wrap: wrap;
}
.mkpi__num {
  width: 130px;
}
.mkpi__btn,
.mkpi__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-text);
  font-family: inherit;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  cursor: pointer;
}
.mkpi__btn:hover:not(:disabled),
.mkpi__chip:hover {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}
.mkpi__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.mkpi__btn--ghost {
  border-color: transparent;
  color: var(--theme-dim);
}
.mkpi__btn--primary {
  border-color: var(--theme-accent);
  background: var(--theme-accent);
  color: var(--theme-on-accent, #fff);
}
.mkpi__btn--primary:hover:not(:disabled) {
  color: var(--theme-on-accent, #fff);
}
.mkpi__chip {
  border-style: dashed;
  color: var(--theme-dim);
  font-weight: var(--weight-medium);
}
.mkpi__icon {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin-left: auto;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
}
.mkpi__icon:hover {
  background: color-mix(in oklch, var(--theme-danger) 14%, transparent);
  color: var(--theme-danger);
}
.mkpi__history {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: var(--sp-2) 0 0;
  list-style: none;
  border-top: 1px solid color-mix(in oklch, var(--theme-dim) 14%, transparent);
}
.mkpi__entry {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.mkpi__note {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--theme-dim);
}
.mkpi__form {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr);
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px dashed var(--theme-accent);
}
.mkpi__formactions {
  grid-column: 1 / -1;
  display: flex;
  gap: var(--sp-2);
}
@media (max-width: 640px) {
  .mkpi__form {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .mkpi__formname {
    grid-column: 1 / -1;
  }
}
.mkpi__starters {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  flex-wrap: wrap;
}
</style>
