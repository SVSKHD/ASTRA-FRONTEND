<script setup lang="ts">
// The primary action control. Variant, size and state are props — a button never
// carries page-specific styling, which is what lets the same component serve a
// dialog footer and a toolbar.
import SaveState from '@/components/ui/SaveState.vue'
import type { SaveState as SaveStateValue } from '@/composables/useSaveState'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    loading?: boolean
    block?: boolean
    type?: 'button' | 'submit'
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
  { variant: 'primary', size: 'md', type: 'button' },
)

/** Working is busy; so is `loading`. Done and failed are not — the button works. */
const busy = () => props.loading || props.state === 'working'
</script>

<template>
  <button
    class="ui-btn ui-focus-ring"
    :class="[`ui-btn--${variant}`, `ui-btn--${size}`, { 'ui-btn--block': block }]"
    :type="type"
    :disabled="disabled || busy()"
    :aria-busy="busy()"
  >
    <span v-if="loading" class="ui-btn__spinner" aria-hidden="true"></span>
    <SaveState v-if="state" :state="state" />
    <slot />
  </button>
</template>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-weight: var(--weight-semibold);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
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
  font-size: var(--text-md);
}
/* The accent gradient is a token pair, so a theme that has no gradient still
   renders a solid accent rather than a broken background. */
.ui-btn--primary {
  background: linear-gradient(
    135deg,
    var(--accent-grad-from, var(--theme-accent)),
    var(--accent-grad-to, var(--theme-accent))
  );
  color: var(--theme-on-accent);
}
.ui-btn--primary:hover:not(:disabled) {
  box-shadow: 0 0 18px color-mix(in oklch, var(--theme-accent) 45%, transparent);
}
.ui-btn--secondary {
  background: var(--glass-card);
  border-color: var(--glass-border);
  color: var(--theme-text);
}
.ui-btn--secondary:hover:not(:disabled) {
  border-color: var(--theme-accent);
}
.ui-btn--ghost {
  background: transparent;
  color: var(--theme-dim);
}
.ui-btn--ghost:hover:not(:disabled) {
  color: var(--theme-text);
  background: color-mix(in oklch, var(--theme-accent) 12%, transparent);
}
.ui-btn--danger {
  background: transparent;
  border-color: var(--theme-danger, var(--theme-text));
  color: var(--theme-danger, var(--theme-text));
}
.ui-btn--danger:hover:not(:disabled) {
  background: color-mix(in oklch, var(--theme-danger, var(--theme-text)) 14%, transparent);
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
}
</style>
