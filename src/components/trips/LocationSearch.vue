<script setup lang="ts">
import TextInput from '@/components/ui/TextInput.vue'
// A location search over OpenStreetMap's Nominatim. Type a place, pick a
// suggestion, and the chosen lat/lng + formatted address are emitted for the
// trip to store. The suggestion list is absolutely positioned so it overlays
// rather than reflows — on mobile the on-screen keyboard never shoves the
// dialog around.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { searchPlaces, type GeoResult } from '@/utils/geo'

const props = withDefaults(defineProps<{ modelValue?: string; placeholder?: string }>(), {
  modelValue: '',
  placeholder: 'Search a place…',
})
const emit = defineEmits<{
  'update:modelValue': [string]
  select: [GeoResult]
}>()

const { c } = useStyles()
const query = ref(props.modelValue)
const results = ref<GeoResult[]>([])
const open = ref(false)
const loading = ref(false)
let debounce: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | null = null

watch(
  () => props.modelValue,
  (v) => {
    if (v !== query.value) query.value = v
  },
)

function onInput(v: string) {
  query.value = v
  emit('update:modelValue', v)
  clearTimeout(debounce)
  if (v.trim().length < 3) {
    results.value = []
    open.value = false
    return
  }
  loading.value = true
  open.value = true
  debounce = setTimeout(run, 350)
}
async function run() {
  controller?.abort()
  controller = new AbortController()
  const found = await searchPlaces(query.value, controller.signal)
  results.value = found
  loading.value = false
  open.value = found.length > 0 || query.value.trim().length >= 3
}
function choose(r: GeoResult) {
  query.value = r.name
  emit('update:modelValue', r.name)
  emit('select', r)
  open.value = false
  results.value = []
}
function onBlur() {
  // Let a click on a suggestion land before the list closes.
  setTimeout(() => (open.value = false), 160)
}
onBeforeUnmount(() => {
  clearTimeout(debounce)
  controller?.abort()
})

const wrap = pxify({ position: 'relative', width: '100%' })
const listStyle = computed(() =>
  pxify({
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    zIndex: 20,
    maxHeight: 210,
    overflowY: 'auto',
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(28px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    borderRadius: 'var(--radius-dialog)',
    padding: 5,
    boxShadow: c.value.shadow,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  }),
)
const itemStyle = computed(() =>
  pxify({
    textAlign: 'left',
    padding: '8px 10px',
    borderRadius: 'var(--radius-card)',
    border: 'none',
    background: 'transparent',
    color: c.value.text,
    ...typeStep('xs'),
    lineHeight: 1.35,
    cursor: 'pointer',
    width: '100%',
  }),
)
const hintStyle = computed(() =>
  pxify({ padding: '8px 10px', ...typeStep('xs'), color: c.value.dim }),
)
</script>

<template>
  <div :style="wrap">
    <TextInput
      :model-value="query"
      :placeholder="placeholder"
      type="text"
      autocomplete="off"
      @update:model-value="onInput"
      @focus="open = results.length > 0"
      @blur="onBlur"
    />
    <div v-if="open" :style="listStyle">
      <div v-if="loading" :style="hintStyle">Searching…</div>
      <div v-else-if="results.length === 0" :style="hintStyle">No matches — keep typing.</div>
      <button
        v-for="r in results"
        :key="r.lat + ',' + r.lng + r.address"
        :style="itemStyle"
        v-hover-style="{ background: c.card }"
        @mousedown.prevent
        @click="choose(r)"
      >
        <strong>{{ r.name }}</strong>
        <div :style="{ color: c.dim, ...typeStep('2xs') }">{{ r.address }}</div>
      </button>
    </div>
  </div>
</template>
