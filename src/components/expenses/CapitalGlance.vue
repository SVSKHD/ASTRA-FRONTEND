<script setup lang="ts">
// Capital at a glance (section 35d): every category's capital, what it has used
// and what is left, on the Overview where it is seen without asking.
//
// Read-only on purpose. Assigning capital is a decision made in the Plan tab;
// here each card is a way in to that decision — it opens Plan on its category.
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import { amount2 } from '@/utils/format'
import { round2 } from '@/utils/tradeMath'
import type { CapitalRow, CapitalStatus } from '@/utils/expensePlan'

const props = defineProps<{ rows: CapitalRow[] }>()
const emit = defineEmits<{ edit: [string] }>()

const STATUS: Record<CapitalStatus, string> = {
  unplanned: 'No capital',
  over: 'Over',
  'pacing-over': 'Will run over',
  'on-track': 'On track',
  idle: 'Untouched',
}

const sum = computed(() => {
  const assigned = round2(props.rows.reduce((s, r) => s + r.capital, 0))
  const used = round2(props.rows.reduce((s, r) => s + r.spent, 0))
  return { assigned, used, left: round2(assigned - used) }
})

/** Fill to the share used, capped at the bar; an overrun is said in words. */
function fill(row: CapitalRow) {
  if (row.capital <= 0) return row.spent > 0 ? '100%' : '0%'
  return `${Math.min(100, Math.max(0, row.pct * 100)).toFixed(1)}%`
}

function headline(row: CapitalRow) {
  if (row.capital <= 0) return amount2(row.spent)
  return amount2(Math.abs(row.remaining))
}

function headlineNote(row: CapitalRow) {
  if (row.capital <= 0) return 'unplanned'
  return row.remaining >= 0 ? 'left' : 'over'
}
</script>

<template>
  <section class="cg" aria-labelledby="cg-title">
    <header class="cg__head">
      <div class="cg__titles">
        <h2 id="cg-title" class="ui-label">Capital by category</h2>
        <p class="cg__sum">
          <span class="ui-tabular">{{ amount2(sum.used) }}</span> used of
          <span class="ui-tabular">{{ amount2(sum.assigned) }}</span> assigned ·
          <span class="ui-tabular" :class="{ 'is-neg': sum.left < 0 }">
            {{ amount2(Math.abs(sum.left)) }} {{ sum.left >= 0 ? 'left' : 'over' }}
          </span>
        </p>
      </div>
      <Button variant="ghost" size="sm" @click="emit('edit', '')">Edit capital</Button>
    </header>

    <ul v-if="rows.length" class="cg__grid">
      <li v-for="row in rows" :key="row.category">
        <button
          type="button"
          class="cg__card"
          :class="`is-${row.status}`"
          :data-capital="row.category"
          :aria-label="`${row.category}: ${amount2(row.spent)} used of ${amount2(row.capital)}. Edit its capital.`"
          @click="emit('edit', row.category)"
        >
          <span class="cg__top">
            <span class="cg__name">{{ row.category }}</span>
            <span class="cg__status">{{ STATUS[row.status] }}</span>
          </span>
          <span class="cg__figure">
            <span class="cg__value ui-tabular">{{ headline(row) }}</span>
            <span class="cg__unit">{{ headlineNote(row) }}</span>
          </span>
          <span class="cg__bar" aria-hidden="true">
            <span class="cg__fill" :style="{ width: fill(row) }"></span>
          </span>
          <span class="cg__foot ui-tabular">
            {{ amount2(row.spent) }}
            <template v-if="row.capital > 0"> of {{ amount2(row.capital) }}</template>
            · {{ row.count }} {{ row.count === 1 ? 'expense' : 'expenses' }}
          </span>
        </button>
      </li>
    </ul>
    <p v-else class="cg__empty">
      No capital yet. Give each category its share of the month in Plan, and it shows here.
    </p>
  </section>
</template>

<style scoped>
.cg {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  box-shadow: var(--layer-raised-shadow);
}
.cg__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
  min-width: 0;
}
.cg__titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.cg__titles h2 {
  margin: 0;
}
.cg__sum,
.cg__empty {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-secondary, var(--theme-dim));
}
.cg__sum .ui-tabular {
  font-family: var(--font-mono);
  color: var(--text-primary, var(--theme-text));
}
.cg__sum .is-neg {
  color: var(--theme-danger);
}
.cg__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--sp-2);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cg__grid > li {
  display: flex;
  min-width: 0;
}
/* A card is a button into Plan. Its hover is colour only — a tint and a
   border — over 120ms: no lift, no shadow, nothing that repaints a layer. */
.cg__card {
  --cg-tone: var(--theme-accent);
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: color-mix(in oklch, var(--cg-tone) 4%, transparent);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 120ms var(--ease-out),
    border-color 120ms var(--ease-out);
}
.cg__card:hover {
  border-color: color-mix(in oklch, var(--cg-tone) 55%, transparent);
  background: color-mix(in oklch, var(--cg-tone) 10%, transparent);
}
.cg__card:focus-visible {
  outline: 2px solid var(--cg-tone);
  outline-offset: 2px;
}
.cg__card.is-over {
  --cg-tone: var(--theme-danger);
}
.cg__card.is-pacing-over,
.cg__card.is-unplanned {
  --cg-tone: var(--theme-warning);
}
.cg__card.is-on-track {
  --cg-tone: var(--theme-success);
}
.cg__card.is-idle {
  --cg-tone: var(--theme-dim);
}
.cg__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
}
.cg__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  font-weight: var(--weight-medium);
  color: var(--text-primary, var(--theme-text));
}
.cg__status {
  flex-shrink: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--cg-tone);
}
.cg__card.is-idle .cg__status {
  color: var(--text-muted, var(--theme-dim));
}
.cg__figure {
  display: flex;
  align-items: baseline;
  gap: var(--sp-1);
  min-width: 0;
}
.cg__value {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  line-height: var(--lh-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary, var(--theme-text));
}
.cg__card.is-over .cg__value {
  color: var(--theme-danger);
}
.cg__unit {
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
.cg__bar {
  position: relative;
  display: block;
  height: 6px;
  min-width: 0;
  border-radius: 999px;
  background: color-mix(in oklch, var(--theme-dim) 18%, transparent);
  overflow: hidden;
}
.cg__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: var(--cg-tone);
  transition: width var(--dur-med) var(--ease-out);
}
.cg__card.is-idle .cg__fill {
  background: var(--theme-accent);
}
.cg__foot {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}

@media (prefers-reduced-motion: reduce) {
  .cg__card,
  .cg__fill {
    transition: none;
  }
}
</style>
