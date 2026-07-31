<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useDayList } from '@/composables/useDayList'
import { useMovePending } from '@/composables/useMovePending'
import { pxify, merge, rowBase, dayBody, dayGroupCard, tagChip } from '@/styles'
import { buildDayGroups, ymd } from '@/utils/dayGroups'
import { todayKey } from '@/utils/rollover'
import DayGroupHead from '@/components/DayGroupHead.vue'
import DayToolbar from '@/components/DayToolbar.vue'
import StatusPill from '@/components/StatusPill.vue'
import ShareGlobeButton from '@/components/ShareGlobeButton.vue'
import OfflineChip from '@/components/OfflineChip.vue'
import MovePendingButton from '@/components/MovePendingButton.vue'
import LinkProgressBar from '@/components/LinkProgressBar.vue'
import LinkedAccordion from '@/components/LinkedAccordion.vue'
import { nestedChildIds } from '@/utils/links'
import { useAccordionState } from '@/composables/useAccordionState'
import type { Todo } from '@/types'

const app = useAppStore()
const ui = useUiStore()
const { c, dark, s, panelStyle } = useStyles()
const { todos, burst, draggingTodoId } = storeToRefs(app)
// The reactive clock (ticks every 60s + on focus/resume). Reading it in the
// grouping computed is what makes the day buckets recompute at midnight, so a
// todo written "yesterday" migrates into Today on its own — no refresh.
const { now } = storeToRefs(ui)

// Creating and editing both happen in ItemDialog now, so N / ⌘K opens that
// instead of focusing a form the tab no longer carries.
defineExpose({ focus: () => app.openCreate('todo') })

// The Today empty state offers a secondary "move pending here" entry point; it
// only shows when Today is empty and there are overdue pending todos to move.
const moveTodos = useMovePending('todos')
const todayStr = computed(() => todayKey(new Date(now.value)))

// Todos have no deadline, so the day they belong to is the day they were
// written. Legacy todos carry createdAt 0 and fall into the undated bucket.
function dayOf(t: Todo) {
  return t.createdAt > 0 ? ymd(new Date(t.createdAt)) : ''
}
const groups = computed(() =>
  buildDayGroups(todos.value, dayOf, {
    direction: 'past',
    undatedLabel: 'Undated',
    now: new Date(now.value),
  }),
)
const day = useDayList('todo', groups)

// A folded day animates from 0fr to 1fr rather than being removed, which is
// what gives the accordion a real height transition instead of a jump.
function bodyStyle(open: boolean) {
  return pxify(dayBody(open))
}

// --- drag between days ------------------------------------------------------
// Dropping a todo on another day rewrites its createdAt to that day, which is
// what actually moves it between cards.
const dragging = computed(() => draggingTodoId.value != null)
const groupStyle = computed(() => pxify(dayGroupCard(c.value, dragging.value)))

function onDragStart(e: DragEvent, t: Todo) {
  app.setTodoDragId(t.id)
  try {
    e.dataTransfer!.effectAllowed = 'move'
    e.dataTransfer!.setData('text/plain', String(t.id))
  } catch {
    /* ignore */
  }
}
function onDragEnd() {
  app.endTodoDrag()
}
function allowDrop(e: DragEvent) {
  e.preventDefault()
  try {
    e.dataTransfer!.dropEffect = 'move'
  } catch {
    /* ignore */
  }
}
function onRowDragOver(e: DragEvent) {
  e.stopPropagation()
  allowDrop(e)
}
function onRowDrop(e: DragEvent, t: Todo) {
  e.preventDefault()
  e.stopPropagation()
  app.dropTodoOnTodo(t.id)
}

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
// The row's text block is now a taskMain column (text / description / tag), so
// the flex-grow that used to live here belongs to that wrapper instead.
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
function rowStyle(t: Todo) {
  const isDrag = draggingTodoId.value === t.id
  return merge(rowBase(c.value), {
    opacity: t.done ? 0.5 : 1,
    position: 'relative',
    // Leave transform unset when idle so TransitionGroup's FLIP `move` (a
    // class-injected transform) is not overridden by an inline one.
    transform: isDrag ? 'scale(1.03)' : undefined,
    boxShadow: isDrag ? '0 18px 40px rgba(0,0,0,0.45)' : undefined,
    zIndex: isDrag ? 5 : 'auto',
  })
}
// The rows wrapper is positioned so a leaving row (position:absolute) collapses
// the day's height under it instead of jumping the siblings.
const rowsWrap = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 9,
  position: 'relative',
})
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

const todayCtaStyle = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    padding: '10px 6px',
    fontSize: 13,
    color: c.value.dim,
    textAlign: 'center',
  }),
)

