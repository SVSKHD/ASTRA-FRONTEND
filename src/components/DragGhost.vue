<script setup lang="ts">
// The floating drag ghost for drag-to-nest: a compact glass pill that follows the
// pointer, showing the dragged item's title + collection badge (or a count for a
// multi-drag), red-tinted with a reason pill when the hovered target is invalid.
// Also hosts the aria-live region for pickup/nest/drop announcements. Rendered
// once at the app shell. Honours prefers-reduced-motion (no scale/rotate).
import { computed, onMounted, ref, watch } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { useDragNest } from '@/composables/useDragNest'
import { DANGER, pxify, typeStep } from '@/styles'
import { LINK_REJECTION_MESSAGE, type LinkRejection } from '@/utils/links'

const { c } = useStyles()
const { drag, setAnnouncer, reduceMotion } = useDragNest()

const live = ref('')
onMounted(() => setAnnouncer((msg: string) => (live.value = msg)))

// A red-tinted ghost when hovering a real target that rejects the drop.
const invalid = computed(() => drag.active && drag.targetKey !== null && !drag.valid)
const reasonText = computed(() =>
  drag.reason ? LINK_REJECTION_MESSAGE[drag.reason as LinkRejection] || drag.reason : '',
)

const ghost = computed(() =>
  pxify({
    position: 'fixed',
    left: 0,
    top: 0,
    transform:
      `translate(${drag.x + 14}px, ${drag.y + 8}px)` + (reduceMotion() ? '' : ' rotate(-1deg)'),
    zIndex: 200,
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
    maxWidth: 260,
  }),
)
const pill = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    padding: '8px 12px',
    borderRadius: 'var(--radius-card)',
    ...typeStep('sm'),
    fontWeight: 'var(--weight-semibold)',
    color: c.value.text,
    background: c.value.glass,
    backdropFilter: 'blur(20px) saturate(1.5)',
    '-webkit-backdrop-filter': 'blur(20px) saturate(1.5)',
    border: '1px solid ' + (invalid.value ? DANGER : c.value.accent),
    boxShadow: c.value.shadow,
    opacity: 0.96,
  }),
)
const badge = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-pill)',
    background: c.value.input,
    color: c.value.dim,
    flexShrink: 0,
  }),
)
const reasonPill = computed(() =>
  pxify({
    alignSelf: 'flex-start',
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '3px 8px',
    borderRadius: 'var(--radius-pill)',
    background: DANGER,
    color: '#fff',
  }),
)
const srOnly = pxify({
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
})

// Clear the live message shortly after so repeats re-announce.
watch(live, (v) => {
  if (v) setTimeout(() => (live.value = ''), 1000)
})
</script>

<template>
  <div :style="srOnly" role="status" aria-live="polite">{{ live }}</div>
  <div v-if="drag.active" :style="ghost">
    <div :style="pill">
      <span v-if="invalid" aria-hidden="true">⊘</span>
      <span>{{ drag.count > 1 ? drag.count + ' items' : drag.title }}</span>
      <span v-if="drag.count <= 1 && drag.badge" :style="badge">{{ drag.badge }}</span>
    </div>
    <span v-if="invalid && reasonText" :style="reasonPill">{{ reasonText }}</span>
  </div>
</template>
