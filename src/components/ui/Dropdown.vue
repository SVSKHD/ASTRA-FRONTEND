<script setup lang="ts">
// A menu of actions. Roving focus with the arrow keys, Escape closes, and the
// items are buttons — a menu built from divs is unreachable by keyboard.
import { computed, ref } from 'vue'
import Popover from './Popover.vue'
import Icon from '@/components/ui/Icon.vue'
import type { IconName } from '@/components/ui/icons'

export interface MenuItem {
  value: string
  label: string
  disabled?: boolean
  /** A glyph before the label. When any item has one, every row keeps the column. */
  icon?: IconName
  /** Destructive: drawn in the danger colour, so Delete never reads as Duplicate. */
  danger?: boolean
}

// `icon`: a quiet "more" glyph whose label is its tooltip and accessible name —
// for a menu that sits on every card, where a worded button on each one is
// the loudest thing on the page.
const props = withDefaults(
  defineProps<{ items: MenuItem[]; label: string; variant?: 'default' | 'toolbar' | 'icon' }>(),
  { variant: 'default' },
)
// One icon anywhere and every row reserves the column, so labels start in line.
const withIcons = computed(() => props.items.some((i) => i.icon))
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
        :aria-label="variant === 'icon' ? label : undefined"
        :title="variant === 'icon' ? label : undefined"
        @click="open = !open"
      >
        <Icon v-if="variant === 'icon'" name="more-horizontal" size="md" />
        <template v-else>
          {{ label }}
          <!-- The same chevron every menu trigger in the library uses (Select,
               MultiSelect, Combobox), rather than a `▾` character whose size and
               weight are whatever the reader's font decides. -->
          <Icon name="chevron-down" size="xs" />
        </template>
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
        :class="{ 'is-danger': item.danger, 'has-icon': withIcons }"
        type="button"
        role="menuitem"
        :disabled="item.disabled"
        @click="choose(item.value)"
      >
        <span v-if="withIcons" class="ui-dropdown__item-icon" aria-hidden="true">
          <Icon v-if="item.icon" :name="item.icon" size="sm" />
        </span>
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
.ui-dropdown__trigger--icon {
  width: 32px;
  height: 32px;
  padding: 0;
  border-color: transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--theme-dim);
}
.ui-dropdown__trigger--icon:hover,
.ui-dropdown__trigger--icon[aria-expanded='true'] {
  background: color-mix(in oklch, var(--theme-text) 8%, transparent);
  color: var(--theme-text);
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
/* With glyphs: a fixed 20px icon column and one gap, so every label starts at
   the same x whatever its glyph's width. */
.ui-dropdown__item.has-icon {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: var(--sp-2);
  white-space: nowrap;
}
.ui-dropdown__item-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 20px;
  color: var(--theme-dim);
}
.ui-dropdown__item:hover:not(:disabled) .ui-dropdown__item-icon {
  color: var(--theme-text);
}
.ui-dropdown__item.is-danger,
.ui-dropdown__item.is-danger .ui-dropdown__item-icon {
  color: var(--theme-danger);
}
.ui-dropdown__item.is-danger:hover:not(:disabled),
.ui-dropdown__item.is-danger:focus-visible {
  background: color-mix(in oklch, var(--theme-danger) 14%, transparent);
}
</style>
