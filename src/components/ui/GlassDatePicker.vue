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

/**
 * What a caller can say about one day. `tone` is the sign of whatever the day
 * measured, `intensity` (0–1) how strongly — the two are separate because the
 * direction and the magnitude are usually different quantities. `title` is the
 * hover text, and the reason the colour is never the only signal.
 */
export interface DayMeta {
  tone?: 'pos' | 'neg' | 'flat'
  intensity?: number
  title?: string
  /**
   * The exact fill for this day, when the caller has a scale of its own — a
   * token, not a computed mix. A caller that supplies this has decided what
   * "twice as far" looks like and measured its text against it, which is more
   * than the linear tint below can do (section 28b, themes/plScale).
   */
  wash?: string
  /**
   * The colour the day number is drawn in on that fill. Supplied WITH the wash,
   * never separately: a caller that picks a background has picked the pair, and
   * a deep step of a ramp can need a numeral the theme's text colour cannot
   * provide (section 29).
   */
  ink?: string
}

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
    /**
     * Per-day decoration, keyed by 'YYYY-MM-DD' (section 28). The grid is the
     * app's only month grid, so a surface that wants to paint days — a trading
     * month's wins and losses, a habit streak — extends it here rather than
     * forking it. Tone and intensity are the caller's meaning, not the
     * picker's: it only knows how to draw them.
     */
    dayMeta?: Record<string, DayMeta>
    /**
     * The month to show, 'YYYY-MM' (section 33).
     *
     * Without it the grid picks its own month from the selected value or from
     * today, and then tells its parent which month it chose — which makes the
     * calendar the source of truth for something the URL owns. With no day
     * selected that is how a link to August opens on September.
     */
    month?: string
    /**
     * The typed field and the preset chips. On by default; a grid used as a
     * heat calendar rather than as a field turns them off, because "tomorrow,
     * 25/12, in 3 days" is an instruction to pick a date and that grid is not
     * picking one.
     */
    quickEntry?: boolean
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
    quickEntry: true,
  },
)
const emit = defineEmits<{
  'update:modelValue': [string | DateRange | null]
  /**
   * The month the grid is showing, as 'YYYY-MM', whenever it moves. A caller
   * painting the grid (section 28) loads its data a month at a time and has to
   * know which one is on screen — the alternative is a second month control
   * beside a grid that already has one.
   */
  month: [string]
}>()

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
// Guarded on both sides. An unmount can outlive the document — a test
// environment torn down while a component is still unmounting, and any
// server-side render — and an unguarded `document.removeEventListener` there
// throws inside a lifecycle hook, which Vue reports as an unhandled rejection
// rather than a test failure. That is the worst shape a bug can have: every
// test still reports as passing while the run exits non-zero.
onMounted(() => globalThis.document?.addEventListener('mousedown', onDocumentPointer))
onBeforeUnmount(() => globalThis.document?.removeEventListener('mousedown', onDocumentPointer))

