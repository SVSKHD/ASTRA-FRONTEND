<script setup lang="ts">
// The Timeline sidebar: the notes drawer's sibling, on the same edge in the
// same glass. Where the notes drawer is a pile sorted by "last touched", this
// is a line — every feature written up on its day, months as sections, newest
// at the top — with each entry's tasks and notes on its card, one tap away.
//
// Writing happens in TimelineEditor, a dialog, for the same reason a note opens
// full-screen: a 380px column is the wrong place to write a spec.
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { noteLabel } from '@/utils/notes'
import {
  TIMELINE_STATUSES,
  TIMELINE_STATUS_LABEL,
  groupTimelineByMonth,
  searchTimeline,
  timelineDayLabel,
  timelineLabel,
  timelinePreview,
} from '@/utils/timeline'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import TextInput from '@/components/ui/TextInput.vue'
import type { TimelineStatus } from '@/types'

const ui = useUiStore()
const app = useAppStore()
const { c, s } = useStyles()
const { timelineOpen } = storeToRefs(ui)
const { timeline, tasks, todos, notes } = storeToRefs(app)

const query = ref('')
const status = ref<'all' | TimelineStatus>('all')

const taskById = computed(() => new Map(tasks.value.map((t) => [t.id, t])))
const todoById = computed(() => new Map(todos.value.map((t) => [t.id, t])))
const noteById = computed(() => new Map(notes.value.map((n) => [n.id, n])))

const months = computed(() => {
  const found = searchTimeline(
    timeline.value,
    query.value,
    (id) => taskById.value.get(id)?.title,
    (id) => todoById.value.get(id)?.text,
  )
  return groupTimelineByMonth(
    status.value === 'all' ? found : found.filter((e) => e.status === status.value),
  )
})
const shownCount = computed(() => months.value.reduce((n, m) => n + m.items.length, 0))
const filters = computed(() => [
  { value: 'all' as const, label: 'All', n: timeline.value.length },
  ...TIMELINE_STATUSES.map((st) => ({
    ...st,
    n: timeline.value.filter((e) => e.status === st.value).length,
  })),
])

// What still exists: a deleted task or note simply drops off the card.
function linkedTasks(ids: number[]) {
  return ids.flatMap((id) => {
    const t = taskById.value.get(id)
    return t ? [t] : []
  })
}
function linkedTodos(ids: number[]) {
  return ids.flatMap((id) => {
    const t = todoById.value.get(id)
    return t ? [t] : []
  })
}
function openTodo(id: number) {
  ui.toggleTimeline()
  app.openEdit('todo', id)
}
function linkedNotes(ids: number[]) {
  return ids.flatMap((id) => {
    const n = noteById.value.get(id)
    return n ? [n] : []
  })
}

function openTask(id: number) {
  ui.toggleTimeline()
  app.openEdit('task', id)
}
function openNote(id: number) {
  ui.toggleTimeline()
  app.openNoteView(id)
}

const drawerStyle = computed(() =>
  pxify({
    position: 'fixed',
    top: 16,
    right: 16,
    bottom: 16,
    width: 'min(88vw,380px)',
    zIndex: 7,
    background: c.value.glass,
    backdropFilter: 'blur(30px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    borderRadius: 'var(--radius-dialog)',
    boxShadow: c.value.shadow,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-3)',
    transform: 'translateX(' + (timelineOpen.value ? '0' : '150%') + ')',
    opacity: timelineOpen.value ? 1 : 0,
    pointerEvents: timelineOpen.value ? 'auto' : 'none',
    transition: 'transform .45s cubic-bezier(.5,1.3,.4,1), opacity .3s ease',
    overflow: 'hidden',
    color: c.value.text,
  }),
)
</script>

