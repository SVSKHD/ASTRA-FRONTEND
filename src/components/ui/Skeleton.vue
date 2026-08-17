<script setup lang="ts">
// A loading placeholder. Shaped like the content it stands in for, so the layout
// does not jump when the real thing arrives.
withDefaults(defineProps<{ width?: string; height?: string; radius?: string; lines?: number }>(), {
  width: '100%',
  height: '12px',
  radius: 'var(--radius-sm)',
  lines: 1,
})
</script>

<template>
  <div class="ui-skeleton" aria-hidden="true">
    <span
      v-for="n in lines"
      :key="n"
      class="ui-skeleton__bar"
      :style="{ width: n === lines && lines > 1 ? '60%' : width, height, borderRadius: radius }"
    ></span>
  </div>
</template>

<style scoped>
.ui-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  width: 100%;
}
.ui-skeleton__bar {
  display: block;
  background: linear-gradient(
    90deg,
    color-mix(in oklch, var(--glass-border) 45%, transparent),
    color-mix(in oklch, var(--glass-border) 85%, transparent),
    color-mix(in oklch, var(--glass-border) 45%, transparent)
  );
  background-size: 200% 100%;
  animation: uiShimmer 1.4s linear infinite;
}
@keyframes uiShimmer {
  to {
    background-position: -200% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-skeleton__bar {
    animation: none;
  }
}
</style>
