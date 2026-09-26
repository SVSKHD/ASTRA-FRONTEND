<script setup lang="ts">
// The weekly review drawer (Todo v2, 5c): what got done this week, and a
// decision on each todo that has rolled over more than twice — bring it into
// today, or drop it. Both choices apply at once and a second click takes them
// back, so there is no Save and nothing to lose by closing.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useWeeklyReview } from '@/composables/useWeeklyReview'
import { pxify, typeStep, WARNING } from '@/styles'
import Icon from '@/components/ui/Icon.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'

const ui = useUiStore()
const { reviewOpen, isPhone } = storeToRefs(ui)
const { c, B } = useStyles()
const { items, undecided, stats, weekLabel, decide, decisions } = useWeeklyReview()

function close() {
  ui.setReviewOpen(false)
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && reviewOpen.value) close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const tiles = computed(() => [
  { v: stats.value.done, l: 'Done this week' },
  { v: undecided.value, l: 'To decide' },
  { v: stats.value.subtasksClosed, l: 'Subtasks closed' },
])

// --- styles -----------------------------------------------------------------
const drawer = computed(() =>
  pxify({
    position: 'fixed',
    top: isPhone.value ? 'auto' : 16,
    right: isPhone.value ? 0 : 16,
    bottom: isPhone.value ? 0 : 16,
    left: isPhone.value ? 0 : 'auto',
    width: isPhone.value ? 'auto' : 440,
    maxHeight: isPhone.value ? '86dvh' : undefined,
    zIndex: 56,
    boxSizing: 'border-box',
    padding: 24,
    borderRadius: isPhone.value ? '28px 28px 0 0' : 24,
    background: c.value.bgSolid,
    border: B.value,
    boxShadow: '-20px 0 50px -20px rgba(0,0,0,0.7)',
    color: c.value.text,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-4)',
    overflowY: 'auto',
  }),
)
const head = pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' })
const title = computed(() => pxify({ ...typeStep('lg'), margin: 0, flex: 1 }))
const dim = computed(() => pxify({ ...typeStep('sm'), color: c.value.dim }))
const grid = pxify({ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-2)' })
const tile = computed(() =>
  pxify({
    padding: 12,
    borderRadius: 'var(--radius-card)',
    background: c.value.card,
    border: '1px solid ' + c.value.border,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  }),
)
const tileV = pxify({ ...typeStep('lg'), fontVariantNumeric: 'tabular-nums' })
const tileL = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim }))
const section = computed(() =>
  pxify({ ...typeStep('sm'), color: c.value.dim, fontWeight: 'var(--weight-medium)' }),
)
function row(dropped: boolean) {
  return pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    padding: '10px 12px',
    borderRadius: 'var(--radius-card)',
    background: c.value.card,
    border: '1px solid ' + c.value.border,
    opacity: dropped ? 0.35 : 1,
    transition: 'opacity .3s ease',
  })
}
const rowMain = pxify({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 })
const rowText = pxify({
  ...typeStep('base'),
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})
const rolled = pxify({ ...typeStep('xs'), color: WARNING })
const foot = computed(() =>
  pxify({ ...typeStep('sm'), color: c.value.dim, opacity: 0.8, marginTop: 'auto' }),
)
</script>

<template>
  <Transition name="wr-fade">
    <div v-if="reviewOpen" class="wr-scrim" @click="close"></div>
  </Transition>
  <Transition :name="isPhone ? 'wr-up' : 'wr-slide'">
    <aside v-if="reviewOpen" :style="drawer" role="dialog" aria-label="Weekly review">
      <div :style="head">
        <h2 :style="title">Weekly review</h2>
        <IconButton label="Close" variant="outline" tone="default" @click="close">
          <Icon name="x" size="sm" />
        </IconButton>
      </div>
      <span :style="dim">Week of {{ weekLabel }}</span>
      <div :style="grid">
        <div v-for="t in tiles" :key="t.l" :style="tile">
          <span :style="tileV">{{ t.v }}</span>
          <span :style="tileL">{{ t.l }}</span>
        </div>
      </div>
      <span :style="section">Rolled over more than twice</span>
      <div v-for="t in items" :key="t.id" :style="row(decisions[t.id]?.kind === 'drop')">
        <div :style="rowMain">
          <span :style="rowText" :title="t.text">{{ t.text || '(untitled)' }}</span>
          <span :style="rolled">rolled over ×{{ t.rolloverCount }}</span>
        </div>
        <Button
          size="sm"
          :variant="decisions[t.id]?.kind === 'keep' ? 'tinted' : 'secondary'"
          :aria-pressed="decisions[t.id]?.kind === 'keep'"
          @click="decide(t, 'keep')"
        >
          {{ decisions[t.id]?.kind === 'keep' ? 'Moved ✓' : 'Move to today' }}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          :aria-pressed="decisions[t.id]?.kind === 'drop'"
          @click="decide(t, 'drop')"
        >
          {{ decisions[t.id]?.kind === 'drop' ? 'Dropped' : 'Drop' }}
        </Button>
      </div>
      <span v-if="!items.length" :style="dim">
        Nothing has rolled over more than twice. A clean week.
      </span>
      <span :style="foot">Dropping archives the todo; it still counts in Overview.</span>
    </aside>
  </Transition>
</template>

<style scoped>
.wr-scrim {
  position: fixed;
  inset: 0;
  z-index: 55;
  background: color-mix(in srgb, var(--glass-solid, #000) 50%, transparent);
}
.wr-fade-enter-active,
.wr-fade-leave-active {
  transition: opacity 300ms ease;
}
.wr-fade-enter-from,
.wr-fade-leave-to {
  opacity: 0;
}
.wr-slide-enter-active,
.wr-slide-leave-active,
.wr-up-enter-active,
.wr-up-leave-active {
  transition: transform var(--dur-slide) var(--ease-soft);
}
.wr-slide-enter-from,
.wr-slide-leave-to {
  transform: translateX(110%);
}
.wr-up-enter-from,
.wr-up-leave-to {
  transform: translateY(105%);
}
@media (prefers-reduced-motion: reduce) {
  .wr-fade-enter-active,
  .wr-fade-leave-active,
  .wr-slide-enter-active,
  .wr-slide-leave-active,
  .wr-up-enter-active,
  .wr-up-leave-active {
    transition: none;
  }
}
</style>
