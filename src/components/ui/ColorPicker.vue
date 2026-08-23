<script setup lang="ts">
// A swatch grid rather than a native colour input: the app's colours are a fixed
// palette, and a free colour wheel would let a user pick something that fails
// contrast against their own theme.
withDefaults(defineProps<{ modelValue: string; colors?: string[]; label?: string }>(), {
  colors: () => [
    'oklch(0.72 0.16 250)',
    'oklch(0.72 0.15 150)',
    'oklch(0.75 0.16 65)',
    'oklch(0.68 0.19 320)',
    'oklch(0.65 0.2 25)',
    'oklch(0.7 0.13 200)',
  ],
})
defineEmits<{ 'update:modelValue': [string] }>()
</script>

<template>
  <div class="ui-colors" role="radiogroup" :aria-label="label || 'Colour'">
    <button
      v-for="color in colors"
      :key="color"
      class="ui-colors__swatch ui-focus-ring"
      :class="{ 'is-selected': modelValue === color }"
      type="button"
      role="radio"
      :aria-checked="modelValue === color"
      :aria-label="color"
      :style="{ '--swatch': color }"
      @click="$emit('update:modelValue', color)"
    >
      <span v-if="modelValue === color" aria-hidden="true">✓</span>
    </button>
  </div>
</template>

<style scoped>
.ui-colors {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.ui-colors__swatch {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid transparent;
  background: var(--swatch);
  color: var(--theme-on-accent);
  font-size: var(--text-2xs);
  font-weight: 900;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ui-colors__swatch.is-selected {
  border-color: var(--theme-text);
}
</style>
