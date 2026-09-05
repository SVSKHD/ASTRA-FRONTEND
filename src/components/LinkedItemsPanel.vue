<script setup lang="ts">
import TextInput from '@/components/ui/TextInput.vue'
// "Linked items" section for an item's detail dialog — shared by todos and
// tasks. Lists direct children with status + collection badge + unlink, shows a
// derived-progress bar, an "all done — mark complete?" prompt at 100%, and a
// type-ahead picker to add links. All logic lives in useLinkedItems, so this
// component is identical for both collections.
import { computed, nextTick, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { useLinkedItems, type LinkedRow } from '@/composables/useLinkedItems'
import { SUCCESS, pxify, typeStep } from '@/styles'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import LinkedAccordion from '@/components/LinkedAccordion.vue'
import type { LinkCollection } from '@/types'

const props = defineProps<{ collection: LinkCollection; docId: number }>()

const app = useAppStore()
const { c } = useStyles()
const { parentRef, links, progress, link, candidates } = useLinkedItems(
  props.collection,
  () => props.docId,
)

const picking = ref(false)
const query = ref('')
const searchEl = ref<HTMLInputElement | null>(null)
const results = computed<LinkedRow[]>(() => candidates(query.value).slice(0, 8))

async function openPicker() {
  picking.value = true
  query.value = ''
  await nextTick()
  searchEl.value?.focus()
}
function pick(row: LinkedRow) {
  link(row.ref)
  picking.value = false
  query.value = ''
}
const allDone = computed(
  () => progress.value.total > 0 && progress.value.done >= progress.value.total,
)
function markParentComplete() {
  if (props.collection === 'todos') app.setTodoStatus(props.docId, 'done')
  else app.setTaskStatus(props.docId, 'done')
}

// --- styles -----------------------------------------------------------------
const wrap = pxify({ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' })
const header = pxify({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--sp-2)',
})
const labelStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
const addBtn = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '5px 10px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + c.value.border,
    background: c.value.card,
    color: c.value.accent,
    cursor: 'pointer',
  }),
)
const rowStyle = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    padding: '7px 10px',
    borderRadius: 'var(--radius-card)',
    background: c.value.card,
    border: '1px solid ' + c.value.border,
    cursor: 'pointer',
  }),
)
function dotStyle(done: boolean) {
  return pxify({
    width: 14,
    height: 14,
    flexShrink: 0,
    borderRadius: '50%',
    border: '1.5px solid ' + (done ? SUCCESS : c.value.border),
    background: done ? SUCCESS : 'transparent',
    display: 'grid',
    placeItems: 'center',
  })
}
const badgeStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '2px 6px',
    borderRadius: 'var(--radius-control)',
    background: c.value.input,
    color: c.value.dim,
    flexShrink: 0,
  }),
)
const titleStyle = computed(() =>
  pxify({
    flex: 1,
    minWidth: 0,
    ...typeStep('sm'),
    color: c.value.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
)
const promptStyle = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--sp-3)',
    padding: '10px 12px',
    borderRadius: 'var(--radius-card)',
    background: `color-mix(in oklch, ${SUCCESS} 14%, transparent)`,
    border: '1px solid ' + SUCCESS,
    ...typeStep('xs'),
    color: c.value.text,
  }),
)
const confirmBtn = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '6px 12px',
    borderRadius: 'var(--radius-pill)',
    border: 'none',
    background: SUCCESS,
    // The ink on a filled token, from the theme rather than a literal near-black:
    // on a pale success colour a near-black is right and on a dark one it is not,
    // and only the theme knows which it has.
    color: 'var(--theme-on-accent)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
)
const pickerWrap = computed(() =>
  pxify({ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }),
)
const emptyStyle = computed(() =>
  pxify({ ...typeStep('xs'), color: c.value.dim, padding: '4px 2px' }),
)
</script>

<template>
  <div :style="wrap">
    <div :style="header">
      <span :style="labelStyle">Linked items</span>
      <button type="button" :style="addBtn" @click="openPicker">+ Link item</button>
    </div>

    <ProgressBar v-if="progress.total > 0" :value="progress.done" :max="progress.total" />

    <div v-if="allDone" :style="promptStyle">
      <span>All linked items done — mark this complete?</span>
      <button type="button" :style="confirmBtn" @click="markParentComplete">Mark complete</button>
    </div>

    <!-- picker -->
    <div v-if="picking" :style="pickerWrap">
      <TextInput
        ref="searchEl"
        placeholder="Search todos and tasks…"
        :model-value="query"
        @update:model-value="query = $event"
        @keydown.esc="picking = false"
      />
      <div v-if="results.length === 0" :style="emptyStyle">No matching items to link.</div>
      <div
        v-for="row in results"
        :key="row.collection + ':' + row.ref.id"
        :style="rowStyle"
        @click="pick(row)"
      >
        <span :style="dotStyle(row.done)"></span>
        <span :style="titleStyle">{{ row.title }}</span>
        <span :style="badgeStyle">{{ row.collection === 'todos' ? 'Todo' : 'Task' }}</span>
      </div>
    </div>

    <!-- linked children as the shared accordion, expanded by default here -->
    <LinkedAccordion
      v-for="row in links"
      :key="row.collection + ':' + row.ref.id"
      :item-ref="row.ref"
      :parent-ref="parentRef"
      :is-root="false"
      :default-expanded="true"
    />
  </div>
</template>
