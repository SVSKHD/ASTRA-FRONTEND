<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { pxify } from '@/styles'

const ui = useUiStore()
const { theme } = storeToRefs(ui)

const enabled =
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  !window.matchMedia('(pointer:coarse)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

const dots = [0, 1, 2, 3, 4, 5]
const refs = dots.map(() => ref<HTMLElement | null>(null))
const trailPos = dots.map(() => ({ x: -100, y: -100 }))
const mouse = { x: -100, y: -100 }
let raf = 0

function onMove(e: MouseEvent) {
  mouse.x = e.clientX
  mouse.y = e.clientY
}
function loop() {
  let prev = mouse
  trailPos.forEach((p, i) => {
    p.x += (prev.x - p.x) * 0.35
    p.y += (prev.y - p.y) * 0.35
    const el = refs[i].value
    if (el) el.style.transform = 'translate3d(' + (p.x - 3) + 'px,' + (p.y - 3) + 'px,0)'
    prev = p
  })
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  if (!enabled) return
  window.addEventListener('mousemove', onMove)
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  if (!enabled) return
  window.removeEventListener('mousemove', onMove)
  cancelAnimationFrame(raf)
})

function dotStyle(i: number) {
  return pxify({
    position: 'fixed',
    top: 0,
    left: 0,
    width: 8 - i,
    height: 8 - i,
    borderRadius: '50%',
    background: theme.value.accent,
    opacity: (6 - i) / 9,
    pointerEvents: 'none',
    zIndex: 50,
    transform: 'translate3d(-100px,-100px,0)',
    willChange: 'transform',
  })
}
</script>

<template>
  <template v-if="enabled">
    <span v-for="i in dots" :key="i" :ref="(el) => (refs[i].value = el as HTMLElement)" :style="dotStyle(i)"></span>
  </template>
</template>
