<script setup lang="ts">
// The glass surface itself, as one component. Everything that used to write its
// own blur + border + shadow triple now composes this, which is what makes a
// blur-free theme a token change rather than a hunt.
withDefaults(
  defineProps<{ padding?: 'none' | 'sm' | 'md' | 'lg'; radius?: 'md' | 'lg' | 'xl' }>(),
  {
    padding: 'md',
    radius: 'lg',
  },
)
</script>

<template>
  <div class="ui-glass" :class="[`ui-glass--p-${padding}`, `ui-glass--r-${radius}`]">
    <slot />
  </div>
</template>

<style scoped>
.ui-glass {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  border: 1px solid var(--glass-border);
  box-shadow: var(--elev-1);
  color: var(--theme-text);
  min-width: 0;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .ui-glass {
    background: var(--glass-solid);
  }
}
.ui-glass--p-none {
  padding: 0;
}
.ui-glass--p-sm {
  padding: var(--sp-3);
}
.ui-glass--p-md {
  padding: var(--sp-4);
}
.ui-glass--p-lg {
  padding: var(--sp-5);
}
.ui-glass--r-md {
  border-radius: var(--radius-md);
}
.ui-glass--r-lg {
  border-radius: var(--radius-lg);
}
.ui-glass--r-xl {
  border-radius: var(--radius-xl);
}
</style>
