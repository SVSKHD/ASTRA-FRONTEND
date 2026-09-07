<script setup lang="ts">
// Two to five mutually exclusive options, all visible at once (section 25b).
//
// THE ONLY PICK-ONE-OF-N STRIP IN THE APP. `Tabs` used to be a second
// implementation of this same control — same roving tabindex, same arrow keys,
// same "all the options, one of them on" — differing only in its ARIA and in a
// hundred lines of near-identical CSS that drifted apart anyway. It is now a
// thin wrapper around this file, so there is one keyboard model to get right,
// one appearance to keep, and one place a fix lands.
//
// WHAT THE WRAPPER STILL BUYS, and why it was not simply deleted: the two are
// not the same PROMISE. A radio group picks a value that some other control
// will act on; a tab strip switches what is on screen right now, and assistive
// technology says so — "tab 2 of 4" against "radio button, 2 of 4". That
// distinction is carried by `as`, and by nothing else.
//
// It is one roving-tabindex group, not a row of buttons: arrow keys move the
// selection, Tab leaves the control. A row of tab stops that all do the same
// kind of thing is the commonest way a keyboard user loses their place.
//
// THE ARROW KEYS STOP HERE. `.stop` as well as `.prevent`, because the shell
// binds the same four keys on `document` to step through the app's tabs: with
// the key still bubbling, arrowing along Personal · Business · All moved the
// segment AND switched the whole workspace to another tab underneath it. One
// press must not have two answers. `.prevent` alone was not enough — it stops
// the browser's default, not other listeners.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'

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
    /**
     * What this strip IS, to assistive technology.
     *
     * `radiogroup` (the default) picks a value — Repeats, Side, Which money.
     * `tablist` switches what is on screen — Journal / Signals / Combined,
     * Overview / Transactions / Debts / Tags. Same control, same keys, same
     * paint; a different sentence read out to somebody who cannot see it.
     *
     * Call sites do not usually set this: `Tabs` sets it, and a strip that
     * switches views should be written as a `<Tabs>` so the choice is made by
     * picking the right component rather than by remembering a prop.
     */
    as?: 'radiogroup' | 'tablist'
  }>(),
  { size: 'md', as: 'radiogroup' },
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const track = ref<HTMLElement | null>(null)
const buttons = ref<HTMLButtonElement[]>([])
const index = computed(() => props.options.findIndex((o) => o.value === props.modelValue))

// ---- the thumb -------------------------------------------------------------
//
// THE SELECTION IS ONE ELEMENT THAT MOVES, not a background that switches off
// here and on there. Those two look identical in a screenshot and completely
// different in use: a fill that cross-fades tells you the selection changed,
// while a thumb that travels tells you WHERE IT WENT, which is the thing the
// eye was about to go looking for. It is the same reason the control shows
// every option at once rather than a dropdown — the alternatives are supposed
// to be part of the picture.
//
// Measured rather than computed from percentages, because the segments are not
// equal width: they size to their own labels (see `flex: 1 0 auto` below), so
// "one third across" is not where the third segment is.
const thumb = ref({ x: 0, y: 0, w: 0, h: 0, ready: false })
/** Off for the first paint, so the thumb appears in place instead of flying in. */
const animated = ref(false)

function measure(): void {
  const el = buttons.value[index.value]
  // `offsetLeft`/`offsetTop` are relative to the nearest positioned ancestor,
  // which is the track — the same coordinate system the thumb is placed in, so
  // the track's own border and padding are accounted for without arithmetic.
  // A zero width means the element is not laid out yet (or never will be, under
  // a test renderer with no layout): the CSS fallback covers that case.
  if (!el || !track.value || !el.offsetWidth) {
    thumb.value = { ...thumb.value, ready: false }
    return
  }
  thumb.value = {
    x: el.offsetLeft,
    y: el.offsetTop,
    w: el.offsetWidth,
    h: el.offsetHeight,
    ready: true,
  }
}

async function remeasure(): Promise<void> {
  await nextTick()
  measure()
}

let observer: ResizeObserver | null = null

onMounted(async () => {
  await remeasure()
  // One frame with the thumb parked where it belongs, THEN turn the movement
  // on. Without this every strip in the app slides in from the left on mount,
  // which is a page announcing itself rather than a control answering a click.
  requestAnimationFrame(() => (animated.value = true))
  if (typeof ResizeObserver !== 'undefined' && track.value) {
    observer = new ResizeObserver(() => measure())
    observer.observe(track.value)
    for (const b of buttons.value) if (b) observer.observe(b)
  }
  // A webfont swapping in changes every label's width after layout has already
  // settled, which would leave the thumb a few pixels off the segment it is
  // supposed to be under.
  void document.fonts?.ready.then(measure)
})
onBeforeUnmount(() => observer?.disconnect())

// The selection, the option set and the size step all move it.
watch(() => [props.modelValue, props.options, props.size], remeasure, { deep: true })

