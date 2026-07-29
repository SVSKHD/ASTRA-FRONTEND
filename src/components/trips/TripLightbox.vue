<script setup lang="ts">
// A full-screen photo lightbox. Arrow keys / on-screen arrows / horizontal
// swipe move between photos; two-finger pinch zooms (with pan) and a double-tap
// toggles zoom; Escape or a tap on the backdrop closes. Used by the trip page's
// per-place galleries.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'

const props = withDefaults(
  defineProps<{ photos: string[]; index: number; captions?: string[] }>(),
  { captions: () => [] },
)
const emit = defineEmits<{ (e: 'close'): void; (e: 'update:index', v: number): void }>()

const { c } = useStyles()
const current = ref(props.index)
// A broken/404 photo shows the same placeholder as everywhere else.
const imgError = ref(false)
watch(
  () => props.index,
  (v) => {
    current.value = v
    imgError.value = false
    resetZoom()
  },
)

const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
function resetZoom() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}
function go(delta: number) {
  const n = props.photos.length
  if (!n) return
  current.value = (current.value + delta + n) % n
  resetZoom()
  emit('update:index', current.value)
}

// --- keyboard ---------------------------------------------------------------
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') go(1)
  else if (e.key === 'ArrowLeft') go(-1)
  else if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}
onMounted(() => document.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey, true))

// --- touch: swipe + pinch-zoom + pan ---------------------------------------
let startX = 0
let startY = 0
let panStartX = 0
let panStartY = 0
let pinchDist = 0
let pinchScale = 1
let mode: 'none' | 'swipe' | 'pan' | 'pinch' = 'none'
let lastTap = 0

function dist(t: TouchList) {
  const dx = t[0].clientX - t[1].clientX
  const dy = t[0].clientY - t[1].clientY
  return Math.hypot(dx, dy)
}
function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 2) {
    mode = 'pinch'
    pinchDist = dist(e.touches)
    pinchScale = scale.value
  } else if (e.touches.length === 1) {
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    panStartX = tx.value
    panStartY = ty.value
    mode = scale.value > 1 ? 'pan' : 'swipe'
  }
}
function onTouchMove(e: TouchEvent) {
  if (mode === 'pinch' && e.touches.length === 2) {
    e.preventDefault()
    const next = (pinchScale * dist(e.touches)) / (pinchDist || 1)
    scale.value = Math.min(4, Math.max(1, next))
  } else if (mode === 'pan' && e.touches.length === 1) {
    e.preventDefault()
    tx.value = panStartX + (e.touches[0].clientX - startX)
    ty.value = panStartY + (e.touches[0].clientY - startY)
  }
}
function onTouchEnd(e: TouchEvent) {
  if (mode === 'swipe') {
    const dx = (e.changedTouches[0]?.clientX ?? startX) - startX
    const dy = (e.changedTouches[0]?.clientY ?? startY) - startY
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1)
  }
  if (mode === 'pinch' && scale.value < 1.05) resetZoom()
  mode = 'none'
  // Double-tap toggles zoom.
  const now = e.timeStamp
  if (now - lastTap < 300 && e.touches.length === 0) {
    scale.value = scale.value > 1 ? 1 : 2
    if (scale.value === 1) resetZoom()
  }
  lastTap = now
}

const src = computed(() => props.photos[current.value] || '')
const caption = computed(() => props.captions[current.value] || '')
const placeholderStyle = pxify({
  width: 'min(80vw, 360px)',
  height: 'min(60vh, 300px)',
  borderRadius: 16,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  color: 'rgba(255,255,255,0.7)',
  border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.06)',
})

// --- styles -----------------------------------------------------------------
const overlay = pxify({
  position: 'fixed',
  inset: 0,
  zIndex: 40,
  background: 'rgba(4,4,12,0.92)',
  backdropFilter: 'blur(6px)',
  '-webkit-backdrop-filter': 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  touchAction: 'none',
})
const imgStyle = computed(() =>
  pxify({
    maxWidth: '94vw',
    maxHeight: '86vh',
    borderRadius: 12,
    transform: 'translate(' + tx.value + 'px,' + ty.value + 'px) scale(' + scale.value + ')',
    transition: mode === 'none' ? 'transform .18s ease' : 'none',
    userSelect: 'none',
    touchAction: 'none',
  }),
)
function navBtn(side: 'left' | 'right') {
  return pxify({
    position: 'fixed',
    top: '50%',
    [side]: 16,
    transform: 'translateY(-50%)',
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: '1px solid ' + c.value.border,
    background: 'rgba(0,0,0,0.4)',
    color: '#fff',
    fontSize: 20,
    cursor: 'pointer',
    zIndex: 41,
    display: 'grid',
    placeItems: 'center',
  })
}
const closeBtn = computed(() =>
  pxify({
    position: 'fixed',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: '1px solid ' + c.value.border,
    background: 'rgba(0,0,0,0.4)',
    color: '#fff',
    fontSize: 20,
    cursor: 'pointer',
    zIndex: 41,
  }),
)
const captionBar = pxify({
  position: 'fixed',
  bottom: 54,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 41,
  maxWidth: '90vw',
  textAlign: 'center',
  fontSize: 13,
  fontWeight: 600,
  color: '#fff',
  background: 'rgba(0,0,0,0.5)',
  padding: '6px 14px',
  borderRadius: 12,
})
const counter = pxify({
  position: 'fixed',
  bottom: 20,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 41,
  fontSize: 12,
  color: '#fff',
  background: 'rgba(0,0,0,0.45)',
  padding: '4px 12px',
  borderRadius: 999,
})
</script>

<template>
  <Teleport to="body">
    <div
      :style="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      @click.self="emit('close')"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <img
        v-if="!imgError"
        :src="src"
        :style="imgStyle"
        alt="Trip photo"
        draggable="false"
        @error="imgError = true"
        @dblclick="go(0)"
      />
      <div v-else :style="placeholderStyle">
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.6)"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8.5" cy="8.5" r="1.6" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        <span style="font-size: 13px; font-weight: 600">No image yet</span>
      </div>

      <button :style="closeBtn" aria-label="Close" @click="emit('close')">×</button>
      <span v-if="caption" :style="captionBar">{{ caption }}</span>
      <template v-if="photos.length > 1">
        <button :style="navBtn('left')" aria-label="Previous" @click.stop="go(-1)">‹</button>
        <button :style="navBtn('right')" aria-label="Next" @click.stop="go(1)">›</button>
        <span :style="counter">{{ current + 1 }} / {{ photos.length }}</span>
      </template>
    </div>
  </Teleport>
</template>