<template>
  <div v-if="timelineOpen" :style="s.overlay" @click="ui.toggleTimeline()"></div>
  <aside
    :style="drawerStyle"
    class="tld"
    aria-label="Timeline"
    :aria-hidden="!timelineOpen"
    :inert="!timelineOpen || undefined"
  >
    <div :style="s.drawerHeader">
      <span :style="s.drawerTitle">Timeline</span>
      <button :style="s.del" aria-label="Close timeline" @click="ui.toggleTimeline()">×</button>
    </div>

    <button :style="s.addBtn2" v-hover-style="s.addBtnHover" @click="app.newTimelineEntry()">
      + New entry
    </button>
    <TextInput
      v-if="timeline.length > 3"
      v-model="query"
      type="search"
      placeholder="Search the timeline…"
    />
    <div v-if="timeline.length" class="tld__filters" role="tablist" aria-label="Status">
      <button
        v-for="f in filters"
        :key="f.value"
        type="button"
        role="tab"
        class="tld__filter"
        :class="{ 'is-on': status === f.value }"
        :aria-selected="status === f.value"
        @click="status = f.value"
      >
        {{ f.label }} <span class="tld__filter-n">{{ f.n }}</span>
      </button>
    </div>

    <div v-if="!timeline.length" class="tld__empty">
      <span class="tld__empty-icon"><Icon name="clock" size="md" /></span>
      <strong>Nothing on the timeline yet</strong>
      <span>Write up a feature in markdown, date it, and link the tasks that build it.</span>
    </div>
    <div v-else-if="!shownCount" :style="s.empty">No entry matches that.</div>

    <div class="tld__list">
      <section v-for="m in months" :key="m.key" class="tld__month">
        <h3 class="tld__month-head">
          {{ m.label }} <span class="tld__month-n">{{ m.items.length }}</span>
        </h3>
        <ol class="tld__line">
          <li v-for="e in m.items" :key="e.id" class="tld__item" :class="'is-' + e.status">
            <span class="tld__dot" aria-hidden="true" />
            <div class="tld__card">
              <button type="button" class="tld__open" @click="app.openTimelineEntry(e.id)">
                <span class="tld__meta">
                  <span class="tld__date">{{ timelineDayLabel(e.date) }}</span>
                  <span class="tld__status">{{ TIMELINE_STATUS_LABEL[e.status] }}</span>
                </span>
                <span class="tld__title">{{ timelineLabel(e) }}</span>
                <span v-if="e.title && timelinePreview(e.body)" class="tld__preview">{{
                  timelinePreview(e.body)
                }}</span>
              </button>
              <div
                v-if="
                  linkedTasks(e.taskIds).length ||
                  linkedTodos(e.todoIds).length ||
                  linkedNotes(e.noteIds).length
                "
                class="tld__links"
              >
                <button
                  v-for="t in linkedTasks(e.taskIds)"
                  :key="'t' + t.id"
                  type="button"
                  class="tld__chip"
                  :class="{ 'is-done': t.status === 'done' }"
                  :title="'Open task: ' + t.title"
                  @click="openTask(t.id)"
                >
                  <Icon name="list" size="xs" />
                  <span class="tld__chip-t">{{ t.title }}</span>
                </button>
                <button
                  v-for="t in linkedTodos(e.todoIds)"
                  :key="'todo' + t.id"
                  type="button"
                  class="tld__chip"
                  :class="{ 'is-done': t.status === 'done' }"
                  :title="'Open todo: ' + t.text"
                  @click="openTodo(t.id)"
                >
                  <Icon name="list" size="xs" />
                  <span class="tld__chip-t">{{ t.text }}</span>
                </button>
                <button
                  v-for="n in linkedNotes(e.noteIds)"
                  :key="'n' + n.id"
                  type="button"
                  class="tld__chip"
                  :title="'Open note: ' + noteLabel(n)"
                  @click="openNote(n.id)"
                >
                  <Icon name="notebook" size="xs" />
                  <span class="tld__chip-t">{{ noteLabel(n, 32) }}</span>
                </button>
              </div>
              <span class="tld__actions">
                <IconButton label="Edit entry" size="sm" @click="app.openTimelineEntry(e.id)">
                  <Icon name="pencil" size="xs" />
                </IconButton>
                <IconButton label="Delete entry" size="sm" @click="app.removeTimelineEntry(e.id)">
                  <Icon name="trash" size="xs" />
                </IconButton>
              </span>
            </div>
          </li>
        </ol>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.tld {
  --tld-planned: var(--theme-dim);
  --tld-progress: var(--theme-accent);
  --tld-shipped: var(--theme-success);
}
.tld__filters {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 12px;
  background: color-mix(in oklch, var(--theme-text) 6%, transparent);
}
.tld__filter {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  cursor: pointer;
}
.tld__filter.is-on {
  background: var(--glass-solid, var(--theme-card));
  color: var(--theme-text);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--shadow-ink, #000) 16%, transparent);
}
.tld__filter-n {
  opacity: 0.65;
  font-variant-numeric: tabular-nums;
}
.tld__filter:focus-visible,
.tld__open:focus-visible,
.tld__chip:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}

