<script setup lang="ts">
// The primary action control. Variant, size and state are props — a button never
// carries page-specific styling, which is what lets the same component serve a
// dialog footer and a toolbar.
//
// A PILL, per the Todo v2 sheet: every button in the shell — "+ New todo",
// "Done, next", "Move to today", "Undo", EXPORT — is a fully rounded capsule,
// and a rounded-rectangle button beside them read as belonging to a different
// app. The five variants are the sheet's five rows: primary (solid accent),
// secondary (outline), ghost (text), tinted (accent at 18%, the Undo button)
// and danger. `caps` is the small uppercase tracked label of the toolbar's
// EXPORT and SELECT; `count` hangs a number badge after the label, as the
// Weekly review button carries its undecided count.
import SaveState from '@/components/ui/SaveState.vue'
import type { SaveState as SaveStateValue } from '@/composables/useSaveState'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'tinted' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    loading?: boolean
    block?: boolean
    type?: 'button' | 'submit'
    /** Uppercase, tracked, one step smaller: the toolbar's EXPORT / SELECT. */
    caps?: boolean
    /** A count badge after the label. Omitted (or 0) draws nothing. */
    count?: number
    /**
     * The three states of a save (section 41).
     *
     * Different from `loading`, and the difference is the point. `loading` adds
     * a spinner BESIDE the label, so the button is wider while it is busy and
     * says nothing at all when it finishes. `state` puts a reserved box in the
     * label's place-holder position that never changes size, and it has a
     * finish: a check that is held long enough to read, or an error that stays
     * until it is dealt with.
     */
    state?: SaveStateValue
  }>(),
  { variant: 'primary', size: 'md', type: 'button', caps: false, count: 0 },
)

/** Working is busy; so is `loading`. Done and failed are not — the button works. */
const busy = () => props.loading || props.state === 'working'
</script>

<template>
  <button
    class="ui-btn ui-focus-ring"
    :class="[
      `ui-btn--${variant}`,
      `ui-btn--${size}`,
      { 'ui-btn--block': block, 'ui-btn--caps': caps },
    ]"
    :type="type"
    :disabled="disabled || busy()"
    :aria-busy="busy()"
  >
    <span v-if="loading" class="ui-btn__spinner" aria-hidden="true"></span>
    <SaveState v-if="state" :state="state" />
    <slot />
    <span v-if="count" class="ui-btn__count">{{ count }}</span>
  </button>
</template>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  font-weight: var(--weight-semibold);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}
.ui-btn:active:not(:disabled) {
  transform: translateY(1px);
}
.ui-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-btn--block {
  width: 100%;
}
.ui-btn--sm {
  min-height: var(--control-sm);
  padding: 0 var(--sp-3);
  font-size: var(--text-xs);
}
.ui-btn--md {
  min-height: var(--control-md);
  padding: 0 var(--sp-4);
  font-size: var(--text-sm);
}
.ui-btn--lg {
  min-height: var(--control-lg);
  padding: 0 var(--sp-5);
  font-size: var(--text-base);
}
.ui-btn--caps {
  font-size: var(--text-2xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
/* Solid accent, and no glow: the sheet's "+ New todo" is a flat pill, and the
   old 18px accent halo was the one glowing control in a strip of things that
   do not glow. Hover lifts it a pixel and lightens the fill a step instead. */
.ui-btn--primary {
  background: var(--theme-accent);
  color: var(--theme-on-accent);
}
.ui-btn--primary:hover:not(:disabled) {
  background: color-mix(in oklch, var(--theme-accent) 92%, var(--theme-text));
  transform: translateY(-1px);
}
.ui-btn--secondary {
  background: transparent;
  border-color: color-mix(in srgb, var(--theme-text) 18%, transparent);
  color: var(--theme-text);
}
.ui-btn--secondary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  border-color: color-mix(in srgb, var(--theme-text) 28%, transparent);
}
.ui-btn--ghost {
  background: transparent;
  color: var(--theme-dim);
}
.ui-btn--ghost:hover:not(:disabled) {
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
}
/* A tint of the accent under primary text: the label stays readable on every
   theme because the hue is on the surface, not on the words (section 24b). */
.ui-btn--tinted {
  background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
  color: var(--theme-text);
}
.ui-btn--tinted:hover:not(:disabled) {
  background: color-mix(in srgb, var(--theme-accent) 26%, transparent);
}
.ui-btn--danger {
  background: transparent;
  border-color: var(--theme-danger, var(--theme-text));
  color: var(--theme-danger, var(--theme-text));
}
.ui-btn--danger:hover:not(:disabled) {
  background: color-mix(in oklch, var(--theme-danger, var(--theme-text)) 14%, transparent);
}
.ui-btn__count {
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
  color: var(--theme-text);
  font-size: var(--text-2xs);
  line-height: var(--lh-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0;
  text-transform: none;
}
.ui-btn--primary .ui-btn__count {
  background: color-mix(in srgb, var(--theme-on-accent) 16%, transparent);
  color: inherit;
}
.ui-btn__spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: uiSpin 700ms linear infinite;
}
@keyframes uiSpin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-btn__spinner {
    animation-duration: 2s;
  }
  .ui-btn--primary:hover:not(:disabled) {
    transform: none;
  }
}
</style>
