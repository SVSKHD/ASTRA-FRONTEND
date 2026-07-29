<script setup lang="ts">
// One tile that always fills its slot — never a broken-image icon, never a
// collapsed gap. Given a URL it shows the photo (with a shimmer until it
// loads); given no URL, or when the URL 404s / fails to load, it shows the same
// themed "No image yet" glass placeholder at exactly the same size. Used for
// every photo surface in Trips (cards, hero, day galleries, timeline, lightbox)
// so an absent or dead image never shifts the layout.
import { computed, ref, watch } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'

const props = withDefaults(
  defineProps<{
    src?: string
    alt?: string
    // Either an aspect ratio (e.g. '1 / 1') or a fixed height in px.
    aspect?: string
    height?: number
    radius?: number
    label?: string
    iconSize?: number
  }>(),
  { src: '', alt: 'Photo', aspect: '', height: 0, radius: 12, label: 'No image yet', iconSize: 22 },
)

const { c } = useStyles()
const errored = ref(false)
const loaded = ref(false)
// A new URL gets a fresh chance to load.
watch(
  () => props.src,
  () => {
    errored.value = false
    loaded.value = false
  },
)
const showImg = computed(() => !!props.src && !errored.value)

const frame = computed(() =>
  pxify({
    position: 'relative',
    width: '100%',
    ...(props.height ? { height: props.height } : { aspectRatio: props.aspect || '1 / 1' }),
    borderRadius: props.radius,
    overflow: 'hidden',
    border: '1px solid ' + c.value.border,
    background:
      showImg.value && !loaded.value
        ? 'linear-gradient(90deg,' +
          c.value.input +
          ' 25%,' +
          c.value.card +
          ' 50%,' +
          c.value.input +
          ' 75%)'
        : c.value.input,
    backgroundSize: '200% 100%',
    animation: showImg.value && !loaded.value ? 'shimmer 1.4s ease-in-out infinite' : 'none',
  }),
)
const imgStyle = computed(() =>
  pxify({
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    opacity: loaded.value ? 1 : 0,
    transition: 'opacity .3s ease',
  }),
)
const placeholder = computed(() =>
  pxify({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    color: c.value.dim,
    background: c.value.input,
  }),
)
const labelStyle = computed(() =>
  pxify({ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.02em', color: c.value.dim }),
)
</script>

<template>
  <div :style="frame">
    <img
      v-if="showImg"
      :src="src"
      :alt="alt"
      :style="imgStyle"
      loading="lazy"
      @load="loaded = true"
      @error="errored = true"
    />
    <div v-if="!showImg" :style="placeholder">
      <svg
        :width="iconSize"
        :height="iconSize"
        viewBox="0 0 24 24"
        fill="none"
        :stroke="c.dim"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8.5" cy="8.5" r="1.6" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
      <span :style="labelStyle">{{ label }}</span>
    </div>
  </div>
</template>
