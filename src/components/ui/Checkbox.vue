<script setup lang="ts">
// A checkbox with a real input underneath, so the label, keyboard and
// indeterminate state all come for free rather than being re-implemented.
import { useId } from 'vue'

withDefaults(
  defineProps<{
    modelValue: boolean
    label?: string
    disabled?: boolean
    indeterminate?: boolean
  }>(),
  {},
)
defineEmits<{ 'update:modelValue': [boolean] }>()
const uid = useId()
</script>

<template>
  <label class="ui-check" :class="{ 'is-disabled': disabled }" :for="uid">
    <input
      :id="uid"
      class="ui-check__input ui-sr-only"
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      :indeterminate="indeterminate"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="ui-check__box" aria-hidden="true">
      <span v-if="indeterminate">–</span>
      <span v-else-if="modelValue">✓</span>
    </span>
    <span v-if="label" class="ui-check__label">{{ label }}</span>
  </label>
</template>

<style scoped>
.ui-check {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  cursor: pointer;
  font-size: var(--text-md);
  color: var(--theme-text);
}
.ui-check.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-check__box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 5px;
  border: 1.5px solid var(--glass-border);
  background: var(--theme-input);
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--theme-on-accent);
  transition: background var(--dur-fast) var(--ease-out);
}
.ui-check__input:checked + .ui-check__box,
.ui-check__input:indeterminate + .ui-check__box {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
}
.ui-check__input:focus-visible + .ui-check__box {
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--theme-accent) 32%, transparent);
}
</style>
