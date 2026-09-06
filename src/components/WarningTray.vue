<script setup lang="ts">
import { ref } from 'vue'
import { warningEntries, removeWarning } from '@/services/warnings'

const expanded = ref(false)

function dismiss(id: string): void {
  const entry = warningEntries.find((item) => item.id === id)
  if (!entry?.dismissible) return
  entry.dismiss()
  removeWarning(id)
}

function dismissAll(): void {
  for (const entry of [...warningEntries]) if (entry.dismissible) entry.dismiss()
  warningEntries.splice(0)
  expanded.value = false
}
</script>

<template>
  <aside v-if="warningEntries.length" class="warning-tray" aria-label="Warnings">
    <button
      class="warning-tray__summary"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="warning-tray__signal" aria-hidden="true">!</span>
      <span class="warning-tray__label"
        >{{ warningEntries.length }} warning{{ warningEntries.length === 1 ? '' : 's' }}</span
      >
      <span class="warning-tray__chevron" aria-hidden="true">{{ expanded ? '⌃' : '⌄' }}</span>
    </button>
    <Transition name="warning-panel">
      <div v-if="expanded" class="warning-tray__list">
        <div
          v-for="entry in warningEntries"
          :key="entry.id"
          class="warning-tray__item"
          :class="`is-${entry.tone}`"
        >
          <div class="warning-tray__copy">
            <strong v-if="entry.title">{{ entry.title }}</strong>
            <span>{{ entry.message }}</span>
          </div>
          <button
            v-if="entry.dismissible"
            class="warning-tray__dismiss"
            type="button"
            :aria-label="`Dismiss ${entry.title || 'warning'}`"
            @click="dismiss(entry.id)"
          >
            ×
          </button>
        </div>
        <button class="warning-tray__dismissAll" type="button" @click="dismissAll">
          Dismiss all
        </button>
      </div>
    </Transition>
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
.warning-tray__item.is-success {
  border-left-color: var(--theme-success);
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
.warning-panel-enter-active,
.warning-panel-leave-active {
  transition:
    opacity var(--dur-med) var(--ease-out),
    transform var(--dur-med) var(--ease-out),
    max-height var(--dur-med) var(--ease-out);
  overflow: hidden;
}
.warning-panel-enter-from,
.warning-panel-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-6px);
}
.warning-panel-enter-to,
.warning-panel-leave-from {
  max-height: 520px;
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .warning-panel-enter-active,
  .warning-panel-leave-active {
    transition: none;
  }
}
@media (max-width: 640px) {
  .warning-tray {
    right: var(--sp-3);
    bottom: var(--sp-3);
  }
}
</style>
