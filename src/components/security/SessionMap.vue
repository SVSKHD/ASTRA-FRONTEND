<script setup lang="ts">
// The last five places this account has signed in from.
//
// No tile server and no map library. Three reasons, in order of how much they
// matter:
//
//  1. Loading map tiles for a set of coordinates derived from the user's IP
//     tells the tile host where the user has been. On a page whose entire
//     purpose is "here is what we store about your location, and it is not
//     much", that would be a contradiction.
//  2. The precision is one decimal place. Rendering ~11km of certainty on a
//     street map claims an accuracy the data does not have; five dots on a
//     plain graticule claims exactly what it knows.
//  3. Leaflet is already lazily loaded for Trips and adding it here would drag
//     it into a second chunk for a picture with no roads in it.
//
// So it is a dot plot on an equirectangular grid, which is the Planning canvas
// treatment: a plain surface, a faint grid, and the data drawn on top.
import { computed } from 'vue'
import { project, type MapPoint } from '@/utils/sessionView'
import { formatRelative } from '@/utils/timestamps'

const props = defineProps<{ points: MapPoint[]; now: number }>()

// The viewBox is 2:1 because the projection is: 360° of longitude over 180° of
// latitude. Any other ratio would stretch the world.
const W = 360
const H = 180

const plotted = computed(() =>
  props.points.map((p, index) => {
    const { x, y } = project(p.lat, p.lng)
    return {
      ...p,
      cx: x * W,
      cy: y * H,
      // The most recent is solid; older ones fade. Floors at 0.35 so the fifth
      // pin is still a pin rather than a smudge.
      opacity: Math.max(0.35, 1 - index * 0.16),
      isLatest: index === 0,
    }
  }),
)

const meridians = [-120, -60, 0, 60, 120].map((lng) => project(0, lng).x * W)
const parallels = [60, 30, 0, -30, -60].map((lat) => project(lat, 0).y * H)
</script>

<template>
  <figure class="smap">
    <svg
      class="smap__canvas"
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      :aria-label="`Sign-in locations: ${points.map((p) => p.label).join(', ')}`"
    >
      <!-- The graticule stands in for coastlines: it gives the eye something to
           measure against without pretending to be a map of countries. -->
      <g class="smap__grid" aria-hidden="true">
        <line v-for="x in meridians" :key="`m${x}`" :x1="x" :x2="x" y1="0" :y2="H" />
        <line v-for="y in parallels" :key="`p${y}`" x1="0" :x2="W" :y1="y" :y2="y" />
        <line class="smap__equator" x1="0" :x2="W" :y1="H / 2" :y2="H / 2" />
      </g>
      <g>
        <circle
          v-for="p in plotted"
          :key="p.key"
          class="smap__pin"
          :class="{ 'smap__pin--latest': p.isLatest }"
          :cx="p.cx"
          :cy="p.cy"
          :r="p.isLatest ? 5 : 3.5"
          :opacity="p.opacity"
        >
          <title>{{ p.label }} — {{ formatRelative(p.seenAt, now) }}</title>
        </circle>
      </g>
    </svg>
    <!-- The legend is not decoration: the dots alone carry the information, and
         colour-and-position alone is exactly what the review checklist forbids.
         Each place is named in text. -->
    <figcaption class="smap__legend">
      <span v-for="(p, i) in points" :key="p.key" class="smap__item">
        <span
          class="smap__swatch"
          :class="{ 'smap__swatch--latest': i === 0 }"
          aria-hidden="true"
        />
        <span class="smap__place">{{ p.label }}</span>
        <span class="smap__when">{{ formatRelative(p.seenAt, now) }}</span>
      </span>
    </figcaption>
  </figure>
</template>

<style scoped>
.smap {
  display: grid;
  gap: var(--sp-3);
  min-width: 0;
  margin: 0;
}
.smap__canvas {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--border-subtle, var(--glass-border));
  border-radius: var(--radius-card, 10px);
  background: var(--bg-elevated, var(--glass-card));
}
.smap__grid line {
  stroke: var(--border-subtle, var(--glass-border));
  stroke-width: 0.6;
}
.smap__equator {
  stroke-width: 1;
}
.smap__pin {
  fill: var(--theme-dim, var(--text-muted));
}
.smap__pin--latest {
  fill: var(--theme-accent);
}
.smap__legend {
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.smap__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.smap__swatch {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--theme-dim, var(--text-muted));
}
.smap__swatch--latest {
  background: var(--theme-accent);
}
.smap__place {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary, var(--theme-text));
}
.smap__when {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
</style>
