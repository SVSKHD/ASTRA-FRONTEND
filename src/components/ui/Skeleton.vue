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
/* FLAT, AND THAT IS THE POINT (section 43, item 5).
   
   The four loading treatments have one job each and none of them overlaps. A
   skeleton is first paint: it says "this is the shape of what is coming", and
   it says it by being that shape. It used to also sweep a gradient across
   itself, which is the shimmer's sentence — "what you are reading is being
   replaced" — said about content that is not there to replace. Two treatments
   on one element, saying two different things, one of them untrue.
   
   So the bar is a flat wash of the panel's own hairline colour. A caller that
   wants the sweep asks for it by name, on a panel that has content in it. */
.ui-skeleton__bar {
  display: block;
  background: color-mix(in oklch, var(--glass-border) 65%, transparent);
}
</style>
