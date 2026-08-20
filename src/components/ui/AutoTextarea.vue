<script setup lang="ts">
// An inline-editable line of text that is always fully visible (section 20b).
//
// A single-line `<input>` cuts its content off mid-sentence and gives no way to
// read the rest without clicking into it and scrolling sideways. This is a
// textarea that grows to fit instead, so a three-line point renders as three
// lines and the whole thing is readable at rest.
//
// It is also borderless at rest. Ten bordered boxes stacked down a card is what
// makes a checklist look heavy — heavier than the text in them. Only the row
// being edited looks like a field: a subtle fill and a one-pixel accent border
// appear on focus and go again on blur.
import { computed } from 'vue'
import { rowKeyAction, useAutoResizeTextarea } from '@/composables/useAutoResizeTextarea'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    label?: string
    // Struck through and dimmed, but still fully readable.
    done?: boolean
    // Larger type for a title rather than a list line.
    variant?: 'body' | 'title'
    disabled?: boolean
    minHeight?: number
  }>(),
  { placeholder: '', label: '', done: false, variant: 'body', disabled: false, minHeight: 0 },
)

const emit = defineEmits<{
  'update:modelValue': [string]
  // Plain Enter: this line is finished, move to (or make) the next one.
  commit: []
  // Escape: put back what was there before.
  revert: []
  focus: []
  blur: []
}>()

const { el, onInput, resizeSoon } = useAutoResizeTextarea({
  watch: () => props.modelValue,
  minHeight: props.minHeight,
})

function onTextInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
  onInput()
}

function onKeydown(event: KeyboardEvent) {
  const action = rowKeyAction(event)
  if (action === 'commit') {
    // Without preventDefault the newline lands anyway, and the row would both
    // commit and gain a blank line.
    event.preventDefault()
    emit('commit')
  } else if (action === 'revert') {
    event.preventDefault()
    // Stops the surrounding dialog reading the same Escape as "close me".
    event.stopPropagation()
    emit('revert')
  } else if (action === 'newline') {
    // The textarea's own default is exactly right here; it just needs to
    // re-measure once the newline has landed.
    resizeSoon()
  }
}

const classes = computed(() => [
  'atx',
  `atx--${props.variant}`,
  props.done && 'atx--done',
  props.disabled && 'atx--disabled',
])

defineExpose({ focus: () => el.value?.focus() })
</script>

<template>
  <textarea
    ref="el"
    :class="classes"
    rows="1"
    :value="modelValue"
    :placeholder="placeholder"
    :aria-label="label || undefined"
    :disabled="disabled"
    @input="onTextInput"
    @keydown="onKeydown"
    @focus="emit('focus')"
    @blur="emit('blur')"
  ></textarea>
</template>

<style scoped>
.atx {
  /* Reads as text on the card, not as a control. The border and fill arrive
     only on focus, below. */
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--theme-text);
  font-family: inherit;
  line-height: 1.5;
  /* The three that keep the text whole: never scroll inside, never let the
     browser add a drag handle, and wrap rather than run off the edge. */
  resize: none;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  display: block;
}
.atx--body {
  font-size: var(--text-sm);
}
.atx--title {
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: 1.3;
}
/* Only the row being edited looks like a field. */
.atx:focus {
  outline: none;
  border-color: var(--theme-accent);
  background: color-mix(in oklch, var(--theme-accent) 8%, transparent);
}
.atx--done {
  text-decoration: line-through;
  /* Dimmed, not hidden — a finished point is still something to read. */
  opacity: 0.5;
}
.atx--disabled {
  cursor: default;
}
.atx::placeholder {
  color: var(--theme-dim);
  opacity: 0.7;
}
</style>
