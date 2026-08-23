<script setup lang="ts">
// The collapsed "Completed · N" section that sits below the active region in
// every list. One component, shared by all four sections: it owns the shell —
// header count, chevron, persisted open state, a "Clear completed" (archive)
// action and a sort toggle (recently completed / original order) — while each
// view renders its own dimmed completed rows into the default slot.
//
// Hidden entirely by the "Hide completed items" setting (the parent gates on
// it), and absent until at least one item is completed.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { useAccordionState } from '@/composables/useAccordionState'
import { pxify, typeStep } from '@/styles'
import type { ListKey } from '@/types'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps<{
  collection: ListKey
  count: number
  sort: 'recent' | 'original'
  clearable?: boolean
}>()
const emit = defineEmits<{ (e: 'clear'): void; (e: 'toggle-sort'): void }>()

const { c, dark } = useStyles()
const acc = useAccordionState()

const key = computed(() => 'completed:' + props.collection)
const open = computed(() => acc.isOpen(key.value, false))
function toggle() {
  acc.toggle(key.value, false)
}

const cardStyle = computed(() =>
  pxify({
    borderRadius: 'var(--radius-dialog)',
    border: '1px solid ' + c.value.border,
    background: dark.value ? 'rgba(30,32,58,0.28)' : 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  }),
)
const headStyle = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
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
const titleStyle = computed(() =>
  pxify({
    ...typeStep('sm'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.dim,
    flex: 1,
    letterSpacing: '0.01em',
  }),
)
const actionsWrap = pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' })
function ghostBtn() {
  return pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.04em',
    padding: '5px 10px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })
}
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
  gap: 'var(--sp-2)',
  padding: '4px 10px 12px',
})
const sortLabel = computed(() =>
  props.sort === 'recent' ? 'Recently completed' : 'Original order',
)
</script>

<template>
  <div :style="cardStyle">
    <div :style="headStyle" role="button" :aria-expanded="open" @click="toggle">
      <span :style="chevronStyle">
        <Icon name="chevron-right" size="xs" :style="{ color: c.dim }" />
      </span>
      <span :style="titleStyle">Completed · {{ count }}</span>
      <div :style="actionsWrap" @click.stop>
        <button :style="ghostBtn()" :title="'Sort: ' + sortLabel" @click="emit('toggle-sort')">
          {{ sortLabel }}
        </button>
        <button v-if="clearable" :style="ghostBtn()" @click="emit('clear')">Clear completed</button>
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
