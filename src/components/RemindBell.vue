<script setup lang="ts">
import Select from '@/components/ui/Select.vue'
// The "Remind me" bell on every todo/task/idea row and detail page. Clicking opens a
// compact popover of quick options (Later today +3h, Tonight 8pm, Tomorrow 9am,
// In 2 days, Next week, Custom) plus an optional Repeat row. Choosing one creates
// a reminder that points back at this item — it does NOT duplicate it. When a
// reminder is already attached the button shows a small chip with the next fire
// time ("in 3h"); tapping the chip opens that reminder.
//
// `size` scales the bell's hit box, its glyph and the chip together: `md` (the
// default, 32px) for list rows, `sm` (26px) for dense rows and sub-lists, `lg`
// (40px) for a detail page's toolbar or a touch-first surface.
import { computed, ref } from 'vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { bellChipLabel, soonestFireAmong } from '@/utils/upcoming'
import type { RemindCollection, Repeat, RepeatType } from '@/types'
import Icon from '@/components/ui/Icon.vue'

type BellSize = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    collection: RemindCollection
    id: number
    variant?: 'row' | 'detail'
    size?: BellSize
    /** The glyph's own size step, when it should differ from what `size`
     *  implies — e.g. to match a neighbouring `md` icon in the same box. */
    iconSize?: 'xs' | 'sm' | 'md'
  }>(),
  { variant: 'row', size: 'md', iconSize: undefined },
)

// Box in px, the icon's size step, and the chip's type step, per size.
const SIZES: Record<BellSize, { box: number; icon: 'xs' | 'sm' | 'md'; chip: '2xs' | 'xs' }> = {
  sm: { box: 26, icon: 'xs', chip: '2xs' },
  md: { box: 32, icon: 'sm', chip: '2xs' },
  lg: { box: 40, icon: 'md', chip: 'xs' },
}
const dims = computed(() => SIZES[props.size])

const app = useAppStore()
const ui = useUiStore()
const { c } = useStyles()
const { reminders, todos, tasks, ideas } = storeToRefs(app)
const { now } = storeToRefs(ui)

const item = computed(() =>
  (props.collection === 'todos'
    ? todos.value
    : props.collection === 'ideas'
      ? ideas.value
      : tasks.value
  ).find((x) => x.id === props.id),
)
const reminderIds = computed(() => item.value?.reminderIds ?? [])
const chipLabel = computed(() => bellChipLabel(reminders.value, reminderIds.value, now.value))

const open = ref(false)
const repeat = ref<RepeatType>('none')
const customStart = ref('')

// Local 'YYYY-MM-DDTHH:mm' for a Date, matching the datetime-local convention.
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    '-' +
    p(d.getMonth() + 1) +
    '-' +
    p(d.getDate()) +
    'T' +
    p(d.getHours()) +
    ':' +
    p(d.getMinutes())
  )
}
function atTime(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date(now.value)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, minute, 0, 0)
  return toLocalInput(d)
}

interface Quick {
  label: string
  start: () => string
}
const quicks: Quick[] = [
  { label: 'Later today', start: () => toLocalInput(new Date(now.value + 3 * 3600000)) },
  { label: 'Tonight · 8pm', start: () => atTime(0, 20) },
  { label: 'Tomorrow · 9am', start: () => atTime(1, 9) },
  { label: 'In 2 days', start: () => atTime(2, 9) },
  { label: 'Next week', start: () => atTime(7, 9) },
]

const repeatOptions: { value: RepeatType; label: string }[] = [
  { value: 'none', label: 'No repeat' },
  { value: 'days', label: 'Daily' },
  { value: 'weeks', label: 'Weekly' },
  { value: 'months', label: 'Monthly' },
]
function buildRepeat(): Repeat {
  return repeat.value === 'none' ? { type: 'none' } : { type: repeat.value, n: 1 }
}

