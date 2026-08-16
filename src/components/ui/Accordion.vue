<script setup lang="ts">
// A disclosure. Built on the native summary/details semantics so it is
// keyboard-operable and announces its own state.
withDefaults(defineProps<{ title: string; open?: boolean }>(), { open: false })
defineEmits<{ toggle: [boolean] }>()
</script>

<template>
  <details
    class="ui-accordion"
    :open="open"
    @toggle="$emit('toggle', ($event.target as HTMLDetailsElement).open)"
  >
    <summary class="ui-accordion__head ui-focus-ring">
      <span class="ui-accordion__caret" aria-hidden="true">▸</span>
      {{ title }}
    </summary>
    <div class="ui-accordion__body"><slot /></div>
  </details>
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
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--theme-text);
  cursor: pointer;
  list-style: none;
}
.ui-accordion__head::-webkit-details-marker {
  display: none;
}
.ui-accordion__caret {
  transition: transform var(--dur-fast) var(--ease-out);
  color: var(--theme-dim);
}
.ui-accordion[open] .ui-accordion__caret {
  transform: rotate(90deg);
}
.ui-accordion__body {
  padding: 0 var(--sp-3) var(--sp-3);
  color: var(--theme-dim);
  font-size: var(--text-md);
}
</style>
