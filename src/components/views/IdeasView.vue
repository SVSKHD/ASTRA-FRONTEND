<script setup lang="ts">
// The Ideas tab, built the way the Todos tab is: quick add at the top, open
// ideas as a drag-to-reorder / drag-to-nest tree with a ring check, a collapsed
// Completed section with "Clear completed", bulk selection, JSON export and
// import, the "Remind me" bell, and the selected idea's details in the
// right-hand pane (a slide-over on a phone).
//
// What ideas keep of their own: a type (feature, business, …) and an optional
// deadline, both filterable here and both feeding the top ticker. There is no
// carried-over group — an idea has no "day" to carry it from — and no focus
// timer or weekly review, which are todo routines.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { DANGER, SUCCESS, pxify, typeStep } from '@/styles'
import { splitList } from '@/utils/listSplit'
import { buildIndex, childrenOf, descendantsOf } from '@/utils/taskTree'
import { emptyTagQueryMessage, matchesTagQuery } from '@/utils/tagFilter'
import { downloadText } from '@/utils/noteExport'
import { copyToClipboard } from '@/utils/share'
import {
  buildTaskTransferUrl,
  exportTaskTransferJson,
  taskTransferFilename,
} from '@/utils/taskTransfer'
import { usePaneInset } from '@/composables/usePaneInset'
import PanelHeader from '@/components/PanelHeader.vue'
import ProgressLine from '@/components/ProgressLine.vue'
import CompletedSection from '@/components/CompletedSection.vue'
import TreeList from '@/components/TreeList.vue'
import IdeaDetail from '@/components/IdeaDetail.vue'
import QuickAdd from '@/components/todo/QuickAdd.vue'
import TagFilterInput from '@/components/TagFilterInput.vue'
import TaskTransferPasteDialog from '@/components/TaskTransferPasteDialog.vue'
import DetailPane from '@/components/ui/DetailPane.vue'
import SlideOver from '@/components/ui/SlideOver.vue'
import Modal from '@/components/ui/Modal.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import Select from '@/components/ui/Select.vue'
import Icon from '@/components/ui/Icon.vue'
import { IDEA_TYPE_OPTIONS } from '@/types'
import type { Idea } from '@/types'
import { vScrollFade } from '@/directives/scrollFade'

const app = useAppStore()
const ui = useUiStore()
const { c, s, panelStyle, isMobile } = useStyles()
const { ideas, hideCompleted } = storeToRefs(app)

// "/n" and "+ New idea" land in quick add with its details open.
const quickAdd = ref<InstanceType<typeof QuickAdd> | null>(null)
function focusQuickAdd() {
  if (quickAdd.value) quickAdd.value.focus(true)
  else app.openCreate('idea')
}
defineExpose({ focus: focusQuickAdd })

// --- export / import ---------------------------------------------------------
const importFile = ref<HTMLInputElement | null>(null)
const pasteDialogOpen = ref(false)
const transferMenu = computed(() => [
  { value: 'export-json', label: 'Export JSON', disabled: ideas.value.length === 0 },
  { value: 'copy-url', label: 'Copy import URL', disabled: ideas.value.length === 0 },
  { value: 'paste-json', label: 'Paste JSON/link' },
  { value: 'import-file', label: 'Import file' },
  { value: 'sample-json', label: 'Example JSON' },
])
function exportIdeas(list: readonly Idea[], filename: string) {
  downloadText(
    exportTaskTransferJson('ideas', list, new Date().toISOString()),
    filename,
    'application/json;charset=utf-8',
  )
}
async function copyIdeasUrl() {
  try {
    await copyToClipboard(buildTaskTransferUrl('ideas', ideas.value))
    app.showToastMsg('Idea import URL copied')
  } catch {
    app.showToastMsg('Could not copy import URL')
  }
}
function onTransfer(action: string) {
  if (action === 'export-json') {
    exportIdeas(ideas.value, taskTransferFilename('ideas'))
    app.showToastMsg('Ideas exported')
  } else if (action === 'copy-url') void copyIdeasUrl()
  else if (action === 'paste-json') pasteDialogOpen.value = true
  else if (action === 'import-file') importFile.value?.click()
  else if (action === 'sample-json') app.openTaskTransferHelp('ideas')
}
function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const result = app.importTaskTransferJson(String(reader.result ?? ''), 'ideas')
    if (result.error) app.showToastMsg('Could not import ideas: ' + result.error)
    else app.showToastMsg(`Imported ${result.count} idea${result.count === 1 ? '' : 's'} from JSON`)
  }
  reader.onerror = () => app.showToastMsg('Could not read that JSON file')
  reader.readAsText(file)
}