// A portalled panel is no longer carried along by whatever scrolls under it, so
// it has to be told. Capture-phase, because the scroller is usually an ancestor
// of the trigger rather than the window.
function onViewportChange() {
  reposition()
}
onMounted(() => {
  globalThis.window?.addEventListener('scroll', onViewportChange, true)
  globalThis.window?.addEventListener('resize', onViewportChange)
})
onBeforeUnmount(() => {
  // Same guard, same reason as the document listener above.
  globalThis.window?.removeEventListener('scroll', onViewportChange, true)
  globalThis.window?.removeEventListener('resize', onViewportChange)
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

watch(
  () => picker.anchor.value.slice(0, 7),
  (month) => emit('month', month),
  {
    immediate: true,
  },
)

// The controlled month. Guarded on a real change so the emit above and this
// watcher cannot chase each other around the same value.
watch(
  () => props.month,
  (month) => {
    if (month && /^\d{4}-\d{2}$/.test(month) && month !== picker.anchor.value.slice(0, 7)) {
      picker.jumpTo(`${month}-01`)
    }
  },
  { immediate: true },
)

function onClear() {
  picker.clear()
  closePanel()
}

function metaFor(ymd: string): DayMeta | undefined {
  return props.dayMeta?.[ymd]
}

// The intensity is handed over as a percentage rather than a bare number so the
// stylesheet can drop it straight into color-mix(), which will not accept a
// unitless multiplier there. `order` is the cell's place in the month, which is
// what staggers the fill sweep — computed here rather than in CSS because
// nth-child cannot see across the week rows.
function dayStyle(ymd: string, order: number) {
  const meta = metaFor(ymd)
  const style: Record<string, string> = { '--gdp-day-order': String(order) }
  if (meta?.wash) style['--gdp-day-wash'] = meta.wash
  if (meta?.ink) style['--gdp-day-ink'] = meta.ink
  if (meta?.tone && meta.tone !== 'flat') {
    const pct = Math.round(Math.max(0, Math.min(1, meta.intensity ?? 1)) * 100)
    style['--gdp-day-heat'] = `${pct}%`
  }
  return style
}

// A grid somebody is painting behaves differently from a date field: its cells
// lift under the pointer, and its selection is a ring rather than a fill,
// because a fill would overwrite the very colour the caller put there.
const painted = computed(() => Object.keys(props.dayMeta ?? {}).length > 0)
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
        <div v-if="quickEntry" class="gdp__typed">
          <input
            v-model="picker.typed.value"
            class="gdp__input"
            type="text"
            :placeholder="mode === 'time' ? '6pm, 18:30' : 'tomorrow, 25/12, in 3 days'"
            :aria-invalid="!!picker.typedError.value"
            @keydown.enter.prevent="picker.submitTyped()"
          />
        </div>
        <p v-if="quickEntry && picker.typedError.value" class="gdp__error" role="alert">
          {{ picker.typedError.value }}
        </p>

        <div v-if="showGrid && quickEntry" class="gdp__chips">
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
              :class="{ 'is-painted': painted }"
              role="grid"
              tabindex="0"
              :aria-activedescendant="`gdp-day-${picker.focused.value}`"
              @keydown="picker.onGridKeydown"
            >
              <div v-for="(week, wi) in picker.weeks.value" :key="wi" class="gdp__week" role="row">
                <button
                  v-for="(cell, di) in week"
                  :id="`gdp-day-${cell.ymd}`"
                  :key="cell.ymd"
                  type="button"
                  role="gridcell"
                  class="gdp__day"
                  :class="[
                    {
                      'is-out': !cell.inMonth,
                      'is-today': cell.isToday,
                      'is-selected': picker.isSelected(cell.ymd),
                      'is-inrange': picker.inRange(cell.ymd),
                      'is-focused': picker.focused.value === cell.ymd,
                    },
                    metaFor(cell.ymd)?.tone ? `is-${metaFor(cell.ymd)?.tone}` : '',
                    { 'has-wash': !!metaFor(cell.ymd)?.wash },
                  ]"
                  :style="dayStyle(cell.ymd, wi * 7 + di)"
                  :tabindex="-1"
                  :aria-selected="picker.isSelected(cell.ymd)"
                  :disabled="picker.disabled(cell.ymd)"
                  :title="metaFor(cell.ymd)?.title"
                  @click="picker.selectDate(cell.ymd)"
                >
                  <!-- The number by default. A caller painting the grid adds
                       its own mark here — which is what keeps the colour from
                       being the only thing carrying the day's meaning. -->
                  <slot name="day" :cell="cell" :meta="metaFor(cell.ymd)">{{ cell.day }}</slot>
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
  gap: var(--sp-1);
  min-width: 0;
}
.gdp__label {
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.gdp__trigger {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  /* 44px on touch: the spec's target size, enforced by the size modifiers. */
  min-height: var(--gdp-height, 40px);
  padding: 0 12px;
  border-radius: var(--radius-card);
  border: 1px solid var(--glass-border);
  background: var(--theme-input);
  color: var(--theme-text);
  font-size: var(--gdp-font, var(--text-sm));
  line-height: var(--gdp-lh, var(--lh-sm));
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
  /* A flex child sizes to its longest word without this, so the ellipsis
     works and the trigger still grows past its container. */
  min-width: 0;
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
  --gdp-font: var(--text-xs);
  --gdp-lh: var(--lh-xs);
}
.gdp--md {
  --gdp-height: 40px;
  --gdp-font: var(--text-sm);
  --gdp-lh: var(--lh-sm);
}
.gdp--lg {
  --gdp-height: 48px;
  --gdp-font: var(--text-base);
  --gdp-lh: var(--lh-base);
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
  gap: var(--sp-2);
  padding: 12px;
  border-radius: var(--radius-dialog);
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
  border-radius: var(--radius-dialog) var(--radius-dialog) 0 0;
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
  /* The sweep and the lift are both motion answering nothing the reader asked
     for on this frame, so both go. The wash, the ring and the edge stay: they
     are the information, and none of them moves. */
  .gdp__grid.is-painted .gdp__day.has-wash,
  .gdp__grid.is-painted .gdp__day.is-pos,
  .gdp__grid.is-painted .gdp__day.is-neg,
  .gdp__grid.is-painted .gdp__day.is-flat {
    animation: none;
  }
  .gdp__grid.is-painted .gdp__day {
    transition: none;
  }
  .gdp__grid.is-painted .gdp__day:hover:not(:disabled),
  .gdp__grid.is-painted .gdp__day:focus-visible {
    transform: none;
  }
}

.gdp__input {
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border-radius: var(--radius-card);
  border: 1px solid var(--glass-border);
  background: var(--theme-input);
  color: var(--theme-text);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}
.gdp__input:focus-visible {
  outline: none;
  border-color: var(--theme-accent);
}
.gdp__error {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--theme-text);
}
.gdp__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.gdp__chip {
  padding: 5px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  font-weight: var(--weight-semibold);
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
  gap: var(--sp-2);
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
  border-radius: var(--radius-control);
  border: 1px solid transparent;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
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
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  font-weight: var(--weight-semibold);
}
.gdp__weekdays,
.gdp__week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.gdp__weekdays span {
  text-align: center;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
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
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
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
  font-weight: var(--weight-semibold);
}
.gdp__day.is-focused {
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--theme-accent) 55%, transparent);
}
.gdp__day:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  text-decoration: line-through;
}

