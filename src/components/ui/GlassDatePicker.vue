<script setup lang="ts">
// The single date/time input in the app (section 16a). Every native date field
// was replaced by this: one component, five modes, one set of keyboard and
// accessibility rules to get right instead of twenty.
//
// Logic lives in useDatePicker (state) and utils/datePicker (arithmetic); this
// file is presentation only. Styling is tokens-only — --glass-bg, --glass-border
// and --glass-blur come from the theme, so a theme that drops the blur (contrast,
// mono) needs no special case here, and there is no hardcoded rgba anywhere.
//
// Desktop opens a popover, mobile a bottom sheet. Both are role="dialog",
// aria-modal, focus-trapped, and return focus to the trigger on close.
//
// Both are also portalled to the body (section 22e, acceptance 119). A panel
// positioned inside its own field is clipped by the first ancestor that
// scrolls, and `position: fixed` does not save it either: the detail dialog
// carries a transform and a backdrop-filter, each of which makes it the
// containing block for fixed children. So the panel leaves the flow entirely
// and is handed coordinates, computed by utils/popoverPlace — which is also
// what gives it collision detection, since something has to decide what
// happens when there is no room below the field.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { storeToRefs } from 'pinia'
import { useDatePicker } from '@/composables/useDatePicker'
import { formatDisplay, type DateRange, type PickerMode } from '@/utils/datePicker'
import { placePopover, type Placed } from '@/utils/popoverPlace'

const props = withDefaults(
  defineProps<{
    modelValue: string | DateRange | null | undefined
    mode?: PickerMode
    min?: string | null
    max?: string | null
    disabledDates?: string[]
    firstDayOfWeek?: number
    timezone?: string
    clearable?: boolean
    placeholder?: string
    size?: 'sm' | 'md' | 'lg'
    inline?: boolean
    disabled?: boolean
    label?: string
    id?: string
  }>(),
  {
    mode: 'date',
    min: null,
    max: null,
    firstDayOfWeek: 1,
    clearable: true,
    placeholder: 'Pick a date',
    size: 'md',
    inline: false,
    disabled: false,
  },
)
const emit = defineEmits<{ 'update:modelValue': [string | DateRange | null] }>()

const ui = useUiStore()
const { isMobile } = storeToRefs(ui)

const picker = useDatePicker({
  mode: toRef(props, 'mode'),
  value: toRef(props, 'modelValue'),
  min: toRef(props, 'min'),
  max: toRef(props, 'max'),
  disabledDates: toRef(props, 'disabledDates'),
  firstDayOfWeek: toRef(props, 'firstDayOfWeek'),
  timezone: toRef(props, 'timezone'),
  commit: (value) => emit('update:modelValue', value),
})

const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
// A bottom sheet on a phone, a popover on a pointer device — the same panel
// either way, so there is one set of behaviours rather than two components.
const asSheet = computed(() => isMobile.value && !props.inline)
const showPanel = computed(() => props.inline || picker.open.value)
const displayText = computed(
  () => formatDisplay(props.mode, (props.modelValue as string | DateRange) ?? null) || '',
)
const showTimeColumn = computed(() => props.mode === 'datetime' || props.mode === 'time')
const showGrid = computed(() => props.mode !== 'time')

// --- where the portalled panel goes -----------------------------------------
// Measured rather than guessed: the trigger's box and the panel's own are both
// read from the DOM, so a panel that grew a time column lands differently from
// one that did not.
const placed = ref<Placed | null>(null)
const portalled = computed(() => !props.inline && !asSheet.value)
const panelStyle = computed(() =>
  portalled.value && placed.value
    ? {
        top: `${placed.value.top}px`,
        left: `${placed.value.left}px`,
        maxHeight: `${placed.value.maxHeight}px`,
      }
    : undefined,
)

function reposition() {
  if (!portalled.value || !picker.open.value) return
  const anchor = trigger.value?.getBoundingClientRect()
  if (!anchor) return
  const box = panel.value?.getBoundingClientRect()
  placed.value = placePopover(
    { top: anchor.top, left: anchor.left, width: anchor.width, height: anchor.height },
    { top: 0, left: 0, width: box?.width || 320, height: box?.height || 380 },
    { width: window.innerWidth, height: window.innerHeight },
  )
}

