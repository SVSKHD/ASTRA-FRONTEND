<script setup lang="ts">
// A range input, themed. The value is shown alongside because a slider with no
// readout is a guess.
import { useId } from 'vue'

withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    step?: number
    label?: string
    disabled?: boolean
    showValue?: boolean
  }>(),
  { min: 0, max: 100, step: 1, showValue: true },
)
defineEmits<{ 'update:modelValue': [number] }>()
const uid = useId()
</script>

<template>
  <div class="ui-slider">
    <div v-if="label || showValue" class="ui-slider__head">
      <label v-if="label" :for="uid">{{ label }}</label>
      <span v-if="showValue" class="ui-slider__value">{{ modelValue }}</span>
    </div>
    <input
      :id="uid"
      class="ui-slider__input ui-focus-ring"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :disabled="disabled"
      @input="$emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />
  </div>
</template>

<style scoped>
.ui-slider {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.ui-slider__head {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.ui-slider__value {
  color: var(--theme-text);
  font-weight: 600;
}
.ui-slider__input {
  width: 100%;
  accent-color: var(--theme-accent);
  cursor: pointer;
}
.ui-slider__input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