const isTabs = computed(() => props.as === 'tablist')
/** `aria-checked` on a radio, `aria-selected` on a tab. Never both, never neither. */
const optionRole = computed(() => (isTabs.value ? 'tab' : 'radio'))

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
    ref="track"
    class="ui-seg"
    :class="[
      `ui-seg--${size}`,
      { 'is-disabled': disabled, 'has-thumb': thumb.ready, 'is-animated': animated },
    ]"
    :role="as"
    :aria-label="ariaLabel"
    @keydown.left.stop.prevent="move(-1)"
    @keydown.up.stop.prevent="move(-1)"
    @keydown.right.stop.prevent="move(1)"
    @keydown.down.stop.prevent="move(1)"
    @keydown.home.stop.prevent="move(-index)"
    @keydown.end.stop.prevent="move(options.length - 1 - index)"
  >
    <!-- The travelling selection. `aria-hidden`, and after the buttons in the
         DOM only so it cannot take a tab stop — it is painted underneath them
         by z-index, not by document order. -->
    <span
      v-if="thumb.ready"
      class="ui-seg__thumb"
      aria-hidden="true"
      :style="{
        transform: `translate(${thumb.x}px, ${thumb.y}px)`,
        width: `${thumb.w}px`,
        height: `${thumb.h}px`,
      }"
    ></span>

    <button
      v-for="(opt, i) in options"
      :key="opt.value"
      :ref="(el) => (buttons[i] = el as HTMLButtonElement)"
      type="button"
      :role="optionRole"
      class="ui-seg__opt ui-focus-ring"
      :class="{ 'is-active': opt.value === modelValue }"
      :aria-checked="isTabs ? undefined : opt.value === modelValue"
      :aria-selected="isTabs ? opt.value === modelValue : undefined"
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
  /* Never wider than the field it sits in, and if the options genuinely do not
     fit in that width the ROW scrolls — the same last resort `Tabs` takes. A
     strip that scrolls is recoverable; a strip that clips a word is not. */
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  /* The thumb is absolutely positioned against this box, so the track has to be
     the thing it is positioned against. It scrolls with the content, which is
     what keeps the two together when a strip is too wide for its field. */
  position: relative;
  padding: 2px;
  gap: 2px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-subtle, var(--glass-border));
  background: var(--bg-elevated, var(--glass-card));
}
/* The strip is one control-height tall; a scrollbar under it would be half its
   size and is noise on the common case, which fits. */
.ui-seg::-webkit-scrollbar {
  display: none;
}
.ui-seg__opt {
  display: flex;
  /* GROW TO FILL, NEVER SHRINK BELOW THE LABEL.
     This was `flex: 1`, which is `1 1 0` — every segment forced to the SAME
     width regardless of what is written in it. So a strip with room for
     "One-off" and "Monthly" side by side still clipped "Monthly", because the
     shorter word was being given half the space and the longer one had to fit
     in the same half. The Expenses form read "One-off | Mont…" and the Finances
     scope read "Perso… | Busin… | All" for that reason and no other.
     `1 0 auto` starts each segment at its content width and shares the slack
     out from there, so the widest label sets the floor rather than paying for
     the narrowest. */
  flex: 1 0 auto;
  align-items: center;
  justify-content: center;
  gap: var(--sp-1);
  min-width: 0;
  /* A transparent border of the same width the active segment paints, so
     selecting one does not nudge the row by a pixel. */
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  /* Above the thumb, which is what lets the fill pass behind the label rather
     than over it. */
  position: relative;
  z-index: 1;
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
/* The label is no longer what gives when space runs short — the track scrolls
   instead. An ellipsis here was a safety net that turned out to be the thing
   doing the damage: it made a one-pixel shortfall look like a deliberate
   abbreviation, and "Mont…" is not a word anybody can act on. */
.ui-seg__label {
  min-width: 0;
}
/* THE THUMB CARRIES THE FILL. The active button carries only its type.
   Split that way because the fill is the part that has to MOVE, and a
   background belongs to the element it is on — it can fade, it cannot travel.
   The button keeps the colour and the weight, which are properties of the text
   and would look wrong sliding. */
.ui-seg__thumb {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  border-radius: var(--radius-pill);
  border: 1px solid color-mix(in oklch, var(--theme-accent) 45%, transparent);
  background: color-mix(in oklch, var(--theme-accent) 20%, var(--bg-base, transparent));
  box-shadow: inset 0 1px 4px color-mix(in oklch, var(--theme-accent) 32%, transparent);
  pointer-events: none;
}
/* Movement is switched on one frame after mount — see `animated` above. */
.ui-seg.is-animated .ui-seg__thumb {
  transition:
    transform var(--dur-med) var(--ease-out),
    width var(--dur-med) var(--ease-out),
    height var(--dur-med) var(--ease-out);
}
.ui-seg__opt.is-active {
  color: var(--text-primary, var(--theme-text));
  font-weight: var(--weight-semibold);
}
/* THE FALLBACK, and it is load-bearing rather than defensive.
   The thumb needs layout to exist — a measured width — so before the first
   frame, under a test renderer, or anywhere ResizeObserver and `offsetWidth`
   are not real, there is nothing to draw. The active segment then paints its
   own fill exactly as it did before the thumb existed, so the control is never
   momentarily missing its selection. `has-thumb` is the handover. */
.ui-seg:not(.has-thumb) .ui-seg__opt.is-active {
  background: color-mix(in oklch, var(--theme-accent) 20%, var(--bg-base, transparent));
  border-color: color-mix(in oklch, var(--theme-accent) 45%, transparent);
  box-shadow: inset 0 1px 4px color-mix(in oklch, var(--theme-accent) 32%, transparent);
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
  .ui-seg__opt,
  .ui-seg.is-animated .ui-seg__thumb {
    transition: none;
  }
}
.ui-seg.is-disabled {
  opacity: 0.55;
  pointer-events: none;
}
</style>
