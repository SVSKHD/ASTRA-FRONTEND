<script setup lang="ts">
// ‹ July 2026 › month selector: glass pill with prev/next arrows (next disabled
// beyond the current month) and a click-to-open 12-month grid + year stepper.
// Controlled via v-model of a 'YYYY-MM' key; persistence lives in the parent.
import { computed, nextTick, ref } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { currentMonthKey, monthLabel, shiftMonth } from '@/utils/budget'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const { c } = useStyles()

const CURRENT = currentMonthKey()
const canNext = computed(() => props.modelValue < CURRENT)
const label = computed(() => monthLabel(props.modelValue))

function set(key: string) {
  // Never allow a future month.
  emit('update:modelValue', key > CURRENT ? CURRENT : key)
}
function prev() {
  set(shiftMonth(props.modelValue, -1))
}
function next() {
  if (canNext.value) set(shiftMonth(props.modelValue, 1))
}

// --- popover grid -----------------------------------------------------------
const open = ref(false)
const viewYear = ref(Number(props.modelValue.slice(0, 4)) || new Date().getFullYear())
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const currentYear = Number(CURRENT.slice(0, 4))

async function toggle() {
  if (!open.value) viewYear.value = Number(props.modelValue.slice(0, 4)) || currentYear
  open.value = !open.value
  await nextTick()
}
function keyFor(monthIdx: number): string {
  return viewYear.value + '-' + String(monthIdx + 1).padStart(2, '0')
}
function isFuture(monthIdx: number): boolean {
  return keyFor(monthIdx) > CURRENT
}
function isSelected(monthIdx: number): boolean {
  return keyFor(monthIdx) === props.modelValue
}
function choose(monthIdx: number) {
  if (isFuture(monthIdx)) return
  set(keyFor(monthIdx))
  open.value = false
}
const canYearUp = computed(() => viewYear.value < currentYear)

// --- styles -----------------------------------------------------------------
const wrap = pxify({ position: 'relative', display: 'inline-flex' })
const pill = computed(() =>
  pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 8px',
    borderRadius: 999,
    background: c.value.glass,
    backdropFilter: 'blur(20px) saturate(1.5)',
    border: '1px solid ' + c.value.border,
    boxShadow: c.value.shadow,
  }),
)
function arrowStyle(disabled: boolean) {
  return pxify({
    width: 26,
    height: 26,
    borderRadius: 999,
    border: 'none',
    background: 'transparent',
    color: disabled ? c.value.dim : c.value.text,
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? 'default' : 'pointer',
    ...typeStep('base'),
    lineHeight: 1,
    display: 'grid',
    placeItems: 'center',
  })
}
const labelBtn = computed(() =>
  pxify({
    minWidth: 120,
    textAlign: 'center',
    ...typeStep('sm'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.text,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  }),
)
const overlay = pxify({ position: 'fixed', inset: 0, zIndex: 12 })
const panel = computed(() =>
  pxify({
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 13,
    width: 244,
    padding: 12,
    borderRadius: 16,
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    boxShadow: '0 14px 34px rgba(0,0,0,0.34)',
    animation: 'sheetUp .2s ease',
  }),
)
const yearRow = pxify({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
})
const yearLabel = computed(() =>
  pxify({ ...typeStep('sm'), fontWeight: 'var(--weight-semibold)', color: c.value.text }),
)
const grid = pxify({ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 })
function cellStyle(monthIdx: number) {
  const selected = isSelected(monthIdx)
  const future = isFuture(monthIdx)
  return pxify({
    padding: '9px 0',
    borderRadius: 10,
    border: '1px solid ' + (selected ? c.value.accent : 'transparent'),
    background: selected ? c.value.accent : c.value.card,
    color: selected ? c.value.onAccent : future ? c.value.dim : c.value.text,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    cursor: future ? 'default' : 'pointer',
    opacity: future ? 0.4 : 1,
    textAlign: 'center',
  })
}
</script>

<template>
  <div :style="wrap">
    <div :style="pill">
      <button type="button" :style="arrowStyle(false)" aria-label="Previous month" @click="prev">
        ‹
      </button>
      <button
        type="button"
        :style="labelBtn"
        aria-haspopup="menu"
        :aria-expanded="open"
        @click="toggle"
      >
        {{ label }}
      </button>
      <button
        type="button"
        :style="arrowStyle(!canNext)"
        aria-label="Next month"
        :disabled="!canNext"
        @click="next"
      >
        ›
      </button>
    </div>

    <template v-if="open">
      <div :style="overlay" @click="open = false"></div>
      <div :style="panel" role="menu">
        <div :style="yearRow">
          <button
            type="button"
            :style="arrowStyle(false)"
            aria-label="Previous year"
            @click="viewYear--"
          >
            ‹
          </button>
          <span :style="yearLabel">{{ viewYear }}</span>
          <button
            type="button"
            :style="arrowStyle(!canYearUp)"
            aria-label="Next year"
            :disabled="!canYearUp"
            @click="canYearUp && viewYear++"
          >
            ›
          </button>
        </div>
        <div :style="grid">
          <button
            v-for="(m, i) in MONTHS"
            :key="m"
            type="button"
            :style="cellStyle(i)"
            :disabled="isFuture(i)"
            @click="choose(i)"
          >
            {{ m }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
