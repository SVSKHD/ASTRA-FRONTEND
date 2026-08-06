<script setup lang="ts">
// The tasks list, restructured like the todo list: a single "Carried over · N"
// accordion for overdue tasks, today's active items flat (no per-deadline
// grouping), then a collapsed Completed section. Drag-to-nest, linked
// accordions, the repo/CI chip and the "Remind me" bell all keep working.
import { computed } from 'vue'
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
import LinkProgressBar from '@/components/LinkProgressBar.vue'
import LinkedAccordion from '@/components/LinkedAccordion.vue'
import CarriedOverGroup from '@/components/CarriedOverGroup.vue'
import CompletedSection from '@/components/CompletedSection.vue'
import ProgressLine from '@/components/ProgressLine.vue'
import RemindBell from '@/components/RemindBell.vue'
import { nestedChildIds } from '@/utils/links'
import { useAccordionState } from '@/composables/useAccordionState'
import { useDragNest } from '@/composables/useDragNest'
import type { LinkRef, Task } from '@/types'

const app = useAppStore()
const ui = useUiStore()
const { c, dark, s, panelStyle } = useStyles()
const { startDrag, targetState } = useDragNest()
const { tasks, githubCache, draggingId, hideCompleted } = storeToRefs(app)
const { now } = storeToRefs(ui)

defineExpose({ focus: () => app.openCreate('task') })

const todayStr = computed(() => todayKey(new Date(now.value)))
function dayOf(t: Task): string {
  return t.deadline || ''
}

const nestedIds = computed(() => nestedChildIds('tasks', tasks.value))
const topLevel = computed(() => tasks.value.filter((t) => !nestedIds.value.has(t.id)))

const split = computed(() =>
  splitList(topLevel.value, {
    isDone: (t) => t.status === 'done',
    isCarried: (t) => isOverdueTask(t, todayStr.value),
    completedAt: (t) => t.completedAt,
    completedOnDay: todayStr.value,
    completedSort: 'recent',
  }),
)
const carried = computed(() =>
  [...split.value.carriedOver].sort((a, b) => dayOf(a).localeCompare(dayOf(b))),
)
const active = computed(() => split.value.active)
const completed = computed(() => split.value.completed)
const carriedSubtitle = computed(() => oldestFromLabel(carried.value.map(dayOf)))

