<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, merge, rowBase } from '@/styles'
import type { Task } from '@/types'

const app = useAppStore()
const { c, s, panelStyle } = useStyles()
const { tasks, githubCache, draggingId } = storeToRefs(app)

const title = ref('')
const tag = ref('')
const taskInputRef = ref<HTMLInputElement | null>(null)
defineExpose({ focus: () => taskInputRef.value?.focus() })

function add() {
  app.addTask(title.value, tag.value)
  title.value = ''
  tag.value = ''
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') add()
}

function rel(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

interface Group {
  key: string
  label: string
  date: string
  tasks: Task[]
}
const groups = computed<Group[]>(() => {
  const todayStr = rel(0)
  const tomorrowStr = rel(1)
  const byDate: Record<string, Task[]> = {}
  tasks.value.forEach((t) => {
    const d = t.deadline || ''
    ;(byDate[d] = byDate[d] || []).push(t)
  })
  const otherDates = Object.keys(byDate)
    .filter((d) => d && d !== todayStr && d !== tomorrowStr)
    .sort()
  const defs: { key: string; label: string; date: string }[] = [
    { key: 'today', label: 'Today', date: todayStr },
  ]
  if (byDate[tomorrowStr]) defs.push({ key: 'tomorrow', label: 'Tomorrow', date: tomorrowStr })
  otherDates.forEach((d) =>
    defs.push({
      key: d,
      label: new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      date: d,
    }),
  )
  defs.push({ key: 'nodate', label: 'No date', date: '' })
  return defs.map((g) => ({ ...g, tasks: byDate[g.date] || [] }))
})

const dragging = computed(() => draggingId.value != null)
const groupStyle = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
    padding: '10px 12px 12px',
    borderRadius: 18,
    border: '1.5px dashed ' + (dragging.value ? c.value.accent : c.value.border),
    background: dragging.value ? c.value.input : 'transparent',
    transition: 'border-color .25s ease, background .25s ease',
  }),
)

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
    transform: isDrag ? 'scale(1.03)' : 'none',
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
function statusStyle(t: Task) {
  return pxify({
    flexShrink: 0,
    fontSize: 10,
    padding: '5px 10px',
    borderRadius: 8,
    border: '1px solid ' + c.value.border,
    cursor: 'pointer',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    background: t.done ? c.value.accent : 'transparent',
    color: t.done ? c.value.onAccent : c.value.dim,
    transition: 'background .3s ease, color .3s ease',
  })
}
function repoDotStyle(t: Task) {
  const col = ciColor(t)
  return pxify({ width: 7, height: 7, borderRadius: '50%', background: col, boxShadow: '0 0 6px ' + col, flexShrink: 0, marginRight: 5 })
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
function onGroupDragOver(e: DragEvent) {
  e.preventDefault()
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
    <div :style="s.inputRow">
      <input ref="taskInputRef" :style="s.input" placeholder="Task title…" v-model="title" @keydown="onKey" />
    </div>
    <div :style="s.inputRow">
      <input :style="s.input" placeholder="Project tag (optional)" v-model="tag" @keydown="onKey" />
      <button :style="s.addBtn" v-hover-style="s.addBtnHover" @click="add">+</button>
    </div>
    <div :style="s.dayGroups">
      <div v-for="g in groups" :key="g.key" :style="groupStyle" @dragover="onGroupDragOver" @drop="onGroupDrop($event, g)">
        <div :style="s.dayGroupHead">
          <span :style="s.dayGroupLabelBase">{{ g.label }}</span>
          <span :style="s.dayCount">{{ g.tasks.length }}</span>
        </div>
        <div v-if="g.tasks.length === 0" :style="s.dayDropHint">Drop tasks here</div>
        <div
          v-for="t in g.tasks"
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
          <span :style="s.grip"><span v-for="d in gripDots" :key="d" :style="s.gripDot"></span></span>
          <div :style="s.taskMain">
            <span :style="textStyle(t)">{{ t.title }}</span>
            <div :style="s.chipRow">
              <span v-if="t.tag" :style="s.chip">{{ t.tag }}</span>
              <span v-if="t.repo" :style="repoChipStyle"><span :style="repoDotStyle(t)"></span>{{ t.repo }}</span>
            </div>
          </div>
          <button :style="statusStyle(t)" @click.stop="app.toggleTask(t.id)">{{ t.done ? 'done' : 'open' }}</button>
          <button :style="s.shareBtn" @click.stop="app.share('task', t)">↗</button>
          <button :style="s.del" @click.stop="app.deleteWithUndo('tasks', 'task', t.id)">×</button>
        </div>
      </div>
    </div>
  </div>
</template>
