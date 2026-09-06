<script setup lang="ts">
// Two to four mutually exclusive options, all visible at once (section 25b).
//
// This replaces a radio group wherever the choices are few and short enough to
// show together — Task / Todo / Reminder, Month / Week / Day. A radio group
// makes the reader scan a column to find out what the alternatives even are; a
// segmented control shows the whole choice in the width of one field, which is
// why it is the right shape inside a popover.
//
// It is one roving-tabindex group, not a row of buttons: arrow keys move the
// selection, Tab leaves the control. A row of tab stops that all do the same
// kind of thing is the commonest way a keyboard user loses their place.
import { computed, ref, type Component } from 'vue'

export interface Segment {
  value: string
  label: string
  /**
   * An optional glyph, shown before the label.
   *
   * Optional because most segmented controls are choosing between words — Task
   * / Todo / Reminder needs no picture. It exists for the ones where the app
   * ALREADY draws a glyph for the same concept somewhere else: the trade log
   * shows a candle icon beside every session and an arrow beside every side, in
   * the table, the timeline and the preview, and the form that sets those two
   * values was the one surface rendering them as bare words.
   */
  icon?: Component
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: Segment[]
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    /** Names the group for a screen reader when there is no visible label. */
    ariaLabel?: string
  }>(),
  { size: 'md' },
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const buttons = ref<HTMLButtonElement[]>([])
const index = computed(() => props.options.findIndex((o) => o.value === props.modelValue))

/** The glyph rides the control's size step rather than being chosen per call. */
const iconPx = computed(() => (props.size === 'lg' ? 16 : props.size === 'md' ? 14 : 12))

function pick(value: string) {
  if (props.disabled) return
  emit('update:modelValue', value)
}

// Arrows wrap. With three options, wrapping is what makes "one to the left of
// the first" mean something rather than nothing.
function move(delta: number) {
  if (props.disabled || !props.options.length) return
  const from = index.value < 0 ? 0 : index.value
  const next = (from + delta + props.options.length) % props.options.length
  emit('update:modelValue', props.options[next].value)
  buttons.value[next]?.focus()
}
</script>

<template>
  <div
    class="ui-seg"
    :class="[`ui-seg--${size}`, { 'is-disabled': disabled }]"
    role="radiogroup"
    :aria-label="ariaLabel"
    @keydown.left.prevent="move(-1)"
    @keydown.up.prevent="move(-1)"
    @keydown.right.prevent="move(1)"
    @keydown.down.prevent="move(1)"
    @keydown.home.prevent="move(-index)"
    @keydown.end.prevent="move(options.length - 1 - index)"
  >
    <button
      v-for="(opt, i) in options"
      :key="opt.value"
      :ref="(el) => (buttons[i] = el as HTMLButtonElement)"
      type="button"
      role="radio"
      class="ui-seg__opt ui-focus-ring"
      :class="{ 'is-active': opt.value === modelValue }"
      :aria-checked="opt.value === modelValue"
      :tabindex="opt.value === modelValue || (index < 0 && i === 0) ? 0 : -1"
      :disabled="disabled"
      @click="pick(opt.value)"
    >
      <component :is="opt.icon" v-if="opt.icon" :size="iconPx" aria-hidden="true" />
      <span class="ui-seg__label">{{ opt.label }}</span>
    </button>
  </div>
</template>

<style scoped>
/* One accent per surface (section 24d): the track is neutral and only the
   selected segment takes the accent, so the control has a single anchor for
   the eye however many options it holds. */
.ui-seg {
  display: inline-flex;
  min-width: 0;
  padding: 2px;
  gap: 2px;
  border-radius: var(--radius-control);
  border: 1px solid var(--border-subtle, var(--glass-border));
  background: var(--bg-elevated, var(--glass-card));
}
.ui-seg__opt {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: var(--sp-1);
  min-width: 0;
  /* A transparent border of the same width the active segment paints, so
     selecting one does not nudge the row by a pixel. */
  border: 1px solid transparent;
  border-radius: calc(var(--radius-control) - 2px);
  background: transparent;
  color: var(--text-muted, var(--theme-dim));
  font-family: inherit;
  font-size: var(--text-base);
  line-height: var(--lh-base);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}
/* The label truncates rather than pushing the track wider than its column: a
   three-segment control with glyphs inside a form column is the tight case, and
   an overflowing track breaks the grid around it. The glyph never shrinks — it
   is the half that still reads at 40px. */
.ui-seg__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* The selected segment is a raised chip, not a tint.
   It carries the same three layers the dock's active tab and the tab strip do —
   an accent fill, an edge against the track, and a soft lift — so "the one that
   is on" looks the same in a form as it does in the chrome. */
.ui-seg__opt.is-active {
  background: color-mix(in oklch, var(--theme-accent) 20%, var(--bg-base, transparent));
  border-color: color-mix(in oklch, var(--theme-accent) 45%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 16%, transparent),
    0 2px 8px color-mix(in oklch, var(--theme-accent) 22%, transparent);
  color: var(--text-primary, var(--theme-text));
  font-weight: var(--weight-semibold);
}
.ui-seg__opt:hover:not(.is-active):not(:disabled) {
  background: color-mix(in oklch, var(--theme-accent) 8%, transparent);
  color: var(--text-primary, var(--theme-text));
}
.ui-seg--sm .ui-seg__opt {
  height: calc(var(--control-h-sm) - 6px);
  padding: 0 var(--sp-2);
}
.ui-seg--md .ui-seg__opt {
  height: calc(var(--control-h-md) - 6px);
  padding: 0 var(--sp-3);
}
.ui-seg--lg .ui-seg__opt {
  height: calc(var(--control-h-lg) - 6px);
  padding: 0 var(--sp-4);
}
@media (prefers-reduced-motion: reduce) {
  .ui-seg__opt {
    transition: none;
  }
}
.ui-seg.is-disabled {
  opacity: 0.55;
  pointer-events: none;
}
</style>