// --- the tree, filtered and split ---------------------------------------------
const index = computed(() => buildIndex(ideas.value))
// Sub-ideas render inside their parent (read in the details pane), never as
// top-level rows.
const topLevel = computed(() => {
  const present = new Set(ideas.value.map((i) => i.id))
  return ideas.value.filter((i) => i.parentId == null || !present.has(i.parentId))
})

// Filters: the tag query (behind the search toggle, as on Todos) matches an
// idea's own tag and every sub-idea's; type and sort sit beside quick add.
const showTagFilter = ref(false)
const tagQuery = ref('')
function toggleTagFilter() {
  showTagFilter.value = !showTagFilter.value
  if (!showTagFilter.value) tagQuery.value = ''
}
const typeFilter = ref('all')
const sortKey = ref<'manual' | 'deadline' | 'updated' | 'title'>('manual')
function treeTags(i: Idea): string[] {
  return [i.tag, ...descendantsOf(index.value, i.id).map((d) => d.tag)]
}
const tagGroups = computed(() => topLevel.value.map(treeTags))
const shownTopLevel = computed(() => {
  let list = topLevel.value
  if (typeFilter.value !== 'all') list = list.filter((i) => i.ideaType === typeFilter.value)
  if (tagQuery.value.trim()) {
    const inUse = tagGroups.value.flat()
    list = list.filter((i) => matchesTagQuery(treeTags(i), tagQuery.value, inUse))
  }
  return list
})
const filtering = computed(() => !!tagQuery.value.trim() || typeFilter.value !== 'all')

const completedSort = ref<'recent' | 'original'>('recent')
const split = computed(() =>
  splitList(shownTopLevel.value, {
    isDone: (i) => i.status === 'done',
    // Ideas have no day to be carried from; an overdue deadline shows on the row.
    isCarried: () => false,
    completedAt: (i) => i.completedAt,
    archivedAt: (i) => i.archivedAt ?? null,
    completedSort: completedSort.value,
  }),
)
function byDeadline(a: Idea, b: Idea) {
  if (a.deadline && b.deadline)
    return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0
  if (a.deadline) return -1
  if (b.deadline) return 1
  return b.updatedAt - a.updatedAt
}
// Manual order is each idea's `order`, which is what a drag rewrites; the other
// sorts are views over it and leave the stored order alone.
const active = computed(() => {
  const list = [...split.value.active]
  if (sortKey.value === 'title') return list.sort((a, b) => a.title.localeCompare(b.title))
  if (sortKey.value === 'updated') return list.sort((a, b) => b.updatedAt - a.updatedAt)
  if (sortKey.value === 'deadline') return list.sort(byDeadline)
  return list.sort((a, b) => a.order - b.order)
})
const activeIds = computed(() => active.value.map((i) => i.id))
const completed = computed(() => split.value.completed)
const completedIds = computed(() => completed.value.map((i) => i.id))

