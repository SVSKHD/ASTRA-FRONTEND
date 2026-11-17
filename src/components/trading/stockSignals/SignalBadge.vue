<script setup lang="ts">
// A signal's class as a pill: colour AND an icon AND the word, so it never rests
// on colour alone.
import Icon from '@/components/ui/Icon.vue'
import { SIGNAL_LABEL, type SignalClass } from '@/trading/stockSignals/classify'

withDefaults(defineProps<{ cls: SignalClass; size?: 'sm' | 'md'; stale?: boolean }>(), {
  size: 'sm',
  stale: false,
})
const ICON = {
  bullish: 'trending-up',
  bearish: 'trending-down',
  pending: 'hourglass',
  mixed: 'shuffle',
  unavailable: 'circle-slash',
} as const
</script>

<template>
  <span class="sb" :class="[`is-${cls}`, `sb--${size}`, { 'is-stale': stale }]">
    <Icon :name="ICON[cls]" size="xs" />
    {{ SIGNAL_LABEL[cls] }}<template v-if="stale"> · stale</template>
  </span>
</template>

<style scoped>
.sb {
  --sb: var(--theme-dim);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid color-mix(in oklch, var(--sb) 40%, transparent);
  background: color-mix(in oklch, var(--sb) 13%, transparent);
  color: var(--sb);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
}
.sb--md {
  padding: 3px 10px;
  font-size: var(--text-xs);
}
.sb.is-bullish {
  --sb: var(--theme-success);
}
.sb.is-bearish {
  --sb: var(--theme-danger);
}
.sb.is-pending,
.sb.is-mixed {
  --sb: var(--theme-warning);
}
.sb.is-stale {
  --sb: var(--theme-dim);
}
</style>
