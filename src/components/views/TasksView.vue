<script setup lang="ts">
// The tasks list, restructured like the todo list: a single "Carried over · N"
// accordion for overdue tasks, today's active items flat (no per-deadline
// grouping), then a collapsed Completed section. Drag-to-nest, linked
// accordions, the repo/CI chip and the "Remind me" bell all keep working.
// On desktop the selected task's details and subtasks show in the right-hand
// pane, which is a column of this tab by default and a floating drawer over it
// on request — one setting, three steps, cycled from the pane's own header
// (DetailPane).
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { DANGER, WARNING, doneText, merge, pxify, rowBase, typeStep } from '@/styles'
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
import TaskDetail from '@/components/TaskDetail.vue'
import DetailPane from '@/components/ui/DetailPane.vue'
import LinkedAccordion from '@/components/LinkedAccordion.vue'
import { useTapOpen } from '@/composables/useTapOpen'
import { usePaneInset } from '@/composables/usePaneInset'
import TitleTagPill from '@/components/TitleTagPill.vue'
import { nestedChildIds } from '@/utils/links'
import { buildIndex, descendantsOf, progressOf } from '@/utils/taskTree'
import { emptyTagQueryMessage, matchesTagQuery } from '@/utils/tagFilter'
import TagFilterInput from '@/components/TagFilterInput.vue'
import { useAccordionState } from '@/composables/useAccordionState'
import { useLongList } from '@/composables/useLongList'
import { useDragNest } from '@/composables/useDragNest'
import type { LinkRef, Task } from '@/types'

const app = useAppStore()
const ui = useUiStore()
const { c, s, panelStyle, isMobile } = useStyles()
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

// --- tag filter --------------------------------------------------------------
// Same rule as the todo list: a top-level task matches on its own tag or any
// subtask's, and the filter applies before the split so every section narrows.
const tagQuery = ref('')
function treeTags(t: Task): string[] {
  return [t.tag, ...descendantsOf(taskIndex.value, t.id).map((d) => d.tag)]
}
const tagGroups = computed(() => topLevel.value.map(treeTags))
const shownTopLevel = computed(() => {
  if (!tagQuery.value.trim()) return topLevel.value
  const inUse = tagGroups.value.flat()
  return topLevel.value.filter((t) => matchesTagQuery(treeTags(t), tagQuery.value, inUse))
})

