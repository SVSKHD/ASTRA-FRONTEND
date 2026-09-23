<script setup lang="ts">
// The detail pane, in whichever of its three modes the reader last chose.
//
// The modes are the point of this file. `inline` is the default and the one
// the lists were built around: the detail is the tab's right-hand column, in
// the layout, covering nothing and taking nothing away — pick a row, glance
// right, pick the next. The other two lift the same detail out into a floating
// drawer, for when it is being read rather than glanced at.
//
// It exists as one component rather than as three copies of the same v-if in
// Goals, Tasks and Todos because the modes are a rule about detail panes, not
// about any one tab, and the second copy of a rule is where it starts to drift.
// The views hand it a slot and a title and keep their own layout switch — which
// they cannot delegate, since in `inline` this is a grid cell and in the other
// two it is not in the flow at all.
import { computed, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import SlideOver, { type SlideOverSize } from '@/components/ui/SlideOver.vue'
import Icon from '@/components/ui/Icon.vue'
import { nextPaneMode, paneModeAction, paneModeIcon } from '@/utils/paneMode'

const props = defineProps<{
  /** Whether a row is selected. The column shows regardless — it carries its
   *  own "pick one" state — but a drawer with nothing in it is just a panel
   *  over the list. */
  open: boolean
  title: string
}>()
const emit = defineEmits<{
  close: []
  /** The pane's width in px, so the view can make room for a drawer. Zero
   *  while inline: a column in the layout needs no room made for it. */
  width: [px: number]
}>()

const app = useAppStore()
const { c } = useStyles()

const mode = computed(() => app.paneMode)
const inline = computed(() => mode.value === 'inline')
// The drawer knows two of the three modes by name and nothing about the third,
// which is the right split: `inline` is not a drawer at all.
const drawerSize = computed<SlideOverSize>(() => (mode.value === 'compact' ? 'compact' : 'large'))
const next = computed(() => nextPaneMode(mode.value))
const modeIcon = computed(() => paneModeIcon(next.value))
const modeLabel = computed(() => paneModeAction(next.value))
function cycle() {
  app.setPaneMode(next.value)
}

// Inline takes no room from anyone, and the view has to hear that on the way
// in as well as on the way back.
watch(inline, (isInline) => isInline && emit('width', 0), { immediate: true })

// --- styles ------------------------------------------------------------------
const column = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
    minHeight: 0,
    borderLeft: '1px solid ' + c.value.border,
    paddingLeft: 'var(--sp-4)',
  }),
)
// The column had no header before, and did not need one — until it grew a
// control. It is the thinnest one that will hold a button: the label is the
// pane's own title, dimmed, which the detail below repeats in full.
const head = pxify({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--sp-2)',
  flexShrink: 0,
})
const headTitle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: c.value.dim,
    flex: 1,
    minWidth: 0,
  }),
)
const modeBtn = computed(() =>
  pxify({
    display: 'grid',
    placeItems: 'center',
    width: 27,
    height: 27,
    flexShrink: 0,
    padding: 0,
    borderRadius: 'var(--radius-control)',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
  }),
)
const modeBtnHover = computed(() => ({ color: c.value.accent, borderColor: c.value.accent }))
</script>

<template>
  <div v-if="inline" :style="column">
    <div :style="head">
      <span :style="headTitle">{{ title }}</span>
      <button
        type="button"
        :style="modeBtn"
        v-hover-style="modeBtnHover"
        :title="modeLabel"
        :aria-label="modeLabel"
        @click="cycle"
      >
        <Icon :name="modeIcon" size="xs" />
      </button>
    </div>
    <slot />
  </div>

  <SlideOver
    v-else
    :open="props.open"
    :modal="false"
    :size="drawerSize"
    :title="title"
    :mode-icon="modeIcon"
    :mode-label="modeLabel"
    @mode="cycle"
    @width="emit('width', $event)"
    @close="emit('close')"
  >
    <slot />
  </SlideOver>
</template>
