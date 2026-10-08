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
import type { ShortStep } from '@/components/ui/type'

/** The three weights the type system allows (ui/type WEIGHTS). */
type Weight = 'normal' | 'medium' | 'semibold'

const props = withDefaults(
  defineProps<{
    /** Whether a row is selected. The column shows regardless — it carries its
     *  own "pick one" state — but a drawer with nothing in it is just a panel
     *  over the list. */
    open: boolean
    title: string
    /** A line beside the title, on its baseline, saying what the pane shows
     *  ("First open subtasks of each todo"). */
    subtitle?: string
    /** The title's step on the type scale and its weight. */
    titleSize?: ShortStep
    titleWeight?: Weight
    /** The subtitle's step and weight: smaller and lighter than the title. */
    subtitleSize?: ShortStep
    subtitleWeight?: Weight
  }>(),
  {
    subtitle: '',
    titleSize: 'xl',
    titleWeight: 'semibold',
    subtitleSize: 'base',
    subtitleWeight: 'normal',
  },
)
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
// Inline, the pane is a card of its own beside the list — a soft fill and a
// large radius — rather than a column fenced off by a divider line.
const column = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
    minHeight: 0,
    padding: '20px 22px 12px',
    borderRadius: 28,
    background: 'color-mix(in srgb, ' + c.value.text + ' 4%, transparent)',
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
// The heading: a large, heavy title with a lighter line beside it on the same
// baseline — the title says where you are, the subtitle what it means.
const headText = pxify({
  display: 'flex',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  columnGap: 10,
  rowGap: 2,
  flex: 1,
  minWidth: 0,
})
const headTitle = computed(() =>
  pxify({
    ...typeStep(props.titleSize),
    fontWeight: `var(--weight-${props.titleWeight})`,
    letterSpacing: '-0.01em',
    lineHeight: 1.15,
    color: c.value.text,
    margin: 0,
  }),
)
const headSubtitle = computed(() =>
  pxify({
    ...typeStep(props.subtitleSize),
    fontWeight: `var(--weight-${props.subtitleWeight})`,
    color: c.value.dim,
    minWidth: 0,
  }),
)
// Raised tiles in the card's corner, the close button's shape in the design.
const modeBtn = computed(() =>
  pxify({
    display: 'grid',
    placeItems: 'center',
    width: 36,
    height: 36,
    flexShrink: 0,
    padding: 0,
    borderRadius: 12,
    border: '1px solid transparent',
    background: c.value.card,
    color: c.value.dim,
    cursor: 'pointer',
  }),
)
// With a todo open the detail names itself in large type below, so the small
// label would only repeat it; it stays for the idle state ("Next up").
const headSpacer = pxify({ flex: 1 })
const modeBtnHover = computed(() => ({ color: c.value.accent, borderColor: c.value.accent }))
</script>

<template>
  <div v-if="inline" :style="column" role="region" :aria-label="title">
    <div :style="head">
      <div v-if="!props.open" :style="headText">
        <h2 :style="headTitle">{{ title }}</h2>
        <span v-if="subtitle" :style="headSubtitle">{{ subtitle }}</span>
      </div>
      <span v-else :style="headSpacer"></span>
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
      <!-- Escape does the same; the button is for the pointer. With nothing
           selected the column shows its own idle state and there is nothing
           to close. -->
      <button
        v-if="props.open"
        type="button"
        :style="modeBtn"
        v-hover-style="modeBtnHover"
        title="Close"
        aria-label="Close details"
        @click="emit('close')"
      >
        <Icon name="x" size="xs" />
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
