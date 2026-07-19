<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { pxify } from '@/styles'
import Celestial from './Celestial.vue'

const ui = useUiStore()
const { theme, dark } = storeToRefs(ui)

interface Star {
  top: number
  left: number
  size: number
  dur: number
  delay: number
  op: number
}

// 110 stars, generated once (matches the design).
const stars: Star[] = Array.from({ length: 110 }, () => ({
  top: Math.random() * 100,
  left: Math.random() * 100,
  size: +(Math.random() * 1.8 + 0.5).toFixed(2),
  dur: +(Math.random() * 5 + 3).toFixed(1),
  delay: +(Math.random() * 6).toFixed(1),
  op: +(Math.random() * 0.6 + 0.25).toFixed(2),
}))

const bgStyle = computed(() =>
  pxify({
    position: 'fixed',
    inset: 0,
    zIndex: 0,
    overflow: 'hidden',
    background: theme.value.pageBg,
    transition: 'background 1s ease',
  }),
)
const driftStyle = pxify({ position: 'absolute', inset: '-8%', animation: 'drift 34s linear infinite alternate' })

function starStyle(st: Star) {
  return pxify({
    position: 'absolute',
    top: st.top + '%',
    left: st.left + '%',
    width: st.size,
    height: st.size,
    borderRadius: '50%',
    background: '#fff',
    opacity: dark.value ? st.op : st.op * 0.35,
    boxShadow: '0 0 ' + st.size * 2.5 + 'px rgba(255,255,255,' + (dark.value ? 0.9 : 0.5) + ')',
    animation: 'twinkle ' + st.dur + 's ease-in-out ' + st.delay + 's infinite',
  })
}
</script>

<template>
  <div :style="bgStyle">
    <Celestial :theme="theme" />
    <div :key="ui.effectiveThemeKey" :style="driftStyle">
      <span v-for="(st, i) in stars" :key="i" :style="starStyle(st)"></span>
    </div>
  </div>
</template>