function create(start: string) {
  if (!start) return
  app.createReminderFromItem(props.collection, props.id, { start, repeat: buildRepeat() })
  app.showToastMsg('Reminder set')
  open.value = false
  repeat.value = 'none'
  customStart.value = ''
}
function chooseCustom() {
  if (customStart.value) create(customStart.value)
}
function openChip() {
  const rid = soonestFireAmong(reminders.value, reminderIds.value, now.value)
  const first = reminderIds.value[0]
  if (rid != null) {
    // Open the actual soonest reminder, resolving its id from the fire time.
    const match = reminders.value.find(
      (r) => reminderIds.value.includes(r.id) && r.cancelledAt == null,
    )
    app.openReminderDialog(match ? match.id : first)
  } else if (first != null) {
    app.openReminderDialog(first)
  }
}

// --- styles -----------------------------------------------------------------
const wrap = pxify({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--sp-2)',
})
const bellBtn = computed(() =>
  pxify({
    width: dims.value.box,
    height: dims.value.box,
    flexShrink: 0,
    borderRadius: 'var(--radius-control)',
    border: 'none',
    background: 'transparent',
    color: chipLabel.value ? c.value.accent : c.value.dim,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
  }),
)
const chipStyle = computed(() =>
  pxify({
    ...typeStep(dims.value.chip),
    padding: props.size === 'lg' ? '3px 9px' : '2px 7px',
    borderRadius: 'var(--radius-pill)',
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: c.value.accent,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
)
const popStyle = computed(() =>
  pxify({
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    zIndex: 30,
    width: 210,
    padding: 10,
    borderRadius: 'var(--radius-dialog)',
    background: c.value.card,
    border: '1px solid ' + c.value.border,
    boxShadow: 'var(--layer-overlay-shadow)',
    backdropFilter: 'blur(16px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
  }),
)
const popHead = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: c.value.dim,
    marginBottom: 2,
  }),
)
const quickBtn = computed(() =>
  pxify({
    textAlign: 'left',
    ...typeStep('xs'),
    padding: '7px 9px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.text,
    cursor: 'pointer',
  }),
)
const rowFlex = pxify({ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' })
const setBtn = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '6px 10px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid ' + c.value.accent,
    background: c.value.accent,
    color: c.value.onAccent,
    cursor: 'pointer',
  }),
)
const backdrop = pxify({ position: 'fixed', inset: 0, zIndex: 20 })
</script>

<template>
  <span :style="wrap">
    <span
      v-if="chipLabel"
      :style="chipStyle"
      role="button"
      title="Open reminder"
      @click.stop="openChip"
      >🔔 {{ chipLabel }}</span
    >
    <button
      type="button"
      :style="bellBtn"
      :aria-label="chipLabel ? 'Add another reminder' : 'Remind me'"
      title="Remind me"
      @click.stop="open = !open"
    >
      <Icon
        name="bell"
        :size="iconSize ?? dims.icon"
        :style="{ color: chipLabel ? c.accent : c.dim }"
      />
    </button>

    <template v-if="open">
      <div :style="backdrop" @click.stop="open = false"></div>
      <div :style="popStyle" @click.stop>
        <span :style="popHead">Remind me</span>
        <button v-for="q in quicks" :key="q.label" :style="quickBtn" @click="create(q.start())">
          {{ q.label }}
        </button>
        <div :style="rowFlex">
          <Select
            v-model="repeat"
            aria-label="Repeat"
            :options="[
              ...repeatOptions.map((o) => ({ value: String(o.value), label: `${o.label}` })),
            ]"
          />
        </div>
        <div :style="rowFlex">
          <GlassDatePicker
            v-model="customStart"
            mode="datetime"
            size="sm"
            label="Custom date and time"
            placeholder="Pick date and time"
          />
          <button :style="setBtn" :disabled="!customStart" @click="chooseCustom">Set</button>
        </div>
      </div>
    </template>
  </span>
</template>
