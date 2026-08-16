<script setup lang="ts">
// A menu of actions. Roving focus with the arrow keys, Escape closes, and the
// items are buttons — a menu built from divs is unreachable by keyboard.
import { ref } from 'vue'
import Popover from './Popover.vue'

export interface MenuItem {
  value: string
  label: string
  disabled?: boolean
}

defineProps<{ items: MenuItem[]; label: string }>()
const emit = defineEmits<{ select: [string] }>()
const open = ref(false)
const itemsEl = ref<HTMLElement | null>(null)

function move(delta: number) {
  const buttons = Array.from(itemsEl.value?.querySelectorAll('button:not(:disabled)') ?? [])
  if (!buttons.length) return
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = buttons[(index + delta + buttons.length) % buttons.length] as HTMLElement
  next.focus()
}
function choose(value: string) {
  emit('select', value)
  open.value = false
}
</script>

<template>
  <Popover :open="open" @close="open = false">
    <template #trigger>
      <button
        class="ui-dropdown__trigger ui-focus-ring"
        type="button"
        :aria-expanded="open"
        aria-haspopup="menu"
        @click="open = !open"
      >
        {{ label }}
        <span aria-hidden="true">▾</span>
      </button>
    </template>
    <div
      ref="itemsEl"
      class="ui-dropdown__items"
      role="menu"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
    >
      <button
        v-for="item in items"
        :key="item.value"
        class="ui-dropdown__item"
        type="button"
        role="menuitem"
        :disabled="item.disabled"
        @click="choose(item.value)"
      >
        {{ item.label }}
      </button>
    </div>
  </Popover>
</template>

<style scoped>
.ui-dropdown__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: var(--control-md);
  padding: 0 var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--theme-input);
  color: var(--theme-text);
  font-size: var(--text-md);
  cursor: pointer;
}
.ui-dropdown__items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ui-dropdown__item {
  text-align: left;
  padding: var(--sp-2) var(--sp-3);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-md);
  cursor: pointer;
}
.ui-dropdown__item:hover:not(:disabled),
.ui-dropdown__item:focus-visible {
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
  outline: none;
}
.ui-dropdown__item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
