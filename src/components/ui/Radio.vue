<script setup lang="ts">
// One radio in a group; the group is the caller's `name`, which is what makes
// arrow-key navigation between them work natively.
import { useId } from 'vue'

defineProps<{
  modelValue: string
  value: string
  name: string
  label?: string
  disabled?: boolean
}>()
defineEmits<{ 'update:modelValue': [string] }>()
const uid = useId()
</script>

<template>
  <label class="ui-radio" :class="{ 'is-disabled': disabled }" :for="uid">
    <input
      :id="uid"
      class="ui-radio__input ui-sr-only"
      type="radio"
      :name="name"
      :value="value"
      :checked="modelValue === value"
      :disabled="disabled"
      @change="$emit('update:modelValue', value)"
    />
    <span class="ui-radio__dot" aria-hidden="true"></span>
    <span v-if="label" class="ui-radio__label">{{ label }}</span>
  </label>
</template>

<style scoped>
.ui-radio {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  cursor: pointer;
  font-size: var(--text-md);
  color: var(--theme-text);
}
.ui-radio.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-radio__dot {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1.5px solid var(--glass-border);
  background: var(--theme-input);
  position: relative;
}
.ui-radio__input:checked + .ui-radio__dot {
  border-color: var(--theme-accent);
}
.ui-radio__input:checked + .ui-radio__dot::after {
  content: '';
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  background: var(--theme-accent);
}
.ui-radio__input:focus-visible + .ui-radio__dot {
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--theme-accent) 32%, transparent);
}
</style>
