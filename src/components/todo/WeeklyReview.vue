<script setup lang="ts">
// The weekly review drawer (Todo v2, 5c): what got done this week, and a
// decision on each todo that has rolled over more than twice — bring it into
// today, or drop it. Both choices apply at once and a second click takes them
// back, so there is no Save and nothing to lose by closing.
//
// Select mode decides many at once: tick rows (or Select all), then Move to
// today, Drop, or Undo for the lot. Each still applies at once and each stays
// undoable row by row afterwards.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useWeeklyReview } from '@/composables/useWeeklyReview'
import { pxify, typeStep, WARNING, itemTitle } from '@/styles'
import Icon from '@/components/ui/Icon.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Checkbox from '@/components/ui/Checkbox.vue'

const ui = useUiStore()
const { reviewOpen, isPhone } = storeToRefs(ui)
const { c, B } = useStyles()
const { items, undecided, stats, weekLabel, decide, decideMany, undoMany, decisions } =
  useWeeklyReview()

function close() {
  ui.setReviewOpen(false)
}

// --- multi-select -------------------------------------------------------------
const selecting = ref(false)
const picked = ref<Set<number>>(new Set())
const pickedItems = computed(() => items.value.filter((t) => picked.value.has(t.id)))
const allPicked = computed(
  () => items.value.length > 0 && items.value.every((t) => picked.value.has(t.id)),
)
const anyPickedDecided = computed(() => pickedItems.value.some((t) => !!decisions.value[t.id]))
function togglePick(id: number) {
  const next = new Set(picked.value)
  if (!next.delete(id)) next.add(id)
  picked.value = next
}
function toggleAll() {
  picked.value = allPicked.value ? new Set() : new Set(items.value.map((t) => t.id))
}
function stopSelecting() {
  selecting.value = false
  picked.value = new Set()
}
function bulk(kind: 'keep' | 'drop' | 'undo') {
  if (kind === 'undo') undoMany(pickedItems.value)
  else decideMany(pickedItems.value, kind)
  picked.value = new Set()
}
// Closing the drawer leaves select mode, so it opens fresh next time.
watch(reviewOpen, (open) => {
  if (!open) stopSelecting()
})
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !reviewOpen.value) return
  // The first Escape leaves select mode; the next closes the drawer.
  if (selecting.value) stopSelecting()
  else close()
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
    boxShadow: '-18px 0 40px -22px color-mix(in srgb, var(--shadow-ink) 45%, transparent)',
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
function row(dropped: boolean, isPicked = false) {
  return pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    padding: '10px 12px',
    borderRadius: 'var(--radius-card)',
    background: c.value.card,
    border: '1px solid ' + (isPicked ? c.value.accent : c.value.border),
    boxShadow: isPicked ? 'inset 0 0 0 1px ' + c.value.accent : 'none',
    opacity: dropped ? 0.35 : 1,
    cursor: selecting.value ? 'pointer' : 'default',
    transition: 'opacity .3s ease, border-color .2s ease, box-shadow .2s ease',
  })
}
const sectionRow = pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' })
const bulkBar = computed(() =>
  pxify({
    position: 'sticky',
    top: -24,
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    flexWrap: 'wrap',
    padding: '8px 10px',
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.accent,
    background: 'color-mix(in oklch, ' + c.value.accent + ' 12%, ' + c.value.bgSolid + ')',
    ...typeStep('xs'),
  }),
)
const bulkCount = pxify({ flex: 1, minWidth: 0 })
const rowMain = pxify({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 })
const rowText = pxify({
  ...itemTitle(),
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
      <div :style="sectionRow">
        <span :style="[section, { flex: 1 }]">Rolled over more than twice</span>
        <Button
          v-if="items.length > 1"
          size="sm"
          variant="ghost"
          :aria-pressed="selecting"
          @click="selecting ? stopSelecting() : (selecting = true)"
        >
          {{ selecting ? 'Done' : 'Select' }}
        </Button>
      </div>
      <!-- Select mode: the count, Select all, and the three bulk choices. -->
      <div v-if="selecting" :style="bulkBar" role="toolbar" aria-label="Selected todos">
        <span :style="bulkCount">{{
          picked.size ? picked.size + ' selected' : 'Tick todos to decide together'
        }}</span>
        <Button size="sm" variant="ghost" @click="toggleAll">
          {{ allPicked ? 'Clear all' : 'Select all' }}
        </Button>
        <template v-if="picked.size">
          <Button size="sm" variant="tinted" @click="bulk('keep')">Move to today</Button>
          <Button size="sm" variant="secondary" @click="bulk('drop')">Drop</Button>
          <Button v-if="anyPickedDecided" size="sm" variant="ghost" @click="bulk('undo')">
            Undo
          </Button>
        </template>
      </div>
      <div
        v-for="t in items"
        :key="t.id"
        :style="row(decisions[t.id]?.kind === 'drop', selecting && picked.has(t.id))"
        :aria-selected="selecting ? picked.has(t.id) : undefined"
        @click="selecting && togglePick(t.id)"
      >
        <Checkbox
          v-if="selecting"
          :model-value="picked.has(t.id)"
          :aria-label="'Select ' + (t.text || 'todo')"
          @click.stop
          @update:model-value="togglePick(t.id)"
        />
        <div :style="rowMain">
          <span :style="rowText" :title="t.text">{{ t.text || '(untitled)' }}</span>
          <span :style="rolled">rolled over ×{{ t.rolloverCount }}</span>
        </div>
        <Button
          size="sm"
          :variant="decisions[t.id]?.kind === 'keep' ? 'tinted' : 'secondary'"
          :aria-pressed="decisions[t.id]?.kind === 'keep'"
          @click.stop="decide(t, 'keep')"
        >
          {{ decisions[t.id]?.kind === 'keep' ? 'Moved ✓' : 'Move to today' }}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          :aria-pressed="decisions[t.id]?.kind === 'drop'"
          @click.stop="decide(t, 'drop')"
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
