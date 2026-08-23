<script setup lang="ts">
// A row of metrics (section 26c).
//
// What it replaces: "In ₹0 Out ₹0 Net +₹0" — a run-on sentence in which the
// labels and the values alternate, the labels are muted to the point of
// disappearing, and the values are coloured by which metric they belong to. The
// eye cannot pair a label with its value, and the colour says nothing, so the
// whole strip reads as one grey line with three red-and-green words in it.
//
// The fix is structural, not cosmetic. Each metric is a stacked pair — label
// above, value below — so the pairing is spatial and needs no reading. Labels
// take --text-secondary at --text-xs rather than the muted token, because a
// label is not decoration: it is the half of the pair that says what the number
// means. Values take --text-primary at --text-base, semibold, tabular, so a
// column of them aligns and none of them shouts.
//
// Colour arrives only through `tone`, and only where a sign carries meaning.
import { toneColor, type ValueTone } from '@/utils/money'

export interface Stat {
  label: string
  value: string
  /** Omitted means neutral. Set only where the sign is the information. */
  tone?: ValueTone
  /** A short qualifier under the value — "of ₹1,20,000". */
  note?: string
}

withDefaults(defineProps<{ stats: Stat[]; size?: 'md' | 'lg' }>(), { size: 'md' })
</script>

<template>
  <dl class="statrow" :class="`statrow--${size}`">
    <div v-for="stat in stats" :key="stat.label" class="statrow__cell">
      <dt class="statrow__label">{{ stat.label }}</dt>
      <dd class="statrow__value ui-tabular" :style="{ color: toneColor(stat.tone ?? 'neutral') }">
        {{ stat.value }}
      </dd>
      <dd v-if="stat.note" class="statrow__note">{{ stat.note }}</dd>
    </div>
  </dl>
</template>

<style scoped>
/* A grid rather than flex with gaps: equal columns mean the dividers land at
   even intervals whatever the values are, so the row does not reflow as the
   numbers change from ₹0 to ₹1,50,000. */
.statrow {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  align-items: start;
  min-width: 0;
  margin: 0;
}
.statrow__cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 0 var(--sp-3);
  /* The divider is a border on the cell, not a separate element, so it cannot
     end up orphaned at the end of the row. */
  border-left: 1px solid var(--border-subtle, var(--glass-border));
}
.statrow__cell:first-child {
  padding-left: 0;
  border-left: none;
}
.statrow__cell:last-child {
  padding-right: 0;
}
.statrow__label {
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--text-muted, var(--theme-dim)));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.statrow__value {
  min-width: 0;
  margin: 0;
  font-size: var(--text-base);
  line-height: var(--lh-base);
  font-weight: var(--weight-semibold);
  overflow-wrap: anywhere;
}
.statrow--lg .statrow__value {
  font-size: var(--text-md);
  line-height: var(--lh-md);
}
.statrow__note {
  min-width: 0;
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
/* On a phone the columns become rows rather than three 90px slivers. */
@media (max-width: 480px) {
  .statrow {
    grid-auto-flow: row;
    gap: var(--sp-2);
  }
  .statrow__cell {
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-1) 0;
    border-left: none;
    border-top: 1px solid var(--border-subtle, var(--glass-border));
  }
  .statrow__cell:first-child {
    border-top: none;
  }
}
</style>
