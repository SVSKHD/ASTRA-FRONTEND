<script setup lang="ts">
// The left gutter beside the stage: a greeting with the weather (GreetCard),
// then the reminder card.
//
// On a wide screen the stage stops at its maximum width and leaves starfield
// either side of it. That gutter is where "what is coming up" now lives: a glass
// card listing reminders and deadlines soonest first, folded behind its own
// header like every other accordion in the app. The NEXT pill in the top strip
// stands down while this is on screen (see `reminderDockShown`).
//
// It only appears where it fits. The card measures the gap between the edge of
// the content region and the stage; below MIN_WIDTH of room it hides, and the
// pill in the strip carries the next item as it always did. The stage is never
// moved or narrowed to make room — the card lives in space nothing else uses.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useAccordionState } from '@/composables/useAccordionState'
import { storeToRefs } from 'pinia'
import {
  daysToGo,
  reminderDockShown,
  useUpcoming,
  whenLabel,
  type Upcoming,
} from '@/composables/useUpcoming'
import { vScrollFade } from '@/directives/scrollFade'
import Caret from '@/components/ui/Caret.vue'
import Icon from '@/components/ui/Icon.vue'
import GreetCard from '@/components/shell/GreetCard.vue'

const props = defineProps<{ stage: HTMLElement | null }>()

const MIN_WIDTH = 200
const GAP = 20
const SHOWN = 8

const ui = useUiStore()
const { now } = storeToRefs(ui)
const { list, colorOf } = useUpcoming()

// The flag a row wears: a reminder's own priority, or "Deadline".
const FLAG: Record<string, string> = { high: 'High', normal: 'Normal', low: 'Low' }
function flagLabel(u: Upcoming): string {
  return u.priority ? FLAG[u.priority] : 'Deadline'
}
// Within three days, the count is drawn in the accent so it stands out.
function isSoon(u: Upcoming): boolean {
  return u.ms >= 0 && u.ms < 3 * 86400000
}
const acc = useAccordionState()
const KEY = 'dock:reminders'
const open = computed(() => acc.isOpen(KEY, true))

// The room to the left of the stage, re-measured whenever the stage or the
// region around it changes size.
const room = ref(0)
function measure() {
  room.value = props.stage ? props.stage.offsetLeft : 0
}
let ro: ResizeObserver | null = null
watch(
  () => props.stage,
  (stage) => {
    ro?.disconnect()
    ro = null
    if (!stage || typeof ResizeObserver === 'undefined') return measure()
    ro = new ResizeObserver(measure)
    ro.observe(stage)
    if (stage.parentElement) ro.observe(stage.parentElement)
    measure()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  ro?.disconnect()
  reminderDockShown.value = false
})

// The whole gutter, less a margin either side: the card reaches across to the
// stage rather than floating as a narrow tile in the middle of the space.
const width = computed(() => room.value - GAP * 2)
const fits = computed(() => width.value >= MIN_WIDTH)
watch(fits, (f) => (reminderDockShown.value = f), { immediate: true })

const shown = computed(() => list.value.slice(0, SHOWN))
const more = computed(() => Math.max(0, list.value.length - SHOWN))
const overdue = computed(() => list.value.filter((u) => u.ms < 0).length)

function go(u: Upcoming) {
  ui.setTab(u.kind === 'reminder' ? 'reminders' : 'deadlines')
}

const cardStyle = computed(() => ({
  width: width.value + 'px',
  left: Math.max(GAP, (room.value - width.value) / 2) + 'px',
}))
</script>

<template>
  <aside v-if="fits" class="rdock" :style="cardStyle" aria-label="Coming up">
    <!-- Hello, the date and the weather, above what is coming up. -->
    <GreetCard />
    <button
      type="button"
      class="rdock__head"
      :aria-expanded="open"
      aria-controls="rdock-body"
      @click="acc.toggle(KEY, true)"
    >
      <Icon name="bell" size="sm" class="rdock__bell" />
      <span class="rdock__title">Reminders</span>
      <span v-if="list.length" class="rdock__count" :class="{ 'is-overdue': overdue > 0 }">{{
        list.length
      }}</span>
      <Caret :open="open" />
    </button>

    <!-- The list is a second card of its own, floating under the bar: it drops
         in when the bar opens and lifts away when it closes. -->
    <Transition name="rdock-pop">
      <div v-if="open" class="rdock__panel">
        <div id="rdock-body" v-scroll-fade class="rdock__body">
          <button
            v-for="u in shown"
            :key="u.key"
            type="button"
            class="rdock__item"
            :title="u.title + ' — ' + flagLabel(u) + ', ' + daysToGo(u.at, now)"
            @click="go(u)"
          >
            <span class="rdock__dot" :style="{ background: colorOf(u) }"></span>
            <span class="rdock__main">
              <span class="rdock__name">{{ u.title || '(untitled)' }}</span>
              <!-- Its importance, and when. -->
              <span class="rdock__meta">
                <span class="rdock__flag" :class="'is-' + (u.priority ?? 'deadline')">
                  <Icon name="flag" size="xs" />{{ flagLabel(u) }}
                </span>
                <span class="rdock__when">{{ whenLabel(u) }}</span>
              </span>
            </span>
            <span class="rdock__time" :class="{ 'is-overdue': u.ms < 0, 'is-soon': isSoon(u) }">{{
              daysToGo(u.at, now)
            }}</span>
          </button>
          <p v-if="!list.length" class="rdock__empty">Nothing coming up.</p>
          <button v-if="more" type="button" class="rdock__more" @click="ui.setTab('reminders')">
            + {{ more }} more
          </button>
        </div>
      </div>
    </Transition>
  </aside>
