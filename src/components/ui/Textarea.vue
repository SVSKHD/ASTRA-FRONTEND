<script setup lang="ts">
// The multi-line field, sharing Input's label/hint/error contract so a form does
// not have two different ways to describe a control.
import { useId } from 'vue'

withDefaults(
  defineProps<{
    modelValue: string
    label?: string
    hint?: string
    error?: string
    placeholder?: string
    rows?: number
    disabled?: boolean
  }>(),
  { rows: 3 },
)
defineEmits<{ 'update:modelValue': [string] }>()
const uid = useId()
</script>

<template>
  <div class="ui-textarea" :class="{ 'is-error': !!error }">
    <label v-if="label" class="ui-textarea__label" :for="uid">{{ label }}</label>
    <textarea
      :id="uid"
      class="ui-textarea__input ui-focus-ring"
      :rows="rows"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="!!error"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    ></textarea>
    <p v-if="error" class="ui-textarea__error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="ui-textarea__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.ui-textarea {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.ui-textarea__label {
  font-size: var(--text-2xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.ui-textarea__input {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--theme-input);
  color: var(--theme-text);
  font-family: inherit;
  font-size: var(--text-sm);
  resize: vertical;
}
.ui-textarea__input:focus-visible {
  border-color: var(--theme-accent);
}
.ui-textarea.is-error .ui-textarea__input {
  border-color: var(--theme-danger, var(--theme-text));
}
.ui-textarea__hint,
.ui-textarea__error {
  margin: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.ui-textarea__error {
  color: var(--theme-danger, var(--theme-text));
  font-weight: var(--weight-semibold);
}
</style>
