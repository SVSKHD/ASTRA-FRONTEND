// The stateful half of GlassDatePicker (section 16a). The arithmetic lives in
// utils/datePicker; this is the state machine over it — what month is showing,
// where keyboard focus is, what the typed field has parsed to, and what a
// selection commits.
//
// Headless on purpose: it renders nothing, so the picker's presentation can
// change (popover on desktop, bottom sheet on mobile, inline in the /ui page)
// without any of these rules moving.

import { computed, ref, watch, type Ref } from 'vue'
import { parseTypedInput, ymdOf } from '@/utils/dateParse'
import { localDateInTz } from '@/utils/recurrence'
import {
  announce,
  clampDate,
  formatDisplay,
  isDateDisabled,
  joinValue,
  monthMatrix,
  nearestTimeOption,
  nextRange,
  normalizeRange,
  presets,
  shiftFocus,
  splitValue,
  timeOptions,
  weekdayLabels,
  type DateRange,
  type DisabledRules,
  type PickerMode,
} from '@/utils/datePicker'

export interface DatePickerOptions {
  mode: Ref<PickerMode>
  value: Ref<string | DateRange | null | undefined>
  min?: Ref<string | null | undefined>
  max?: Ref<string | null | undefined>
  disabledDates?: Ref<string[] | undefined>
  firstDayOfWeek?: Ref<number>
  timezone?: Ref<string | undefined>
  // Called with the committed value in the mode's own shape.
  commit: (value: string | DateRange | null) => void
}

