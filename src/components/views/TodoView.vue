<script setup lang="ts">
// The todo list, restructured around the Done/Not-done split and the single
// carried-over accordion (no per-day date groups): a "Carried over · N"
// accordion when anything is pending from before today, then today's active
// items flat, then a collapsed "Completed" section. Drag-to-nest, linked
// accordions and the new "Remind me" bell all keep working inside every region.
// On desktop the selected todo's details show in the right-hand pane, which is
// a column of this tab by default and a floating drawer over it on request —
// one setting, three steps, cycled from the pane's own header (DetailPane).
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import {
  DANGER,
  WARNING,
  checkHalo,
  checkHaloDone,
  checkTick,
  checkRing,
  doneText,
  merge,
  pxify,
  rowBase,
  typeStep,
} from '@/styles'
import { ymd } from '@/utils/dayGroups'
import { todayKey, isOverdueTodo } from '@/utils/rollover'
import { splitList, ageChip, oldestFromLabel } from '@/utils/listSplit'
import { relLabel } from '@/utils/upcoming'
import ListToolbar from '@/components/ListToolbar.vue'
import StatusPill from '@/components/StatusPill.vue'
import OfflineChip from '@/components/OfflineChip.vue'
import CarriedOverGroup from '@/components/CarriedOverGroup.vue'
import CompletedSection from '@/components/CompletedSection.vue'
import ProgressLine from '@/components/ProgressLine.vue'
import RemindBell from '@/components/RemindBell.vue'
import TreeList from '@/components/TreeList.vue'
import TodoDetail from '@/components/TodoDetail.vue'
import DetailPane from '@/components/ui/DetailPane.vue'
import LinkedAccordion from '@/components/LinkedAccordion.vue'
import { nestedChildIds } from '@/utils/links'
import { richIsEmpty, richPlain } from '@/utils/richText'
import TitleTagPill from '@/components/TitleTagPill.vue'
import { buildIndex, descendantsOf, progressOf } from '@/utils/taskTree'
import { emptyTagQueryMessage, matchesTagQuery } from '@/utils/tagFilter'
import TagFilterInput from '@/components/TagFilterInput.vue'
import { useAccordionState } from '@/composables/useAccordionState'
import { useLongList } from '@/composables/useLongList'
import { useDragNest } from '@/composables/useDragNest'
import { usePaneInset } from '@/composables/usePaneInset'
import type { LinkRef, Todo } from '@/types'
import Icon from '@/components/ui/Icon.vue'

const app = useAppStore()
const ui = useUiStore()
const { c, s, panelStyle, isMobile } = useStyles()
const { startDrag, targetState } = useDragNest()
const { todos, hideCompleted } = storeToRefs(app)
const { now } = storeToRefs(ui)

defineExpose({ focus: () => app.openCreate('todo') })

const todayStr = computed(() => todayKey(new Date(now.value)))
function dayOf(t: Todo): string {
  return t.createdAt > 0 ? ymd(new Date(t.createdAt)) : ''
}

// Nested children render inside their parent's tree, never as top-level rows, so
// they are filtered out of every region here — both cross-collection link nesting
// and the flat parentId hierarchy.
const nestedIds = computed(() => nestedChildIds('todos', todos.value))
const treeNestedIds = computed(() => {
  const present = new Set(todos.value.map((t) => t.id))
  const nested = new Set<number>()
  for (const t of todos.value) {
    if (t.parentId != null && present.has(t.parentId)) nested.add(t.id)
  }
  return nested
})
const topLevel = computed(() =>
  todos.value.filter((t) => !nestedIds.value.has(t.id) && !treeNestedIds.value.has(t.id)),
)

