<script setup lang="ts">
// A content card: optional title row, body, optional footer. Interactive cards
// are real buttons so the whole card is reachable by keyboard.
withDefaults(defineProps<{ title?: string; interactive?: boolean }>(), {})
defineEmits<{ click: [] }>()
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    class="ui-card"
    :class="{ 'is-interactive': interactive }"
    :type="interactive ? 'button' : undefined"
    @click="interactive && $emit('click')"
  >
    <header v-if="title || $slots.header" class="ui-card__head">
      <slot name="header">
        <span class="ui-card__title">{{ title }}</span>
      </slot>
    </header>
    <div class="ui-card__body"><slot /></div>
    <footer v-if="$slots.footer" class="ui-card__foot"><slot name="footer" /></footer>
  </component>
</template>

<style scoped>
.ui-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  width: 100%;
  text-align: left;
  padding: var(--sp-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-border);
  background:
    linear-gradient(var(--surface-tint, transparent), var(--surface-tint, transparent)),
    var(--glass-card);
  color: var(--theme-text);
  box-shadow: var(--elev-1);
  min-width: 0;
}
.ui-card.is-interactive {
  cursor: pointer;
  transition:
    transform var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.ui-card.is-interactive:hover {
  transform: translateY(-2px);
  border-color: var(--theme-accent);
  box-shadow: var(--accent-glow, none), var(--elev-1);
}
.ui-card__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.ui-card__title {
  font-size: var(--text-md);
  font-weight: 700;
}
.ui-card__body {
  min-width: 0;
}
.ui-card__foot {
  display: flex;
  gap: var(--sp-2);
  justify-content: flex-end;
}
</style>
