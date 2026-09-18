<script setup lang="ts">
// One collapsible card in a right-hand detail pane (todos, tasks, goals).
//
// Every section in the three panes is one of these, so the header — Caret,
// uppercase label, count badge, optional actions — sits at the same height and
// the same left edge everywhere, and the body opens with the same animation as
// the list accordions. Open state is remembered per section kind (not per item)
// through useAccordionState, so collapsing "Details" keeps it collapsed as you
// move from one todo to the next.
import { computed } from 'vue'
import { useAccordionState } from '@/composables/useAccordionState'
import { useTapOpen } from '@/composables/useTapOpen'
import { useDetailStyles } from '@/composables/useDetailStyles'
import Caret from '@/components/ui/Caret.vue'

const props = withDefaults(
  defineProps<{
    title: string
    /** Remembers open/closed, e.g. "task:notes". */
    storageKey: string
    /** A short count shown beside the title ("2/5", 3). */
    count?: string | number
    defaultOpen?: boolean
  }>(),
  { count: undefined, defaultOpen: true },
)

const acc = useAccordionState()
const { card } = useDetailStyles()
const key = computed(() => 'pane:' + props.storageKey)
const open = computed(() => acc.isOpen(key.value, props.defaultOpen))
function toggle() {
  acc.toggle(key.value, props.defaultOpen)
}
// Only a real tap toggles — not a text selection dragged across the header, a
// long press, or a touch scroll that happened to start on it.
const tap = useTapOpen(toggle)
</script>

<template>
  <section class="psec" :class="{ 'is-open': open }" :style="[card, { gap: 0 }]">
    <header class="psec__head">
      <button
        type="button"
        class="psec__toggle ui-focus-ring"
        :aria-expanded="open"
        @pointerdown="tap.onPointerDown"
        @pointercancel="tap.onPointerCancel"
        @click="tap.onClick"
      >
        <Caret :open="open" />
        <span class="psec__title">{{ title }}</span>
        <span v-if="count !== undefined && count !== ''" class="psec__count">{{ count }}</span>
      </button>
      <div v-if="$slots.actions" class="psec__actions"><slot name="actions" /></div>
    </header>
    <div class="psec__body">
      <div class="psec__clip">
        <div class="psec__inner"><slot /></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.psec {
  min-width: 0;
}
.psec__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 26px;
}
.psec__toggle {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex: 1;
  min-width: 0;
  /* Pull the caret's box into the card padding so the label, not the arrow's
     empty box, lines up with the content below it. */
  margin-left: -6px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius-control);
}
.psec__title {
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.psec__count {
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: var(--theme-card);
  color: var(--theme-dim);
  font-variant-numeric: tabular-nums;
}
.psec__actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
/* Height and opacity move together on one easing, so a section opens as one
   gesture rather than growing an empty box and then filling it. */
.psec__body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 260ms var(--ease-out, ease),
    opacity 200ms ease;
}
.psec.is-open .psec__body {
  grid-template-rows: 1fr;
  opacity: 1;
}
.psec__clip {
  min-height: 0;
  overflow: hidden;
}
.psec__inner {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding-top: var(--sp-3);
}
@media (prefers-reduced-motion: reduce) {
  .psec__body {
    transition: none;
  }
}
</style>
