<script setup lang="ts">
// The table of contents for a long note.
//
// Built from the source, not from the rendered DOM, so it exists before the
// note has been rendered and stays correct while a progressively-rendered note
// is still holding most of itself back — the entries below the fold are the
// reason someone opens a contents list in the first place.
import { computed, ref } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { headingsOf } from '@/utils/mdRender'

const props = withDefaults(defineProps<{ source: string; minHeadings?: number }>(), {
  // Two headings is a document with sections; one is a title.
  minHeadings: 3,
})
const emit = defineEmits<{ jump: [string] }>()

const { c } = useStyles()
const open = ref(false)

const headings = computed(() => headingsOf(props.source))
const show = computed(() => headings.value.length >= props.minHeadings)
// Everything is indented relative to the shallowest heading present, so a note
// whose top level is ## does not start with a wasted indent.
const base = computed(() => Math.min(...headings.value.map((h) => h.level), 6))

const wrap = computed(() =>
  pxify({
    border: '1px solid ' + c.value.border,
    borderRadius: 12,
    background: c.value.input,
    overflow: 'hidden',
  }),
)
const head = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    background: 'transparent',
    color: c.value.dim,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  }),
)
const list = pxify({ display: 'flex', flexDirection: 'column', padding: '0 8px 8px' })
const entry = (level: number) =>
  pxify({
    textAlign: 'left',
    padding: '4px 8px',
    paddingLeft: 8 + (level - base.value) * 14,
    border: 'none',
    background: 'transparent',
    color: level === base.value ? c.value.text : c.value.dim,
    ...typeStep('xs'),
    cursor: 'pointer',
    borderRadius: 8,
  })
const entryHover = computed(() => ({ background: c.value.card, color: c.value.accent }))
const caret = computed(() => pxify({ color: c.value.accent, ...typeStep('2xs') }))
</script>

<template>
  <nav v-if="show" :style="wrap" aria-label="Note contents">
    <button type="button" :style="head" :aria-expanded="open" @click="open = !open">
      <span :style="caret">{{ open ? '▾' : '▸' }}</span>
      Contents
      <span>· {{ headings.length }}</span>
    </button>
    <div v-if="open" :style="list">
      <button
        v-for="h in headings"
        :key="h.id"
        type="button"
        :style="entry(h.level)"
        v-hover-style="entryHover"
        @click="emit('jump', h.id)"
      >
        {{ h.text }}
      </button>
    </div>
  </nav>
</template>
