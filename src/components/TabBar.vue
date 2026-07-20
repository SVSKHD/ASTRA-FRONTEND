<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import TabGlyph from './TabGlyph.vue'
import type { TabKey } from '@/types'

const ui = useUiStore()
const { c, isMobile, s, B } = useStyles()
const { tab } = storeToRefs(ui)

const TABS: { key: TabKey; label: string }[] = [
  { key: 'todo', label: 'Todo' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'deadlines', label: 'Deadlines' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'finances', label: 'Finances' },
  { key: 'trips', label: 'Trips' },
]

const scrollRef = ref<HTMLElement | null>(null)
const indicatorRef = ref<HTMLElement | null>(null)
const btnRefs = ref<(HTMLElement | null)[]>([])

function tabBtnStyle() {
  return pxify({
    position: 'relative',
    zIndex: 2,
    flex: isMobile.value ? '1 1 0' : '0 0 auto',
    width: isMobile.value ? 'auto' : 48,
    minWidth: isMobile.value ? 0 : 48,
    height: 46,
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

function syncIndicator(recenter: boolean) {
  const scroll = scrollRef.value
  const ind = indicatorRef.value
  const idx = TABS.findIndex((t) => t.key === tab.value)
  const btn = btnRefs.value[idx]
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
    <div ref="scrollRef" class="tab-scroll" :style="s.tabScroll">
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
          <span :style="outlineStyle(tab === t.key)"><TabGlyph :name="t.key" :col="c.dim" /></span>
          <span :key="tab === t.key ? 'on' : 'off'" :style="fillStyle(tab === t.key)">
            <TabGlyph :name="t.key" :filled="true" :col="c.accent" :ko="c.card" />
          </span>
        </span>
        <span class="tab-tip" :style="tipStyle">{{ t.label }}</span>
      </button>
    </div>
  </div>
</template>
