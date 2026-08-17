<script setup lang="ts">
// The tasks list, restructured like the todo list: a single "Carried over · N"
// accordion for overdue tasks, today's active items flat (no per-deadline
// grouping), then a collapsed Completed section. Drag-to-nest, linked
// accordions, the repo/CI chip and the "Remind me" bell all keep working.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, merge, rowBase, tagChip } from '@/styles'
import { todayKey, isOverdueTask } from '@/utils/rollover'
import { splitList, ageChip, oldestFromLabel } from '@/utils/listSplit'
import { relLabel } from '@/utils/upcoming'
import ListToolbar from '@/components/ListToolbar.vue'
import StatusPill from '@/components/StatusPill.vue'
import CarriedOverGroup from '@/components/CarriedOverGroup.vue'
import CompletedSection from '@/components/CompletedSection.vue'
import ProgressLine from '@/components/ProgressLine.vue'
import RemindBell from '@/components/RemindBell.vue'
import TreeList from '@/components/TreeList.vue'
import { nestedChildIds } from '@/utils/links'
import { useAccordionState } from '@/composables/useAccordionState'
import { useLongList } from '@/composables/useLongList'
import { useDragNest } from '@/composables/useDragNest'
import type { LinkRef, Task } from '@/types'

const app = useAppStore()
const ui = useUiStore()
const { c, dark, s, panelStyle } = useStyles()
const { startDrag, targetState } = useDragNest()
const { tasks, draggingId, hideCompleted } = storeToRefs(app)
const { now } = storeToRefs(ui)

defineExpose({ focus: () => app.openCreate('task') })

const todayStr = computed(() => todayKey(new Date(now.value)))
function dayOf(t: Task): string {
  return t.deadline || ''
}

const nestedIds = computed(() => nestedChildIds('tasks', tasks.value))
// Tasks nested under another present task via the flat parentId hierarchy render
// inside their parent's tree, so they drop out of the main (top-level) list.
const treeNestedIds = computed(() => {
  const present = new Set(tasks.value.map((t) => t.id))
  const nested = new Set<number>()
  for (const t of tasks.value) {
    if (t.parentId != null && present.has(t.parentId)) nested.add(t.id)
  }
  return nested
})
const topLevel = computed(() =>
  tasks.value.filter((t) => !nestedIds.value.has(t.id) && !treeNestedIds.value.has(t.id)),
)

const completedSort = ref<'recent' | 'original'>('recent')
const split = computed(() =>
  splitList(topLevel.value, {
    isDone: (t) => t.status === 'done',
    isCarried: (t) => isOverdueTask(t, todayStr.value),
    completedAt: (t) => t.completedAt,
    archivedAt: (t) => t.archivedAt ?? null,
    completedOnDay: todayStr.value,
    completedSort: completedSort.value,
  }),
)
const carried = computed(() =>
  [...split.value.carriedOver].sort((a, b) => dayOf(a).localeCompare(dayOf(b))),
)
const active = computed(() => split.value.active)
const activeRootIds = computed(() => active.value.map((t) => t.id))
const completed = computed(() => split.value.completed)
// A completed list is unbounded — it grows for as long as the workspace is
// used. Past 100 rows it renders in windows so opening the section stays
// instant however many years are behind it.
const completedWindow = useLongList(completed)
const carriedSubtitle = computed(() => oldestFromLabel(carried.value.map(dayOf)))

// --- drag-to-nest -----------------------------------------------------------
function onGripDown(e: PointerEvent, t: Task) {
  e.preventDefault()
  e.stopPropagation()
  startDrag([{ id: t.id, collection: 'tasks' }], e, {
    title: t.title || '(untitled)',
    badge: 'Task',
  })
}
function nestHighlight(id: number) {
  const ts = targetState({ id, collection: 'tasks' } as LinkRef)
  if (!ts.active || ts.zone !== 'nest') return {}
  return ts.valid
    ? { outline: '2px solid ' + c.value.accent, outlineOffset: '1px', background: c.value.card }
    : { outline: '2px solid oklch(0.64 0.22 25)', outlineOffset: '1px' }
}

// --- linked-items nesting ---------------------------------------------------
const acc = useAccordionState()
function accKey(t: Task) {
  return 'tasks:' + t.id
}
const parentKeys = computed(() =>
  topLevel.value.filter((t) => t.linked.length > 0).map((t) => accKey(t)),
)
const anyLinked = computed(() => parentKeys.value.length > 0)
const allExpanded = computed(
  () => parentKeys.value.length > 0 && parentKeys.value.every((k) => acc.isOpen(k)),
)
function toggleAll() {
  acc.setMany(parentKeys.value, !allExpanded.value)
}

// --- click vs. double-click (single → dialog, double → task view) -----------
let clickTimer: ReturnType<typeof setTimeout> | null = null
function onRowClick(t: Task) {
  if (clickTimer) return
  clickTimer = setTimeout(() => {
    clickTimer = null
    app.openTaskDialog(t.id)
  }, 230)
}
function onRowDblClick(t: Task) {
  if (clickTimer) {
    clearTimeout(clickTimer)
    clickTimer = null
  }
  app.openTaskView(t.id)
}

