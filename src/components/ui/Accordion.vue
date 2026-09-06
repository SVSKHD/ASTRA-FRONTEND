<script setup lang="ts">
// A disclosure: a button that announces its own state, and a body that grows
// rather than appearing.
//
// The arrow is `Caret`, the same component every other collapsible header in
// the app uses, rather than a `▸` typed into the template — see that file for
// why a literal character was the wrong thing to draw here.
import Caret from '@/components/ui/Caret.vue'

const props = withDefaults(defineProps<{ title: string; open?: boolean }>(), { open: false })
const emit = defineEmits<{ toggle: [boolean] }>()
</script>

<template>
  <div class="ui-accordion" :class="{ 'is-open': props.open }">
    <button
      class="ui-accordion__head ui-focus-ring"
      type="button"
      :aria-expanded="props.open"
      @click="emit('toggle', !props.open)"
    >
      <Caret :open="props.open" />
      {{ props.title }}
    </button>
    <div class="ui-accordion__body">
      <div class="ui-accordion__bodyInner"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.ui-accordion {
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--glass-card);
  overflow: hidden;
}
.ui-accordion__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
  cursor: pointer;
  list-style: none;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
}
.ui-accordion__body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  padding: 0 var(--sp-3);
  color: var(--theme-dim);
  font-size: var(--text-sm);
  transition:
    grid-template-rows var(--dur-med) var(--ease-out),
    opacity var(--dur-fast) ease,
    padding var(--dur-med) var(--ease-out);
}
.ui-accordion__bodyInner {
  min-height: 0;
  overflow: hidden;
}
.ui-accordion.is-open .ui-accordion__body {
  grid-template-rows: 1fr;
  opacity: 1;
  padding-bottom: var(--sp-3);
}
@media (prefers-reduced-motion: reduce) {
  .ui-accordion__body {
    transition: none;
  }
}
</style>
