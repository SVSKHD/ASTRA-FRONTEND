<script setup lang="ts">
// Every field of a reminder, labelled, in one column: what, when, how often,
// how important, a note, Google Calendar, and the dates it will fire on. The
// same form creates (in the dialog) and edits (in the dialog on a phone, in the
// detail pane on a desktop), so the two can never show different fields again.
//
// It holds no state of its own beyond "Custom repeat is open": every change is
// emitted as a patch, and the caller writes it to the draft or the reminder.
import { computed, onMounted, ref, watch } from 'vue'
import TextInput from '@/components/ui/TextInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
import Select from '@/components/ui/Select.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Switch from '@/components/ui/Switch.vue'
import Chip from '@/components/ui/Chip.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import ReminderTimeline from '@/components/ReminderTimeline.vue'
import {
  PRIORITY_OPTIONS,
  REPEAT_PRESETS,
  UNIT_OPTIONS,
  presetOf,
  repeatOfPreset,
  timePresets,
  whenLabel,
  type RepeatPreset,
  type ReminderFormValue,
} from '@/utils/reminderView'
import { occurrences, repFreqLabel } from '@/utils/reminders'
import type { Priority, Reminder, Repeat, RepeatType } from '@/types'

const props = withDefaults(
  defineProps<{
    value: ReminderFormValue
    now: number
    /** Creating: the calendar is a switch. Editing: the caller shows its status. */
    create?: boolean
    /** Leave the title out (the detail pane shows it as its heading). */
    hideTitle?: boolean
    autofocus?: boolean
  }>(),
  { create: false, hideTitle: false, autofocus: false },
)
const emit = defineEmits<{ patch: [Partial<ReminderFormValue>] }>()
const set = (patch: Partial<ReminderFormValue>) => emit('patch', patch)

const root = ref<HTMLElement | null>(null)
onMounted(() => {
  if (props.autofocus) root.value?.querySelector<HTMLInputElement>('.rf__title input')?.focus()
})

// --- when ------------------------------------------------------------------
const presets = computed(() => timePresets(props.now))

