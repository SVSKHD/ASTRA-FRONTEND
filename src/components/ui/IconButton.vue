<script setup lang="ts">
// A square button for a glyph. Separate from Button because an icon-only control
// needs a label for assistive tech, and making that a required prop is the only
// way it actually gets written.
withDefaults(
  defineProps<{
    label: string
    size?: 'sm' | 'md' | 'lg'
    variant?: 'ghost' | 'solid'
    disabled?: boolean
    active?: boolean
  }>(),
  { size: 'md', variant: 'ghost' },
)
</script>

<template>
  <button
    class="ui-iconbtn ui-focus-ring"
    :class="[`ui-iconbtn--${size}`, `ui-iconbtn--${variant}`, { 'is-active': active }]"
    type="button"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.ui-iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.ui-iconbtn:hover:not(:disabled),
.ui-iconbtn.is-active {
  color: var(--theme-text);
  border-color: var(--glass-border);
}
.ui-iconbtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ui-iconbtn--solid {
  background: var(--glass-card);
  border-color: var(--glass-border);
}
.ui-iconbtn--sm {
  width: var(--control-sm);
  height: var(--control-sm);
  font-size: var(--text-sm);
}
.ui-iconbtn--md {
  width: var(--control-md);
  height: var(--control-md);
  font-size: var(--text-md);
}
.ui-iconbtn--lg {
  width: var(--control-lg);
  height: var(--control-lg);
  font-size: var(--text-lg);
}
</style>
