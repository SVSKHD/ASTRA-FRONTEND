<script setup lang="ts">
// A count that rolls to its new value instead of snapping — used on the day
// accordion headers so a card migrating in or out reads as a live re-count.
// Keyed remount + a single-child <Transition> gives the roll; the leaving digit
// is taken out of flow so the badge width never jumps.
defineProps<{ value: number }>()
</script>

<template>
  <span class="num-roll">
    <Transition name="numpop">
      <span :key="value" class="num-roll-digit">{{ value }}</span>
    </Transition>
  </span>
</template>

<style scoped>
.num-roll {
  position: relative;
  display: inline-flex;
  justify-content: center;
  min-width: 1ch;
  vertical-align: baseline;
}
.num-roll-digit {
  display: inline-block;
}
.numpop-enter-active {
  transition:
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.3s ease;
}
.numpop-leave-active {
  position: absolute;
  left: 0;
  right: 0;
  transition:
    transform 0.22s ease,
    opacity 0.22s ease;
}
.numpop-enter-from {
  opacity: 0;
  transform: translateY(-0.55em) scale(0.6);
}
.numpop-leave-to {
  opacity: 0;
  transform: translateY(0.55em) scale(0.6);
}
</style>
