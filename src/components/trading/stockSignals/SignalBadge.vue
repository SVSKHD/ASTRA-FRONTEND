<script setup lang="ts">
// A signal state as a pill: colour AND an icon AND the words, so it never rests
// on colour alone. The engine's eight states fall into five colours.
import Icon from '@/components/ui/Icon.vue'
import { STATE_BUCKET, STATE_HELP, STATE_LABEL, type SignalState } from '@/trading/stockSignals/api'

withDefaults(defineProps<{ state: SignalState | null | undefined; size?: 'sm' | 'md' }>(), {
  size: 'sm',
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
  <span
    class="sb"
    :class="[`is-${STATE_BUCKET[state ?? 'UNAVAILABLE']}`, `sb--${size}`]"
    :title="STATE_HELP[state ?? 'UNAVAILABLE']"
  >
    <Icon :name="ICON[STATE_BUCKET[state ?? 'UNAVAILABLE']]" size="xs" />
    {{ STATE_LABEL[state ?? 'UNAVAILABLE'] }}
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
</style>
