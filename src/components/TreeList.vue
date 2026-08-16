<script setup lang="ts">
// The active region of the todos/tasks list, rendered as ONE flat, indented tree
// so the drag affordances read correctly: every row (root or descendant) is a
// direct child of the same container at padding-left = depth × INDENT, which is
// exactly the coordinate space the reorder line and the horizontal-depth
// projection work in. Collapsing a row filters its subtree out of the flat list.
//
// Shared by both collections; the few per-collection bits (title field, todo
// description / globe share, task due / repo) branch on `collection`. The drag
// engine, grip handle and drop-line indicator are collection-agnostic.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { useAccordionState } from '@/composables/useAccordionState'
import { useTreeDrag, INDENT_PX, type TreeCollection } from '@/composables/useTreeDrag'
import { buildIndex, childrenOf, progressOf } from '@/utils/taskTree'
import { pxify, merge, rowBase, tagChip } from '@/styles'
import DragHandle from '@/components/DragHandle.vue'
import TreeDropLine from '@/components/TreeDropLine.vue'
import OfflineChip from '@/components/OfflineChip.vue'
import LinkProgressBar from '@/components/LinkProgressBar.vue'
import LinkedAccordion from '@/components/LinkedAccordion.vue'
import StatusPill from '@/components/StatusPill.vue'
import IssueChip from '@/components/IssueChip.vue'
import RemindBell from '@/components/RemindBell.vue'
import ShareGlobeButton from '@/components/ShareGlobeButton.vue'
import type { LinkRef, Task, Todo } from '@/types'

const props = defineProps<{ collection: TreeCollection; rootIds: number[] }>()

const app = useAppStore()
const { c, dark, s } = useStyles()
const { todos, tasks } = storeToRefs(app)
const accordion = useAccordionState()
const { targetState, rootState, isSource, setAnnouncer } = useTreeDrag()

// Screen-reader announcements for drag moves (picked up / moved / dropped /
// cancelled / can't drop), driven by the engine.
const liveMsg = ref('')
onMounted(() => setAnnouncer((m) => (liveMsg.value = m)))
onBeforeUnmount(() => setAnnouncer(() => {}))
const srOnly = {
  position: 'absolute' as const,
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap' as const,
}

const isTasks = computed(() => props.collection === 'tasks')
const list = computed<(Task | Todo)[]>(() => (isTasks.value ? tasks.value : todos.value))
const index = computed(() => buildIndex(list.value))

const keyOf = (id: number) => (isTasks.value ? 'tasktree:' : 'todotree:') + id
function expanded(id: number) {
  return accordion.isOpen(keyOf(id))
}
function toggleExpand(id: number) {
  accordion.toggle(keyOf(id))
}
function hasKids(id: number) {
  return childrenOf(index.value, id).length > 0
}

const collapsed = computed(() => {
  const set = new Set<number>()
  for (const it of list.value) if (hasKids(it.id) && !expanded(it.id)) set.add(it.id)
  return set
})

interface Row {
  id: number
  parentId: number | null
  depth: number
}
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const emit = (id: number, depth: number, parentId: number | null) => {
    out.push({ id, parentId, depth })
    if (!collapsed.value.has(id)) {
      for (const ch of childrenOf(index.value, id)) emit(ch.id, depth + 1, id)
    }
  }
  for (const rid of props.rootIds) {
    if (index.value.byId.has(rid)) emit(rid, 0, null)
  }
  return out
})

