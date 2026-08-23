<script setup lang="ts">
// The capture prompt shown when a metric-enabled occurrence is ticked (task 11).
// A compact inline popover, not a full dialog: a number input prefilled with the
// target (focused + selected), the unit suffix, an optional note, and Save / Skip.
// Enter saves, Esc cancels and leaves the item unticked. While open the occurrence
// is held in the sync guard so a remote snapshot can't overwrite the number
// mid-entry; the guard is released on save/skip/cancel.
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { useSyncGuard } from '@/composables/useSyncGuard'
import { pxify, typeStep } from '@/styles'
import { captureOutcome, type Metric } from '@/utils/goalMetrics'

const props = defineProps<{
  occurrenceId: number
  metric: Metric
  prompt?: string
}>()
const emit = defineEmits<{
  (e: 'save', payload: { actual: number; note: string | null }): void
  (e: 'skip'): void
  (e: 'missed', payload: { actual: number; note: string | null }): void
  (e: 'cancel'): void
}>()

const { c } = useStyles()
const guard = useSyncGuard()

const value = ref(String(props.metric.target))
const note = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

const num = computed(() => {
  const n = parseFloat(value.value)
  return Number.isFinite(n) ? n : 0
})
const outcome = computed(() => captureOutcome(props.metric, num.value))
const unitSuffix = computed(() => props.metric.unit)

onMounted(async () => {
  guard.editingIds.add(props.occurrenceId)
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select()
})
onBeforeUnmount(() => {
  guard.editingIds.delete(props.occurrenceId)
})

function save() {
  emit('save', { actual: num.value, note: note.value.trim() || null })
}
function skip() {
  emit('skip')
}
function markMissed() {
  emit('missed', { actual: num.value, note: note.value.trim() || null })
}

// --- styles ------------------------------------------------------------------
const pop = computed(() =>
  pxify({
    position: 'absolute',
    zIndex: 40,
    top: 'calc(100% + 6px)',
    left: 0,
    width: 250,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(28px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    boxShadow: c.value.shadow,
    animation: 'fadeUp .16s ease both',
  }),
)
const promptStyle = computed(() =>
  pxify({ ...typeStep('sm'), fontWeight: 'var(--weight-semibold)', color: c.value.text }),
)
const inputWrap = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    border: '1px solid ' + c.value.border,
    background: c.value.input,
    padding: '4px 10px',
  }),
)
const numInput = computed(() =>
  pxify({
    flex: 1,
    minWidth: 0,
    ...typeStep('md'),
    fontWeight: 'var(--weight-semibold)',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: c.value.text,
    fontFamily: 'inherit',
  }),
)
const unitStyle = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim, flexShrink: 0 }))
const noteInput = computed(() =>
  pxify({
    ...typeStep('xs'),
    borderRadius: 10,
    border: '1px solid ' + c.value.border,
    background: c.value.input,
    padding: '6px 10px',
    color: c.value.text,
    outline: 'none',
    fontFamily: 'inherit',
  }),
)
const outcomeStyle = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    color: outcome.value.hit ? 'oklch(0.72 0.15 150)' : 'oklch(0.8 0.16 72)',
  }),
)
const rowBtns = pxify({ display: 'flex', gap: 8, alignItems: 'center' })
const saveBtn = computed(() =>
  pxify({
    flex: 1,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '7px 10px',
    borderRadius: 999,
    border: 'none',
    background: c.value.accent,
    color: c.value.onAccent,
    cursor: 'pointer',
  }),
)
const ghostBtn = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '7px 10px',
    borderRadius: 999,
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
  }),
)
const missedBtn = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '4px 8px',
    borderRadius: 999,
    border: '1px solid oklch(0.64 0.22 25)',
    background: 'transparent',
    color: 'oklch(0.64 0.22 25)',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  }),
)
</script>

<template>
  <div :style="pop" @click.stop @keydown.esc.stop.prevent="emit('cancel')">
    <div :style="promptStyle">{{ prompt || 'How much did you achieve today?' }}</div>
    <div :style="inputWrap">
      <input
        ref="inputEl"
        :style="numInput"
        v-model="value"
        type="text"
        inputmode="decimal"
        @keydown.enter.stop.prevent="save"
      />
      <span :style="unitStyle">{{ unitSuffix }}</span>
    </div>
    <div :style="outcomeStyle">
      {{ num }} / {{ metric.target }} · {{ outcome.pct }}%
      <span v-if="outcome.hit"> ✓</span>
    </div>
    <input
      :style="noteInput"
      v-model="note"
      type="text"
      placeholder="Note (optional)"
      @keydown.enter.stop.prevent="save"
    />
    <div :style="rowBtns">
      <button :style="saveBtn" @click="save">Save</button>
      <button :style="ghostBtn" @click="skip">Skip today</button>
    </div>
    <button v-if="outcome.offerMissed" :style="missedBtn" @click="markMissed">
      Mark as missed instead
    </button>
  </div>
</template>