export function useDatePicker(opts: DatePickerOptions) {
  const open = ref(false)
  const typed = ref('')
  const typedError = ref('')
  // Which half of a datetime the keyboard is in — the time column is a separate
  // roving-focus group from the grid.
  const timeOpen = ref(false)

  const today = computed(() =>
    opts.timezone?.value ? localDateInTz(Date.now(), opts.timezone.value) : ymdOf(new Date()),
  )
  const firstDay = computed(() => opts.firstDayOfWeek?.value ?? 1)
  const rules = computed<DisabledRules>(() => ({
    min: opts.min?.value ?? null,
    max: opts.max?.value ?? null,
    disabledDates: opts.disabledDates?.value ?? [],
  }))

  const isRange = computed(() => opts.mode.value === 'range')
  const range = computed<DateRange>(() =>
    isRange.value
      ? normalizeRange((opts.value.value as DateRange) ?? { start: null, end: null })
      : { start: null, end: null },
  )
  const parts = computed(() =>
    isRange.value
      ? { date: range.value.start, time: null }
      : splitValue(opts.mode.value, opts.value.value as string),
  )

  // The month on screen, and the cell the keyboard is on. Both start from the
  // current value, falling back to today so opening an empty field lands
  // somewhere useful rather than in 1970.
  const anchor = ref(clampDate(parts.value.date ?? today.value, rules.value))
  const focused = ref(anchor.value)

  // Reopening re-syncs to the stored value: a picker that reopens where it was
  // last scrolled, rather than where the value is, reads as a bug.
  watch(open, (isOpen) => {
    if (!isOpen) {
      typed.value = ''
      typedError.value = ''
      timeOpen.value = false
      return
    }
    const start = clampDate(parts.value.date ?? today.value, rules.value)
    anchor.value = start
    focused.value = start
  })

  const weeks = computed(() => monthMatrix(anchor.value, firstDay.value, today.value))
  const weekdays = computed(() => weekdayLabels(firstDay.value))
  const monthTitle = computed(() =>
    new Date(anchor.value + 'T00:00:00').toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    }),
  )
  const presetChips = computed(() => presets(new Date(today.value + 'T00:00:00')))
  const times = computed(() => timeOptions(15))
  const selectedTime = computed(() => parts.value.time)
  const display = computed(() =>
    formatDisplay(opts.mode.value, (opts.value.value as string | DateRange) ?? null),
  )
  const announcement = computed(() => announce(focused.value, disabled(focused.value)))

  function disabled(ymd: string): boolean {
    return isDateDisabled(ymd, rules.value)
  }
  function isSelected(ymd: string): boolean {
    if (isRange.value) return range.value.start === ymd || range.value.end === ymd
    return parts.value.date === ymd
  }
  function inRange(ymd: string): boolean {
    if (!isRange.value) return false
    const { start, end } = range.value
    return !!start && !!end && ymd > start && ymd < end
  }

  // ---- commits --------------------------------------------------------------

  function selectDate(ymd: string, closeAfter = true) {
    if (disabled(ymd)) return
    focused.value = ymd
    if (isRange.value) {
      const next = nextRange(range.value, ymd)
      opts.commit(next)
      // A range stays open until both ends are chosen — closing halfway would
      // leave a half-range nobody asked for.
      if (next.end && closeAfter) open.value = false
      return
    }
    opts.commit(joinValue(opts.mode.value, ymd, parts.value.time))
    // A datetime still needs its time, so the panel stays up.
    if (closeAfter && opts.mode.value !== 'datetime') open.value = false
  }

  function selectTime(time: string, closeAfter = true) {
    if (opts.mode.value === 'time') {
      opts.commit(time)
      if (closeAfter) open.value = false
      return
    }
    const date = parts.value.date ?? today.value
    opts.commit(joinValue(opts.mode.value, date, time))
    if (closeAfter) open.value = false
  }

  function applyPreset(ymd: string | null) {
    if (ymd === null) {
      opts.commit(isRange.value ? { start: null, end: null } : '')
      open.value = false
      return
    }
    selectDate(clampDate(ymd, rules.value))
  }

  function clear() {
    opts.commit(isRange.value ? { start: null, end: null } : '')
  }

  // ---- typed input ----------------------------------------------------------

  // Parsed on submit rather than on every keystroke: re-interpreting a
  // half-typed "25/1" as the 25th of January while the user is still typing
  // "25/12" is worse than waiting for Enter.
  function submitTyped(): boolean {
    const raw = typed.value.trim()
    if (!raw) return false
    const parsed = parseTypedInput(raw, new Date(today.value + 'T00:00:00'))
    if (!parsed || (!parsed.date && !parsed.time)) {
      typedError.value = 'Try “tomorrow”, “25/12” or “in 3 days”'
      return false
    }
    typedError.value = ''
    if (parsed.date && disabled(parsed.date)) {
      typedError.value = 'That date is unavailable'
      return false
    }
    if (parsed.date && parsed.time && opts.mode.value === 'datetime') {
      opts.commit(joinValue('datetime', parsed.date, parsed.time))
    } else if (parsed.date) {
      if (isRange.value) opts.commit(nextRange(range.value, parsed.date))
      else opts.commit(joinValue(opts.mode.value, parsed.date, parts.value.time))
    } else if (parsed.time) {
      selectTime(parsed.time, false)
    }
    typed.value = ''
    open.value = false
    return true
  }

  // ---- keyboard -------------------------------------------------------------

  const NAV_KEYS = [
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'PageUp',
    'PageDown',
    'Home',
    'End',
  ]

  function onGridKeydown(event: KeyboardEvent): void {
    if (NAV_KEYS.includes(event.key)) {
      event.preventDefault()
      const next = shiftFocus(focused.value, event.key, firstDay.value)
      focused.value = clampDate(next, rules.value)
      // Paging the focus out of the visible month pages the month with it.
      if (focused.value.slice(0, 7) !== anchor.value.slice(0, 7)) anchor.value = focused.value
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectDate(focused.value)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      open.value = false
    }
  }

  function goMonth(delta: number) {
    anchor.value = shiftFocus(anchor.value, delta > 0 ? 'PageDown' : 'PageUp', firstDay.value)
  }
  function goYear(delta: number) {
    const d = new Date(anchor.value + 'T00:00:00')
    d.setFullYear(d.getFullYear() + delta)
    anchor.value = ymdOf(d)
  }
  function jumpTo(ymd: string) {
    anchor.value = ymd
    focused.value = ymd
  }

  return {
    // state
    open,
    typed,
    typedError,
    timeOpen,
    anchor,
    focused,
    today,
    // derived
    weeks,
    weekdays,
    monthTitle,
    presetChips,
    times,
    selectedTime,
    display,
    announcement,
    range,
    parts,
    // predicates
    disabled,
    isSelected,
    inRange,
    // actions
    selectDate,
    selectTime,
    applyPreset,
    clear,
    submitTyped,
    onGridKeydown,
    goMonth,
    goYear,
    jumpTo,
    nearestTime: () => nearestTimeOption(parts.value.time),
  }
}
