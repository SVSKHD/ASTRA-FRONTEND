<script setup lang="ts">
// The shell every control sits in (section 25a).
//
// It owns the label, the required marker, the hint, the error, the counter and
// the for/id/aria-describedby wiring. Controls own none of that — which is the
// whole point. When each control renders its own label, "the gap under a label"
// is a decision made once per control, and they were 4px in one place and 6px
// in another, uppercase here and sentence case there. Worse, error text kept
// ending up as a sibling paragraph with no aria-describedby pointing at it, so
// a screen reader read a field as valid while the page said otherwise.
//
// The message row is reserved rather than conditional. A hint appearing and an
// error replacing it must not change the field's height, because a form that
// grows by 16px when you tab out of the first field pushes the submit button
// under your cursor — and the reader has to re-find where they were, at the
// exact moment they are being told they got something wrong.
import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    label?: string
    hint?: string
    error?: string
    required?: boolean
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    readonly?: boolean
    /** Supply when the control already has an id — otherwise one is generated. */
    id?: string
    /** Current length, for the counter. Shown only alongside `maxLength`. */
    length?: number
    maxLength?: number
  }>(),
  { size: 'md' },
)

const generated = useId()
const fieldId = computed(() => props.id ?? generated)
const errorId = computed(() => `${fieldId.value}-err`)
const hintId = computed(() => `${fieldId.value}-hint`)

// An error replaces the hint; it never stacks with it. Two lines of guidance
// under one field, one of which is now wrong, is worse than either alone.
const message = computed(() => props.error || props.hint || '')
const describedBy = computed(() =>
  props.error ? errorId.value : props.hint ? hintId.value : undefined,
)
const counter = computed(() => (props.maxLength ? `${props.length ?? 0}/${props.maxLength}` : ''))
const overLimit = computed(() => !!props.maxLength && (props.length ?? 0) > props.maxLength)
</script>

<template>
  <div
    class="ui-ff"
    :class="[
      `ui-ff--${size}`,
      { 'is-error': !!error, 'is-disabled': disabled, 'is-readonly': readonly },
    ]"
  >
    <label v-if="label" class="ui-ff__label" :for="fieldId">
      {{ label }}
      <!-- The marker is aria-hidden and the requirement is carried by the
           control's own `required`; a screen reader announcing "asterisk" is
           not what anybody wanted. -->
      <span v-if="required" class="ui-ff__req" aria-hidden="true">*</span>
    </label>

    <!-- The control. It is handed everything it needs to be wired correctly,
         so a call site cannot forget to associate its own error text. -->
    <slot
      :id="fieldId"
      :described-by="describedBy"
      :invalid="!!error"
      :size="size"
      :disabled="disabled"
      :readonly="readonly"
      :required="required"
    />

    <div class="ui-ff__msgrow">
      <p
        v-if="message"
        :id="error ? errorId : hintId"
        class="ui-ff__msg"
        :class="{ 'is-error': !!error }"
        :role="error ? 'alert' : undefined"
      >
        {{ message }}
      </p>
      <span v-else class="ui-ff__msg" aria-hidden="true"></span>
      <span v-if="counter" class="ui-ff__count ui-tabular" :class="{ 'is-over': overLimit }">
        {{ counter }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.ui-ff {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ui-ff__label {
  /* The uppercase label step, whole: size, leading, weight, tracking and case
     travel together. Picking the size and forgetting the tracking is the
     commonest way a system stops looking like one. */
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted, var(--theme-dim));
  /* 6px, per section 25a. Not a token, because it is the one measurement in the
     app that is deliberately between two steps of the spacing ladder: a label
     8px above its control reads as a heading over a group. */
  margin-bottom: 6px;
}
.ui-ff__req {
  color: var(--theme-danger);
}
/* The reserved row. min-height rather than a rendered blank, so a field with a
   message and a field without are the same height and the form does not move
   under the reader when one appears. */
.ui-ff__msgrow {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
  margin-top: var(--sp-1);
  min-height: calc(var(--text-xs) * var(--lh-xs));
}
.ui-ff__msg {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
.ui-ff__msg.is-error {
  color: var(--theme-danger);
  font-weight: var(--weight-medium);
}
.ui-ff__count {
  flex-shrink: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
.ui-ff__count.is-over {
  color: var(--theme-danger);
  font-weight: var(--weight-semibold);
}
.ui-ff.is-disabled {
  opacity: 0.55;
}
</style>