const completedSort = ref<'recent' | 'original'>('recent')
const split = computed(() =>
  splitList(shownTopLevel.value, {
    isDone: (t) => t.status === 'done',
    isCarried: (t) => isOverdueTask(t, todayStr.value),
    completedAt: (t) => t.completedAt,
    archivedAt: (t) => t.archivedAt ?? null,
    // No day filter: Completed keeps everything finished until it is cleared
    // or deleted (see the same note in TodoView).
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

// --- master/detail selection ------------------------------------------------
// Desktop: a tap selects the task into the right-hand pane. Mobile has no room
// for a second column, so a tap keeps opening the task dialog.
const selectedId = ref<number | null>(null)
const selectedExists = computed(
  () => selectedId.value != null && tasks.value.some((t) => t.id === selectedId.value),
)
// Which shape the pane is in. `inline` is a second grid column and the list
// gives it half the tab; the drawer modes float over the tab instead, and the
// list narrows by however much the drawer covers so the toolbar's New button
// never ends up behind it. The width comes from the pane itself, so compact,
// large and a dragged edge all make the right amount of room.
const splitView = computed(() => !isMobile.value && app.paneMode === 'inline')
const paneOpen = computed(() => !isMobile.value && !splitView.value && selectedExists.value)
const paneWidth = ref(0)
const { host: paneHost, style: paneInset } = usePaneInset(paneOpen, paneWidth)
function openTask(id: number, siblings: number[] = activeRootIds.value) {
  if (isMobile.value) app.openTaskDialog(id, siblings)
  else selectedId.value = id
}
function selectedRowStyle(id: number) {
  return !isMobile.value && selectedId.value === id
    ? {
        borderColor: c.value.accent,
        backgroundColor: 'color-mix(in srgb, ' + c.value.accent + ' 8%, ' + c.value.card + ')',
      }
    : {}
}
// Subtask counter shown on every row, 0/0 when a task has none.
const taskIndex = computed(() => buildIndex(tasks.value))
function subCount(id: number) {
  return progressOf(taskIndex.value, id, (x) => x.status === 'done')
}

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
    : { outline: '2px solid ' + DANGER, outlineOffset: '1px' }
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
// Carried-over and completed rows are rendered here rather than by TreeList, so
// they host their own linked children (TreeList does the same for today's rows).
function linksOpen(t: Task) {
  return t.linked.length > 0 && acc.isOpen(accKey(t))
}
const linkBody = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  padding: '6px 4px 2px 26px',
})

// --- opening a row ----------------------------------------------------------
// A single click selects the task (desktop) or opens the detail dialog
// (mobile), immediately (section 18b). The double click still opens the
// full-page task view.
const pressedRow = ref<number | null>(null)
const tap = useTapOpen(() => {
  const id = pressedRow.value
  pressedRow.value = null
  if (id != null) openTask(id)
})
function onRowPointerDown(event: PointerEvent, t: Task) {
  pressedRow.value = t.id
  tap.onPointerDown(event)
}
function onRowDblClick(t: Task) {
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
    ...typeStep('base'),
    color: c.value.text,
    lineHeight: 1.3,
    ...doneText(t.done),
  })
}
const gripDots = [0, 1, 2, 3, 4, 5]
const ageChipStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    padding: '2px 7px',
    borderRadius: 'var(--radius-pill)',
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: c.value.dim,
    flexShrink: 0,
  }),
)
const subCountStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    color: c.value.dim,
    padding: '1px 6px',
    borderRadius: 'var(--radius-pill)',
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    flexShrink: 0,
  }),
)
const rolloverChipStyle = computed(() =>
  pxify({
    ...typeStep('2xs'),
    padding: '2px 7px',
    borderRadius: 'var(--radius-pill)',
    background: 'transparent',
    // The overdue chip. One token rather than a light/dark pair of literals:
    // the pair only ever knew about two grounds, and there are nineteen.
    border: '1px solid ' + WARNING,
    color: WARNING,
    flexShrink: 0,
  }),
)
const doneMetaStyle = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim }))
const parentCardStyle = pxify({ display: 'flex', flexDirection: 'column' })
const linkExpandBtn = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '5px 10px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
)
// Two columns while the pane is inline; the list alone once it floats.
const splitLayout = pxify({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 'var(--sp-4)',
  flex: 1,
  minHeight: 0,
})
// The filter input stays put above the list while the list scrolls under it.
const leftColumn = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  flex: 1,
  minHeight: 0,
})
const tagInputRow = pxify({ padding: '4px 10px 0' })
const listColumn = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-4)',
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  // A scroll container clips its overflow on every side, so the room for a
  // hovered row's shadow has to be inside it.
  padding: '4px 10px 18px',
})
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
  <div ref="paneHost" :style="[panelStyle, paneInset]">
    <ListToolbar title="Tasks" new-label="New task" @new="app.openCreate('task')">
      <template #actions>
        <button v-if="anyLinked" type="button" :style="linkExpandBtn" @click="toggleAll">
          {{ allExpanded ? 'Collapse links' : 'Expand links' }}
        </button>
      </template>
    </ListToolbar>
    <ProgressLine :done="split.stats.done" :total="split.stats.total" />
    <!-- data-own-keys: ↑/↓ scroll this list rather than switch tabs (globalKeys). -->
    <div :style="splitView ? splitLayout : leftColumn" data-own-keys>
      <div :style="leftColumn">
        <div :style="tagInputRow">
          <TagFilterInput v-model="tagQuery" :groups="tagGroups" />
        </div>
        <div :style="listColumn">
          <div v-if="tasks.length === 0" :style="s.empty">Nothing yet — add your first task.</div>
          <div
            v-else-if="tagQuery.trim() && !carried.length && !active.length && !completed.length"
            :style="s.empty"
          >
            {{ emptyTagQueryMessage(tagQuery, 'tasks') }}
          </div>

          <!-- 1. Carried over accordion -->
          <CarriedOverGroup
            v-if="carried.length > 0"
            collection="tasks"
            :count="carried.length"
            :subtitle="carriedSubtitle"
          >
            <div v-for="t in carried" :key="t.id" :style="parentCardStyle">
              <div
                :style="[rowStyle(t), selectedRowStyle(t.id), nestHighlight(t.id)]"
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
                <div
                  :style="s.taskMain"
                  @pointerdown="onRowPointerDown($event, t)"
                  @pointercancel="tap.onPointerCancel"
                  @click="tap.onClick"
                  @dblclick="onRowDblClick(t)"
                >
                  <span :style="textStyle(t)"
                    ><TitleTagPill v-if="t.tag" :tag="t.tag" />{{ t.title }}</span
                  >
                  <div :style="s.chipRow">
                    <span :style="subCountStyle" title="Subtasks done / total"
                      >☑ {{ subCount(t.id).done }}/{{ subCount(t.id).total }}</span
                    >
                    <span v-if="t.rolloverCount > 1" :style="rolloverChipStyle"
                      >rolled over ×{{ t.rolloverCount }}</span
                    >
                  </div>
                </div>
                <RemindBell collection="tasks" :id="t.id" />
                <StatusPill :status="t.status" @cycle="app.cycleTaskStatus(t.id)" />
                <button :style="s.del" @click.stop="app.deleteWithUndo('tasks', 'task', t.id)">
                  ×
                </button>
              </div>
              <div v-if="linksOpen(t)" :style="linkBody">
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
          </CarriedOverGroup>

          <!-- 2. Active items as a flat, drag-reorderable tree (grip handle, reorder /
             nest / promote indicators, root strip). -->
          <TreeList
            collection="tasks"
            :root-ids="activeRootIds"
            :selectable="!isMobile"
            :selected-id="selectedId"
            @select="selectedId = $event"
          />

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
            <template v-for="t in completedWindow.visible.value" :key="t.id">
              <div :style="[rowStyle(t, true), selectedRowStyle(t.id)]">
                <StatusPill :status="t.status" @cycle="app.cycleTaskStatus(t.id)" />
                <div
                  :style="s.taskMain"
                  @click="
                    openTask(
                      t.id,
                      completedWindow.visible.value.map((x) => x.id),
                    )
                  "
                >
                  <span :style="textStyle(t)"
                    ><TitleTagPill v-if="t.tag" :tag="t.tag" />{{ t.title }}</span
                  >
                  <div :style="s.chipRow">
                    <span :style="subCountStyle" title="Subtasks done / total"
                      >☑ {{ subCount(t.id).done }}/{{ subCount(t.id).total }}</span
                    >
                    <span :style="doneMetaStyle">done {{ doneAgo(t) }}</span>
                  </div>
                </div>
                <button :style="s.del" @click.stop="app.deleteWithUndo('tasks', 'task', t.id)">
                  ×
                </button>
              </div>
              <div v-if="linksOpen(t)" :style="linkBody">
                <LinkedAccordion
                  v-for="ch in t.linked"
                  :key="ch.collection + ':' + ch.id"
                  :item-ref="ch"
                  :parent-ref="{ id: t.id, collection: 'tasks' }"
                  :depth="0"
                  :is-root="false"
                />
              </div>
            </template>
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
      </div>

      <!-- The selected task's details and subtasks (desktop). Inline it is the
           second column of this grid; in either drawer mode it floats over the
           tab instead and this contributes nothing to the layout. -->
      <DetailPane
        v-if="!isMobile"
        :open="selectedExists"
        title="Task details"
        @width="paneWidth = $event"
        @close="selectedId = null"
      >
        <TaskDetail :task-id="selectedExists ? selectedId : null" @select="selectedId = $event" />
      </DetailPane>
    </div>
  </div>
</template>
