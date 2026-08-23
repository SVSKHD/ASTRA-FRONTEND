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
/* Section 24b: a badge is a tinted surface, so it names both halves of its
   pair. The label sits at --text-primary on a tint of the tone colour; the tone
   colour itself carries the border and the glyph, where it is a signal rather
   than something that has to be read. Setting the tone as the *text* is what
   put an info badge at 2.4:1 on the pale themes. */
.ui-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 2px var(--sp-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--badge-tone);
  background: color-mix(in oklch, var(--badge-tone) 12%, var(--bg-base, transparent));
  color: var(--text-primary, var(--theme-text));
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.03em;
}
.ui-badge__glyph {
  color: var(--badge-tone);
  font-weight: var(--weight-semibold);
}
.ui-badge--neutral {
  --badge-tone: var(--text-muted, var(--theme-dim));
}
.ui-badge--success {
  --badge-tone: var(--theme-success, var(--theme-text));
}
.ui-badge--warning {
  --badge-tone: var(--theme-warning, var(--theme-text));
}
.ui-badge--danger {
  --badge-tone: var(--theme-danger, var(--theme-text));
}
.ui-badge--info {
  --badge-tone: var(--theme-accent);
}
</style>
