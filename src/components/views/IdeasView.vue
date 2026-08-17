<script setup lang="ts">
// Ideas are a flat, filterable list rather than a day accordion: they have no
// lifecycle status, and their deadline (when set) also feeds the top ticker.
// Create and edit both live in ItemDialog, so this tab carries no add-form.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, rowBase, tagChip } from '@/styles'
import { urg } from '@/utils/colors'
import ListToolbar from '@/components/ListToolbar.vue'
import { IDEA_TYPE_OPTIONS } from '@/types'
import type { Idea } from '@/types'

const app = useAppStore()
const { c, dark, s, panelStyle } = useStyles()
const { ideas, tags } = storeToRefs(app)

defineExpose({ focus: () => app.openCreate('idea') })

const typeFilter = ref<string>('all')
const tagFilter = ref<string>('all')
const sortKey = ref<'deadline' | 'updated' | 'title'>('deadline')

const today = computed(() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})

interface IdeaRow extends Idea {
  typeLabel: string
  hasDue: boolean
  dueBadge: string
  dueCol: string
}

const view = computed<IdeaRow[]>(() => {
  let list = ideas.value.slice()
  if (typeFilter.value !== 'all') list = list.filter((i) => i.ideaType === typeFilter.value)
  if (tagFilter.value !== 'all') list = list.filter((i) => i.tag === tagFilter.value)

  const rows = list.map((i) => {
    const hasDue = !!i.deadline
    const due = hasDue ? new Date(i.deadline + 'T00:00:00') : null
    const days = due ? Math.round((due.getTime() - today.value.getTime()) / 86400000) : 0
    const opt = IDEA_TYPE_OPTIONS.find((o) => o.value === i.ideaType)
    return {
      ...i,
      typeLabel: opt ? opt.label : i.ideaType || '—',
      hasDue,
      dueCol: hasDue ? urg(days, dark.value) : c.value.dim,
      dueBadge: !hasDue ? '' : days < 0 ? 'past' : days === 0 ? 'today' : days + 'd',
    }
  })

  rows.sort((a, b) => {
    if (sortKey.value === 'title') return a.title.localeCompare(b.title)
    if (sortKey.value === 'updated') return b.updatedAt - a.updatedAt
    // deadline: dated first (soonest first), undated sink to the bottom.
    if (a.hasDue && b.hasDue) return a.deadline < b.deadline ? -1 : 1
    if (a.hasDue) return -1
    if (b.hasDue) return 1
    return b.updatedAt - a.updatedAt
  })
  return rows
})

const row = computed(() => pxify(rowBase(c.value)))
function chipStyle(tag: string) {
  return pxify(tagChip(c.value, tag, dark.value))
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
const typeBadge = computed(() =>
  pxify({
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    padding: '3px 8px',
    borderRadius: 8,
    color: c.value.dim,
    border: '1px solid ' + c.value.border,
    background: c.value.input,
  }),
)
const filterBar = pxify({
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  padding: '0 2px 10px',
})
const metaStyle = computed(() =>
  pxify({ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3 }),
)
</script>

<template>
  <div :style="panelStyle">
    <ListToolbar title="Ideas" new-label="New idea" @new="app.openCreate('idea')" />

    <div v-if="ideas.length" :style="filterBar">
      <select
        :style="s.select"
        :value="typeFilter"
        @change="typeFilter = ($event.target as HTMLSelectElement).value"
      >
        <option value="all">All types</option>
        <option v-for="o in IDEA_TYPE_OPTIONS" :key="o.value" :value="o.value">
          {{ o.label }}
        </option>
      </select>
      <select
        :style="s.select"
        :value="tagFilter"
        @change="tagFilter = ($event.target as HTMLSelectElement).value"
      >
        <option value="all">All tags</option>
        <option v-for="t in tags" :key="t" :value="t">{{ t }}</option>
      </select>
      <select
        :style="s.select"
        :value="sortKey"
        @change="sortKey = ($event.target as HTMLSelectElement).value as typeof sortKey"
      >
        <option value="deadline">By deadline</option>
        <option value="updated">Recently updated</option>
        <option value="title">By title</option>
      </select>
    </div>

    <div v-if="ideas.length === 0" :style="s.empty">No ideas yet. Brainstorm one.</div>
    <div v-else-if="view.length === 0" :style="s.empty">No ideas match these filters.</div>
    <div :style="s.list">
      <!-- The row re-renders only when something it draws changes. `c` is in the
           list because every style below is theme-derived, so a theme switch has
           to invalidate the memo along with the data. -->
      <div
        v-for="t in view"
        :key="t.id"
        v-memo="[t.title, t.tag, t.typeLabel, t.hasDue, t.dueBadge, t.dueCol, t.noteIds.length, c]"
        :style="row"
        v-hover-style="s.rowHover"
      >
        <span v-if="t.hasDue" :style="badgeStyle(t.dueCol)">{{ t.dueBadge }}</span>
        <div :style="s.taskMain" @click="app.openEdit('idea', t.id)">
          <span :style="s.dlTitle">{{ t.title }}</span>
          <div :style="metaStyle">
            <span :style="typeBadge">{{ t.typeLabel }}</span>
            <span v-if="t.tag" :style="chipStyle(t.tag)">{{ t.tag }}</span>
            <span v-if="t.noteIds.length" :style="s.dlDate">
              {{ t.noteIds.length }} note{{ t.noteIds.length === 1 ? '' : 's' }}
            </span>
          </div>
        </div>
        <button :style="s.shareBtn" @click="app.share('idea', t)">↗</button>
        <button :style="s.del" @click="app.deleteWithUndo('ideas', 'idea', t.id)">×</button>
      </div>
    </div>
  </div>
</template>