// --- drag-to-nest -----------------------------------------------------------
function onGripDown(e: PointerEvent, t: Task) {
  e.preventDefault()
  e.stopPropagation()
  startDrag([{ id: t.id, collection: 'tasks' }], e, { title: t.title || '(untitled)', badge: 'Task' })
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
function expanded(t: Task) {
  return acc.isOpen(accKey(t))
}
function toggleExpand(t: Task) {
  acc.toggle(accKey(t))
}
function orphanBreadcrumb(t: Task): string {
  return t.parents
    .map((p) => app.linkableById(p))
    .filter((it): it is NonNullable<typeof it> => !!it)
    .map((it) => ('text' in it ? it.text : it.title))
    .join(', ')
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
function ciColor(t: Task) {
  const gh = githubCache.value[t.id]
  if (!gh || gh.status === 'loading') return c.value.dim
  return gh.data.ci === 'passing' ? 'oklch(0.7 0.15 145)' : 'oklch(0.65 0.2 25)'
}
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
const rowsWrap = pxify({ display: 'flex', flexDirection: 'column', gap: 9, position: 'relative' })
function textStyle(t: Task) {
  return pxify({
    fontSize: 14,
    color: c.value.text,
    lineHeight: 1.3,
    textDecoration: t.done ? 'line-through' : 'none',
    textDecorationColor: c.value.dim,
  })
}
function repoDotStyle(t: Task) {
  const col = ciColor(t)
  return pxify({
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: col,
    boxShadow: '0 0 6px ' + col,
    flexShrink: 0,
    marginRight: 5,
  })
}
const repoChipStyle = computed(() =>
  pxify({
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 10,
    padding: '3px 8px',
    borderRadius: 8,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: c.value.dim,
  }),
)
const gripDots = [0, 1, 2, 3, 4, 5]
function chipStyle(tag: string) {
  return pxify(tagChip(c.value, tag, dark.value))
}
function linkOf(t: Task) {
  return app.linkProgressOf({ id: t.id, collection: 'tasks' })
}
const linkChip = computed(() =>
  pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: c.value.dim,
    padding: '2px 7px',
    borderRadius: 999,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
  }),
)
const linkLineWrap = pxify({ position: 'absolute', left: 12, right: 12, bottom: 3 })
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
function chevronStyle(t: Task) {
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
    transform: expanded(t) ? 'rotate(90deg)' : 'rotate(0deg)',
    transition: 'transform .25s ease',
  })
}
function accBodyOuter(t: Task) {
  return pxify({
    display: 'grid',
    gridTemplateRows: expanded(t) ? '1fr' : '0fr',
    transition: 'grid-template-rows .3s cubic-bezier(.4,1,.4,1)',
  })
}
const accBodyClip = pxify({ overflow: 'hidden', minHeight: 0 })
const accBodyInner = computed(() =>
  pxify({ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 6px 2px 30px' }),
)
const breadcrumbStyle = computed(() =>
  pxify({ fontSize: 10, color: c.value.dim, padding: '2px 0 4px 46px' }),
)
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
const dueChipStyle = computed(() =>
  pxify({ fontSize: 10, color: c.value.dim, padding: '2px 0' }),
)
function dueLabel(t: Task): string {
  if (!t.deadline) return ''
  return new Date(t.deadline + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
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

    <!-- 2. Active items, flat -->
    <TransitionGroup name="rowflip" tag="div" :style="rowsWrap">
      <div v-for="t in active" :key="t.id" :style="parentCardStyle">
        <div
          :style="[rowStyle(t), nestHighlight(t.id)]"
          v-hover-style="s.rowHover"
          :data-nest-id="t.id"
          data-nest-collection="tasks"
          @dragover="onRowDragOver"
          @drop="onGripDrop($event, t)"
        >
          <button
            v-if="t.linked.length"
            type="button"
            :style="chevronStyle(t)"
            :aria-label="expanded(t) ? 'Collapse linked' : 'Expand linked'"
            :aria-expanded="expanded(t)"
            @click.stop="toggleExpand(t)"
          >
            <svg
              width="11"
              height="11"
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
              <span v-if="dueLabel(t)" :style="dueChipStyle">due {{ dueLabel(t) }}</span>
              <span v-if="t.repo" :style="repoChipStyle"
                ><span :style="repoDotStyle(t)"></span>{{ t.repo }}</span
              >
              <span v-if="t.linked.length" :style="linkChip" title="Linked items">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  :stroke="c.dim"
                  stroke-width="1.9"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M9 12h6" />
                  <path d="M10 8H8a4 4 0 0 0 0 8h2" />
                  <path d="M14 8h2a4 4 0 0 1 0 8h-2" />
                </svg>
                {{ linkOf(t).done }}/{{ linkOf(t).total }}
              </span>
            </div>
          </div>
          <RemindBell collection="tasks" :id="t.id" />
          <StatusPill :status="t.status" @cycle="app.cycleTaskStatus(t.id)" />
          <button :style="s.shareBtn" @click.stop="app.share('task', t)">↗</button>
          <button :style="s.del" @click.stop="app.deleteWithUndo('tasks', 'task', t.id)">×</button>
          <div v-if="t.linked.length" :style="linkLineWrap">
            <LinkProgressBar :done="linkOf(t).done" :total="linkOf(t).total" compact />
          </div>
        </div>

        <span v-if="orphanBreadcrumb(t)" :style="breadcrumbStyle">
          part of ‹{{ orphanBreadcrumb(t) }}›
        </span>

        <div v-if="t.linked.length" :style="accBodyOuter(t)">
          <div :style="accBodyClip">
            <div :style="accBodyInner">
              <LinkedAccordion
                v-for="ch in t.linked"
                :key="ch.collection + ':' + ch.id"
                :item-ref="ch"
                :parent-ref="{ id: t.id, collection: 'tasks' }"
                :depth="0"
                :is-root="false"
              />
            </div>
          </div>
        </div>
      </div>
    </TransitionGroup>

    <!-- 3. Completed section -->
    <CompletedSection
      v-if="!hideCompleted && completed.length > 0"
      collection="tasks"
      :count="completed.length"
      sort="recent"
    >
      <div v-for="t in completed" :key="t.id" :style="rowStyle(t, true)">
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
    </CompletedSection>
  </div>
</template>
