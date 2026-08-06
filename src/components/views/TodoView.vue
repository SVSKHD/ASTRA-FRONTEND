<script setup lang="ts">
// The todo list, restructured around the Done/Not-done split and the single
// carried-over accordion (no per-day date groups): a "Carried over · N"
// accordion when anything is pending from before today, then today's active
// items flat, then a collapsed "Completed" section. Drag-to-nest, linked
// accordions and the new "Remind me" bell all keep working inside every region.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, merge, rowBase, tagChip } from '@/styles'
import { ymd } from '@/utils/dayGroups'
import { todayKey, isOverdueTodo } from '@/utils/rollover'
import { splitList, ageChip, oldestFromLabel } from '@/utils/listSplit'
import { relLabel } from '@/utils/upcoming'
import ListToolbar from '@/components/ListToolbar.vue'
import StatusPill from '@/components/StatusPill.vue'
import ShareGlobeButton from '@/components/ShareGlobeButton.vue'
import OfflineChip from '@/components/OfflineChip.vue'
import LinkProgressBar from '@/components/LinkProgressBar.vue'
import LinkedAccordion from '@/components/LinkedAccordion.vue'
import CarriedOverGroup from '@/components/CarriedOverGroup.vue'
import CompletedSection from '@/components/CompletedSection.vue'
import ProgressLine from '@/components/ProgressLine.vue'
import RemindBell from '@/components/RemindBell.vue'
import { nestedChildIds } from '@/utils/links'
import { useAccordionState } from '@/composables/useAccordionState'
import { useDragNest } from '@/composables/useDragNest'
import type { LinkRef, Todo } from '@/types'

const app = useAppStore()
const ui = useUiStore()
const { c, dark, s, panelStyle } = useStyles()
const { startDrag, targetState } = useDragNest()
const { todos, burst, hideCompleted } = storeToRefs(app)
const { now } = storeToRefs(ui)

defineExpose({ focus: () => app.openCreate('todo') })

const todayStr = computed(() => todayKey(new Date(now.value)))
function dayOf(t: Todo): string {
  return t.createdAt > 0 ? ymd(new Date(t.createdAt)) : ''
}

// Nested children render inside their parent's accordion, never as top-level
// rows, so they are filtered out of every region here.
const nestedIds = computed(() => nestedChildIds('todos', todos.value))
const topLevel = computed(() => todos.value.filter((t) => !nestedIds.value.has(t.id)))

const completedSort = ref<'recent' | 'original'>('recent')
const split = computed(() =>
  splitList(topLevel.value, {
    isDone: (t) => t.status === 'done',
    isCarried: (t) => isOverdueTodo(t, todayStr.value),
    completedAt: (t) => t.completedAt,
    archivedAt: (t) => t.archivedAt ?? null,
    completedOnDay: todayStr.value, // Completed shows what was done today
    completedSort: completedSort.value,
  }),
)
// Carried oldest-first by original day; today's active in list order.
const carried = computed(() =>
  [...split.value.carriedOver].sort((a, b) => dayOf(a).localeCompare(dayOf(b))),
)
const active = computed(() => split.value.active)
const completed = computed(() => split.value.completed)
const carriedSubtitle = computed(() => oldestFromLabel(carried.value.map(dayOf)))

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
    : { outline: '2px solid oklch(0.64 0.22 25)', outlineOffset: '1px' }
}

