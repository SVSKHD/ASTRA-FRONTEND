<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { useDayList } from '@/composables/useDayList'
import { pxify, merge, rowBase, dayBody, dayGroupCard, tagChip } from '@/styles'
import { buildDayGroups } from '@/utils/dayGroups'
import DayGroupHead from '@/components/DayGroupHead.vue'
import DayToolbar from '@/components/DayToolbar.vue'
import StatusPill from '@/components/StatusPill.vue'
import RolloverButton from '@/components/RolloverButton.vue'
import type { Task } from '@/types'

const app = useAppStore()
const ui = useUiStore()
const { c, dark, s, panelStyle } = useStyles()
const { tasks, githubCache, draggingId } = storeToRefs(app)
// Reactive clock so the deadline buckets re-file at midnight without a refresh.
const { now } = storeToRefs(ui)

// Creating and editing both happen in a dialog now, so N / ⌘K opens that
// instead of focusing a form the tab no longer carries.
defineExpose({ focus: () => app.openCreate('task') })

// A folded day animates from 0fr to 1fr rather than being removed, which is
// what gives the accordion a real height transition instead of a jump.
function bodyStyle(open: boolean) {
  return pxify(dayBody(open))
}

// Same day-wise shape as the todo list, keyed off the deadline instead of the
// creation day — hence 'future', which pins Today then Tomorrow.
const groups = computed(() =>
  buildDayGroups(tasks.value, (t) => t.deadline || '', {
    direction: 'future',
    undatedLabel: 'No date',
    keepEmptyUndated: true,
    now: new Date(now.value),
  }),
)
type Group = (typeof groups.value)[number] // the drop handlers need the shape
const day = useDayList('tasks', groups)

const dragging = computed(() => draggingId.value != null)
const groupStyle = computed(() => pxify(dayGroupCard(c.value, dragging.value)))

function ciColor(t: Task) {
  const gh = githubCache.value[t.id]
  if (!gh || gh.status === 'loading') return c.value.dim
  return gh.data.ci === 'passing' ? 'oklch(0.7 0.15 145)' : 'oklch(0.65 0.2 25)'
}
function rowStyle(t: Task) {
  const isDrag = draggingId.value === t.id
  return merge(rowBase(c.value), {
    opacity: t.done ? 0.5 : 1,
    cursor: 'pointer',
    position: 'relative',
    // Idle transform stays unset so the FLIP `move` transform is not blocked.
    transform: isDrag ? 'scale(1.03)' : undefined,
    boxShadow: isDrag ? '0 18px 40px rgba(0,0,0,0.45)' : undefined,
    zIndex: isDrag ? 5 : 'auto',
  })
}
const rowsWrap = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 9,
  position: 'relative',
})
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

// Click vs. double-click discrimination (single → dialog, double → task view).
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

function onDragStart(e: DragEvent, t: Task) {
  app.setDragId(t.id)
  try {
    e.dataTransfer!.effectAllowed = 'move'
    e.dataTransfer!.setData('text/plain', String(t.id))
  } catch {
    /* ignore */
  }
}
function onDragEnd() {
  app.setDragId(null)
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
function onRowDrop(e: DragEvent, t: Task) {
  e.preventDefault()
  e.stopPropagation()
  app.dropOnTask(t.id)
}
function onGroupDragOver(e: DragEvent, g: Group) {
  e.preventDefault()
  // A drag heading for a folded day should not have to be aborted to open it.
  day.openForDrop(g)
  try {
    e.dataTransfer!.dropEffect = 'move'
  } catch {
    /* ignore */
  }
}
function onGroupDrop(e: DragEvent, g: Group) {
  e.preventDefault()
  app.dropOnGroup(g.date)
}
</script>

<template>
  <div :style="panelStyle">
    <RolloverButton />
    <DayToolbar
      :filter="day.filter.value"
      :all-open="day.allOpen.value"
      new-label="New task"
      @filter="day.setFilter"
      @fold="day.foldAll"
      @new="app.openCreate('task')"
    />
    <div :style="s.dayGroups">
      <div
        v-for="g in groups"
        :key="g.key"
        :style="groupStyle"
        @dragover="onGroupDragOver($event, g)"
        @drop="onGroupDrop($event, g)"
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
            <div v-if="g.total === 0" :style="s.dayDropHint">Drop tasks here</div>
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
                @click="onRowClick(t)"
                @dblclick="onRowDblClick(t)"
              >
                <span :style="s.grip"
                  ><span v-for="d in gripDots" :key="d" :style="s.gripDot"></span
                ></span>
                <div :style="s.taskMain">
                  <span :style="textStyle(t)">{{ t.title }}</span>
                  <div :style="s.chipRow">
                    <span v-if="t.tag" :style="chipStyle(t.tag)">{{ t.tag }}</span>
                    <span v-if="t.repo" :style="repoChipStyle"
                      ><span :style="repoDotStyle(t)"></span>{{ t.repo }}</span
                    >
                  </div>
                </div>
                <StatusPill :status="t.status" @cycle="app.cycleTaskStatus(t.id)" />
                <button :style="s.shareBtn" @click.stop="app.share('task', t)">↗</button>
                <button :style="s.del" @click.stop="app.deleteWithUndo('tasks', 'task', t.id)">
                  ×
                </button>
              </div>
            </TransitionGroup>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