function nodeOf(id: number) {
  return index.value.byId.get(id)
}
function title(id: number) {
  const n = nodeOf(id)
  if (!n) return '(untitled)'
  return (isTasks.value ? (n as Task).title : (n as Todo).text) || '(untitled)'
}
function desc(id: number) {
  const n = nodeOf(id)
  return !isTasks.value ? (n as Todo | undefined)?.description || '' : ''
}
function tagOf(id: number) {
  return nodeOf(id)?.tag || ''
}
// A linked GitHub issue shows as a chip on the row (13c). Tasks only — todos
// never link to issues.
function issueLinkOf(id: number) {
  return isTasks.value ? ((nodeOf(id) as Task | undefined)?.github ?? null) : null
}
// Goals this row is attached to (task 8), for the goal chip. Resolves ids to
// titles so a row shows which goal(s) it belongs to from the Tasks/Todos tab.
function goalNamesOf(id: number): string[] {
  const ids = nodeOf(id)?.goalIds
  if (!ids || !ids.length) return []
  return ids
    .map((gid) => app.goalById(gid)?.title)
    .filter((t): t is string => !!t)
    .map((t) => t || 'Goal')
}
function done(id: number) {
  return nodeOf(id)?.status === 'done'
}
function statusOf(id: number) {
  return nodeOf(id)?.status ?? 'pending'
}
function conflicted(id: number) {
  return nodeOf(id)?.hasConflict === true
}
function progress(id: number) {
  return progressOf(index.value, id, (x) => x.status === 'done')
}
function itemType(): 'task' | 'todo' {
  return isTasks.value ? 'task' : 'todo'
}
function dueLabel(id: number) {
  const t = nodeOf(id) as Task | undefined
  if (!isTasks.value || !t?.deadline) return ''
  return new Date(t.deadline + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function openDetail(id: number) {
  if (isTasks.value) app.openTaskDialog(id)
  else app.openEdit('todo', id)
}
function toggleDone(id: number) {
  if (isTasks.value) app.cycleTaskStatus(id)
  else app.toggleTodo(id)
}
function cycleStatus(id: number) {
  if (isTasks.value) app.cycleTaskStatus(id)
  else app.cycleTodoStatus(id)
}
function del(id: number) {
  app.deleteWithUndo(props.collection, itemType(), id)
}
function dismissConflict(id: number) {
  if (isTasks.value) app.dismissTaskConflict(id)
}

// --- cross-collection linked items (preserved from the list rows) -----------
function linkedOf(id: number): LinkRef[] {
  return nodeOf(id)?.linked ?? []
}
function linksExpanded(id: number) {
  return accordion.isOpen(props.collection + ':' + id)
}
function breadcrumb(id: number): string {
  return (nodeOf(id)?.parents ?? [])
    .map((p) => app.linkableById(p))
    .filter((it): it is NonNullable<typeof it> => !!it)
    .map((it) => ('text' in it ? it.text : it.title))
    .join(', ')
}
function selfRef(id: number): LinkRef {
  return { id, collection: props.collection }
}

// --- drop indicators --------------------------------------------------------
function ts(id: number) {
  return targetState(props.collection, id)
}
function showLine(id: number, side: 'above' | 'below') {
  const t = ts(id)
  return t.active && t.mode === 'reorder' && t.side === side
}
function nestStyle(id: number) {
  const t = ts(id)
  if (!t.active || t.mode !== 'nest') return {}
  const col = t.valid ? c.value.accent : 'oklch(0.64 0.22 25)'
  return {
    outline: '2px solid ' + col,
    outlineOffset: '1px',
    background: t.valid
      ? 'color-mix(in srgb, ' + c.value.accent + ' 14%, transparent)'
      : 'transparent',
    animation: t.valid ? 'none' : 'shake .4s',
  }
}
function sourceStyle(id: number) {
  if (!isSource(props.collection, id)) return {}
  return {
    opacity: 0.6,
    transform: 'scale(1.02)',
    boxShadow: '0 14px 30px rgba(0,0,0,0.4)',
    zIndex: 5,
  }
}
const root = computed(() => rootState(props.collection))

// --- styles -----------------------------------------------------------------
const wrap = pxify({ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' })
function nodeWrap(depth: number) {
  return pxify({ paddingLeft: depth * INDENT_PX, display: 'flex', flexDirection: 'column' })
}
const barWrap = pxify({ position: 'relative' })
const rowStyle = computed(() =>
  merge(rowBase(c.value), { cursor: 'pointer', position: 'relative' }),
)
function textStyle(id: number) {
  return pxify({
    fontSize: 14,
    color: c.value.text,
    lineHeight: 1.3,
    textDecoration: done(id) ? 'line-through' : 'none',
    textDecorationColor: c.value.dim,
  })
}
const descStyle = computed(() =>
  pxify({ fontSize: 12, lineHeight: 1.4, color: c.value.dim, cursor: 'pointer' }),
)
function chipStyle(tag: string) {
  return pxify(tagChip(c.value, tag, dark.value))
}
function chevronStyle(id: number) {
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
    transform: expanded(id) ? 'rotate(90deg)' : 'rotate(0deg)',
    transition: 'transform .25s ease',
  })
}
const chevronSpacer = pxify({ width: 18, flexShrink: 0 })
function boxStyle(id: number) {
  return pxify({
    width: 22,
    height: 22,
    flexShrink: 0,
    borderRadius: 7,
    border: '1.5px solid ' + (done(id) ? c.value.accent : c.value.border),
    background: done(id) ? c.value.accent : 'transparent',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  })
}
const countChip = computed(() =>
  pxify({
    fontSize: 10,
    color: c.value.dim,
    padding: '1px 6px',
    borderRadius: 999,
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    flexShrink: 0,
  }),
)
const dueChipStyle = computed(() => pxify({ fontSize: 10, color: c.value.dim }))
// Goal-attachment chip (task 8): a subtle accent-outlined pill on rows that
// belong to one or more goals, so attachment is visible from the Tasks/Todos tab.
const goalChip = computed(() =>
  pxify({
    fontSize: 10,
    color: c.value.accent,
    padding: '1px 6px',
    borderRadius: 999,
    background: 'transparent',
    border: '1px solid ' + c.value.accent,
    flexShrink: 0,
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
)
const conflictBadge = computed(() =>
  pxify({
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    padding: '2px 6px',
    borderRadius: 6,
    color: 'oklch(0.7 0.18 60)',
    border: '1px solid oklch(0.7 0.18 60)',
    background: 'transparent',
    cursor: 'pointer',
    flexShrink: 0,
  }),
)
const progressWrap = pxify({ padding: '4px 4px 0' })
const breadcrumbStyle = computed(() =>
  pxify({ fontSize: 10, color: c.value.dim, padding: '2px 0 2px 26px' }),
)
const linkBody = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '6px 4px 2px 26px',
  }),
)
const rootStripStyle = computed(() =>
  pxify({
    marginTop: 6,
    padding: '12px',
    borderRadius: 12,
    border: '1.5px dashed ' + (root.value.active ? c.value.accent : c.value.border),
    background: root.value.active
      ? 'color-mix(in srgb, ' + c.value.accent + ' 12%, transparent)'
      : 'transparent',
    color: root.value.active ? c.value.accent : c.value.dim,
    fontSize: 11,
    textAlign: 'center',
    letterSpacing: '0.04em',
    transition: 'border-color .15s ease, background .15s ease, color .15s ease',
  }),
)
</script>

<template>
  <TransitionGroup name="rowflip" tag="div" :style="wrap">
    <div v-for="row in rows" :key="row.id" :style="nodeWrap(row.depth)">
      <div :style="barWrap">
        <TreeDropLine
          v-if="showLine(row.id, 'above')"
          side="above"
          :indent-depth="ts(row.id).indentDepth"
          :valid="ts(row.id).valid"
          :base-inset="-row.depth * INDENT_PX"
        />
        <div
          class="tree-row"
          :style="[rowStyle, nestStyle(row.id), sourceStyle(row.id)]"
          v-hover-style="s.rowHover"
          :data-tree-collection="collection"
          :data-tree-id="row.id"
          :data-tree-depth="row.depth"
          :data-tree-parent="row.parentId ?? ''"
        >
          <button
            v-if="hasKids(row.id)"
            type="button"
            :style="chevronStyle(row.id)"
            :aria-label="expanded(row.id) ? 'Collapse' : 'Expand'"
            :aria-expanded="expanded(row.id)"
            @click.stop="toggleExpand(row.id)"
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
          <span v-else :style="chevronSpacer"></span>

          <DragHandle :collection="collection" :id="row.id" :title="title(row.id)" />

          <StatusPill v-if="isTasks" :status="statusOf(row.id)" @cycle="cycleStatus(row.id)" />
          <button
            v-else
            type="button"
            :style="boxStyle(row.id)"
            aria-label="Toggle done"
            @click.stop="toggleDone(row.id)"
          >
            <svg
              v-if="done(row.id)"
              width="12"
              height="12"
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

          <div :style="s.taskMain" @click="openDetail(row.id)">
            <span :style="textStyle(row.id)">{{ title(row.id) }}</span>
            <span v-if="desc(row.id)" :style="descStyle">{{ desc(row.id) }}</span>
            <div :style="s.chipRow">
              <span v-if="tagOf(row.id)" :style="chipStyle(tagOf(row.id))">{{
                tagOf(row.id)
              }}</span>
              <span v-if="dueLabel(row.id)" :style="dueChipStyle">due {{ dueLabel(row.id) }}</span>
              <IssueChip v-if="issueLinkOf(row.id)" :link="issueLinkOf(row.id)!" compact />
              <span
                v-for="g in goalNamesOf(row.id)"
                :key="g"
                :style="goalChip"
                title="Attached to goal"
                >◎ {{ g }}</span
              >
              <span v-if="hasKids(row.id)" :style="countChip"
                >{{ progress(row.id).done }}/{{ progress(row.id).total }}</span
              >
            </div>
            <OfflineChip :pending="app.isItemPending(itemType(), row.id)" />
          </div>

          <span
            v-if="conflicted(row.id)"
            :style="conflictBadge"
            title="A newer version arrived while you were editing"
            @click.stop="dismissConflict(row.id)"
            >remote ✕</span
          >
          <RemindBell :collection="collection" :id="row.id" />
          <ShareGlobeButton
            v-if="!isTasks"
            entity-type="todo"
            :item="nodeOf(row.id)"
            variant="row"
          />
          <button v-else :style="s.shareBtn" @click.stop="app.share('task', nodeOf(row.id)!)">
            ↗
          </button>
          <button :style="s.del" @click.stop="del(row.id)">×</button>
        </div>
        <TreeDropLine
          v-if="showLine(row.id, 'below')"
          side="below"
          :indent-depth="ts(row.id).indentDepth"
          :valid="ts(row.id).valid"
          :base-inset="-row.depth * INDENT_PX"
        />
      </div>

      <div v-if="hasKids(row.id) && expanded(row.id)" :style="progressWrap">
        <LinkProgressBar :done="progress(row.id).done" :total="progress(row.id).total" compact />
      </div>

      <!-- Cross-collection linked items (kept from the old list rows). -->
      <span v-if="breadcrumb(row.id)" :style="breadcrumbStyle">
        part of ‹{{ breadcrumb(row.id) }}›
      </span>
      <div v-if="linkedOf(row.id).length && linksExpanded(row.id)" :style="linkBody">
        <LinkedAccordion
          v-for="ch in linkedOf(row.id)"
          :key="ch.collection + ':' + ch.id"
          :item-ref="ch"
          :parent-ref="selfRef(row.id)"
          :depth="0"
          :is-root="false"
        />
      </div>
    </div>
  </TransitionGroup>

  <!-- Root drop strip: only present while dragging this collection. -->
  <div v-if="root.dragging" :data-tree-root="collection" :style="rootStripStyle">
    Drop here to make a top-level {{ isTasks ? 'task' : 'todo' }}
  </div>

  <div :style="srOnly" role="status" aria-live="assertive">{{ liveMsg }}</div>
</template>