// --- selection for the details pane ---------------------------------------------
const selectedId = ref<number | null>(null)
const selectedExists = computed(
  () => selectedId.value != null && ideas.value.some((i) => i.id === selectedId.value),
)
const splitView = computed(() => !isMobile.value && app.paneMode === 'inline')
const paneOpen = computed(() => !isMobile.value && !splitView.value && selectedExists.value)
const paneWidth = ref(0)
const { host: paneHost, style: paneInset } = usePaneInset(paneOpen, paneWidth)
// On a phone the details open in a slide-over. A row opens it on pointerup and
// the browser's synthesised click lands a moment later on the new scrim, so a
// close that soon after opening is that ghost click, not the reader.
let openedAt = 0
function onSelect(id: number) {
  selectedId.value = id
  openedAt = performance.now()
}
function closeSheet() {
  if (performance.now() - openedAt < 450) return
  selectedId.value = null
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || selectedId.value == null) return
  const t = e.target as HTMLElement | null
  if (
    t &&
    (t.closest('input, textarea, [contenteditable="true"], [role="dialog"]') || t.isContentEditable)
  )
    return
  selectedId.value = null
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// --- bulk selection ---------------------------------------------------------------
const selectionMode = ref(false)
const picked = ref<Set<number>>(new Set())
function treeIds(id: number): number[] {
  return [id, ...childrenOf(index.value, id).flatMap((ch) => treeIds(ch.id))]
}
const selectableIds = computed(() => [
  ...new Set([...activeIds.value.flatMap(treeIds), ...completedIds.value]),
])
const selectableSet = computed(() => new Set(selectableIds.value))
const pickedIds = computed(() => [...picked.value].filter((id) => selectableSet.value.has(id)))
const pickedCount = computed(() => pickedIds.value.length)
const selectionVisible = computed(() => selectionMode.value || pickedCount.value > 0)
const allPicked = computed(
  () => selectableIds.value.length > 0 && selectableIds.value.every((id) => picked.value.has(id)),
)
watch(selectableIds, (ids) => {
  const allowed = new Set(ids)
  const next = [...picked.value].filter((id) => allowed.has(id))
  if (next.length !== picked.value.size) picked.value = new Set(next)
})
function togglePick(id: number) {
  selectionMode.value = true
  const next = new Set(picked.value)
  if (!next.delete(id)) next.add(id)
  picked.value = next
}
function clearSelection() {
  picked.value = new Set()
  selectionMode.value = false
}
function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) picked.value = new Set()
}
function completePicked() {
  const ids = [...new Set(pickedIds.value.flatMap(treeIds))].filter(
    (id) => index.value.byId.get(id)?.status !== 'done',
  )
  for (const id of ids) app.setIdeaStatus(id, 'done')
  if (ids.length) app.showToastMsg(`Completed ${ids.length} idea${ids.length === 1 ? '' : 's'}`)
  clearSelection()
}
function movePickedToTasks() {
  const created = app.convertIdeasToTasks(pickedIds.value)
  clearSelection()
  selectedId.value = null
  if (created.length) ui.setTab('tasks')
}
// The selection with every sub-idea under it, in the toolbar Export's format.
function exportPicked() {
  const ids = new Set<number>()
  for (const id of pickedIds.value) for (const t of treeIds(id)) ids.add(t)
  const list = ideas.value.filter((i) => ids.has(i.id))
  if (!list.length) return
  exportIdeas(list, taskTransferFilename('ideas').replace('ideas-', 'ideas-selected-'))
  app.showToastMsg(`Exported ${list.length} idea${list.length === 1 ? '' : 's'}`)
}
const deleteConfirmOpen = ref(false)
const bulkDeleting = ref(false)
async function confirmDeletePicked() {
  if (!pickedCount.value || bulkDeleting.value) return
  bulkDeleting.value = true
  try {
    const deleted = await app.deleteManyWithProgress('ideas', pickedIds.value)
    if (deleted > 0) {
      clearSelection()
      selectedId.value = null
    }
  } finally {
    bulkDeleting.value = false
    deleteConfirmOpen.value = false
  }
}

