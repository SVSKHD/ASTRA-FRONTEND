<script setup lang="ts">
// The single "Carried over · N" accordion that replaces per-day date grouping in
// every pending list. One component, shared by all four sections (todos, tasks,
// deadlines, reminders): it owns the collapsible shell — header count, muted
// "oldest from …" subtitle, chevron, persisted open state, and the "Move all to
// today" batch for the collections that can roll — while each view renders its
// own native rows into the default slot, so a carried row keeps the exact
// interactivity (complete, drag-to-nest, remind, open) it has anywhere else.
//
// Rendered only when non-empty: once auto-rollover has run it is normally empty
// and the parent drops it entirely, so it appears only when rollover is off,
// was undone, or a collection is excluded from rolloverScope.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { useAccordionState } from '@/composables/useAccordionState'
import { pxify } from '@/styles'
import MovePendingButton from '@/components/MovePendingButton.vue'
import type { ListKey } from '@/types'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps<{
  collection: ListKey
  count: number
  subtitle?: string
}>()
const emit = defineEmits<{ (e: 'select-all'): void }>()

const { c, dark } = useStyles()
const acc = useAccordionState()

const key = computed(() => 'carried:' + props.collection)
const open = computed(() => acc.isOpen(key.value, false))
function toggle() {
  acc.toggle(key.value, false)
}

// Only todos and tasks roll forward; deadlines and reminders carry an overdue
// date that "Move all to today" wouldn't sensibly rewrite.
const canRoll = computed(() => props.collection === 'todos' || props.collection === 'tasks')
const moveCollection = computed<'todos' | 'tasks'>(() =>
  props.collection === 'todos' ? 'todos' : 'tasks',
)

const cardStyle = computed(() =>
  pxify({
    borderRadius: 14,
    border: '1px solid ' + c.value.border,
    background: dark.value ? 'rgba(40,44,78,0.3)' : 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  }),
)
const headStyle = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    cursor: 'pointer',
    userSelect: 'none',
  }),
)
const chevronStyle = computed(() =>
  pxify({
    width: 16,
    height: 16,
    flexShrink: 0,
    color: c.value.dim,
    transform: open.value ? 'rotate(90deg)' : 'rotate(0deg)',
    transition: 'transform .25s ease',
    display: 'grid',
    placeItems: 'center',
  }),
)
const titleWrap = pxify({ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 })
const titleStyle = computed(() =>
  pxify({ fontSize: 13, fontWeight: 700, color: c.value.text, letterSpacing: '0.01em' }),
)
const subStyle = computed(() => pxify({ fontSize: 11, color: c.value.dim }))
const actionsWrap = pxify({ display: 'flex', alignItems: 'center', gap: 8 })
const selectBtn = computed(() =>
  pxify({
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.04em',
    padding: '5px 10px',
    borderRadius: 999,
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
)
const bodyOuter = computed(() =>
  pxify({
    display: 'grid',
    gridTemplateRows: open.value ? '1fr' : '0fr',
    transition: 'grid-template-rows .3s cubic-bezier(.4,1,.4,1)',
  }),
)
const bodyClip = pxify({ overflow: 'hidden', minHeight: 0 })
const bodyInner = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 9,
  padding: '4px 10px 12px',
})
</script>

<template>
  <div :style="cardStyle">
    <div :style="headStyle" role="button" :aria-expanded="open" @click="toggle">
      <span :style="chevronStyle">
        <Icon name="chevron-right" size="xs" :style="{ color: c.dim }" />
      </span>
      <div :style="titleWrap">
        <span :style="titleStyle">Carried over · {{ count }}</span>
        <span v-if="subtitle" :style="subStyle">{{ subtitle }}</span>
      </div>
      <div :style="actionsWrap" @click.stop>
        <MovePendingButton v-if="canRoll" :collection="moveCollection" />
        <button :style="selectBtn" @click="emit('select-all')">Select all</button>
        <slot name="actions" />
      </div>
    </div>
    <div :style="bodyOuter">
      <div :style="bodyClip">
        <div :style="bodyInner">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>