// --- repeat ----------------------------------------------------------------
// Custom stays open once picked, even when the values happen to match a preset
// ("every 1 day" while typing towards "every 10 days").
const customOpen = ref(presetOf(props.value.repeat) === 'custom')
watch(
  () => props.value.repeat,
  (rep) => {
    if (presetOf(rep) === 'custom') customOpen.value = true
  },
)
const preset = computed<RepeatPreset>(() =>
  customOpen.value ? 'custom' : presetOf(props.value.repeat),
)
function pickPreset(value: string) {
  const p = value as RepeatPreset
  customOpen.value = p === 'custom'
  set({ repeat: repeatOfPreset(p, props.value.repeat) })
}
const unit = computed(() => props.value.repeat.type)
function setUnit(value: string) {
  const type = value as RepeatType
  const rep: Repeat =
    type === 'weekdays'
      ? {
          type,
          weekdays: props.value.repeat.weekdays?.length
            ? props.value.repeat.weekdays
            : [1, 2, 3, 4, 5],
        }
      : { type, n: props.value.repeat.n || 1 }
  set({ repeat: rep })
}
function setEvery(n: number | null) {
  set({ repeat: { ...props.value.repeat, n: Math.max(1, Math.round(n || 1)) } })
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const picked = computed(() => new Set(props.value.repeat.weekdays ?? []))
function toggleDay(d: number) {
  const next = new Set(picked.value)
  if (next.has(d)) next.delete(d)
  else next.add(d)
  set({ repeat: { type: 'weekdays', weekdays: [...next].sort() } })
}

// --- the summary and the dates ahead ---------------------------------------
// The timeline reads a Reminder; the form's values are enough of one.
const asReminder = computed(
  () =>
    ({
      id: -1,
      title: props.value.title,
      note: props.value.note,
      start: props.value.start,
      repeat: props.value.repeat,
      priority: props.value.priority,
    }) as Reminder,
)
const nextAt = computed(() =>
  props.value.start ? occurrences(asReminder.value, props.now).next : null,
)
const summary = computed(() => {
  if (!props.value.start) return 'Pick a time to see when it will ring.'
  const freq = props.value.repeat.type === 'none' ? 'Once' : repFreqLabel(props.value.repeat)
  if (props.value.repeat.type === 'weekdays' && !picked.value.size) return 'Pick at least one day.'
  return nextAt.value == null
    ? `${freq} · that time has passed`
    : `${freq} · next ${whenLabel(nextAt.value, props.now)}`
})
const repeats = computed(() => props.value.repeat.type !== 'none')
</script>

<template>
  <div ref="root" class="rf">
    <TextInput
      v-if="!hideTitle"
      class="rf__title"
      size="lg"
      label="Reminder"
      placeholder="Remind me to…"
      :model-value="value.title"
      @update:model-value="set({ title: String($event ?? '') })"
    />

    <section class="rf__section" aria-label="When">
      <span class="rf__label">When</span>
      <GlassDatePicker
        mode="datetime"
        :model-value="value.start"
        placeholder="Pick a date and time"
        :clearable="false"
        @update:model-value="set({ start: String($event ?? '') })"
      />
      <div class="rf__chips">
        <Chip
          v-for="p in presets"
          :key="p.label"
          size="sm"
          icon="clock"
          :label="p.label"
          :selected="value.start === p.value"
          @click="set({ start: p.value })"
        />
      </div>
    </section>

    <section class="rf__section" aria-label="Repeat">
      <span class="rf__label">Repeat</span>
      <SegmentedControl
        class="rf__seg"
        size="sm"
        aria-label="Repeat"
        :model-value="preset"
        :options="REPEAT_PRESETS"
        @update:model-value="pickPreset"
      />
      <div v-if="preset === 'custom'" class="rf__custom">
        <template v-if="unit !== 'weekdays'">
          <span class="rf__inline">Every</span>
          <NumberInput
            class="rf__every"
            size="sm"
            :min="1"
            :model-value="value.repeat.n ?? 1"
            @update:model-value="setEvery"
          />
        </template>
        <Select
          class="rf__unit"
          size="sm"
          :model-value="unit"
          :options="UNIT_OPTIONS"
          @update:model-value="setUnit"
        />
      </div>
      <div v-if="unit === 'weekdays'" class="rf__days" role="group" aria-label="Days">
        <button
          v-for="d in WEEK_ORDER"
          :key="d"
          type="button"
          class="rf__day"
          :class="{ 'is-on': picked.has(d) }"
          :aria-pressed="picked.has(d)"
          @click="toggleDay(d)"
        >
          {{ WEEKDAYS[d] }}
        </button>
      </div>
      <p class="rf__summary">{{ summary }}</p>
    </section>

    <section class="rf__section" aria-label="Priority">
      <span class="rf__label">Priority</span>
      <SegmentedControl
        class="rf__seg"
        size="sm"
        aria-label="Priority"
        :model-value="value.priority"
        :options="PRIORITY_OPTIONS"
        @update:model-value="set({ priority: $event as Priority })"
      />
    </section>

    <TextArea
      label="Note"
      size="sm"
      :rows="2"
      placeholder="Anything to know when it rings"
      :model-value="value.note"
      @update:model-value="set({ note: $event })"
    />

    <Switch
      v-if="create"
      label="Add to Google Calendar"
      :model-value="value.addToCalendar"
      @update:model-value="set({ addToCalendar: $event })"
    />
    <slot name="calendar" />

    <section v-if="value.start && repeats" class="rf__section" aria-label="Upcoming dates">
      <span class="rf__label">Upcoming dates</span>
      <ReminderTimeline :reminder="asReminder" :now="now" :upcoming="6" />
    </section>
  </div>
</template>

<style scoped>
.rf {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  min-width: 0;
}
.rf > * {
  min-width: 0;
}
.rf__section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
/* The same label the kit's fields draw above themselves. */
.rf__label {
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
/* The strips fill the column, and their segments share it rather than overflow
   it: five repeat choices fit a phone's width. */
.rf__seg {
  width: 100%;
}
.rf__seg :deep(.ui-seg__opt) {
  flex: 1 1 auto;
  padding: 0 6px;
}
.rf__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.rf__custom {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.rf__inline {
  font-size: var(--text-sm);
  color: var(--theme-dim);
}
.rf__every {
  width: 96px;
}
.rf__unit {
  flex: 1;
  min-width: 140px;
}
.rf__days {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
}
.rf__day {
  min-width: 44px;
  height: 32px;
  padding: 0 var(--sp-2);
  border-radius: var(--radius-pill);
  border: 1px solid var(--theme-border);
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    background var(--dur-fast) ease,
    color var(--dur-fast) ease;
}
.rf__day.is-on {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
  color: var(--theme-on-accent);
}
.rf__day:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.rf__summary {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
</style>
