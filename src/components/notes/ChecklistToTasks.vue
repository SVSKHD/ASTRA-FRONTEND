<script setup lang="ts">
// "Convert checklist to tasks": the task-list items in a note, previewed and
// selected before anything is written.
//
// The spec asks for the goals import preview from section 12c. That import is a
// route (`/import/goals`) rather than an extractable component, so this follows
// its shape — parse, show every row with what will happen to it, let the reader
// deselect, then write in one go — without pulling a whole page in to do it.
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { checklistItems } from '@/utils/mdTyping'

const props = defineProps<{ source: string; open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const app = useAppStore()
const { c } = useStyles()

const items = computed(() => checklistItems(props.source))
// Ticked items are already done; the useful default is to import what is left.
const chosen = ref<Set<number>>(new Set())
watch(
  () => [props.open, items.value] as const,
  ([open]) => {
    if (!open) return
    chosen.value = new Set(items.value.map((it, i) => (it.done ? -1 : i)).filter((i) => i >= 0))
  },
  { immediate: true },
)

function toggle(index: number) {
  const next = new Set(chosen.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  chosen.value = next
}

const count = computed(() => chosen.value.size)

function importChosen() {
  const picked = items.value.filter((_, i) => chosen.value.has(i))
  for (const item of picked) app.addTask(item.text, '')
  if (picked.length) {
    app.showToastMsg(`${picked.length} task${picked.length === 1 ? '' : 's'} added`)
  }
  emit('close')
}

const overlay = pxify({
  position: 'fixed',
  inset: 0,
  zIndex: 55,
  background: 'rgba(0,0,0,0.5)',
})
const card = computed(() =>
  pxify({
    position: 'fixed',
    zIndex: 56,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%,-50%)',
    width: 'min(92vw, 460px)',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 16,
    borderRadius: 18,
    border: '1px solid ' + c.value.border,
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.5)',
    boxShadow: c.value.shadow,
  }),
)
const heading = computed(() =>
  pxify({ fontSize: 14, fontWeight: 700, color: c.value.text, margin: 0 }),
)
const sub = computed(() => pxify({ fontSize: 11, color: c.value.dim }))
const list = pxify({ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1 })
const row = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '7px 8px',
    borderRadius: 10,
    fontSize: 12,
    color: c.value.text,
    cursor: 'pointer',
    textAlign: 'left',
    border: 'none',
    background: 'transparent',
    width: '100%',
  }),
)
const rowHover = computed(() => ({ background: c.value.card }))
const doneTag = computed(() =>
  pxify({ fontSize: 9, color: c.value.dim, letterSpacing: '0.08em', textTransform: 'uppercase' }),
)
const foot = pxify({ display: 'flex', alignItems: 'center', gap: 8 })
const spacer = pxify({ flex: 1 })
const ghost = computed(() =>
  pxify({
    padding: '7px 12px',
    borderRadius: 10,
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    fontSize: 12,
    cursor: 'pointer',
  }),
)
const primary = computed(() =>
  pxify({
    padding: '7px 14px',
    borderRadius: 10,
    border: 'none',
    background: c.value.accent,
    color: c.value.onAccent,
    fontSize: 12,
    fontWeight: 700,
    cursor: count.value ? 'pointer' : 'not-allowed',
    opacity: count.value ? 1 : 0.5,
  }),
)
</script>

<template>
  <template v-if="open">
    <div :style="overlay" @click="emit('close')"></div>
    <div :style="card" role="dialog" aria-modal="true" aria-label="Convert checklist to tasks">
      <h2 :style="heading">Convert checklist to tasks</h2>
      <p v-if="!items.length" :style="sub">This note has no checklist items.</p>
      <p v-else :style="sub">
        {{ items.length }} item{{ items.length === 1 ? '' : 's' }} found. Ticked ones are left out
        by default.
      </p>

      <div v-if="items.length" :style="list">
        <button
          v-for="(item, i) in items"
          :key="i"
          type="button"
          :style="row"
          v-hover-style="rowHover"
          :aria-pressed="chosen.has(i)"
          @click="toggle(i)"
        >
          <input type="checkbox" :checked="chosen.has(i)" tabindex="-1" aria-hidden="true" />
          <span>{{ item.text }}</span>
          <span v-if="item.done" :style="doneTag">done</span>
        </button>
      </div>

      <div :style="foot">
        <span :style="spacer"></span>
        <button type="button" :style="ghost" @click="emit('close')">Cancel</button>
        <button type="button" :style="primary" :disabled="!count" @click="importChosen">
          Add {{ count }} task{{ count === 1 ? '' : 's' }}
        </button>
      </div>
    </div>
  </template>
</template>
