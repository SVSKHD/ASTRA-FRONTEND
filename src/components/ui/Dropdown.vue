<script setup lang="ts">
// A menu of actions. Roving focus with the arrow keys, Escape closes, and the
// items are buttons — a menu built from divs is unreachable by keyboard.
import { ref } from 'vue'
import Popover from './Popover.vue'
import Icon from '@/components/ui/Icon.vue'

export interface MenuItem {
  value: string
  label: string
  disabled?: boolean
}

withDefaults(defineProps<{ items: MenuItem[]; label: string; variant?: 'default' | 'toolbar' }>(), {
  variant: 'default',
})
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
        :class="`ui-dropdown__trigger--${variant}`"
        type="button"
        :aria-expanded="open"
        aria-haspopup="menu"
        @click="open = !open"
      >
        {{ label }}
        <!-- The same chevron every menu trigger in the library uses (Select,
             MultiSelect, Combobox), rather than a `▾` character whose size and
             weight are whatever the reader's font decides. -->
        <Icon name="chevron-down" size="xs" />
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
  justify-content: center;
  gap: var(--sp-2);
  border: 1px solid;
  font-weight: var(--weight-semibold);
  cursor: pointer;
  white-space: nowrap;
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}
.ui-dropdown__trigger:active {
  transform: translateY(1px);
}
.ui-dropdown__trigger--default {
  min-height: var(--control-md);
  padding: 0 var(--sp-3);
  border-radius: var(--radius-md);
  border-color: var(--glass-border);
  background: var(--theme-input);
  color: var(--theme-text);
  font-size: var(--text-sm);
}
.ui-dropdown__trigger--default:hover {
  border-color: var(--theme-accent);
}
.ui-dropdown__trigger--toolbar {
  min-height: 28px;
  padding: 5px 10px;
  border-radius: var(--radius-pill);
  border-color: var(--glass-border);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.ui-dropdown__trigger--toolbar:hover,
.ui-dropdown__trigger--toolbar[aria-expanded='true'] {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
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
  font-size: var(--text-sm);
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
