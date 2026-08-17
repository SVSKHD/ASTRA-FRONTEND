// Long lists render in windows rather than all at once (section 16e).
//
// The rows here are not fixed-height — a todo carries tags, a transaction
// carries a note, a reminder carries a timeline — so absolute-positioned
// windowing would need a measurement pass and would fight the existing layout.
// What actually costs time on a long list is creating a thousand component
// instances in one tick, and that is fixed by rendering the first window and
// extending it as the reader approaches the end. Scroll position, keyboard
// navigation, find-in-page within the rendered window and the surrounding
// styles all keep working exactly as before.
//
// Below the threshold nothing changes at all: the list is handed back whole and
// no sentinel is rendered, so short lists pay nothing for this.

import { computed, ref, watch, type Ref } from 'vue'

export interface LongListOptions {
  // Lists shorter than this render in full — the spec's "virtualise anything
  // over 100 rows".
  threshold?: number
  // How many more rows each extension reveals.
  step?: number
}

export interface LongList<T> {
  // The rows to render right now.
  visible: Ref<T[]>
  // True when the source is long enough for windowing to be in play.
  windowed: Ref<boolean>
  // Rows not yet rendered. Drives the "N more" affordance.
  remaining: Ref<number>
  // Reveal the next step. Safe to call when nothing is left.
  more: () => void
  // Reveal everything at once, for "show all" and for print.
  all: () => void
}

export function useLongList<T>(source: Ref<T[]>, options: LongListOptions = {}): LongList<T> {
  const threshold = Math.max(1, options.threshold ?? 100)
  const step = Math.max(1, options.step ?? threshold)
  const limit = ref(threshold)

  // A new list (a filter change, a different day) starts a fresh window rather
  // than inheriting however far the reader had scrolled through the old one.
  watch(
    () => source.value.length,
    (length, previous) => {
      if (previous === undefined || length < previous) limit.value = threshold
    },
  )

  const windowed = computed(() => source.value.length > threshold)
  const visible = computed(() =>
    windowed.value ? source.value.slice(0, limit.value) : source.value,
  )
  const remaining = computed(() => Math.max(0, source.value.length - visible.value.length))

  return {
    visible,
    windowed,
    remaining,
    more: () => {
      limit.value = Math.min(source.value.length, limit.value + step)
    },
    all: () => {
      limit.value = source.value.length
    },
  }
}
