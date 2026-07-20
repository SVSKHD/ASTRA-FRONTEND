<script setup lang="ts">
import { computed } from 'vue'
import { pxify, type Style } from '@/styles'
import type { Theme } from '@/themes'

const props = defineProps<{ theme: Theme }>()

const cornerStyle = computed<Style>(() =>
  props.theme.corner === 'bc'
    ? { bottom: '-8%', left: '50%', transform: 'translateX(-50%)' }
    : { top: '-8%', right: '-10%' },
)
const wrap = computed(() =>
  pxify({
    position: 'absolute',
    ...cornerStyle.value,
    width: 260,
    height: 260,
    pointerEvents: 'none',
  }),
)

const t = computed(() => props.theme)

const sun = computed(() =>
  pxify({
    position: 'absolute',
    inset: 0,
    margin: 'auto',
    width: 150,
    height: 150,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 35%,' + t.value.sunColor + ' 0%, transparent 70%)',
    boxShadow: '0 0 100px 30px ' + t.value.sunColor,
    animation: 'breathe 8s ease-in-out infinite',
  }),
)
const rays = [0, 1, 2, 3, 4, 5, 6, 7]
function rayStyle(i: number) {
  return pxify({
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 2,
    height: 70,
    background: t.value.sunColor,
    opacity: 0.3,
    transform: 'translate(-50%,-100%) rotate(' + i * 45 + 'deg)',
    transformOrigin: '50% 100%',
  })
}

const flareParticles = [0, 1, 2, 3, 4, 5]
function flareStyle(i: number) {
  return pxify({
    position: 'absolute',
    top: 60 + Math.sin(i) * 70 + 50,
    right: 40 + Math.cos(i) * 70,
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: t.value.sunColor,
    boxShadow: '0 0 8px ' + t.value.sunColor,
    animation: 'twinkle ' + (3 + i * 0.4) + 's ease-in-out infinite',
  })
}

const bands = [0, 1, 2]
function bandStyle(i: number) {
  return pxify({
    position: 'absolute',
    top: 30 + i * 22,
    right: -20,
    width: 280,
    height: 44,
    borderRadius: '50%',
    background: t.value.ribbonColor,
    filter: 'blur(18px)',
    opacity: 0.7 - i * 0.15,
    animation: 'auroraWave ' + (10 + i * 3) + 's ease-in-out infinite',
    animationDelay: i * 0.6 + 's',
  })
}
</script>

<template>
  <div :style="wrap">
    <!-- Sun (daylight / dawn) -->
    <template v-if="t.celestial === 'sun'">
      <div :style="sun"></div>
      <div
        v-if="t.rays"
        :style="pxify({ position: 'absolute', inset: 0, animation: 'spin 70s linear infinite' })"
      >
        <div v-for="i in rays" :key="i" :style="rayStyle(i)"></div>
      </div>
    </template>

    <!-- Earth + orbiting moon (deep space) -->
    <template v-else-if="t.celestial === 'earthMoon'">
      <div
        :style="
          pxify({
            position: 'absolute',
            top: 60,
            right: 60,
            width: 70,
            height: 70,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 32% 32%, #6fd6c4 0%, #2f7fbf 45%, #16305e 100%)',
            boxShadow: '0 0 50px 10px rgba(90,150,255,0.35)',
          })
        "
      ></div>
      <div
        :style="
          pxify({
            position: 'absolute',
            top: 60,
            right: 60,
            width: 70,
            height: 70,
            animation: 'spin 40s linear infinite',
          })
        "
      >
        <div
          :style="
            pxify({
              position: 'absolute',
              top: -30,
              left: '50%',
              width: 20,
              height: 20,
              borderRadius: '50%',
              transform: 'translateX(-50%)',
              background: 'radial-gradient(circle at 35% 35%, #e8e8ee 0%, #9a9aa8 70%)',
              boxShadow: '0 0 14px rgba(230,230,240,0.5)',
            })
          "
        ></div>
      </div>
    </template>

    <!-- Crescent moon in nebula (nebula rose) -->
    <template v-else-if="t.celestial === 'crescent'">
      <div
        :style="
          pxify({
            position: 'absolute',
            top: 20,
            right: 20,
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: 'rgba(255,110,180,0.22)',
            filter: 'blur(60px)',
            animation: 'nebulaDrift 20s ease-in-out infinite',
          })
        "
      ></div>
      <div
        :style="
          pxify({
            position: 'absolute',
            top: 80,
            right: 100,
            width: 160,
            height: 160,
            borderRadius: '50%',
            background: 'rgba(140,90,255,0.2)',
            filter: 'blur(55px)',
            animation: 'nebulaDrift 26s ease-in-out infinite reverse',
          })
        "
      ></div>
      <div
        :style="
          pxify({
            position: 'absolute',
            top: 70,
            right: 70,
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: '#ece6f2',
            boxShadow: '0 0 30px rgba(230,220,245,0.5), 18px -4px 0 6px ' + (t.bgDeep || '#2a0f3d'),
          })
        "
      ></div>
    </template>

    <!-- Solar flare (solar flare) -->
    <template v-else-if="t.celestial === 'flare'">
      <div
        :style="
          pxify({
            position: 'absolute',
            top: 50,
            right: 50,
            width: 160,
            height: 160,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%,' + t.sunColor + ' 0%, transparent 72%)',
            boxShadow: '0 0 90px 26px ' + t.sunColor,
            animation: 'breathe 7s ease-in-out infinite',
          })
        "
      ></div>
      <span v-for="i in flareParticles" :key="i" :style="flareStyle(i)"></span>
    </template>

    <!-- Aurora bands (aurora day / night) -->
    <template v-else-if="t.celestial === 'auroraLight' || t.celestial === 'auroraDark'">
      <div v-for="i in bands" :key="i" :style="bandStyle(i)"></div>
      <div
        v-if="t.celestial === 'auroraDark'"
        :style="
          pxify({
            position: 'absolute',
            top: 10,
            right: 10,
            width: 46,
            height: 46,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #f2f2fa 0%, #b8b8c8 70%)',
            boxShadow: '0 0 26px rgba(230,230,245,0.4)',
          })
        "
      ></div>
    </template>
  </div>
</template>
