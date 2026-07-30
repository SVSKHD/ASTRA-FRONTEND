<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useDayList } from '@/composables/useDayList'
import { pxify, merge, rowBase, dayBody, dayGroupCard, tagChip } from '@/styles'
import { buildDayGroups, ymd } from '@/utils/dayGroups'
import DayGroupHead from '@/components/DayGroupHead.vue'
import DayToolbar from '@/components/DayToolbar.vue'
import StatusPill from '@/components/StatusPill.vue'
import ShareGlobeButton from '@/components/ShareGlobeButton.vue'
import OfflineChip from '@/components/OfflineChip.vue'
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
    />
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
            <div v-if="g.total === 0" :style="s.dayDropHint">Drop a todo here</div>
            <div v-else-if="day.visible(g).length === 0" :style="s.dayDropHint">
              {{ day.hiddenBy(g) }} hidden by the filter
            </div>
            <TransitionGroup v-else name="rowflip" tag="div" :style="rowsWrap">
              <div
                v-for="t in day.visible(g)"
                :key="t.id"
                :style="rowStyle(t)"
                v-hover-style="s.rowHover"
                draggable="true"
                @dragstart="onDragStart($event, t)"
                @dragend="onDragEnd"
                @dragover="onRowDragOver"
                @drop="onRowDrop($event, t)"
              >
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
                  <div v-if="t.tag" :style="s.chipRow">
                    <span :style="chipStyle(t.tag)">{{ t.tag }}</span>
                  </div>
                  <OfflineChip :pending="app.isItemPending('todo', t.id)" />
                </div>
                <StatusPill :status="t.status" @cycle="app.cycleTodoStatus(t.id)" />
                <ShareGlobeButton entity-type="todo" :item="t" variant="row" />
                <button :style="s.del" @click="app.deleteWithUndo('todos', 'todo', t.id)">×</button>
              </div>
            </TransitionGroup>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