.tld__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 12px;
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-card);
  color: var(--theme-dim);
  font-size: var(--text-xs);
  text-align: center;
}
.tld__empty strong {
  color: var(--theme-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
.tld__empty-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
  color: var(--theme-accent);
}

.tld__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
.tld__month-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  padding: 2px 0;
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.tld__month-n {
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}
/* The line: a rule down the left, a dot per entry in its status colour. */
.tld__line {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0 0 0 20px;
  list-style: none;
}
.tld__line::before {
  content: '';
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 6px;
  width: 2px;
  border-radius: 1px;
  background: color-mix(in oklch, var(--theme-text) 12%, transparent);
}
.tld__item {
  position: relative;
  min-width: 0;
}
.tld__dot {
  position: absolute;
  top: 14px;
  left: -19px;
  width: 12px;
  height: 12px;
  border: 2px solid var(--tld-dot);
  border-radius: 50%;
  background: var(--glass-solid, var(--theme-card));
}
.tld__item.is-planned {
  --tld-dot: var(--tld-planned);
}
.tld__item.is-progress {
  --tld-dot: var(--tld-progress);
}
.tld__item.is-shipped {
  --tld-dot: var(--tld-shipped);
}
.tld__item.is-shipped .tld__dot,
.tld__item.is-progress .tld__dot {
  background: var(--tld-dot);
}
.tld__card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in oklch, var(--theme-text) 8%, transparent);
  border-radius: var(--radius-card);
  background: color-mix(in oklch, var(--theme-card) 85%, transparent);
  transition: border-color var(--dur-fast) ease;
}
.tld__card:hover {
  border-color: color-mix(in oklch, var(--tld-dot) 55%, transparent);
}
.tld__open {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.tld__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-right: 56px;
}
.tld__date {
  color: var(--theme-dim);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}
.tld__status {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--tld-dot) 16%, transparent);
  color: var(--theme-text);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
}
.tld__title {
  min-width: 0;
  color: var(--theme-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  overflow-wrap: anywhere;
}
.tld__preview {
  min-width: 0;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.tld__links {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
}
.tld__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-text) 7%, transparent);
  color: var(--theme-text);
  font: inherit;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.tld__chip:hover {
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
}
.tld__chip :deep(svg) {
  flex-shrink: 0;
  color: var(--theme-accent);
}
.tld__chip-t {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tld__chip.is-done .tld__chip-t {
  text-decoration: line-through;
  text-decoration-color: color-mix(in oklch, var(--theme-text) 45%, transparent);
}
/* Edit and delete arrive on approach, as on a note card; always there on touch. */
.tld__actions {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  opacity: 0;
  transition: opacity var(--dur-fast, 0.15s) var(--ease-out, ease);
}
.tld__card:hover .tld__actions,
.tld__card:focus-within .tld__actions {
  opacity: 1;
}
@media (hover: none) {
  .tld__actions {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .tld__actions,
  .tld__card {
    transition: none;
  }
}
</style>
