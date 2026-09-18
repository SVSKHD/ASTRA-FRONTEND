<script setup lang="ts">
// The one action button of the right-hand detail panes.
//
// Every action in a pane — the header's, a section's, a note row's — is this,
// so they share one height, one icon size, one hover and one focus ring. With a
// `label` shown it is a pill (section actions: "New note"); without, a square
// icon button whose label is its tooltip and its accessible name.
//
// `tone` says what the action spends: accent for the one thing a section is
// for, danger for the one that deletes, and nothing for everything else.
import Icon from '@/components/ui/Icon.vue'
import type { IconName } from '@/components/ui/icons'

withDefaults(
  defineProps<{
    icon: IconName
    label: string
    showLabel?: boolean
    tone?: 'default' | 'accent' | 'danger'
    active?: boolean
    disabled?: boolean
  }>(),
  { showLabel: false, tone: 'default', active: false, disabled: false },
)
defineEmits<{ click: [MouseEvent] }>()
</script>

<template>
  <button
    type="button"
    class="pbtn ui-focus-ring"
    :class="[`pbtn--${tone}`, { 'pbtn--label': showLabel, 'is-active': active }]"
    :title="label"
    :aria-label="showLabel ? undefined : label"
    :aria-pressed="active || undefined"
    :disabled="disabled"
    @click.stop="$emit('click', $event)"
  >
    <Icon :name="icon" size="sm" />
    <span v-if="showLabel" class="pbtn__text">{{ label }}</span>
  </button>
</template>

<style scoped>
.pbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--dur-fast, 0.15s) ease,
    border-color var(--dur-fast, 0.15s) ease,
    color var(--dur-fast, 0.15s) ease;
}
.pbtn--label {
  width: auto;
  padding: 0 12px 0 10px;
  border-color: var(--glass-border);
  background: var(--theme-input, transparent);
  color: var(--theme-text);
}
.pbtn:hover:not(:disabled) {
  color: var(--theme-text);
  background: color-mix(in oklch, var(--theme-text) 9%, transparent);
}
.pbtn--label:hover:not(:disabled) {
  border-color: color-mix(in oklch, var(--theme-accent) 55%, var(--glass-border));
}
.pbtn--accent {
  color: var(--theme-accent);
}
.pbtn--accent.pbtn--label {
  border-color: var(--theme-accent);
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
  color: var(--theme-accent);
}
.pbtn--accent:hover:not(:disabled) {
  color: var(--theme-accent);
  background: color-mix(in oklch, var(--theme-accent) 22%, transparent);
}
.pbtn--danger:hover:not(:disabled) {
  color: var(--theme-danger);
  background: color-mix(in oklch, var(--theme-danger) 14%, transparent);
}
.pbtn.is-active {
  color: var(--theme-accent);
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
}
.pbtn:disabled {
  opacity: 0.4;
  cursor: default;
}
.pbtn__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (prefers-reduced-motion: reduce) {
  .pbtn {
    transition: none;
  }
}
</style>
