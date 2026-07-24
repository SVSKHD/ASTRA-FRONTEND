<script setup lang="ts">
// The header carousel. Desktop keeps the full icon strip, now centred between a
// pair of arrows that step through the tabs. Mobile cannot fit six icons and
// read well, so it shows one tab at a time — glyph, label and position dots —
// with the arrows doing the navigating.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, tabDot } from '@/styles'
import TabGlyph from './TabGlyph.vue'
import type { TabKey } from '@/types'

const ui = useUiStore()
const { c, isMobile, s, B } = useStyles()
const { tab, tabDir } = storeToRefs(ui)

const TABS: { key: TabKey; label: string }[] = [
  { key: 'todo', label: 'Todo' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'deadlines', label: 'Deadlines' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'finances', label: 'Finances' },
  { key: 'trips', label: 'Trips' },
  { key: 'ideas', label: 'Ideas' },
  { key: 'stocks', label: 'Stocks' },
]

const scrollRef = ref<HTMLElement | null>(null)
const indicatorRef = ref<HTMLElement | null>(null)
const btnRefs = ref<(HTMLElement | null)[]>([])

const activeIndex = computed(() => TABS.findIndex((t) => t.key === tab.value))
const activeTab = computed(() => TABS[activeIndex.value] ?? TABS[0])
// The list wraps, so neither arrow is ever a dead end — they only ever say
// which way you are about to move.
const prevLabel = computed(() => TABS[(activeIndex.value + TABS.length - 1) % TABS.length].label)
const nextLabel = computed(() => TABS[(activeIndex.value + 1) % TABS.length].label)

// Sized to sit inside the header row rather than in a bar of its own: the
// glyphs keep their weight, the slot around them loses the padding it only
// needed when it was floating.
function tabBtnStyle() {
  return pxify({
    position: 'relative',
    zIndex: 2,
    flex: '0 0 auto',
    width: 40,
    minWidth: 40,
    height: 36,
    scrollSnapAlign: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    borderRadius: 16,
    cursor: 'pointer',
    transition: 'transform .2s ease',
  })
}
const iconWrap = pxify({
  position: 'relative',
  width: 22,
  height: 22,
  display: 'block',
  flexShrink: 0,
})
// The mobile stage renders the same glyph at a size that carries the row.
const stageIconWrap = pxify({
  position: 'relative',
  width: 24,
  height: 24,
  display: 'block',
  flexShrink: 0,
})
function outlineStyle(active: boolean) {
  return pxify({
    position: 'absolute',
    inset: 0,
    opacity: active ? 0 : 1,
    transition: 'opacity .28s ease',
  })
}
function fillStyle(active: boolean) {
  return pxify({
    position: 'absolute',
    inset: 0,
    opacity: active ? 1 : 0,
    transition: 'opacity .28s ease',
    color: c.value.accent,
    animation: active ? 'iconPop .4s cubic-bezier(.34,1.56,.64,1) both' : 'none',
  })
}
const tipStyle = computed(() =>
  pxify({
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.02em',
    color: c.value.text,
    padding: '5px 11px',
    borderRadius: 11,
    background: c.value.glass,
    backdropFilter: 'blur(20px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(20px) saturate(1.6)',
    border: B.value,
    boxShadow: c.value.shadow + ', inset 0 1px 0 rgba(255,255,255,0.14)',
  }),
)
function dotStyle(i: number) {
  return pxify(tabDot(c.value, i === activeIndex.value))
}
// The mobile stage slides in from whichever side the new tab came from, so the
// arrows read as movement along a strip rather than a swap.
const stageInner = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    animation:
      (tabDir.value === -1 ? 'slideInL' : 'slideInR') + ' .3s cubic-bezier(.4,1.3,.4,1) both',
  }),
)

function syncIndicator(recenter: boolean) {
  const scroll = scrollRef.value
  const ind = indicatorRef.value
  const btn = btnRefs.value[activeIndex.value]
  if (!scroll || !ind || !btn) return
  const left = btn.offsetLeft
  const width = btn.offsetWidth
  ind.style.width = width + 'px'
  ind.style.transform = 'translateX(' + left + 'px)'
  ind.style.opacity = '1'
  if (recenter) {
    const max = scroll.scrollWidth - scroll.clientWidth
    if (max > 1) {
      const target = left - (scroll.clientWidth - width) / 2
      scroll.scrollTo({ left: Math.max(0, Math.min(max, target)), behavior: 'smooth' })
    }
  }
}

function onSelect(key: TabKey) {
  ui.setTab(key)
  nextTick(() => syncIndicator(true))
}
function step(delta: number) {
  ui.cycleTab(delta)
  nextTick(() => syncIndicator(true))
}

watch(tab, () => nextTick(() => syncIndicator(true)))
watch(isMobile, () => nextTick(() => syncIndicator(false)))

let onResize: () => void
onMounted(() => {
  syncIndicator(false)
  requestAnimationFrame(() => syncIndicator(true))
  setTimeout(() => syncIndicator(true), 160)
  onResize = () => nextTick(() => syncIndicator(false))
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
</script>

<template>
  <div :style="s.tabBar">
    <div :style="s.tabCarousel">
      <button
        :style="s.tabArrow"
        v-hover-style="s.tabArrowHover"
        :title="'Previous: ' + prevLabel"
        :aria-label="'Previous tab: ' + prevLabel"
        @click="step(-1)"
      >
        ‹
      </button>

      <!-- Mobile: one tab on stage, with dots for where you are in the six. -->
      <button v-if="isMobile" :style="s.tabStage" :aria-label="activeTab.label" @click="step(1)">
        <span :style="stageInner">
          <span :style="stageIconWrap">
            <TabGlyph :name="activeTab.key" :filled="true" :col="c.accent" :ko="c.card" />
          </span>
          <span :style="s.tabStageLabel">{{ activeTab.label }}</span>
        </span>
        <span :style="s.tabDots">
          <span v-for="(t, i) in TABS" :key="t.key" :style="dotStyle(i)"></span>
        </span>
      </button>

      <!-- Desktop: the whole strip, centred, with the sliding indicator. -->
      <div v-else ref="scrollRef" class="tab-scroll" :style="s.tabScroll">
        <div ref="indicatorRef" class="tab-indicator" :style="s.indicator"></div>
        <button
          v-for="(t, i) in TABS"
          :key="t.key"
          :ref="(el) => (btnRefs[i] = el as HTMLElement)"
          class="tab-slot"
          :style="tabBtnStyle()"
          :title="t.label"
          :aria-label="t.label"
          @click="onSelect(t.key)"
        >
          <span :style="iconWrap">
            <span :style="outlineStyle(tab === t.key)"
              ><TabGlyph :name="t.key" :col="c.dim"
            /></span>
            <span :key="tab === t.key ? 'on' : 'off'" :style="fillStyle(tab === t.key)">
              <TabGlyph :name="t.key" :filled="true" :col="c.accent" :ko="c.card" />
            </span>
          </span>
          <span class="tab-tip" :style="tipStyle">{{ t.label }}</span>
        </button>
      </div>

      <button
        :style="s.tabArrow"
        v-hover-style="s.tabArrowHover"
        :title="'Next: ' + nextLabel"
        :aria-label="'Next tab: ' + nextLabel"
        @click="step(1)"
      >
        ›
      </button>
    </div>
  </div>
</template>
