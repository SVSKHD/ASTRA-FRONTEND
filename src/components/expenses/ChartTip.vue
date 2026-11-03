<script setup lang="ts">
// The hover card both expense charts share (section 35d).
//
// It replaces SVG <title> tooltips, which the browser shows only after a
// second's delay, in its own unstyled box. This one is instant, in the app's
// type and tokens, and follows the hovered day. It is positioned, never
// animated: moving it is a style write, not a transition to wait for.
import { computed } from 'vue'

export interface TipRow {
  label: string
  value: string
  tone?: 'pos' | 'neg' | 'warn'
}

const props = defineProps<{
  /** Where the hovered day sits, as a share of the plot's width (0–1). */
  at: number
  title: string
  rows: TipRow[]
}>()

/** Anchored to the day, and flipped at the edges so it never leaves the card. */
const style = computed(() => {
  const pct = `${(props.at * 100).toFixed(2)}%`
  if (props.at < 0.2) return { left: pct, transform: 'translateX(-12px)' }
  if (props.at > 0.8) return { left: pct, transform: 'translateX(calc(-100% + 12px))' }
  return { left: pct, transform: 'translateX(-50%)' }
})
</script>

<template>
  <div class="tip" :style="style" role="status" aria-live="polite">
    <p class="tip__title">{{ title }}</p>
    <dl class="tip__rows">
      <div v-for="r in rows" :key="r.label" class="tip__row">
        <dt>{{ r.label }}</dt>
        <dd class="ui-tabular" :class="r.tone && `is-${r.tone}`">{{ r.value }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.tip {
  position: absolute;
  top: 0;
  z-index: 3;
  min-width: 11rem;
  max-width: 16rem;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-sm);
  /* Opaque: a figure read over a chart line is a figure misread. */
  background: var(--glass-solid, var(--layer-overlay-bg));
  box-shadow: var(--layer-raised-shadow);
  pointer-events: none;
}
.tip__title {
  margin: 0 0 var(--sp-1);
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  font-weight: var(--weight-semibold);
  color: var(--text-primary, var(--theme-text));
}
.tip__rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  min-width: 0;
}
.tip__row {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-3);
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
}
.tip__row dt {
  min-width: 0;
  color: var(--text-secondary, var(--theme-dim));
}
.tip__row dd {
  margin: 0;
  min-width: 0;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary, var(--theme-text));
}
.tip__row dd.is-pos {
  color: var(--theme-success);
}
.tip__row dd.is-neg {
  color: var(--theme-danger);
}
.tip__row dd.is-warn {
  color: var(--theme-warning);
}
</style>
