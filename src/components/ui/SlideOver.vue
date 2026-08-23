<script setup lang="ts">
// A side drawer for secondary flows that should not take the whole screen.
//
// Two widths, because the two things a drawer holds are different shapes: a
// short form fits in 380px, and a reference table does not. `lg` is still a
// drawer rather than a modal — it stays attached to the edge and leaves the
// page it came from visible beside it.
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    side?: 'left' | 'right'
    size?: 'md' | 'lg'
  }>(),
  {
    side: 'right',
    size: 'md',
  },
)
const emit = defineEmits<{ close: [] }>()
void props
</script>

<template>
  <template v-if="open">
    <div class="ui-drawer__scrim" @click="emit('close')"></div>
    <aside
      class="ui-drawer"
      :class="[`ui-drawer--${side}`, `ui-drawer--${size}`]"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @keydown.esc="emit('close')"
    >
      <header class="ui-drawer__head">
        <h2 class="ui-drawer__title">{{ title }}</h2>
        <button class="ui-drawer__x" type="button" aria-label="Close" @click="emit('close')">
          ×
        </button>
      </header>
      <div class="ui-drawer__body"><slot /></div>
    </aside>
  </template>
</template>

<style scoped>
.ui-drawer__scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: color-mix(in oklch, var(--glass-solid) 55%, transparent);
}
.ui-drawer {
  position: fixed;
  top: 0;
  bottom: 0;
  z-index: 51;
  width: min(92vw, var(--drawer-w, 380px));
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-left: 1px solid var(--glass-border);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  color: var(--theme-text);
  overflow-y: auto;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .ui-drawer {
    background: var(--glass-solid);
  }
}
.ui-drawer--md {
  --drawer-w: 380px;
}
.ui-drawer--lg {
  --drawer-w: 560px;
}
.ui-drawer--right {
  right: 0;
  animation: uiDrawerR var(--dur-med) var(--ease-out) both;
}
.ui-drawer--left {
  left: 0;
  border-left: none;
  border-right: 1px solid var(--glass-border);
  animation: uiDrawerL var(--dur-med) var(--ease-out) both;
}
@keyframes uiDrawerR {
  from {
    transform: translateX(12%);
    opacity: 0;
  }
}
@keyframes uiDrawerL {
  from {
    transform: translateX(-12%);
    opacity: 0;
  }
}
.ui-drawer__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.ui-drawer__title {
  flex: 1;
  margin: 0;
  font-size: var(--text-lg);
}
.ui-drawer__x {
  border: none;
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-xl);
  cursor: pointer;
  line-height: 1;
}
</style>
