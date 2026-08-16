<script setup lang="ts">
// A binary toggle. role="switch" rather than a checkbox, because it commits
// immediately rather than on a form submit — and that difference is what a
// screen reader needs told.
import { useId } from 'vue'

withDefaults(
  defineProps<{ modelValue: boolean; label?: string; disabled?: boolean; size?: 'sm' | 'md' }>(),
  { size: 'md' },
)
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const uid = useId()
</script>

<template>
  <div class="ui-switch" :class="[`ui-switch--${size}`, { 'is-disabled': disabled }]">
    <button
      :id="uid"
      class="ui-switch__track ui-focus-ring"
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :aria-label="label"
      :disabled="disabled"
      @click="emit('update:modelValue', !modelValue)"
    >
      <span class="ui-switch__knob"></span>
    </button>
    <label v-if="label" class="ui-switch__label" :for="uid">{{ label }}</label>
  </div>
</template>

<style scoped>
.ui-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}
.ui-switch.is-disabled {
  opacity: 0.5;
}
.ui-switch__track {
  position: relative;
  width: 38px;
  height: 22px;
  padding: 0;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: var(--theme-input);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.ui-switch--sm .ui-switch__track {
  width: 32px;
  height: 18px;
}
.ui-switch__track[aria-checked='true'] {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
}
.ui-switch__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--theme-on-accent);
  transition: transform var(--dur-fast) var(--ease-out);
}
.ui-switch--sm .ui-switch__knob {
  width: 12px;
  height: 12px;
}
.ui-switch__track[aria-checked='true'] .ui-switch__knob {
  transform: translateX(16px);
}
.ui-switch--sm .ui-switch__track[aria-checked='true'] .ui-switch__knob {
  transform: translateX(14px);
}
.ui-switch__label {
  font-size: var(--text-md);
  color: var(--theme-text);
  cursor: pointer;
}
</style>
