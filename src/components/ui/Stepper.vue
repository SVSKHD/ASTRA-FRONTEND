<script setup lang="ts">
// A numeric stepper. The text input stays editable, because typing 47 is faster
// than pressing + forty-seven times.
const props = withDefaults(
  defineProps<{ modelValue: number; min?: number; max?: number; step?: number; label?: string }>(),
  { min: 0, max: 999, step: 1 },
)
const emit = defineEmits<{ 'update:modelValue': [number] }>()

function nudge(delta: number) {
  const next = Math.min(props.max, Math.max(props.min, props.modelValue + delta * props.step))
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="ui-stepper">
    <span v-if="label" class="ui-sr-only">{{ label }}</span>
    <button
      class="ui-stepper__btn ui-focus-ring"
      type="button"
      aria-label="Decrease"
      :disabled="modelValue <= min"
      @click="nudge(-1)"
    >
      −
    </button>
    <input
      class="ui-stepper__input"
      type="number"
      :value="modelValue"
      :min="min"
      :max="max"
      :aria-label="label"
      @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />
    <button
      class="ui-stepper__btn ui-focus-ring"
      type="button"
      aria-label="Increase"
      :disabled="modelValue >= max"
      @click="nudge(1)"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.ui-stepper {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--theme-input);
  padding: 2px;
}
.ui-stepper__btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--theme-text);
  cursor: pointer;
  font-size: var(--text-md);
}
.ui-stepper__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ui-stepper__input {
  width: 46px;
  border: none;
  background: transparent;
  color: var(--theme-text);
  text-align: center;
  font-size: var(--text-md);
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
}
.ui-stepper__input::-webkit-outer-spin-button,
.ui-stepper__input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
</style>
