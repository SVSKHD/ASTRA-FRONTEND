<script setup lang="ts">
// "Linked items" section for an item's detail dialog — shared by todos and
// tasks. Lists direct children with status + collection badge + unlink, shows a
// derived-progress bar, an "all done — mark complete?" prompt at 100%, and a
// type-ahead picker to add links. All logic lives in useLinkedItems, so this
// component is identical for both collections.
import { computed, nextTick, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { useLinkedItems, type LinkedRow } from '@/composables/useLinkedItems'
import { pxify } from '@/styles'
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
const wrap = pxify({ display: 'flex', flexDirection: 'column', gap: 10 })
const header = pxify({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
})
const labelStyle = computed(() =>
  pxify({
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: c.value.dim,
  }),
)
const addBtn = computed(() =>
  pxify({
    fontSize: 11,
    fontWeight: 700,
    padding: '5px 10px',
    borderRadius: 999,
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
    gap: 8,
    padding: '7px 10px',
    borderRadius: 10,
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
    border: '1.5px solid ' + (done ? 'oklch(0.72 0.15 150)' : c.value.border),
    background: done ? 'oklch(0.72 0.15 150)' : 'transparent',
    display: 'grid',
    placeItems: 'center',
  })
}
const badgeStyle = computed(() =>
  pxify({
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '2px 6px',
    borderRadius: 6,
    background: c.value.input,
    color: c.value.dim,
    flexShrink: 0,
  }),
)
const titleStyle = computed(() =>
  pxify({
    flex: 1,
    minWidth: 0,
    fontSize: 13,
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
    gap: 10,
    padding: '10px 12px',
    borderRadius: 12,
    background: 'color-mix(in oklch, oklch(0.72 0.15 150) 14%, transparent)',
    border: '1px solid oklch(0.72 0.15 150)',
    fontSize: 12,
    color: c.value.text,
  }),
)
const confirmBtn = computed(() =>
  pxify({
    fontSize: 11,
    fontWeight: 700,
    padding: '6px 12px',
    borderRadius: 999,
    border: 'none',
    background: 'oklch(0.72 0.15 150)',
    color: '#08130c',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
)
const pickerWrap = computed(() => pxify({ display: 'flex', flexDirection: 'column', gap: 6 }))
const searchStyle = computed(() =>
  pxify({
    padding: '9px 12px',
    borderRadius: 12,
    border: '1px solid ' + c.value.accent,
    background: c.value.input,
    color: c.value.text,
    fontSize: 13,
    outline: 'none',
  }),
)
const emptyStyle = computed(() => pxify({ fontSize: 12, color: c.value.dim, padding: '4px 2px' }))
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
      <input
        ref="searchEl"
        :style="searchStyle"
        placeholder="Search todos and tasks…"
        :value="query"
        @input="query = ($event.target as HTMLInputElement).value"
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
