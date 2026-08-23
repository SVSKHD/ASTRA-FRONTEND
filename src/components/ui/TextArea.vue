<script setup lang="ts">
// The multi-line field (section 25b).
//
// It auto-grows by default, through the same composable as the inline row
// editors, so "how tall is a textarea" has one answer in this app rather than
// one per surface. A fixed `rows` is still available for the case where the
// field is deliberately a window onto something long — pasted JSON, a log —
// and growing to forty lines would push everything else off the screen.
//
// This is not AutoTextarea. That one is an inline row editor: it commits on
// Enter and has no box of its own, because it sits *in* a list row. This one is
// a form control with a border, and Enter is a newline.
import { computed, ref, useId, watch } from 'vue'
import { useAutoResizeTextarea } from '@/composables/useAutoResizeTextarea'

const props = withDefaults(
  defineProps<{
    modelValue: string
    /** Deprecated in favour of FormField; kept so forms can migrate one at a time. */
    label?: string
    hint?: string
    error?: string
    placeholder?: string
    /** Starting height, and the fixed height when `autoGrow` is off. */
    rows?: number
    /** Off for a field that is a window onto something long. */
    autoGrow?: boolean
    /** Caps the growth; past this the field scrolls instead. */
    maxHeight?: string
    /** A floor for the auto-grown height, in pixels. */
    minHeight?: number
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    readonly?: boolean
    invalid?: boolean
    required?: boolean
    maxlength?: number
    id?: string
    describedBy?: string
  }>(),
  { rows: 3, autoGrow: true, size: 'md', maxHeight: '40vh' },
)
const emit = defineEmits<{
  // focus and blur are forwarded explicitly rather than left to attribute
  // fallthrough. Neither event bubbles, so a listener that lands on this
  // component's root div — which is where a fallthrough listener goes — never
  // fires. It fails silently, and only for those two events, which is the worst
  // shape a bug can have.
  'update:modelValue': [string]
  focus: [FocusEvent]
  blur: [FocusEvent]
}>()

const generated = useId()
const fieldId = computed(() => props.id ?? generated)
const ownErrorId = computed(() => `${fieldId.value}-err`)
const ownHintId = computed(() => `${fieldId.value}-hint`)
const describedBy = computed(
  () =>
    props.describedBy ??
    (props.error ? ownErrorId.value : props.hint ? ownHintId.value : undefined),
)
const isInvalid = computed(() => props.invalid || !!props.error)

const auto = useAutoResizeTextarea({
  watch: () => props.modelValue,
  minHeight: props.minHeight,
})
const area = ref<HTMLTextAreaElement | null>(null)

// One function ref feeding both, so the local ref and the composable's cannot
// disagree about which element is on screen.
function setArea(el: unknown) {
  const node = (el as HTMLTextAreaElement) ?? null
  area.value = node
  if (props.autoGrow) auto.el.value = node
}

watch(
  () => props.autoGrow,
  (on) => {
    auto.el.value = on ? area.value : null
    if (on) auto.resize()
    else if (area.value) area.value.style.height = ''
  },
)

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
  if (props.autoGrow) auto.onInput()
}

defineExpose({ focus: () => area.value?.focus(), el: area })
</script>

<template>
  <div class="ui-ta">
    <label v-if="label" class="ui-ta__label" :for="fieldId">{{ label }}</label>
    <div
      class="ui-control ui-ta__box"
      :class="[
        `ui-control--${size}`,
        { 'is-disabled': disabled, 'is-readonly': readonly, 'is-invalid': isInvalid },
      ]"
    >
      <textarea
        :id="fieldId"
        :ref="setArea"
        class="ui-control__input ui-ta__input"
        :class="{ 'is-fixed': !autoGrow }"
        :rows="rows"
        :style="{ maxHeight: autoGrow ? maxHeight : undefined }"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :maxlength="maxlength"
        :aria-invalid="isInvalid"
        :aria-describedby="describedBy"
        @input="onInput"
        @focus="emit('focus', $event)"
        @blur="emit('blur', $event)"
      ></textarea>
    </div>
    <p v-if="error" :id="ownErrorId" class="ui-ta__msg is-error" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="ownHintId" class="ui-ta__msg">{{ hint }}</p>
  </div>
</template>

<style scoped>
.ui-ta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ui-ta__label {
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted, var(--theme-dim));
  margin-bottom: 6px;
}
/* A multi-line box pads vertically and lets its content set the height, where
   the single-line controls centre a fixed row. */
.ui-ta__box {
  align-items: stretch;
  padding: var(--sp-2) 10px;
}
.ui-ta__input {
  /* Off, because the field sizes itself; a drag handle on an auto-growing box
     invites a reader to fight it. */
  resize: none;
  overflow-y: auto;
  line-height: var(--lh-base);
}
.ui-ta__input.is-fixed {
  resize: vertical;
}
.ui-ta__msg {
  margin: var(--sp-1) 0 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
.ui-ta__msg.is-error {
  color: var(--theme-danger);
  font-weight: var(--weight-medium);
}
</style>
