<script setup lang="ts">
// The row at the top of a list tab's panel, above the progress line: what the
// tab is called in the middle, and the tab's actions in the right-hand corner
// ending in the create button. Todos and Tasks share it, so the two tabs are
// laid out the same way and a create button is always found in the same place.
//
// Three columns of `1fr auto 1fr`, so the title sits at the centre of the
// panel; the right column never shrinks below its buttons, and on a narrow
// panel it is the empty left column that gives way.
//
// A button passed in with class `panel-action` takes the header's one button
// shape (a 32px outlined pill, `is-on` for a toggled state, `panel-action--icon`
// squared for a lone icon), so every control in the row matches New.
defineProps<{ title: string; newLabel?: string }>()
defineEmits<{ new: [] }>()
</script>

<template>
  <div class="panel-header">
    <div class="panel-header__row">
      <div class="panel-header__side panel-header__side--left">
        <slot name="left" />
      </div>
      <h2 class="panel-header__title">{{ title }}</h2>
      <div class="panel-header__side panel-header__side--right">
        <slot name="right" />
        <button v-if="newLabel" type="button" class="panel-header__new" @click="$emit('new')">
          <span aria-hidden="true">+</span>{{ newLabel }}
        </button>
      </div>
    </div>
    <!-- Directly under the row, closer than the panel's own gap: the progress
         bar belongs to the count at the row's left end. -->
    <slot name="below" />
  </div>
</template>

<style scoped>
.panel-header {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.panel-header__row {
  display: grid;
  grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr);
  align-items: center;
  gap: var(--sp-3);
  min-height: 32px;
}
.panel-header__side {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.panel-header__side--right {
  justify-content: flex-end;
}
.panel-header__title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
  white-space: nowrap;
  text-align: center;
}
/* The one filled pill in the panel: 32px, like every control beside it. */
.panel-header__new {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  flex-shrink: 0;
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-accent);
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: filter var(--dur-fast, 120ms) ease;
}
.panel-header__new:hover {
  filter: brightness(1.08);
}
.panel-header__new:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
/* The same pill, outlined, for everything beside New. */
:slotted(.panel-action) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  min-width: 32px;
  padding: 0 12px;
  flex-shrink: 0;
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-border);
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background var(--dur-fast, 120ms) ease,
    border-color var(--dur-fast, 120ms) ease,
    color var(--dur-fast, 120ms) ease;
}
:slotted(.panel-action:hover) {
  background: var(--theme-card);
}
:slotted(.panel-action.is-on) {
  border-color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  color: var(--theme-accent);
}
:slotted(.panel-action--icon) {
  width: 32px;
  padding: 0;
}
:slotted(.panel-action:focus-visible) {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
</style>
