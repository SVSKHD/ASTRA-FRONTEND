<script setup lang="ts">
// A Leaflet + OpenStreetMap map of a trip's places. Every place with a pin is
// drawn as a numbered marker in visit order, a route line connects them in
// sequence, and the view auto-fits their bounds. `interactive: false` gives a
// static thumbnail (no drag/zoom) for the trip cards; the dialog uses the live
// map. Numbered markers are HTML divIcons, which also sidesteps Leaflet's
// default marker-image assets breaking under a bundler.
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import L from 'leaflet'
import { useStyles } from '@/composables/useStyles'
import type { TripPlace } from '@/types'

const props = withDefaults(
  defineProps<{
    places: TripPlace[]
    interactive?: boolean
    height?: number | string
    active?: number | null
  }>(),
  { interactive: true, height: 320, active: null },
)
const emit = defineEmits<{ (e: 'select', placeId: number): void }>()

const { c } = useStyles()
const mapEl = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let markerLayer: L.LayerGroup | null = null
let routeLine: L.Polyline | null = null
const markerById = new Map<number, L.Marker>()

const heightStyle = () =>
  typeof props.height === 'number' ? props.height + 'px' : String(props.height)

function pinned(): TripPlace[] {
  return props.places.filter((p) => p.lat != null && p.lng != null)
}

function numberedIcon(n: number, activeState: boolean): L.DivIcon {
  const bg = activeState ? c.value.accent : c.value.card
  const fg = activeState ? c.value.onAccent : c.value.text
  const size = activeState ? 30 : 26
  return L.divIcon({
    className: 'trip-pin',
    html:
      '<div style="width:' +
      size +
      'px;height:' +
      size +
      'px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);' +
      'display:grid;place-items:center;background:' +
      bg +
      ';color:' +
      fg +
      ';border:2px solid ' +
      c.value.accent +
      ';box-shadow:0 3px 8px rgba(0,0,0,0.4);font-weight:700;font-size:12px">' +
      '<span style="transform:rotate(45deg)">' +
      n +
      '</span></div>',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  })
}

function render() {
  if (!map) return
  if (!markerLayer) markerLayer = L.layerGroup().addTo(map)
  markerLayer.clearLayers()
  markerById.clear()
  if (routeLine) {
    routeLine.remove()
    routeLine = null
  }
  const pins = pinned()
  const latlngs: L.LatLngExpression[] = []
  pins.forEach((p, i) => {
    const pos: L.LatLngExpression = [p.lat as number, p.lng as number]
    latlngs.push(pos)
    const marker = L.marker(pos, {
      icon: numberedIcon(i + 1, p.id === props.active),
      title: p.name || 'Place ' + (i + 1),
      interactive: true,
    })
    marker.on('click', () => emit('select', p.id))
    marker.addTo(markerLayer as L.LayerGroup)
    markerById.set(p.id, marker)
  })
  if (latlngs.length > 1) {
    routeLine = L.polyline(latlngs, {
      color: c.value.accent,
      weight: 3,
      opacity: 0.7,
      dashArray: '6 8',
    }).addTo(map)
  }
  fit()
}

function fit() {
  if (!map) return
  const pins = pinned()
  if (pins.length === 0) {
    map.setView([20, 0], 1)
    return
  }
  if (pins.length === 1) {
    map.setView([pins[0].lat as number, pins[0].lng as number], 13)
    return
  }
  const bounds = L.latLngBounds(pins.map((p) => [p.lat as number, p.lng as number]))
  map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 })
}

function panTo(placeId: number | null) {
  if (!map || placeId == null) return
  const p = props.places.find((x) => x.id === placeId)
  if (!p || p.lat == null || p.lng == null) return
  map.panTo([p.lat, p.lng])
}

onMounted(() => {
  if (!mapEl.value) return
  map = L.map(mapEl.value, {
    zoomControl: props.interactive,
    dragging: props.interactive,
    scrollWheelZoom: props.interactive,
    doubleClickZoom: props.interactive,
    boxZoom: props.interactive,
    keyboard: props.interactive,
    touchZoom: props.interactive,
    attributionControl: props.interactive,
  })
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(map)
  render()
  // The map often mounts inside a dialog that animates in, so its container has
  // no size yet on the first frame; a delayed invalidate re-reads it.
  nextTick(() => setTimeout(() => map?.invalidateSize(), 60))
})
onBeforeUnmount(() => {
  map?.remove()
  map = null
})

watch(() => props.places, render, { deep: true })
watch(
  () => props.active,
  (id) => {
    // Recolour markers to highlight the active one, then pan to it.
    render()
    panTo(id)
  },
)

defineExpose({ invalidate: () => map?.invalidateSize(), panTo })
</script>

<template>
  <div
    ref="mapEl"
    :style="{
      width: '100%',
      height: heightStyle(),
      borderRadius: '16px',
      overflow: 'hidden',
      border: '1px solid ' + c.border,
      zIndex: 0,
    }"
  ></div>
</template>