// --- styles -------------------------------------------------------------------
const typeOptions = [
  { value: 'all', label: 'All types' },
  ...IDEA_TYPE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label })),
]
const sortOptions = [
  { value: 'manual', label: 'My order' },
  { value: 'deadline', label: 'By deadline' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'title', label: 'By title' },
]
const splitLayout = pxify({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 'var(--sp-4)',
  flex: 1,
  minHeight: 0,
})
const leftColumn = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  flex: 1,
  minHeight: 0,
})
const headRow = pxify({
  padding: '4px 10px 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-3)',
})
const filterRow = pxify({ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' })
const listColumn = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-4)',
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  scrollbarGutter: 'stable',
  padding: '4px 10px 18px',
})
const bulkBar = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    flexWrap: 'wrap',
    padding: '8px 10px',
    borderRadius: 'var(--radius-card)',
    border: '1px solid ' + c.value.accent,
    background: 'color-mix(in oklch, ' + c.value.accent + ' 12%, transparent)',
    ...typeStep('xs'),
  }),
)
function pillBtn(col: string) {
  return pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '5px 10px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + col,
    background: 'color-mix(in oklch, ' + col + ' 12%, transparent)',
    color: col,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })
}
const confirmCopy = computed(() =>
  pxify({ ...typeStep('sm'), lineHeight: 1.5, color: c.value.dim, margin: 0 }),
)
const shortcutHint = computed(() =>
  pxify({
    alignSelf: 'center',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 12px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + c.value.border,
    ...typeStep('xs'),
    color: c.value.dim,
    flexShrink: 0,
  }),
)
const shortcutKey = computed(() => pxify({ fontFamily: 'var(--font-mono)', color: c.value.accent }))
</script>