</template>

<style scoped>
/* Two floating glass cards, one above the other: the bar, and — when it is
   open — the list. The aside itself is only their column. */
.rdock {
  position: absolute;
  top: 18px;
  z-index: 3;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(100% - 36px);
}
/* The shared surface: glass warmed with the theme's accent so each card reads
   as its own surface against the starfield rather than a hole in it. */
.rdock__head,
.rdock__panel {
  border-radius: var(--radius-dialog);
  background: color-mix(in oklch, var(--theme-accent) 9%, var(--glass-card, var(--theme-card)));
  border: 1px solid color-mix(in oklch, var(--theme-accent) 22%, transparent);
  backdrop-filter: blur(30px) saturate(1.6);
  -webkit-backdrop-filter: blur(30px) saturate(1.6);
}
.rdock__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  padding: 14px 16px;
  /* A hairline lift: the bar sits close to the starfield. */
  box-shadow: 0 2px 10px color-mix(in oklch, black 22%, transparent);
  transition: background var(--dur-fast, 120ms) ease;
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.rdock__head:hover {
  background: color-mix(in oklch, var(--theme-accent) 15%, var(--glass-card, var(--theme-card)));
}
.rdock__bell {
  color: var(--theme-accent);
}
.rdock__title {
  flex: 1;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
.rdock__count {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  display: inline-grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--theme-text) 8%, transparent);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.rdock__count.is-overdue {
  background: color-mix(in srgb, var(--theme-danger) 18%, transparent);
  color: var(--theme-danger);
}
/* The list card floats a little higher than the bar — a softer, wider
   shadow — so it reads as lifted over the page. */
.rdock__panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  box-shadow: 0 12px 28px color-mix(in oklch, black 30%, transparent);
  transform-origin: top center;
}
.rdock-pop-enter-active,
.rdock-pop-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.rdock-pop-enter-from,
.rdock-pop-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}
@media (prefers-reduced-motion: reduce) {
  .rdock-pop-enter-active,
  .rdock-pop-leave-active {
    transition: opacity 0.15s ease;
  }
  .rdock-pop-enter-from,
  .rdock-pop-leave-to {
    transform: none;
  }
}
.rdock__body {
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
}
.rdock__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast, 120ms) ease;
}
.rdock__item:hover,
.rdock__item:focus-visible {
  background: color-mix(in srgb, var(--theme-text) 7%, transparent);
  outline: none;
}
.rdock__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.rdock__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.rdock__name {
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rdock__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.rdock__when {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The importance flag: High in the danger colour, Normal in the accent, Low
   and deadlines quiet. */
.rdock__flag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 1px 6px 1px 4px;
  border-radius: var(--radius-pill);
  font-weight: var(--weight-semibold);
  background: color-mix(in srgb, var(--theme-text) 7%, transparent);
  color: var(--theme-dim);
}
.rdock__flag.is-high {
  background: color-mix(in srgb, var(--theme-danger) 16%, transparent);
  color: var(--theme-danger);
}
.rdock__flag.is-normal {
  background: color-mix(in srgb, var(--theme-accent) 16%, transparent);
  color: var(--theme-accent);
}
.rdock__time {
  flex-shrink: 0;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--theme-dim);
}
.rdock__time.is-soon {
  color: var(--theme-accent);
}
.rdock__time.is-overdue {
  color: var(--theme-danger);
  font-weight: var(--weight-semibold);
}
.rdock__empty {
  margin: 0;
  padding: 6px 10px 4px;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.rdock__more {
  align-self: flex-start;
  margin: 2px 10px 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--theme-accent);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
</style>
