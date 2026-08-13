<script setup lang="ts">
// The Planning tab: node-graph boards for thinking a plan out visually, whose
// nodes can become — or link to — real tasks/todos. JointJS owns the canvas via
// usePlanningBoard (kept out of Vue reactivity); this view is the surrounding
// chrome — board switcher, toolbar and the selected-node actions.
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { usePlanningBoard } from '@/composables/usePlanningBoard'
import { pxify } from '@/styles'

const app = useAppStore()
const { c, s, panelStyle } = useStyles()
const { boards } = storeToRefs(app)

const activeBoardId = ref<number | null>(null)
const canvasEl = ref<HTMLElement | null>(null)

// Pick a board on load; create a first one on demand.
watch(
  boards,
  (list) => {
    if (activeBoardId.value == null && list.length) activeBoardId.value = list[0].id
  },
  { immediate: true, deep: true },
)

const board = computed(() => boards.value.find((b) => b.id === activeBoardId.value) ?? null)

const { selectedId, addNode, tidy, fitToContent, zoomIn, zoomOut, onWheel } = usePlanningBoard(
  canvasEl,
  activeBoardId,
)

const selectedNode = computed(() =>
  selectedId.value != null ? app.nodeById(selectedId.value) : null,
)

function newBoard() {
  activeBoardId.value = app.addBoard('Board ' + (boards.value.length + 1), 'tree')
}
function convertTask() {
  if (selectedId.value != null) app.convertNodeToTask(selectedId.value)
}
function convertTodo() {
  if (selectedId.value != null) app.convertNodeToTodo(selectedId.value)
}
function openLinked() {
  const n = selectedNode.value
  if (!n?.linkedType || n.linkedId == null) return
  if (n.linkedType === 'task') app.openTaskDialog(n.linkedId)
  else app.openEdit('todo', n.linkedId)
}
function deleteNode() {
  if (selectedId.value != null) app.removeNode(selectedId.value)
}

// The ⌘K / "new" contract: create a board if there is none, else add a node.
defineExpose({
  focus: () => (boards.value.length ? addNode('idea') : newBoard()),
})

onMounted(() => {
  if (!boards.value.length) newBoard()
})

// --- styles -----------------------------------------------------------------
const toolbar = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 10,
  }),
)
function btn(active = false) {
  return pxify({
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid ' + (active ? c.value.accent : c.value.border),
    background: active ? c.value.accent : 'transparent',
    color: active ? c.value.onAccent : c.value.text,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })
}
const boardTab = (active: boolean) => btn(active)
const canvasWrap = computed(() =>
  pxify({
    flex: 1,
    minHeight: 0,
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
    border: '1px solid ' + c.value.border,
    background: c.value.input,
  }),
)
const canvasStyle = pxify({ position: 'absolute', inset: 0 })
const spacer = pxify({ flex: 1 })
const hint = computed(() =>
  pxify({
    position: 'absolute',
    bottom: 12,
    left: 12,
    fontSize: 11,
    color: c.value.dim,
    pointerEvents: 'none',
    background: c.value.glass,
    padding: '4px 10px',
    borderRadius: 8,
  }),
)
</script>

<template>
  <div :style="panelStyle">
    <!-- Board switcher + create -->
    <div :style="toolbar">
      <button
        v-for="b in boards"
        :key="b.id"
        type="button"
        :style="boardTab(b.id === activeBoardId)"
        @click="activeBoardId = b.id"
      >
        {{ b.name }}
      </button>
      <button type="button" :style="btn()" @click="newBoard">+ Board</button>
    </div>

    <!-- Actions -->
    <div v-if="board" :style="toolbar">
      <button type="button" :style="btn()" @click="addNode('idea')">+ Node</button>
      <button type="button" :style="btn()" @click="tidy">Tidy tree</button>
      <button type="button" :style="btn()" @click="fitToContent">Fit</button>
      <button type="button" :style="btn()" @click="zoomOut">−</button>
      <button type="button" :style="btn()" @click="zoomIn">+</button>
      <span :style="spacer"></span>
      <template v-if="selectedNode">
        <template v-if="selectedNode.linkedType">
          <button type="button" :style="btn()" @click="openLinked">
            Open {{ selectedNode.linkedType }}
          </button>
        </template>
        <template v-else>
          <button type="button" :style="btn()" @click="convertTask">Convert to Task</button>
          <button type="button" :style="btn()" @click="convertTodo">Convert to Todo</button>
        </template>
        <button type="button" :style="btn()" @click="deleteNode">Delete</button>
      </template>
    </div>

    <div v-if="board" :style="canvasWrap">
      <div ref="canvasEl" :style="canvasStyle" @wheel="onWheel"></div>
      <div :style="hint">
        Drag nodes to arrange · drag between nodes to relate · scroll+⌘ to zoom
      </div>
    </div>
    <div v-else :style="s.empty">Create a board to start planning.</div>
  </div>
</template>