function openPanel() {
  if (props.disabled) return
  picker.open.value = true
  void nextTick(() => {
    // Twice: once against the fallback size so the panel is never painted at
    // the top-left of the window, then again once it has a real height.
    reposition()
    void nextTick(reposition)
    gridEl.value?.focus()
  })
}
function closePanel(returnFocus = true) {
  picker.open.value = false
  if (returnFocus) void nextTick(() => trigger.value?.focus())
}
function togglePanel() {
  if (picker.open.value) closePanel()
  else openPanel()
}

// Focus trap: Tab cycles inside the panel while it is open, so a keyboard user
// cannot walk off into the page behind an open dialog.
function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closePanel()
    return
  }
  if (event.key !== 'Tab' || !panel.value) return
  const focusable = panel.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
  )
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

function onDocumentPointer(event: MouseEvent) {
  if (!picker.open.value || props.inline) return
  const target = event.target as Node
  if (panel.value?.contains(target) || trigger.value?.contains(target)) return
  closePanel(false)
}
onMounted(() => document.addEventListener('mousedown', onDocumentPointer))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentPointer))

// A portalled panel is no longer carried along by whatever scrolls under it, so
// it has to be told. Capture-phase, because the scroller is usually an ancestor
// of the trigger rather than the window.
function onViewportChange() {
  reposition()
}
onMounted(() => {
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
})

// Scrolling the chosen time into view is what makes the column usable at all —
// otherwise it opens at midnight every time.
const timeListEl = ref<HTMLElement | null>(null)
watch(showPanel, async (visible) => {
  if (!visible || !showTimeColumn.value) return
  await nextTick()
  const selected = timeListEl.value?.querySelector<HTMLElement>('[data-selected="true"]')
  // Optional-called: scrollIntoView is absent in jsdom and in a few older
  // webviews, and a missing scroll is not worth an unhandled rejection.
  selected?.scrollIntoView?.({ block: 'center' })
})

function onClear() {
  picker.clear()
  closePanel()
}
</script>

