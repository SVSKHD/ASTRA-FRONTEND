<script setup lang="ts">
// A square button for a glyph. Separate from Button because an icon-only control
// needs a label for assistive tech, and making that a required prop is the only
// way it actually gets written.
//
// The Todo v2 sheet's three icon buttons, as one component: the 32px row action
// (timer, bell, ×) is `md`, the 28px subtask focus is `sm`, the 40px phone
// sheet action is `lg`. `tone` says what hovering means — accent for an action,
// danger for the delete — and `outline` is the framed close button of the
// details pane and the review drawer. Colour is only ever on the glyph and the
// hover tint, never on a label, so every tone survives a mono theme.
withDefaults(
  defineProps<{
    label: string
    size?: 'sm' | 'md' | 'lg'
    variant?: 'ghost' | 'solid' | 'outline'
    tone?: 'default' | 'accent' | 'danger'
    disabled?: boolean
    active?: boolean
  }>(),
  { size: 'md', variant: 'ghost', tone: 'accent' },
)
</script>

<template>
  <button
    class="ui-iconbtn ui-focus-ring"
    :class="[
      `ui-iconbtn--${size}`,
      `ui-iconbtn--${variant}`,
      `ui-iconbtn--${tone}`,
      { 'is-active': active },
    ]"
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
  flex-shrink: 0;
  padding: 0;
  border: 1px solid transparent;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  transition:
    color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.ui-iconbtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
/* Sizes and the radius that goes with each: 8 / 10 / 12 on 28 / 32 / 40. */
.ui-iconbtn--sm {
  width: var(--control-sm);
  height: var(--control-sm);
  border-radius: var(--radius-control);
  font-size: var(--text-xs);
}
.ui-iconbtn--md {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  font-size: var(--text-sm);
}
.ui-iconbtn--lg {
  width: var(--control-lg);
  height: var(--control-lg);
  border-radius: var(--radius-card);
  font-size: var(--text-md);
}
.ui-iconbtn--solid {
  background: var(--glass-card);
  border-color: var(--glass-border);
}
.ui-iconbtn--outline {
  border-color: var(--theme-border);
}
/* Hover: a tint of the tone under the glyph, and the glyph takes the tone. */
.ui-iconbtn--default:hover:not(:disabled) {
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-text) 8%, transparent);
}
.ui-iconbtn--accent:hover:not(:disabled),
.ui-iconbtn--accent.is-active {
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
}
.ui-iconbtn--danger:hover:not(:disabled) {
  color: var(--theme-danger, var(--theme-text));
  background: color-mix(in srgb, var(--theme-danger, var(--theme-text)) 12%, transparent);
}
.ui-iconbtn--default.is-active {
  color: var(--theme-text);
  border-color: var(--glass-border);
}
@media (prefers-reduced-motion: reduce) {
  .ui-iconbtn {
    transition: none;
  }
}
</style>
