<script setup lang="ts">
// A tag/chip: label, optional colour, optional icon, optional remove.
//
// The Todo v2 sheet has two chips and this is both. A TAG is an outlined pill:
// the tag's hue on its border and its dot, primary text inside, at 12px on a
// row and 11px (`sm`) beside a subtask. A PARSED chip — what quick add
// understood: "CRM", "Fri", "5pm reminder" — is the `accent` tone: an accent
// tint with an icon saying which kind of token it was. Under a mono theme the
// dot becomes an outlined shape, which is why the dot is a prop rather than a
// caller-drawn span.
import Icon from '@/components/ui/Icon.vue'
import type { IconName } from '@/components/ui/icons'

withDefaults(
  defineProps<{
    label: string
    color?: string
    icon?: IconName
    tone?: 'neutral' | 'accent'
    removable?: boolean
    selected?: boolean
    size?: 'sm' | 'md'
  }>(),
  { size: 'md', tone: 'neutral' },
)
defineEmits<{ remove: []; click: [] }>()
</script>

<template>
  <span
    class="ui-chip"
    :class="[`ui-chip--${size}`, `ui-chip--${tone}`, { 'is-selected': selected }]"
    :style="color ? { '--chip-color': color } : undefined"
  >
    <Icon v-if="icon" :name="icon" size="xs" class="ui-chip__icon" />
    <span v-else-if="color" class="ui-chip__dot" aria-hidden="true"></span>
    {{ label }}
    <button
      v-if="removable"
      class="ui-chip__x"
      type="button"
      :aria-label="`Remove ${label}`"
      @click.stop="$emit('remove')"
    >
      ×
    </button>
  </span>
</template>

<style scoped>
/* Section 24b: the chip's hue is on its border and its dot, never on its text.
   It used to set --chip-color as both the fill and the label, which is one hue
   twelve percent apart from itself — a ratio no theme could rescue. */
.ui-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--chip-color, color-mix(in srgb, var(--theme-text) 22%, transparent));
  color: var(--text-primary, var(--theme-text));
  background: transparent;
  white-space: nowrap;
  font-weight: var(--weight-medium);
}
.ui-chip--sm {
  padding: 1px var(--sp-2);
  font-size: var(--text-2xs);
  line-height: var(--lh-xs);
}
.ui-chip--md {
  padding: 1px 9px;
  font-size: var(--text-xs);
  line-height: var(--lh-sm);
}
.ui-chip--accent {
  padding-block: 3px;
  border-color: color-mix(in srgb, var(--theme-accent) 32%, transparent);
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
}
.ui-chip--accent .ui-chip__icon {
  color: var(--theme-accent);
}
.ui-chip.is-selected {
  border-color: var(--theme-accent);
  background: color-mix(in oklch, var(--theme-accent) 18%, var(--bg-base, transparent));
}
.ui-chip__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--chip-color, var(--theme-accent));
}
.ui-chip__x {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: var(--text-xs);
  line-height: 1;
  padding: 0 2px;
}
</style>
