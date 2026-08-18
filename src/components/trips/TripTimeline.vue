<script setup lang="ts">
// The trip as a vertical timeline: each place a node in visit order, showing
// its number, name, date & time, the gap since the previous stop ("+2h 15m"),
// notes and photo thumbnails. Works for To-Visit trips too — it just reads the
// planned order/times instead of visited ones. Nodes stagger in; clicking one
// asks the dialog to highlight/pan that pin when it flips back to the map.
import { computed } from 'vue'
import { sanitize } from '@/utils/sanitizeHtml'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { formatGap, formatWhen } from '@/utils/geo'
import SmartImage from '@/components/trips/SmartImage.vue'
import type { TripPlace } from '@/types'

const props = withDefaults(defineProps<{ places: TripPlace[]; active?: number | null }>(), {
  active: null,
})
const emit = defineEmits<{
  (e: 'select', placeId: number): void
  // Fired when a photo thumbnail is clicked; the trip page opens its lightbox.
  (e: 'photo', placeId: number, index: number): void
}>()

const { c } = useStyles()

const nodes = computed(() =>
  props.places.map((p, i) => ({
    place: p,
    n: i + 1,
    when: formatWhen(p.visitedAt),
    gap: i > 0 ? formatGap(props.places[i - 1].visitedAt, p.visitedAt) : '',
  })),
)

const wrap = pxify({ display: 'flex', flexDirection: 'column', gap: 0, padding: '4px 2px' })
function nodeStyle(i: number) {
  return pxify({
    display: 'grid',
    gridTemplateColumns: '34px 1fr',
    gap: 12,
    animation: 'fadeUp .35s ease both',
    animationDelay: i * 60 + 'ms',
  })
}
function railStyle(last: boolean) {
  return pxify({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    // The connecting line runs down from the dot to the next node, so the last
    // node has no tail.
    paddingBottom: last ? 0 : 0,
  })
}
function dotStyle(activeState: boolean) {
  return pxify({
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    fontSize: 12,
    fontWeight: 700,
    background: activeState ? c.value.accent : c.value.card,
    color: activeState ? c.value.onAccent : c.value.text,
    border: '2px solid ' + c.value.accent,
    cursor: 'pointer',
  })
}
function lineStyle(last: boolean) {
  return pxify({
    flex: 1,
    width: 2,
    minHeight: 20,
    background: last ? 'transparent' : c.value.border,
    marginTop: 2,
  })
}
const bodyStyle = pxify({ paddingBottom: 18, minWidth: 0 })
const nameStyle = computed(() =>
  pxify({ fontSize: 14, fontWeight: 600, color: c.value.text, cursor: 'pointer' }),
)
const metaStyle = computed(() =>
  pxify({ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 3 }),
)
const whenStyle = computed(() => pxify({ fontSize: 11, color: c.value.dim }))
const gapChip = computed(() =>
  pxify({
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 8,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: c.value.accent,
  }),
)
const addrStyle = computed(() =>
  pxify({ fontSize: 11, color: c.value.dim, marginTop: 3, lineHeight: 1.35 }),
)
const notesStyle = computed(() =>
  pxify({
    fontSize: 12,
    lineHeight: 1.5,
    color: c.value.text,
    marginTop: 6,
    padding: '8px 10px',
    borderRadius: 10,
    background: c.value.input,
  }),
)
const photoRow = pxify({ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 })
const photoCell = pxify({
  width: 54,
  padding: 0,
  border: 'none',
  background: 'none',
  cursor: 'zoom-in',
})
const emptyStyle = computed(() =>
  pxify({ textAlign: 'center', color: c.value.dim, fontSize: 12.5, padding: '24px 0' }),
)

// Trip notes are rich text the owner wrote, but this same component renders a
// public share in a stranger's browser — so the stored HTML is sanitised on the
// way to the DOM rather than trusted (section 17: no unsanitised v-html).
function safe(html: unknown): string {
  return sanitize(String(html ?? ''))
}
</script>

<template>
  <div :style="wrap">
    <div v-if="nodes.length === 0" :style="emptyStyle">
      No places yet — add a stop to build the timeline.
    </div>
    <div v-for="(node, i) in nodes" :key="node.place.id" :style="nodeStyle(i)">
      <div :style="railStyle(i === nodes.length - 1)">
        <button
          :style="dotStyle(node.place.id === active)"
          :title="node.place.name"
          @click="emit('select', node.place.id)"
        >
          {{ node.n }}
        </button>
        <span :style="lineStyle(i === nodes.length - 1)"></span>
      </div>
      <div :style="bodyStyle">
        <span :style="nameStyle" @click="emit('select', node.place.id)">
          {{ node.place.name || 'Untitled place' }}
        </span>
        <div :style="metaStyle">
          <span v-if="node.when" :style="whenStyle">{{ node.when }}</span>
          <span v-else :style="whenStyle">No date/time yet</span>
          <span v-if="node.gap" :style="gapChip">{{ node.gap }}</span>
        </div>
        <div v-if="node.place.address" :style="addrStyle">{{ node.place.address }}</div>
        <div
          v-if="node.place.notes"
          class="rich"
          :style="notesStyle"
          v-html="safe(node.place.notes)"
        ></div>
        <div :style="photoRow">
          <button
            v-for="(url, pi) in node.place.photos"
            :key="pi"
            :style="photoCell"
            :aria-label="'Open photo ' + (pi + 1)"
            @click="emit('photo', node.place.id, pi)"
          >
            <SmartImage :src="url" alt="Trip photo" :height="54" :radius="10" />
          </button>
          <span v-if="!node.place.photos.length" :style="photoCell">
            <SmartImage :height="54" :radius="10" :icon-size="18" />
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
