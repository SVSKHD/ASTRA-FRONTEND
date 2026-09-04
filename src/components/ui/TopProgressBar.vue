<script setup lang="ts">
// The fourth loading treatment (section 43, item 5).
//
// Two pixels at the top of the viewport, and it means one thing: work that is
// not about any single element on the page — a route change, a background sync.
// That restriction is the whole design. A loader detached from what it is
// loading cannot say what it is loading, so it may only be used when there is
// nothing on the page to attach it to.
//
// THE 200ms DELAY AND THE 400ms FLOOR are the same rules the save ring follows,
// for the same reason: a bar that flashes on a route change served from cache
// is a bar that reads as a fault, and one that appears and leaves inside a
// frame is a flicker at the top of the screen — the most distracting place on
// it for something nobody can read.
import { onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ active: boolean }>()

const DELAY_MS = 200
const MIN_VISIBLE_MS = 400

const shown = ref(false)
let showTimer: ReturnType<typeof setTimeout> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined
let shownAt = 0

function clear(): void {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
}

watch(
  () => props.active,
  (active) => {
    clear()
    if (active) {
      showTimer = setTimeout(() => {
        shownAt = Date.now()
        shown.value = true
      }, DELAY_MS)
      return
    }
    if (!shown.value) return
    const owed = MIN_VISIBLE_MS - (Date.now() - shownAt)
    if (owed <= 0) {
      shown.value = false
      return
    }
    hideTimer = setTimeout(() => (shown.value = false), owed)
  },
  { immediate: true },
)

onUnmounted(clear)
</script>

<template>
  <!-- `role="progressbar"` with no value: it is indeterminate by definition, and
       a bar that invents a percentage is a bar that lies. -->
  <div
    v-if="shown"
    class="ui-topbar"
    role="progressbar"
    aria-label="Loading"
    aria-busy="true"
  ></div>
</template>
