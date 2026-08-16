<script setup lang="ts">
// A status badge. Tone maps to an icon and a label as well as a colour, so it
// still reads under the mono themes where hue carries nothing.
const props = withDefaults(
  defineProps<{ tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; label: string }>(),
  { tone: 'neutral' },
)
const GLYPH: Record<string, string> = {
  neutral: '•',
  success: '✓',
  warning: '!',
  danger: '×',
  info: 'i',
}
const glyph = GLYPH[props.tone]
</script>

<template>
  <span class="ui-badge" :class="`ui-badge--${tone}`">
    <span class="ui-badge__glyph" aria-hidden="true">{{ glyph }}</span>
    {{ label }}
  </span>
</template>

<style scoped>
.ui-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 2px var(--sp-2);
  border-radius: var(--radius-sm);
  border: 1px solid currentColor;
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.03em;
}
.ui-badge__glyph {
  font-weight: 900;
}
.ui-badge--neutral {
  color: var(--theme-dim);
}
.ui-badge--success {
  color: var(--theme-success, var(--theme-text));
}
.ui-badge--warning {
  color: var(--theme-warning, var(--theme-text));
}
.ui-badge--danger {
  color: var(--theme-danger, var(--theme-text));
}
.ui-badge--info {
  color: var(--theme-accent);
}
</style>
