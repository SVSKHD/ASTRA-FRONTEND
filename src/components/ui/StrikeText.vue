<script setup lang="ts">
// Text that strikes itself through when it is done (Todo v2, 4a).
//
// Not `text-decoration: line-through`, which appears all at once: a line that
// DRAWS across the words from the left, 350ms with a 100ms delay so it follows
// the checkbox's pop, and then the text fades to 55%. Under reduced motion
// both happen at once. One component so the row, the sheet and the Next up
// list draw the same line.
withDefaults(defineProps<{ done: boolean }>(), { done: false })
</script>

<template>
  <span class="ui-strike" :class="{ 'is-done': done }">
    <span class="ui-strike__text"><slot /></span>
  </span>
</template>

<style scoped>
.ui-strike {
  display: inline;
  min-width: 0;
  transition: opacity var(--dur-pop) ease 250ms;
}
.ui-strike__text {
  position: relative;
}
.ui-strike__text::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 52%;
  height: 1.5px;
  background: currentColor;
  opacity: 0.7;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform var(--dur-strike) ease 100ms;
}
.ui-strike.is-done {
  opacity: 0.55;
}
.ui-strike.is-done .ui-strike__text::after {
  transform: scaleX(1);
}
@media (prefers-reduced-motion: reduce) {
  .ui-strike,
  .ui-strike__text::after {
    transition: none;
  }
}
</style>