<template>
  <div class="gdp" :class="[`gdp--${size}`, { 'gdp--inline': inline }]">
    <label v-if="label" class="gdp__label" :for="id">{{ label }}</label>

    <button
      v-if="!inline"
      :id="id"
      ref="trigger"
      type="button"
      class="gdp__trigger"
      :class="{ 'gdp__trigger--empty': !displayText }"
      :disabled="disabled"
      :aria-haspopup="'dialog'"
      :aria-expanded="picker.open.value"
      @click="togglePanel"
    >
      <span class="gdp__value">{{ displayText || placeholder }}</span>
      <span
        v-if="clearable && displayText && !disabled"
        class="gdp__clear"
        role="button"
        tabindex="0"
        aria-label="Clear date"
        @click.stop="onClear"
        @keydown.enter.stop.prevent="onClear"
        >×</span
      >
    </button>

    <!-- Portalled unless it is inline, which renders in the flow on purpose.
         `to="body"` puts it above every dialog in the app rather than inside
         one of them (acceptance 119). -->
    <Teleport to="body" :disabled="inline">
      <!-- The scrim only exists for the sheet; a popover closes on outside click. -->
      <div v-if="picker.open.value && asSheet" class="gdp__scrim" @click="closePanel()"></div>

      <div
        v-if="showPanel"
        ref="panel"
        class="gdp__panel"
        :class="{
          'gdp__panel--sheet': asSheet,
          'gdp__panel--inline': inline,
          'gdp__panel--portal': portalled,
        }"
        :style="panelStyle"
        role="dialog"
        aria-modal="true"
        :aria-label="label || 'Choose a date'"
        @keydown="onPanelKeydown"
      >
        <!-- Typed entry: "tmrw 6pm", "25/12", "in 3 days". -->
        <div class="gdp__typed">
          <input
            v-model="picker.typed.value"
            class="gdp__input"
            type="text"
            :placeholder="mode === 'time' ? '6pm, 18:30' : 'tomorrow, 25/12, in 3 days'"
            :aria-invalid="!!picker.typedError.value"
            @keydown.enter.prevent="picker.submitTyped()"
          />
        </div>
        <p v-if="picker.typedError.value" class="gdp__error" role="alert">
          {{ picker.typedError.value }}
        </p>

        <div v-if="showGrid" class="gdp__chips">
          <button
            v-for="preset in picker.presetChips.value"
            :key="preset.label"
            type="button"
            class="gdp__chip"
            @click="picker.applyPreset(preset.ymd)"
          >
            {{ preset.label }}
          </button>
        </div>

        <div class="gdp__body">
          <div v-if="showGrid" class="gdp__calendar">
            <div class="gdp__nav">
              <button
                type="button"
                class="gdp__navBtn"
                aria-label="Previous year"
                @click="picker.goYear(-1)"
              >
                «
              </button>
              <button
                type="button"
                class="gdp__navBtn"
                aria-label="Previous month"
                @click="picker.goMonth(-1)"
              >
                ‹
              </button>
              <span class="gdp__month" aria-live="polite">{{ picker.monthTitle.value }}</span>
              <button
                type="button"
                class="gdp__navBtn"
                aria-label="Next month"
                @click="picker.goMonth(1)"
              >
                ›
              </button>
              <button
                type="button"
                class="gdp__navBtn"
                aria-label="Next year"
                @click="picker.goYear(1)"
              >
                »
              </button>
            </div>

            <div class="gdp__weekdays" aria-hidden="true">
              <span v-for="wd in picker.weekdays.value" :key="wd">{{ wd }}</span>
            </div>

            <div
              ref="gridEl"
              class="gdp__grid"
              role="grid"
              tabindex="0"
              :aria-activedescendant="`gdp-day-${picker.focused.value}`"
              @keydown="picker.onGridKeydown"
            >
              <div v-for="(week, wi) in picker.weeks.value" :key="wi" class="gdp__week" role="row">
                <button
                  v-for="cell in week"
                  :id="`gdp-day-${cell.ymd}`"
                  :key="cell.ymd"
                  type="button"
                  role="gridcell"
                  class="gdp__day"
                  :class="{
                    'is-out': !cell.inMonth,
                    'is-today': cell.isToday,
                    'is-selected': picker.isSelected(cell.ymd),
                    'is-inrange': picker.inRange(cell.ymd),
                    'is-focused': picker.focused.value === cell.ymd,
                  }"
                  :tabindex="-1"
                  :aria-selected="picker.isSelected(cell.ymd)"
                  :disabled="picker.disabled(cell.ymd)"
                  @click="picker.selectDate(cell.ymd)"
                >
                  {{ cell.day }}
                </button>
              </div>
            </div>
          </div>

          <!-- 15-minute steps; free entry lives in the typed field above. -->
          <div
            v-if="showTimeColumn"
            ref="timeListEl"
            class="gdp__times"
            role="listbox"
            aria-label="Time"
          >
            <button
              v-for="time in picker.times.value"
              :key="time"
              type="button"
              role="option"
              class="gdp__time"
              :data-selected="picker.selectedTime.value === time"
              :aria-selected="picker.selectedTime.value === time"
              :class="{ 'is-selected': picker.selectedTime.value === time }"
              @click="(picker.selectTime(time), closePanel())"
            >
              {{ time }}
            </button>
          </div>
        </div>

        <!-- Announced as focus moves, so a screen reader follows the grid. -->
        <p class="gdp__sr" aria-live="polite">{{ picker.announcement.value }}</p>

        <div v-if="!inline" class="gdp__foot">
          <button v-if="clearable" type="button" class="gdp__chip" @click="onClear">Clear</button>
          <button type="button" class="gdp__chip" @click="closePanel()">Done</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Tokens only: every colour here resolves to a theme token, so a new theme —
   including the mono pair — restyles the picker without touching this file. */
.gdp {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.gdp__label {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.gdp__trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  /* 44px on touch: the spec's target size, enforced by the size modifiers. */
  min-height: var(--gdp-height, 40px);
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid var(--glass-border);
  background: var(--theme-input);
  color: var(--theme-text);
  font-size: var(--gdp-font, 13px);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 160ms ease-out,
    box-shadow 160ms ease-out;
}
.gdp__trigger:hover:not(:disabled) {
  border-color: var(--theme-accent);
}
.gdp__trigger:focus-visible {
  outline: none;
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--theme-accent) 30%, transparent);
}
.gdp__trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.gdp__trigger--empty .gdp__value {
  color: var(--theme-dim);
}
.gdp__value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gdp__clear {
  flex-shrink: 0;
  padding: 0 4px;
  color: var(--theme-dim);
  cursor: pointer;
  line-height: 1;
}
.gdp__clear:hover {
  color: var(--theme-text);
}