/* Painted days (section 28). The tint carries the magnitude, and the edge —
   under the number for a gain, over it for a loss — carries the direction, so
   the day still reads on the mono themes, where every status token is the text
   colour and the two tints are identical. */
.gdp__day.is-pos,
.gdp__day.is-neg,
.gdp__day.is-flat {
  position: relative;
}
.gdp__day.is-pos {
  background: color-mix(in oklch, var(--theme-success) var(--gdp-day-heat, 0%), transparent);
}
.gdp__day.is-neg {
  background: color-mix(in oklch, var(--theme-danger) var(--gdp-day-heat, 0%), transparent);
}

/* The edge that says which way the day went — under a gain, over a loss — so
   the direction survives a mono theme and a colour-blind reader.
   
   Drawn as a pseudo-element rather than an inset box-shadow, which is what it
   was: a shadow here silently overwrote the focus ring on every painted cell,
   because both live in the same property and the tone rule came last. Focus
   and selection now own `box-shadow` outright and the edge cannot take it. */
.gdp__day.is-pos::after,
.gdp__day.is-neg::after {
  content: '';
  position: absolute;
  right: 5px;
  left: 5px;
  height: 1.5px;
  border-radius: var(--radius-pill);
}
.gdp__day.is-pos::after {
  bottom: 1px;
  background: color-mix(in oklch, var(--theme-success) 85%, transparent);
}
.gdp__day.is-neg::after {
  top: 1px;
  background: color-mix(in oklch, var(--theme-danger) 85%, transparent);
}
/* A traded day that went nowhere: the flat step of the ramp says it, and there
   is no direction to draw an edge for. */
