<script setup lang="ts">
// One level of the flat task tree, rendered recursively (it references itself by
// filename) inside an accordion within the parent row — the same height-animated
// accordion the linked-children use. Each row carries a drag grip (any node, at
// any depth, can be dragged), a status box, the title, a rolled-up progress count
// over its whole subtree, and a conflict badge. Children nest as another
// <TaskSubtree> one level deeper.
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { useAccordionState } from '@/composables/useAccordionState'
import { useTaskTree } from '@/composables/useTaskTree'
import { useTaskDrag } from '@/composables/useTaskDrag'
import { pxify } from '@/styles'
import OfflineChip from '@/components/OfflineChip.vue'
import LinkProgressBar from '@/components/LinkProgressBar.vue'

const props = withDefaults(defineProps<{ taskId: number; depth?: number }>(), { depth: 0 })

const app = useAppStore()
const { c, s } = useStyles()
const accordion = useAccordionState()
const tree = useTaskTree()
const { startDrag, targetState } = useTaskDrag()

const children = computed(() => tree.childrenOf(props.taskId))
const gripDots = [0, 1, 2, 3, 4, 5]

// A distinct accordion namespace so tree expansion never clashes with the
// cross-collection link accordion, which keys on `tasks:<id>`.
const keyOf = (id: number) => 'tasktree:' + id
function expanded(id: number) {
  return accordion.isOpen(keyOf(id))
}
function toggle(id: number) {
  accordion.toggle(keyOf(id))
}
function hasKids(id: number) {
  return tree.hasChildren(id)
}
function done(id: number) {
  return tree.taskById(id)?.status === 'done'
}
function title(id: number) {
  return tree.taskById(id)?.title || '(untitled)'
}
function conflicted(id: number) {
  return tree.taskById(id)?.hasConflict === true
}

function onGripDown(e: PointerEvent, id: number) {
  startDrag(id, e, { title: title(id) })
}
function toggleDone(id: number) {
  app.cycleTaskStatus(id)
}
function open(id: number) {
  app.openTaskDialog(id)
}

// The nest/reorder highlight for a row that is the current drop target.
function highlight(id: number) {
  const ts = targetState(id)
  if (!ts.active) return {}
  const color = ts.valid ? c.value.accent : 'oklch(0.64 0.22 25)'
  if (ts.zone === 'nest') return { outline: '2px solid ' + color, outlineOffset: '1px' }
  return ts.zone === 'above'
    ? { boxShadow: 'inset 0 2px 0 0 ' + color }
    : { boxShadow: 'inset 0 -2px 0 0 ' + color }
}
function rejectStyle(id: number) {
  const ts = targetState(id)
  return ts.active && !ts.valid ? { animation: 'shake .4s' } : {}
}

const rowStyle = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    borderRadius: 10,
    background: c.value.card,
    border: '1px solid ' + c.value.border,
    position: 'relative',
  }),
)
function chevronStyle(id: number) {
  return pxify({
    width: 18,
    height: 18,
    flexShrink: 0,
    border: 'none',
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    transform: expanded(id) ? 'rotate(90deg)' : 'rotate(0deg)',
    transition: 'transform .25s ease',
  })
}
const chevronSpacer = pxify({ width: 18, flexShrink: 0 })
function boxStyle(id: number) {
  return pxify({
    width: 16,
    height: 16,
    flexShrink: 0,
    borderRadius: 5,
    border: '1.5px solid ' + (done(id) ? c.value.accent : c.value.border),
    background: done(id) ? c.value.accent : 'transparent',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  })
}
function titleStyle(id: number) {
  return pxify({
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: c.value.text,
    textDecoration: done(id) ? 'line-through' : 'none',
    textDecorationColor: c.value.dim,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  })
}
const countChip = computed(() =>
  pxify({
    fontSize: 10,
    color: c.value.dim,
    padding: '1px 6px',
    borderRadius: 999,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    flexShrink: 0,
  }),
)
const conflictBadge = computed(() =>
  pxify({
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    padding: '2px 6px',
    borderRadius: 6,
    color: 'oklch(0.7 0.18 60)',
    border: '1px solid oklch(0.7 0.18 60)',
    background: 'transparent',
    cursor: 'pointer',
    flexShrink: 0,
  }),
)
const progressWrap = pxify({ padding: '4px 4px 0' })
function bodyOuter(id: number) {
  return pxify({
    display: 'grid',
    gridTemplateRows: expanded(id) ? '1fr' : '0fr',
    transition: 'grid-template-rows .3s cubic-bezier(.4,1,.4,1)',
  })
}
const bodyClip = pxify({ overflow: 'hidden', minHeight: 0 })
const bodyInner = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 6,
    marginLeft: 12,
    paddingLeft: 12,
    borderLeft: '1.5px solid ' + c.value.border,
  }),
)
const nodeWrap = pxify({ display: 'flex', flexDirection: 'column' })
</script>

<template>
  <div
    v-for="child in children"
    :key="child.id"
    :style="nodeWrap"
    :data-tasktree-id="child.id"
    data-tasktree-collection="tasks"
  >
    <div :style="[rowStyle, highlight(child.id), rejectStyle(child.id)]" v-hover-style="s.rowHover">
      <button
        v-if="hasKids(child.id)"
        type="button"
        :style="chevronStyle(child.id)"
        :aria-label="expanded(child.id) ? 'Collapse' : 'Expand'"
        :aria-expanded="expanded(child.id)"
        @click.stop="toggle(child.id)"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          :stroke="c.dim"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
      <span v-else :style="chevronSpacer"></span>

      <span
        :style="s.grip"
        role="button"
        aria-label="Drag to move"
        title="Drag to move"
        @pointerdown="onGripDown($event, child.id)"
        ><span v-for="d in gripDots" :key="d" :style="s.gripDot"></span
      ></span>

      <button
        type="button"
        :style="boxStyle(child.id)"
        aria-label="Toggle done"
        @click.stop="toggleDone(child.id)"
      >
        <svg
          v-if="done(child.id)"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          :stroke="c.onAccent"
          stroke-width="3.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>

      <span :style="titleStyle(child.id)" @click="open(child.id)">{{ title(child.id) }}</span>
      <span v-if="hasKids(child.id)" :style="countChip"
        >{{ tree.progressOf(child.id).done }}/{{ tree.progressOf(child.id).total }}</span
      >
      <span
        v-if="conflicted(child.id)"
        :style="conflictBadge"
        title="A newer version arrived while you were editing"
        @click.stop="app.dismissTaskConflict(child.id)"
        >remote ✕</span
      >
      <OfflineChip :pending="app.isItemPending('task', child.id)" />
    </div>

    <div v-if="hasKids(child.id)" :style="progressWrap">
      <LinkProgressBar
        :done="tree.progressOf(child.id).done"
        :total="tree.progressOf(child.id).total"
        compact
      />
    </div>

    <div v-if="hasKids(child.id)" :style="bodyOuter(child.id)">
      <div :style="bodyClip">
        <div :style="bodyInner">
          <TaskSubtree :task-id="child.id" :depth="depth + 1" />
        </div>
      </div>
    </div>
  </div>
</template>