.gdp--sm {
  --gdp-height: 32px;
  --gdp-font: 12px;
}
.gdp--md {
  --gdp-height: 40px;
  --gdp-font: 13px;
}
.gdp--lg {
  --gdp-height: 48px;
  --gdp-font: 15px;
}

/* Above the detail dialog (z-index 61) and the note sheet above it (62): a
   portalled panel that layered under the dialog it was opened from would be
   exactly the bug section 22e is about. */
.gdp__scrim {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: color-mix(in oklch, var(--glass-solid) 55%, transparent);
}

.gdp__panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 81;
  width: min(320px, 90vw);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.5);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.5);
  box-shadow: var(--glass-shadow);
  color: var(--theme-text);
}
/* Where backdrop-filter is unsupported the panel becomes opaque rather than
   an unreadable translucent smear. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .gdp__panel {
    background: var(--glass-solid);
  }
}
.gdp__panel--inline {
  position: static;
  width: 100%;
}
/* Portalled: the coordinates come from placePopover, and the panel scrolls
   inside its own max-height rather than growing past the edge of the window. */
.gdp__panel--portal {
  position: fixed;
  top: 0;
  left: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.gdp__panel--sheet {
  position: fixed;
  inset: auto 0 0 0;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  border-radius: 18px 18px 0 0;
  animation: gdpSheetIn 200ms ease-out both;
}
@keyframes gdpSheetIn {
  from {
    transform: translateY(12%);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .gdp__panel--sheet {
    animation: none;
  }
}

.gdp__input {
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--glass-border);
  background: var(--theme-input);
  color: var(--theme-text);
  font-size: 13px;
}
.gdp__input:focus-visible {
  outline: none;
  border-color: var(--theme-accent);
}
.gdp__error {
  margin: 0;
  font-size: 11px;
  color: var(--theme-text);
}
.gdp__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.gdp__chip {
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-dim);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  min-height: 32px;
}
.gdp__chip:hover,
.gdp__chip:focus-visible {
  color: var(--theme-text);
  border-color: var(--theme-accent);
  outline: none;
}

.gdp__body {
  display: flex;
  gap: 8px;
  min-height: 0;
}
.gdp__calendar {
  flex: 1;
  min-width: 0;
}
.gdp__nav {
  display: flex;
  align-items: center;
  gap: 2px;
}
.gdp__navBtn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  font-size: 13px;
}
.gdp__navBtn:hover,
.gdp__navBtn:focus-visible {
  color: var(--theme-text);
  border-color: var(--glass-border);
  outline: none;
}
.gdp__month {
  flex: 1;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
}
.gdp__weekdays,
.gdp__week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.gdp__weekdays span {
  text-align: center;
  font-size: 10px;
  color: var(--theme-dim);
  padding: 4px 0;
}
.gdp__grid:focus-visible {
  outline: none;
}
.gdp__day {
  aspect-ratio: 1;
  min-height: 32px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--theme-text);
  font-size: 12px;
  cursor: pointer;
  transition:
    background 150ms ease-out,
    border-color 150ms ease-out;
}
.gdp__day:hover:not(:disabled) {
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
}
.gdp__day.is-out {
  color: var(--theme-dim);
  opacity: 0.55;
}
.gdp__day.is-today {
  border-color: var(--theme-accent);
}
.gdp__day.is-inrange {
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
}
.gdp__day.is-selected {
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  font-weight: 700;
}
.gdp__day.is-focused {
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--theme-accent) 55%, transparent);
}
.gdp__day:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  text-decoration: line-through;
}

.gdp__times {
  width: 84px;
  max-height: 232px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 2px;
}
.gdp__time {
  min-height: 30px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--theme-text);
  font-size: 12px;
  cursor: pointer;
}
.gdp__time:hover,
.gdp__time:focus-visible {
  border-color: var(--theme-accent);
  outline: none;
}
.gdp__time.is-selected {
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  font-weight: 700;
}

.gdp__foot {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.gdp__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* Touch: every target clears 44px. */
@media (pointer: coarse) {
  .gdp__day,
  .gdp__time,
  .gdp__chip,
  .gdp__navBtn {
    min-height: 44px;
  }
  .gdp__navBtn {
    width: 44px;
  }
}
</style>