<template>
  <div ref="paneHost" :style="[panelStyle, paneInset]">
    <PanelHeader title="Ideas" :new-label="isMobile ? undefined : 'New idea'" @new="focusQuickAdd">
      <template #left>
        <Dropdown :items="transferMenu" label="Export" variant="toolbar" @select="onTransfer" />
        <input
          ref="importFile"
          type="file"
          accept="application/json,.json"
          hidden
          @change="onImportFile"
        />
      </template>
      <template #right>
        <button
          type="button"
          class="panel-action panel-action--icon"
          :class="{ 'is-on': showTagFilter }"
          :aria-pressed="showTagFilter"
          aria-label="Filter by tag"
          title="Filter by tag"
          @click="toggleTagFilter"
        >
          <Icon name="search" size="sm" />
        </button>
        <button
          v-if="selectableIds.length && !selectionVisible"
          type="button"
          class="panel-action"
          @click="toggleSelectionMode"
        >
          Select
        </button>
      </template>
    </PanelHeader>
    <TaskTransferPasteDialog
      :open="pasteDialogOpen"
      collection="ideas"
      @close="pasteDialogOpen = false"
    />
    <Modal
      :open="deleteConfirmOpen"
      title="Delete selected ideas"
      size="sm"
      @close="!bulkDeleting && (deleteConfirmOpen = false)"
    >
      <p :style="confirmCopy">
        Delete {{ pickedCount }} selected idea{{ pickedCount === 1 ? '' : 's' }}? Sub-ideas under
        selected parents are included.
      </p>
      <template #footer>
        <button
          type="button"
          :style="s.editBtn"
          :disabled="bulkDeleting"
          @click="deleteConfirmOpen = false"
        >
          Cancel
        </button>
        <button
          type="button"
          :style="[pillBtn(DANGER), bulkDeleting ? { opacity: 0.55, cursor: 'not-allowed' } : {}]"
          :disabled="bulkDeleting"
          @click="confirmDeletePicked"
        >
          {{ bulkDeleting ? 'Deleting...' : allPicked ? 'Delete all' : 'Delete selected' }}
        </button>
      </template>
    </Modal>

    <div v-if="selectionVisible" :style="bulkBar">
      <span>{{ pickedCount ? pickedCount + ' selected' : 'Select ideas' }}</span>
      <button
        v-if="!allPicked"
        :style="s.editBtn"
        @click="((selectionMode = true), (picked = new Set(selectableIds)))"
      >
        Select all
      </button>
      <button v-else :style="s.editBtn" @click="picked = new Set()">Clear all</button>
      <button v-if="pickedCount" :style="pillBtn(SUCCESS)" @click="completePicked">
        Completed
      </button>
      <button v-if="pickedCount" :style="s.importBtn" @click="movePickedToTasks">
        Move to Tasks
      </button>
      <button v-if="pickedCount" :style="s.importBtn" @click="exportPicked">Export JSON</button>
      <button v-if="pickedCount" :style="pillBtn(DANGER)" @click="deleteConfirmOpen = true">
        {{ allPicked ? 'Delete all' : 'Delete selected' }}
      </button>
      <button :style="s.editBtn" @click="toggleSelectionMode">Done</button>
    </div>

    <!-- data-own-keys: ↑/↓ scroll this list rather than switch tabs (globalKeys). -->
    <div :style="splitView ? splitLayout : leftColumn" data-own-keys>
      <div :style="leftColumn">
        <div :style="headRow">
          <ProgressLine part="inline" :done="split.stats.done" :total="split.stats.total" />
          <QuickAdd ref="quickAdd" collection="ideas" :compact="isMobile" />
          <div v-if="ideas.length" :style="filterRow">
            <Select v-model="typeFilter" :options="typeOptions" size="sm" aria-label="Idea type" />
            <Select
              :model-value="sortKey"
              :options="sortOptions"
              size="sm"
              aria-label="Sort ideas"
              @update:model-value="sortKey = $event as typeof sortKey"
            />
          </div>
          <TagFilterInput v-if="showTagFilter || tagQuery" v-model="tagQuery" :groups="tagGroups" />
        </div>

        <div v-scroll-fade :style="listColumn">
          <div v-if="ideas.length === 0" :style="s.empty">No ideas yet — jot down your first.</div>
          <div v-else-if="filtering && !active.length && !completed.length" :style="s.empty">
            {{
              tagQuery.trim()
                ? emptyTagQueryMessage(tagQuery, 'ideas')
                : 'No ideas match these filters.'
            }}
          </div>

          <!-- Open ideas: a drag-reorderable, drag-to-nest tree. -->
          <TreeList
            collection="ideas"
            :root-ids="activeIds"
            selectable
            :swipe-rows="isMobile"
            :selected-id="selectedId"
            :selected-ids="pickedIds"
            :selection-mode="selectionVisible"
            @select="onSelect"
            @remind="onSelect"
            @toggle-select="togglePick"
          />

          <CompletedSection
            v-if="!hideCompleted && completed.length > 0"
            collection="ideas"
            :count="completed.length"
            :sort="completedSort"
            clearable
            @toggle-sort="completedSort = completedSort === 'recent' ? 'original' : 'recent'"
            @clear="app.archiveCompleted('ideas')"
          >
            <TreeList
              collection="ideas"
              :root-ids="completedIds"
              selectable
              :swipe-rows="isMobile"
              :selected-id="selectedId"
              :selected-ids="pickedIds"
              :selection-mode="selectionVisible"
              @select="onSelect"
              @remind="onSelect"
              @toggle-select="togglePick"
            />
          </CompletedSection>
        </div>
        <span v-if="!isMobile" :style="shortcutHint"
          ><span :style="shortcutKey">/n</span>focus quick add</span
        >
      </div>

      <DetailPane
        v-if="!isMobile"
        :open="selectedExists"
        :title="'Idea details'"
        @width="paneWidth = $event"
        @close="selectedId = null"
      >
        <IdeaDetail v-if="selectedExists" :idea-id="selectedId" @select="selectedId = $event" />
        <div v-else :style="s.empty">Select an idea to see its details and sub-ideas.</div>
      </DetailPane>
    </div>

    <SlideOver
      v-if="isMobile"
      :open="selectedExists"
      title="Idea details"
      size="lg"
      @close="closeSheet"
    >
      <IdeaDetail v-if="selectedExists" :idea-id="selectedId" @select="selectedId = $event" />
    </SlideOver>
  </div>
</template>
