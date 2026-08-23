<script setup lang="ts">
// A tag/chip: label, optional colour dot, optional remove. Under a mono theme the
// dot becomes an outlined shape, which is why the dot is a slot-free prop rather
// than a caller-drawn span.
withDefaults(
  defineProps<{
    label: string
    color?: string
    removable?: boolean
    selected?: boolean
    size?: 'sm' | 'md'
  }>(),
  { size: 'sm' },
)
defineEmits<{ remove: []; click: [] }>()
</script>

<template>
  <span
    class="ui-chip"
    :class="[`ui-chip--${size}`, { 'is-selected': selected }]"
    :style="color ? { '--chip-color': color } : undefined"
  >
    <span v-if="color" class="ui-chip__dot" aria-hidden="true"></span>
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
  gap: var(--sp-1);
  border-radius: var(--radius-pill);
  border: 1px solid var(--chip-color, var(--glass-border));
  color: var(--text-primary, var(--theme-text));
  background: color-mix(
    in oklch,
    var(--chip-color, var(--theme-accent)) 12%,
    var(--bg-base, transparent)
  );
  white-space: nowrap;
  font-weight: var(--weight-semibold);
}
.ui-chip--sm {
  padding: 2px var(--sp-2);
  font-size: var(--text-2xs);
}
.ui-chip--md {
  padding: var(--sp-1) var(--sp-3);
  font-size: var(--text-xs);
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
