<script setup lang="ts">
import { computed, ref } from 'vue'

export interface TradeWarning {
  id: string
  tone: 'danger' | 'warning' | 'info'
  title: string
  message: string
  dismissible?: boolean
}

const props = defineProps<{ warnings: TradeWarning[] }>()
const emit = defineEmits<{ dismiss: [string] }>()
const expanded = ref(false)
const dismissed = ref(new Set<string>())
const visibleWarnings = computed(() =>
  props.warnings.filter((warning) => !dismissed.value.has(warning.id)),
)

function dismiss(warning: TradeWarning): void {
  if (!warning.dismissible) return
  const next = new Set(dismissed.value)
  next.add(warning.id)
  dismissed.value = next
  emit('dismiss', warning.id)
}

function dismissAll(): void {
  for (const warning of visibleWarnings.value) dismiss(warning)
  expanded.value = false
}
</script>

<template>
  <aside v-if="visibleWarnings.length" class="warning-tray" aria-label="Warnings">
    <button
      class="warning-tray__summary"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="warning-tray__signal" aria-hidden="true">!</span>
      <span class="warning-tray__label"
        >{{ visibleWarnings.length }} warning{{ visibleWarnings.length === 1 ? '' : 's' }}</span
      >
      <span class="warning-tray__chevron" aria-hidden="true">{{ expanded ? '⌃' : '⌄' }}</span>
    </button>
    <div v-if="expanded" class="warning-tray__list">
      <div
        v-for="warning in visibleWarnings"
        :key="warning.id"
        class="warning-tray__item"
        :class="`is-${warning.tone}`"
      >
        <div class="warning-tray__copy">
          <strong>{{ warning.title }}</strong
          ><span>{{ warning.message }}</span>
        </div>
        <button
          v-if="warning.dismissible"
          class="warning-tray__dismiss"
          type="button"
          :aria-label="`Dismiss ${warning.title}`"
          @click="dismiss(warning)"
        >
          ×
        </button>
      </div>
      <button class="warning-tray__dismissAll" type="button" @click="dismissAll">
        Dismiss all
      </button>
    </div>
  </aside>
</template>

<style scoped>
.warning-tray {
  position: fixed;
  right: var(--sp-4);
  bottom: var(--sp-4);
  z-index: 70;
  width: min(380px, calc(100vw - 32px));
  color: var(--theme-text);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  box-shadow:
    var(--elev-1),
    inset 0 1px 0 color-mix(in srgb, white 14%, transparent);
  animation: warningTrayIn var(--dur-med) var(--ease-out) both;
}
.warning-tray__summary {
  display: flex;
  align-items: center;
  width: 100%;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border: 0;
  border-radius: inherit;
  color: inherit;
  background: transparent;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  text-align: left;
  cursor: pointer;
}
.warning-tray__signal {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: var(--theme-on-accent, white);
  background: var(--theme-danger, var(--theme-accent));
  font-weight: var(--weight-semibold);
}
.warning-tray__label {
  flex: 1;
}
.warning-tray__chevron {
  color: var(--theme-dim);
  font-size: var(--text-md);
}
.warning-tray__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: 0 var(--sp-3) var(--sp-3);
}
.warning-tray__item {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: 1px solid var(--glass-border);
  border-left: 3px solid var(--theme-accent);
  border-radius: var(--radius-card);
  background: color-mix(in oklch, var(--glass-solid) 28%, transparent);
}
.warning-tray__item.is-danger {
  border-left-color: var(--theme-danger);
}
.warning-tray__item.is-warning {
  border-left-color: var(--theme-warning);
}
.warning-tray__item.is-info {
  border-left-color: var(--theme-accent);
}
.warning-tray__copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.warning-tray__copy strong {
  font-size: var(--text-xs);
}
.warning-tray__copy span {
  color: var(--theme-dim);
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
}
.warning-tray__dismiss,
.warning-tray__dismissAll {
  border: 0;
  color: var(--theme-dim);
  background: transparent;
  cursor: pointer;
}
.warning-tray__dismiss {
  flex: 0 0 auto;
  font-size: var(--text-lg);
  line-height: 1;
}
.warning-tray__dismissAll {
  align-self: flex-end;
  padding: var(--sp-1) var(--sp-2);
  font-size: var(--text-2xs);
}
.warning-tray__dismiss:hover,
.warning-tray__dismissAll:hover {
  color: var(--theme-text);
}
@keyframes warningTrayIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
@media (max-width: 640px) {
  .warning-tray {
    right: var(--sp-3);
    bottom: var(--sp-3);
  }
}
</style>