.gdp__day.is-flat:not(.has-wash) {
  background: color-mix(in oklch, var(--glass-border) 40%, transparent);
}
/* A caller with its own scale wins outright: the token it named is the fill,
   and the linear mix above is not layered under it. */
.gdp__day.has-wash {
  background: var(--gdp-day-wash);
  color: var(--gdp-day-ink, var(--theme-text));
}

/* The fill sweep (section 28b). One orchestrated moment on month load: each
   cell fades its wash in, staggered by its place in the month, and the last one
   lands inside 400ms — `min()` caps the stagger so a six-week month does not
   run longer than a four-week one. Nothing else on this screen animates on
   mount, which is what makes this one legible as a sweep rather than as noise.

   It runs on month change for free: the day buttons are keyed by date, so
   navigating replaces every node and the animation plays on the new ones. */
@keyframes gdpDayWash {
  from {
    background-color: transparent;
    box-shadow: none;
  }
}
.gdp__grid.is-painted .gdp__day.has-wash,
.gdp__grid.is-painted .gdp__day.is-pos,
.gdp__grid.is-painted .gdp__day.is-neg,
.gdp__grid.is-painted .gdp__day.is-flat {
  animation: gdpDayWash 180ms var(--ease-out) both;
  animation-delay: calc(min(var(--gdp-day-order, 0) * 5, 220) * 1ms);
}

/* A painted grid is a control surface, so its cells answer the pointer. 1px:
   enough to read as a lift, small enough that a 42-cell grid does not ripple. */
.gdp__grid.is-painted .gdp__day {
  position: relative;
  transition:
    transform var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}
.gdp__grid.is-painted .gdp__day:hover:not(:disabled),
.gdp__grid.is-painted .gdp__day:focus-visible {
  transform: translateY(-1px);
  z-index: 2;
}
/* The pointer must not repaint a painted cell: the wash IS the reading, and
   hover replacing it with an accent tint is the one thing a heat grid cannot
   afford. The lift and the ring say "you are on this one" instead. */
.gdp__grid.is-painted .gdp__day:hover:not(:disabled) {
  background: var(--gdp-day-wash, transparent);
}

/* Selection is a ring, not a colour (section 28b): filling the cell with the
   accent would delete the green/red reading of the day the reader just picked. */
.gdp__day.is-selected.has-wash {
  background: var(--gdp-day-wash);
  color: var(--gdp-day-ink, var(--theme-text));
  box-shadow:
    inset 0 0 0 2px var(--theme-accent),
    0 0 0 1px color-mix(in oklch, var(--theme-accent) 45%, transparent);
}
.gdp__day.is-selected.is-pos:not(.has-wash),
.gdp__day.is-selected.is-neg:not(.has-wash),
.gdp__day.is-selected.is-flat:not(.has-wash) {
  background: var(--theme-accent);
  color: var(--theme-on-accent);
}

/* Last, and on purpose: wherever the keyboard is, is the thing that must be
   visible. The grid takes focus as one element and moves an
   `aria-activedescendant` between the cells, so this ring is the ONLY signal a
   keyboard user has about which day they are on — it outranks the selection
   ring and every tone rule above. */
.gdp__day.is-focused,
.gdp__day.is-focused.has-wash,
.gdp__day.is-focused.is-selected {
  box-shadow:
    0 0 0 2px var(--theme-accent),
    0 0 0 4px color-mix(in oklch, var(--theme-accent) 30%, transparent);
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
  border-radius: var(--radius-control);
  border: 1px solid transparent;
  background: transparent;
  color: var(--theme-text);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
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
  font-weight: var(--weight-semibold);
}

.gdp__foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
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
