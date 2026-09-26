<script setup lang="ts">
// A determinate progress line (Todo v2 sheet, "Progress · page / detail").
//
// Three heights, two fills, one motion. `md` is the 5px page bar with the
// accent gradient; `lg` is the 6px detail bar, solid accent; `sm` is the 4px
// phone bar. The fill moves by `transform: scaleX()` from the left rather than
// by width, so it composites instead of relayouting, over the sheet's fill
// curve — and `delay` lets a caller put it last in a sequence: the Todo list
// waits 150ms so the bar moves after the checkbox has popped and the strike
// has drawn, not at the same instant.
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    max?: number
    label?: string
    size?: 'sm' | 'md' | 'lg'
    /** Solid accent instead of the gradient pair. The detail pane's bar. */
    solid?: boolean
    /** Milliseconds before the fill starts moving. */
    delay?: number
  }>(),
  { max: 100, size: 'md', solid: false, delay: 0 },
)
const ratio = computed(() => Math.max(0, Math.min(1, props.value / (props.max || 1))))
</script>

<template>
  <div
    class="ui-progress"
    :class="[`ui-progress--${size}`, { 'ui-progress--solid': solid }]"
    :style="{ '--pb-delay': delay + 'ms' }"
  >
    <div
      class="ui-progress__track"
      role="progressbar"
      :aria-valuenow="value"
      :aria-valuemin="0"
      :aria-valuemax="max"
      :aria-label="label"
    >
      <div class="ui-progress__fill" :style="{ transform: `scaleX(${ratio})` }"></div>
    </div>
  </div>
</template>

<style scoped>
.ui-progress__track {
  width: 100%;
  border-radius: 3px;
  background: color-mix(in srgb, var(--theme-text) 7%, transparent);
  overflow: hidden;
}
.ui-progress--sm .ui-progress__track {
  height: 4px;
}
.ui-progress--md .ui-progress__track {
  height: 5px;
}
.ui-progress--lg .ui-progress__track {
  height: 6px;
  background: color-mix(in srgb, var(--theme-text) 8%, transparent);
}
/* Always full width; the ratio is a transform, so the bar never relayouts and
   the motion runs on the compositor. */
.ui-progress__fill {
  width: 100%;
  height: 100%;
  transform-origin: left;
  background: linear-gradient(
    90deg,
    var(--accent-grad-from, var(--theme-accent)),
    var(--accent-grad-to, var(--theme-accent))
  );
  transition: transform var(--dur-fill) var(--ease-soft) var(--pb-delay, 0ms);
}
.ui-progress--solid .ui-progress__fill {
  background: var(--theme-accent);
}
</style>
