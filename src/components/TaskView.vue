<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import type { Task } from '@/types'

const app = useAppStore()
const { c, s } = useStyles()
const { taskViewId, tasks } = storeToRefs(app)

const task = computed<Task | undefined>(() => tasks.value.find((t) => t.id === taskViewId.value))
const dueLabel = computed(() =>
  task.value?.deadline
    ? new Date(task.value.deadline + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : 'No due date',
)
const statusChip = computed(() =>
  pxify({
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: 700,
    padding: '5px 13px',
    borderRadius: 999,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    background: task.value?.done ? c.value.accent : 'transparent',
    color: task.value?.done ? c.value.onAccent : c.value.dim,
    border: '1px solid ' + (task.value?.done ? c.value.accent : c.value.border),
  }),
)
</script>

<template>
  <template v-if="taskViewId != null">
    <div :style="s.taskViewOverlay"></div>
    <div :style="s.taskViewPage">
      <button :style="s.taskViewBack" @click="app.closeTaskView()">← Back</button>
      <div v-if="task" :style="s.taskViewCard">
        <span :style="statusChip">{{ task.done ? 'Done' : 'Open' }}</span>
        <span :style="s.taskViewTitle">{{ task.title }}</span>
        <div :style="s.taskViewMeta">
          <div :style="s.taskViewMetaItem"><span :style="s.taskViewMetaLabel">Due</span><span :style="s.taskViewMetaVal">{{ dueLabel }}</span></div>
          <div v-if="task.tag" :style="s.taskViewMetaItem"><span :style="s.taskViewMetaLabel">Project</span><span :style="s.taskViewMetaVal">{{ task.tag }}</span></div>
          <div v-if="task.repo" :style="s.taskViewMetaItem"><span :style="s.taskViewMetaLabel">Repo</span><span :style="s.taskViewMetaVal">{{ task.repo }}</span></div>
        </div>
        <div v-if="task.notes && task.notes.trim()" :style="s.taskViewNotes">{{ task.notes }}</div>
      </div>
    </div>
  </template>
</template>
