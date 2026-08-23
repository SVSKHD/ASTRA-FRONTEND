<script setup lang="ts">
// One labelled block inside a detail body (section 18c/18d). Both bodies are a
// stack of these, so the spacing, the label weight and the disclosure behaviour
// are decided once.
//
// A section can be collapsible; the activity block uses that to start closed.
import { ref, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    collapsible?: boolean
    // Only meaningful when collapsible.
    startOpen?: boolean
    // A short count or status shown beside the label.
    hint?: string
  }>(),
  { collapsible: false, startOpen: true, hint: '' },
)

const open = ref(!props.collapsible || props.startOpen)
const bodyId = `detail-section-${useId()}`
</script>

<template>
  <section class="dsec">
    <header class="dsec__head">
      <component
        :is="collapsible ? 'button' : 'div'"
        :type="collapsible ? 'button' : undefined"
        class="dsec__label"
        :class="collapsible && 'dsec__label--btn'"
        :aria-expanded="collapsible ? open : undefined"
        :aria-controls="collapsible ? bodyId : undefined"
        @click="collapsible && (open = !open)"
      >
        <span v-if="collapsible" class="dsec__chev" :class="open && 'dsec__chev--open'">›</span>
        {{ label }}
        <span v-if="hint" class="dsec__hint">{{ hint }}</span>
      </component>
      <div class="dsec__actions"><slot name="actions" /></div>
    </header>
    <div v-show="open" :id="bodyId" class="dsec__body"><slot /></div>
  </section>
</template>

<style scoped>
/* A child of the dialog's one scrolling column, so it may not set that
   column's width: without this a wide table or a long unbroken line inside a
   section pushes its neighbours off the dialog (section 22e). */
.dsec {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.dsec__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.dsec__label {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
}
.dsec__label--btn {
  cursor: pointer;
}
.dsec__chev {
  display: inline-block;
  transition: transform var(--dur-fast, 0.15s) var(--ease-out, ease);
}
.dsec__chev--open {
  transform: rotate(90deg);
}
.dsec__hint {
  font-weight: var(--weight-medium);
  letter-spacing: 0;
  text-transform: none;
  opacity: 0.8;
}
.dsec__actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.dsec__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
</style>