// --- styles -----------------------------------------------------------------
function rowStyle(t: Task, done = false) {
  const isDrag = draggingId.value === t.id
  return merge(rowBase(c.value), {
    opacity: done ? 0.55 : 1,
    cursor: 'pointer',
    position: 'relative',
    transform: isDrag ? 'scale(1.03)' : undefined,
    boxShadow: isDrag ? '0 18px 40px rgba(0,0,0,0.45)' : undefined,
    zIndex: isDrag ? 5 : 'auto',
  })
}
function textStyle(t: Task) {
  return pxify({
    fontSize: 14,
    color: c.value.text,
    lineHeight: 1.3,
    textDecoration: t.done ? 'line-through' : 'none',
    textDecorationColor: c.value.dim,
  })
}
const gripDots = [0, 1, 2, 3, 4, 5]
function chipStyle(tag: string) {
  return pxify(tagChip(c.value, tag, dark.value))
}
const ageChipStyle = computed(() =>
  pxify({
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 999,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: c.value.dim,
    flexShrink: 0,
  }),
)
const rolloverChipStyle = computed(() =>
  pxify({
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 999,
    background: 'transparent',
    border: '1px solid ' + (dark.value ? 'oklch(0.72 0.18 55)' : 'oklch(0.6 0.18 55)'),
    color: dark.value ? 'oklch(0.78 0.16 62)' : 'oklch(0.55 0.18 55)',
    flexShrink: 0,
  }),
)
const doneMetaStyle = computed(() => pxify({ fontSize: 11, color: c.value.dim }))
const parentCardStyle = pxify({ display: 'flex', flexDirection: 'column' })
const linkExpandBtn = computed(() =>
  pxify({
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '5px 10px',
    borderRadius: 999,
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
)
const doneAgo = (t: Task) => (t.completedAt ? relLabel(t.completedAt - now.value) : '')

function onGripDrop(e: DragEvent, t: Task) {
  e.preventDefault()
  e.stopPropagation()
  app.dropOnTask(t.id)
}
function onRowDragOver(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  try {
    e.dataTransfer!.dropEffect = 'move'
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <div :style="panelStyle">
    <ListToolbar title="Tasks" new-label="New task" @new="app.openCreate('task')">
      <template #actions>
        <button v-if="anyLinked" type="button" :style="linkExpandBtn" @click="toggleAll">
          {{ allExpanded ? 'Collapse links' : 'Expand links' }}
        </button>
      </template>
    </ListToolbar>
    <ProgressLine :done="split.stats.done" :total="split.stats.total" />
    <div v-if="tasks.length === 0" :style="s.empty">Nothing yet — add your first task.</div>

    <!-- 1. Carried over accordion -->
    <CarriedOverGroup
      v-if="carried.length > 0"
      collection="tasks"
      :count="carried.length"
      :subtitle="carriedSubtitle"
    >
      <div v-for="t in carried" :key="t.id" :style="parentCardStyle">
        <div
          :style="[rowStyle(t), nestHighlight(t.id)]"
          v-hover-style="s.rowHover"
          :data-nest-id="t.id"
          data-nest-collection="tasks"
          @dragover="onRowDragOver"
          @drop="onGripDrop($event, t)"
        >
          <span :style="ageChipStyle">{{ ageChip(dayOf(t), todayStr) }}</span>
          <span
            :style="s.grip"
            role="button"
            aria-label="Drag to nest"
            title="Drag to nest"
            @pointerdown="onGripDown($event, t)"
            ><span v-for="d in gripDots" :key="d" :style="s.gripDot"></span
          ></span>
          <div :style="s.taskMain" @click="onRowClick(t)" @dblclick="onRowDblClick(t)">
            <span :style="textStyle(t)">{{ t.title }}</span>
            <div :style="s.chipRow">
              <span v-if="t.tag" :style="chipStyle(t.tag)">{{ t.tag }}</span>
              <span v-if="t.rolloverCount > 1" :style="rolloverChipStyle"
                >rolled over ×{{ t.rolloverCount }}</span
              >
            </div>
          </div>
          <RemindBell collection="tasks" :id="t.id" />
          <StatusPill :status="t.status" @cycle="app.cycleTaskStatus(t.id)" />
          <button :style="s.del" @click.stop="app.deleteWithUndo('tasks', 'task', t.id)">×</button>
        </div>
      </div>
    </CarriedOverGroup>

    <!-- 2. Active items as a flat, drag-reorderable tree (grip handle, reorder /
         nest / promote indicators, root strip). -->
    <TreeList collection="tasks" :root-ids="activeRootIds" />

    <!-- 3. Completed section -->
    <CompletedSection
      v-if="!hideCompleted && completed.length > 0"
      collection="tasks"
      :count="completed.length"
      :sort="completedSort"
      clearable
      @toggle-sort="completedSort = completedSort === 'recent' ? 'original' : 'recent'"
      @clear="app.archiveCompleted('tasks')"
    >
      <div v-for="t in completedWindow.visible.value" :key="t.id" :style="rowStyle(t, true)">
        <StatusPill :status="t.status" @cycle="app.cycleTaskStatus(t.id)" />
        <div :style="s.taskMain" @click="app.openTaskDialog(t.id)">
          <span :style="textStyle(t)">{{ t.title }}</span>
          <div :style="s.chipRow">
            <span v-if="t.tag" :style="chipStyle(t.tag)">{{ t.tag }}</span>
            <span :style="doneMetaStyle">done {{ doneAgo(t) }}</span>
          </div>
        </div>
        <button :style="s.del" @click.stop="app.deleteWithUndo('tasks', 'task', t.id)">×</button>
      </div>
      <button
        v-if="completedWindow.remaining.value > 0"
        :style="s.showMoreRow"
        @click="completedWindow.more()"
      >
        Show {{ Math.min(100, completedWindow.remaining.value) }} more ({{
          completedWindow.remaining.value
        }}
        hidden)
      </button>
    </CompletedSection>
  </div>
</template>
