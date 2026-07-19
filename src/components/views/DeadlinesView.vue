<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, rowBase } from '@/styles'
import { urg } from '@/utils/colors'
import type { Deadline } from '@/types'

const app = useAppStore()
const { c, dark, s, panelStyle } = useStyles()
const { deadlines, editing, draft } = storeToRefs(app)

const title = ref('')
const date = ref('')
const dlInputRef = ref<HTMLInputElement | null>(null)
defineExpose({ focus: () => dlInputRef.value?.focus() })

function add() {
  app.addDeadline(title.value, date.value)
  title.value = ''
  date.value = ''
}

const today = computed(() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})

interface DlView extends Deadline {
  days: number
  badge: string
  dateLabel: string
  col: string
}
const view = computed<DlView[]>(() =>
  [...deadlines.value]
    .sort((a, b) => (a.due < b.due ? -1 : 1))
    .map((t) => {
      const due = new Date(t.due + 'T00:00:00')
      const days = Math.round((due.getTime() - today.value.getTime()) / 86400000)
      const col = urg(days, dark.value)
      return {
        ...t,
        days,
        col,
        badge: days < 0 ? 'past' : days === 0 ? 'today' : days + 'd',
        dateLabel: due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      }
    }),
)

function isEditing(t: Deadline) {
  return editing.value.type === 'deadline' && editing.value.id === t.id
}
function badgeStyle(col: string) {
  return pxify({
    flexShrink: 0,
    minWidth: 46,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 600,
    padding: '6px 9px',
    borderRadius: 10,
    background: 'transparent',
    color: col,
    border: '1px solid ' + col,
    boxShadow: dark.value ? '0 0 12px ' + col : 'none',
    letterSpacing: '0.02em',
  })
}
const row = computed(() => pxify(rowBase(c.value)))
</script>

<template>
  <div :style="panelStyle">
    <div :style="s.inputRow">
      <input ref="dlInputRef" :style="s.input" placeholder="What's due…" v-model="title" />
    </div>
    <div :style="s.inputRow">
      <input :style="s.input" type="date" v-model="date" />
      <button :style="s.addBtn" v-hover-style="s.addBtnHover" @click="add">+</button>
    </div>
    <div v-if="deadlines.length === 0" :style="s.empty">No deadlines set.</div>
    <div :style="s.list">
      <div v-for="t in view" :key="t.id" :style="row" v-hover-style="s.rowHover">
        <template v-if="isEditing(t)">
          <div :style="s.taskMain">
            <input
              :style="s.editInput"
              :value="(draft.title as string)"
              @input="app.setDraft('title', ($event.target as HTMLInputElement).value)"
              autofocus
            />
            <input
              :style="s.editInputSmall"
              type="date"
              :value="(draft.due as string)"
              @input="app.setDraft('due', ($event.target as HTMLInputElement).value)"
            />
          </div>
          <button :style="s.saveBtn" @click="app.saveEdit()">Save</button>
          <button :style="s.cancelBtn" @click="app.cancelEdit()">Cancel</button>
        </template>
        <template v-else>
          <span :style="badgeStyle(t.col)">{{ t.badge }}</span>
          <div :style="s.taskMain">
            <span :style="s.dlTitle" @click="app.startEdit('deadline', t)">{{ t.title }}</span>
            <span :style="s.dlDate">{{ t.dateLabel }}</span>
          </div>
          <button :style="s.shareBtn" @click="app.share('deadline', t)">↗</button>
          <button :style="s.del" @click="app.deleteWithUndo('deadlines', 'deadline', t.id)">×</button>
        </template>
      </div>
    </div>
  </div>
</template>
