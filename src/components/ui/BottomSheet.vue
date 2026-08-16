<script setup lang="ts">
// The mobile counterpart to Modal: same semantics, thumb-reachable.
const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
void props
</script>

<template>
  <template v-if="open">
    <div class="ui-sheet__scrim" @click="emit('close')"></div>
    <div
      class="ui-sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @keydown.esc="emit('close')"
    >
      <div class="ui-sheet__grip" aria-hidden="true"></div>
      <header class="ui-sheet__head">
        <h2 class="ui-sheet__title">{{ title }}</h2>
        <button class="ui-sheet__x" type="button" aria-label="Close" @click="emit('close')">
          ×
        </button>
      </header>
      <div class="ui-sheet__body"><slot /></div>
    </div>
  </template>
</template>

<style scoped>
.ui-sheet__scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: color-mix(in oklch, var(--glass-solid) 60%, transparent);
}
.ui-sheet {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 51;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  max-height: 85vh;
  overflow-y: auto;
  padding: var(--sp-3) var(--sp-4) var(--sp-5);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  border-top: 1px solid var(--glass-border);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  color: var(--theme-text);
  animation: uiSheetIn var(--dur-med) var(--ease-out) both;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .ui-sheet {
    background: var(--glass-solid);
  }
}
@keyframes uiSheetIn {
  from {
    transform: translateY(14%);
    opacity: 0;
  }
}
.ui-sheet__grip {
  width: 36px;
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--glass-border);
  margin: 0 auto;
}
.ui-sheet__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.ui-sheet__title {
  flex: 1;
  margin: 0;
  font-size: var(--text-lg);
}
.ui-sheet__x {
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-xl);
  cursor: pointer;
  line-height: 1;
}
</style>