// --- tag filter --------------------------------------------------------------
// A top-level todo is described by its own tag and every subtask's below it, so
// filtering to a tag finds a tagged subtask under an untagged parent rather than
// hiding it with the parent. Applied before the split, so carried-over, today and
// completed all narrow together and the progress line counts what is shown.
// The query is typed into the input at the top of the list column.
const tagQuery = ref('')
function treeTags(t: Todo): string[] {
  return [t.tag, ...descendantsOf(todoIndex.value, t.id).map((d) => d.tag)]
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
    isCarried: (t) => isOverdueTodo(t, todayStr.value),
    completedAt: (t) => t.completedAt,
    archivedAt: (t) => t.archivedAt ?? null,
    // No day filter: Completed keeps everything finished until it is cleared
    // or deleted. It used to show only what was ticked TODAY, so yesterday's
    // work vanished at midnight — into no list, with no way to reach it and no
    // sign it had ever existed. `useLongList` below is what makes an unbounded
    // section affordable; a day filter is not the right way to bound it.
    completedSort: completedSort.value,
  }),
)
// Carried oldest-first by original day; today's active in list order.
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
// On desktop the list sits on the left and a tap shows the todo (and its
// subtasks) in the right-hand pane; on mobile there is no room for a second
// column, so a tap keeps opening the item dialog.
const selectedId = ref<number | null>(null)
const selectedExists = computed(
  () => selectedId.value != null && todos.value.some((t) => t.id === selectedId.value),
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
// Subtask counter shown on every row, 0/0 when a todo has none.
const todoIndex = computed(() => buildIndex(todos.value))
function subCount(id: number) {
  return progressOf(todoIndex.value, id, (x) => x.status === 'done')
}
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
function openTodo(id: number) {
  if (isMobile.value) app.openEdit('todo', id)
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

// --- drag-to-nest -----------------------------------------------------------
function onGripDown(e: PointerEvent, t: Todo) {
  e.preventDefault()
  e.stopPropagation()
  startDrag([{ id: t.id, collection: 'todos' }], e, {
    title: t.text || '(untitled)',
    badge: 'Todo',
  })
}
function nestHighlight(id: number) {
  const ts = targetState({ id, collection: 'todos' } as LinkRef)
  if (!ts.active || ts.zone !== 'nest') return {}
  return ts.valid
    ? { outline: '2px solid ' + c.value.accent, outlineOffset: '1px', background: c.value.card }
    : { outline: '2px solid ' + DANGER, outlineOffset: '1px' }
}

// --- linked-items nesting ---------------------------------------------------
const acc = useAccordionState()
function accKey(t: Todo) {
  return 'todos:' + t.id
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
function linksOpen(t: Todo) {
  return t.linked.length > 0 && acc.isOpen(accKey(t))
}
const linkBody = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  padding: '6px 4px 2px 26px',
})

// --- styles -----------------------------------------------------------------
const checkIcon = checkTick
function boxStyle(t: Todo) {
  return pxify({
    position: 'relative',
    flexShrink: 0,
    width: 18,
    height: 18,
    borderRadius: 'var(--radius-control)',
    border: '1.5px solid ' + (t.done ? c.value.accent : checkRing(c.value)),
    background: t.done ? c.value.accent : 'transparent',
    padding: 0,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    boxShadow: t.done
      ? checkHaloDone(c.value.accent) + ', inset 0 1px 0 rgba(255,255,255,0.35)'
      : checkHalo(c.value),
    transition:
      'background .3s cubic-bezier(.5,1.5,.5,1), border-color .3s ease, box-shadow .3s ease',
  })
}
function textStyle(t: Todo) {
  return pxify({
    ...typeStep('base'),
    lineHeight: 1.4,
    color: c.value.text,
    cursor: 'pointer',
    ...doneText(t.done),
  })
}
const descStyle = computed(() =>
  pxify({
    ...typeStep('xs'),
    color: c.value.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
)
function rowStyle(done = false) {
  return merge(rowBase(c.value), { opacity: done ? 0.55 : 1, position: 'relative' })
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
const doneAgo = (t: Todo) => (t.completedAt ? relLabel(t.completedAt - now.value) : '')
</script>

<template>
  <div ref="paneHost" :style="[panelStyle, paneInset]">
    <ListToolbar title="Todos" new-label="New todo" @new="app.openCreate('todo')">
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
          <div v-if="todos.length === 0" :style="s.empty">Nothing yet — add your first todo.</div>
          <div
            v-else-if="tagQuery.trim() && !carried.length && !active.length && !completed.length"
            :style="s.empty"
          >
            {{ emptyTagQueryMessage(tagQuery, 'todos') }}
          </div>

          <!-- 1. Carried over accordion (only when non-empty) -->
          <CarriedOverGroup
            v-if="carried.length > 0"
            collection="todos"
            :count="carried.length"
            :subtitle="carriedSubtitle"
          >
            <div v-for="t in carried" :key="t.id" :style="parentCardStyle">
              <div
                :style="[rowStyle(), selectedRowStyle(t.id), nestHighlight(t.id)]"
                v-hover-style="s.rowHover"
                :data-nest-id="t.id"
                data-nest-collection="todos"
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
                <button :style="boxStyle(t)" @click="app.toggleTodo(t.id)"></button>
                <div :style="s.taskMain" @click="openTodo(t.id)">
                  <span :style="textStyle(t)"
                    ><TitleTagPill v-if="t.tag" :tag="t.tag" />{{ t.text }}</span
                  >
                  <span v-if="!richIsEmpty(t.description)" :style="descStyle">{{
                    richPlain(t.description).replace(/\s+/g, ' ')
                  }}</span>
                  <div :style="s.chipRow">
                    <span :style="subCountStyle" title="Subtasks done / total"
                      >☑ {{ subCount(t.id).done }}/{{ subCount(t.id).total }}</span
                    >
                    <span v-if="t.rolloverCount > 1" :style="rolloverChipStyle"
                      >rolled over ×{{ t.rolloverCount }}</span
                    >
                  </div>
                  <OfflineChip :pending="app.isItemPending('todo', t.id)" />
                </div>
                <RemindBell collection="todos" :id="t.id" />
                <StatusPill :status="t.status" @cycle="app.cycleTodoStatus(t.id)" />
                <button :style="s.del" @click="app.deleteWithUndo('todos', 'todo', t.id)">×</button>
              </div>
              <div v-if="linksOpen(t)" :style="linkBody">
                <LinkedAccordion
                  v-for="ch in t.linked"
                  :key="ch.collection + ':' + ch.id"
                  :item-ref="ch"
                  :parent-ref="{ id: t.id, collection: 'todos' }"
                  :depth="0"
                  :is-root="false"
                />
              </div>
            </div>
          </CarriedOverGroup>

          <!-- 2. Today's active items as a flat, drag-reorderable tree (grip handle,
         reorder / nest / promote indicators, root strip). -->
          <TreeList
            collection="todos"
            :root-ids="activeRootIds"
            :selectable="!isMobile"
            :selected-id="selectedId"
            @select="selectedId = $event"
          />

          <!-- 3. Completed section (collapsed) -->
          <CompletedSection
            v-if="!hideCompleted && completed.length > 0"
            collection="todos"
            :count="completed.length"
            :sort="completedSort"
            clearable
            @toggle-sort="completedSort = completedSort === 'recent' ? 'original' : 'recent'"
            @clear="app.archiveCompleted('todos')"
          >
            <template v-for="t in completedWindow.visible.value" :key="t.id">
              <div :style="[rowStyle(true), selectedRowStyle(t.id)]">
                <button :style="boxStyle(t)" @click="app.toggleTodo(t.id)">
                  <Icon
                    v-if="t.done"
                    name="check"
                    size="xs"
                    :style="[checkIcon, { color: c.onAccent }]"
                  />
                </button>
                <div :style="s.taskMain" @click="openTodo(t.id)">
                  <span :style="textStyle(t)"
                    ><TitleTagPill v-if="t.tag" :tag="t.tag" />{{ t.text }}</span
                  >
                  <div :style="s.chipRow">
                    <span :style="subCountStyle" title="Subtasks done / total"
                      >☑ {{ subCount(t.id).done }}/{{ subCount(t.id).total }}</span
                    >
                    <span :style="doneMetaStyle">done {{ doneAgo(t) }}</span>
                  </div>
                </div>
                <button :style="s.del" @click="app.deleteWithUndo('todos', 'todo', t.id)">×</button>
              </div>
              <div v-if="linksOpen(t)" :style="linkBody">
                <LinkedAccordion
                  v-for="ch in t.linked"
                  :key="ch.collection + ':' + ch.id"
                  :item-ref="ch"
                  :parent-ref="{ id: t.id, collection: 'todos' }"
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

      <!-- The selected todo's details and subtasks (desktop). Inline it is the
           second column of this grid; in either drawer mode it floats over the
           tab instead and this contributes nothing to the layout. -->
      <DetailPane
        v-if="!isMobile"
        :open="selectedExists"
        title="Todo details"
        @width="paneWidth = $event"
        @close="selectedId = null"
      >
        <TodoDetail :todo-id="selectedExists ? selectedId : null" @select="selectedId = $event" />
      </DetailPane>
    </div>
  </div>
</template>
