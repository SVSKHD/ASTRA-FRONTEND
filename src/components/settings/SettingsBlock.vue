<script setup lang="ts">
// One category on the Settings overview, drawn exactly like a Dashboard block
// (components/dashboard/DashBlock.vue): the raised layer's surface, an icon and a
// small-caps title, a hint in the corner, one figure in mono, what it is out of,
// and one line of status. Where DashBlock opens a tab, this selects a category,
// so it is a `tab` in the overview's `tablist` and says when it is the one shown.
//
// The tone is a thin bar along the top edge and the colour of the hint — status
// you can read at a glance without a block turning into a traffic light.
import Icon from '@/components/ui/Icon.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import type { IconName } from '@/components/ui/icons'
import type { BlockSummary } from '@/control/settingsOverview'

defineProps<{
  id: string
  panelId: string
  title: string
  icon: IconName
  summary: BlockSummary
  selected: boolean
}>()
const emit = defineEmits<{ select: [] }>()

/** Mono for figures, as on the Dashboard ("$62.40", "2/3"); words stay in the sans. */
const isNumber = (s: string) => /\d/.test(s)
</script>

<template>
  <button
    :id="id"
    type="button"
    role="tab"
    class="sblock"
    :class="[`is-${summary.tone}`, { 'is-selected': selected }]"
    :aria-selected="selected"
    :aria-controls="panelId"
    :tabindex="selected ? 0 : -1"
    @click="emit('select')"
  >
    <span class="sblock__head">
      <span class="sblock__icon"><Icon :name="icon" size="sm" /></span>
      <span class="sblock__title ui-label">{{ title }}</span>
      <span v-if="summary.hint" class="sblock__hint" data-testid="block-hint">{{
        summary.hint
      }}</span>
    </span>
    <span
      class="sblock__figure"
      :class="{ 'ui-mono': isNumber(summary.figure) }"
      data-testid="block-figure"
      >{{ summary.figure }}</span
    >
    <span class="sblock__of">{{ summary.of }}</span>
    <ProgressBar
      v-if="summary.meter !== null"
      :value="summary.meter"
      :max="100"
      size="sm"
      :label="`${title}: ${summary.figure} ${summary.of}`"
    />
    <span class="sblock__note">{{ summary.note }}</span>
  </button>
</template>

<style scoped>
.sblock {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: var(--sp-3);
  overflow: hidden;
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  backdrop-filter: var(--layer-raised-blur);
  -webkit-backdrop-filter: var(--layer-raised-blur);
  box-shadow: var(--layer-raised-shadow);
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    background-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}
/* The status edge: one thin bar, the only place the tone is a fill. */
.sblock::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background: transparent;
}
.sblock.is-ok::before {
  background: var(--theme-success);
}
.sblock.is-warn::before {
  background: var(--theme-warning);
}
.sblock.is-bad::before {
  background: var(--theme-danger);
}
.sblock:hover {
  border-color: var(--accent, var(--theme-accent));
}
.sblock:active {
  transform: translateY(1px);
}
.sblock:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.sblock.is-selected {
  border-color: var(--accent, var(--theme-accent));
  background: color-mix(in oklch, var(--theme-accent) 10%, var(--layer-raised-bg));
}
.sblock__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  margin-bottom: var(--sp-1);
}
.sblock__icon {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--accent, var(--theme-accent));
}
.sblock__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sblock__hint {
  margin-left: auto;
  flex-shrink: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary, var(--theme-dim));
}
.is-warn .sblock__hint {
  color: var(--theme-warning);
}
.is-bad .sblock__hint {
  color: var(--theme-danger);
}
.sblock__figure {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xl);
  line-height: 1.05;
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary, var(--theme-text));
}
.sblock__of {
  display: block;
  min-width: 0;
  margin-bottom: var(--sp-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.sblock__note {
  display: block;
  min-width: 0;
  margin-top: var(--sp-1);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
  overflow-wrap: anywhere;
}
@media (prefers-reduced-motion: reduce) {
  .sblock {
    transition: none;
  }
}
</style>