// --- linked-items nesting ---------------------------------------------------
const acc = useAccordionState()
function accKey(t: Todo) {
  return 'todos:' + t.id
}
function expanded(t: Todo) {
  return acc.isOpen(accKey(t))
}
function toggleExpand(t: Todo) {
  acc.toggle(accKey(t))
}
function orphanBreadcrumb(t: Todo): string {
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

// --- styles -----------------------------------------------------------------
const checkIcon = pxify({ display: 'block' })
function boxStyle(t: Todo) {
  return pxify({
    position: 'relative',
    flexShrink: 0,
    width: 25,
    height: 25,
    borderRadius: 8,
    border: '1.5px solid ' + (t.done ? c.value.accent : c.value.border),
    background: t.done ? c.value.accent : 'transparent',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    boxShadow: t.done ? 'inset 0 1px 0 rgba(255,255,255,0.35)' : 'none',
    transition:
      'background .3s cubic-bezier(.5,1.5,.5,1), border-color .3s ease, box-shadow .3s ease',
  })
}
function textStyle(t: Todo) {
  return pxify({
    fontSize: 14,
    lineHeight: 1.4,
    color: c.value.text,
    cursor: 'pointer',
    textDecoration: t.done ? 'line-through' : 'none',
    textDecorationColor: c.value.dim,
  })
}
const descStyle = computed(() =>
  pxify({ fontSize: 12, lineHeight: 1.4, color: c.value.dim, cursor: 'pointer' }),
)
function rowStyle(done = false) {
  return merge(rowBase(c.value), { opacity: done ? 0.55 : 1, position: 'relative' })
}
const rowsWrap = pxify({ display: 'flex', flexDirection: 'column', gap: 9, position: 'relative' })
const gripDots = [0, 1, 2, 3, 4, 5]
function chipStyle(tag: string) {
  return pxify(tagChip(c.value, tag, dark.value))
}
const particles = [0, 1, 2, 3, 4, 5]
function particleStyle(i: number) {
  const a = (i * Math.PI) / 3
  return pxify({
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: c.value.accent,
    boxShadow: '0 0 6px ' + c.value.accent,
    pointerEvents: 'none',
    '--tx': (Math.cos(a) * 22).toFixed(1) + 'px',
    '--ty': (Math.sin(a) * 22).toFixed(1) + 'px',
    animation: 'burst .6s ease-out forwards',
  })
}
function linkOf(t: Todo) {
  return app.linkProgressOf({ id: t.id, collection: 'todos' })
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
function chevronStyle(t: Todo) {
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
function accBodyOuter(t: Todo) {
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
const doneAgo = (t: Todo) => (t.completedAt ? relLabel(t.completedAt - now.value) : '')
</script>

<template>
  <div :style="panelStyle">
    <ListToolbar title="Todos" new-label="New todo" @new="app.openCreate('todo')">
      <template #actions>
        <button v-if="anyLinked" type="button" :style="linkExpandBtn" @click="toggleAll">
          {{ allExpanded ? 'Collapse links' : 'Expand links' }}
        </button>
      </template>
    </ListToolbar>
    <ProgressLine :done="split.stats.done" :total="split.stats.total" />
    <div v-if="todos.length === 0" :style="s.empty">Nothing yet — add your first todo.</div>

    <!-- 1. Carried over accordion (only when non-empty) -->
    <CarriedOverGroup
      v-if="carried.length > 0"
      collection="todos"
      :count="carried.length"
      :subtitle="carriedSubtitle"
    >
      <div v-for="t in carried" :key="t.id" :style="parentCardStyle">
        <div
          :style="[rowStyle(), nestHighlight(t.id)]"
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
          <div :style="s.taskMain" @click="app.openEdit('todo', t.id)">
            <span :style="textStyle(t)">{{ t.text }}</span>
            <span v-if="t.description" :style="descStyle">{{ t.description }}</span>
            <div :style="s.chipRow">
              <span v-if="t.tag" :style="chipStyle(t.tag)">{{ t.tag }}</span>
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
      </div>
    </CarriedOverGroup>

    <!-- 2. Today's active items, flat, no date headers -->
    <TransitionGroup name="rowflip" tag="div" :style="rowsWrap">
      <div v-for="t in active" :key="t.id" :style="parentCardStyle">
        <div
          :style="[rowStyle(), nestHighlight(t.id)]"
          v-hover-style="s.rowHover"
          :data-nest-id="t.id"
          data-nest-collection="todos"
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
          <button :style="boxStyle(t)" @click="app.toggleTodo(t.id)">
            <template v-if="burst === t.id">
              <span v-for="i in particles" :key="i" :style="particleStyle(i)"></span>
            </template>
          </button>
          <div :style="s.taskMain" @click="app.openEdit('todo', t.id)">
            <span :style="textStyle(t)">{{ t.text }}</span>
            <span v-if="t.description" :style="descStyle">{{ t.description }}</span>
            <div v-if="t.tag || t.linked.length" :style="s.chipRow">
              <span v-if="t.tag" :style="chipStyle(t.tag)">{{ t.tag }}</span>
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
            <OfflineChip :pending="app.isItemPending('todo', t.id)" />
          </div>
          <RemindBell collection="todos" :id="t.id" />
          <StatusPill :status="t.status" @cycle="app.cycleTodoStatus(t.id)" />
          <ShareGlobeButton entity-type="todo" :item="t" variant="row" />
          <button :style="s.del" @click="app.deleteWithUndo('todos', 'todo', t.id)">×</button>
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
                :parent-ref="{ id: t.id, collection: 'todos' }"
                :depth="0"
                :is-root="false"
              />
            </div>
          </div>
        </div>
      </div>
    </TransitionGroup>

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
      <div v-for="t in completed" :key="t.id" :style="rowStyle(true)">
        <button :style="boxStyle(t)" @click="app.toggleTodo(t.id)">
          <svg
            v-if="t.done"
            :style="checkIcon"
            width="13"
            height="13"
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
        <div :style="s.taskMain" @click="app.openEdit('todo', t.id)">
          <span :style="textStyle(t)">{{ t.text }}</span>
          <div :style="s.chipRow">
            <span v-if="t.tag" :style="chipStyle(t.tag)">{{ t.tag }}</span>
            <span :style="doneMetaStyle">done {{ doneAgo(t) }}</span>
          </div>
        </div>
        <button :style="s.del" @click="app.deleteWithUndo('todos', 'todo', t.id)">×</button>
      </div>
    </CompletedSection>
  </div>
</template>