// Direct-link progress for a todo's list-card chain badge + bottom line.
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
// The thin progress line hugs the bottom edge of the card, inset past the
// rounded corners.
const linkLineWrap = pxify({ position: 'absolute', left: 12, right: 12, bottom: 3 })

// --- linked-items nesting ---------------------------------------------------
// Children whose parent is a visible todo are hidden from the top level and
// rendered inside the parent's accordion instead. `present` is every visible
// todo across the day groups; a child whose parent is filtered out (or is a
// task) stays top-level with a breadcrumb rather than vanishing.
const acc = useAccordionState()
const present = computed(() => groups.value.flatMap((g) => day.visible(g)))
const nestedIds = computed(() => nestedChildIds('todos', present.value))
function topRows(g: (typeof groups.value)[number]): Todo[] {
  return day.visible(g).filter((t) => !nestedIds.value.has(t.id))
}
function accKey(t: Todo) {
  return 'todos:' + t.id
}
function expanded(t: Todo) {
  return acc.isOpen(accKey(t))
}
function toggleExpand(t: Todo) {
  acc.toggle(accKey(t))
}
// A top-level todo that still has parents is an orphan here (parent absent from
// this view) — name the parents so the link isn't hidden.
function orphanBreadcrumb(t: Todo): string {
  return t.parents
    .map((p) => app.linkableById(p))
    .filter((it): it is NonNullable<typeof it> => !!it)
    .map((it) => ('text' in it ? it.text : it.title))
    .join(', ')
}
const parentKeys = computed(() =>
  present.value.filter((t) => t.linked.length > 0).map((t) => accKey(t)),
)
const anyLinked = computed(() => parentKeys.value.length > 0)
const allExpanded = computed(
  () => parentKeys.value.length > 0 && parentKeys.value.every((k) => acc.isOpen(k)),
)
function toggleAll() {
  acc.setMany(parentKeys.value, !allExpanded.value)
}

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
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '8px 6px 2px 30px',
  }),
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
</script>

<template>
  <div :style="panelStyle">
    <DayToolbar
      :filter="day.filter.value"
      :all-open="day.allOpen.value"
      new-label="New todo"
      @filter="day.setFilter"
      @fold="day.foldAll"
      @new="app.openCreate('todo')"
    >
      <template #action>
        <button v-if="anyLinked" type="button" :style="linkExpandBtn" @click="toggleAll">
          {{ allExpanded ? 'Collapse links' : 'Expand links' }}
        </button>
        <MovePendingButton collection="todos" />
      </template>
    </DayToolbar>
    <div v-if="todos.length === 0" :style="s.empty">Nothing yet — add your first todo.</div>
    <div :style="s.dayGroups">
      <div
        v-for="g in groups"
        :key="g.key"
        :style="groupStyle"
        @dragover="(allowDrop($event), day.openForDrop(g))"
        @drop.prevent="app.dropTodoOnDay(g.date)"
      >
        <DayGroupHead
          :label="g.label"
          :counts="g.counts"
          :total="g.total"
          :open="day.isOpen(g)"
          @toggle="day.toggle(g)"
        />
        <div :style="bodyStyle(day.isOpen(g))">
          <div :style="s.dayBodyInner">
            <div
              v-if="g.total === 0 && g.date === todayStr && moveTodos.count.value > 0"
              :style="todayCtaStyle"
            >
              <span>Nothing due today — move {{ moveTodos.count.value }} pending todos here?</span>
              <MovePendingButton collection="todos" />
            </div>
            <div v-else-if="g.total === 0" :style="s.dayDropHint">Drop a todo here</div>
            <div v-else-if="day.visible(g).length === 0" :style="s.dayDropHint">
              {{ day.hiddenBy(g) }} hidden by the filter
            </div>
            <TransitionGroup v-else name="rowflip" tag="div" :style="rowsWrap">
              <div v-for="t in topRows(g)" :key="t.id" :style="parentCardStyle">
                <div
                  :style="rowStyle(t)"
                  v-hover-style="s.rowHover"
                  draggable="true"
                  @dragstart="onDragStart($event, t)"
                  @dragend="onDragEnd"
                  @dragover="onRowDragOver"
                  @drop="onRowDrop($event, t)"
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
                  <span :style="s.grip"
                    ><span v-for="d in gripDots" :key="d" :style="s.gripDot"></span
                  ></span>
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
                      <polyline
                        points="20 6 9 17 4 12"
                        style="animation: popIn 0.35s cubic-bezier(0.3, 1.6, 0.5, 1)"
                      />
                    </svg>
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
                  <StatusPill :status="t.status" @cycle="app.cycleTodoStatus(t.id)" />
                  <ShareGlobeButton entity-type="todo" :item="t" variant="row" />
                  <button :style="s.del" @click="app.deleteWithUndo('todos', 'todo', t.id)">
                    ×
                  </button>
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
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
