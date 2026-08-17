<script setup lang="ts">
// A native select in the system's clothing. Native on purpose: it inherits the
// platform's own picker on mobile, which no custom listbox matches.
import { useId } from 'vue'

export interface SelectOption {
  value: string
  label: string
}

withDefaults(
  defineProps<{
    modelValue: string
    options: SelectOption[]
    label?: string
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
  }>(),
  { size: 'md' },
)
defineEmits<{ 'update:modelValue': [string] }>()
const uid = useId()
</script>

<template>
  <div class="ui-select" :class="`ui-select--${size}`">
    <label v-if="label" class="ui-select__label" :for="uid">{{ label }}</label>
    <select
      :id="uid"
      class="ui-select__control ui-focus-ring"
      :value="modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
    </select>
  </div>
</template>

<style scoped>
.ui-select {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.ui-select__label {
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.ui-select__control {
  padding: 0 var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--theme-input);
  color: var(--theme-text);
  font-size: var(--text-md);
  font-family: inherit;
  cursor: pointer;
}
.ui-select--sm .ui-select__control {
  min-height: var(--control-sm);
}
.ui-select--md .ui-select__control {
  min-height: var(--control-md);
}
.ui-select--lg .ui-select__control {
  min-height: var(--control-lg);
}
.ui-select__control:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
