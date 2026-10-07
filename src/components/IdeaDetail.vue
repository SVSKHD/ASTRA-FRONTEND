<script setup lang="ts">
// Right-hand detail pane of the Ideas view — the idea counterpart of TodoDetail,
// in the same sheet (the dp-* styles) so the two tabs read alike. Double-click a
// value (title, tag, a sub-idea's title) to edit it in place; Enter or blur
// saves, Escape cancels. The type and deadline are pickers, always live.
// Sub-ideas are the idea's parentId children.
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useInlineEdit } from '@/composables/useInlineEdit'
import { fmtDate, useDetailStyles } from '@/composables/useDetailStyles'
import { buildIndex, childrenOf, ancestorsOf, descendantsOf } from '@/utils/taskTree'
import RemindBell from '@/components/RemindBell.vue'
import MoveToDeadlineButton from '@/components/MoveToDeadlineButton.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import PaneSection from '@/components/detail/PaneSection.vue'
import PaneNotes from '@/components/detail/PaneNotes.vue'
import PaneButton from '@/components/detail/PaneButton.vue'
import PaneToolbar from '@/components/detail/PaneToolbar.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Select from '@/components/ui/Select.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import RichDescription from '@/components/detail/RichDescription.vue'
import Icon from '@/components/ui/Icon.vue'
import AddMoreDialog from '@/components/detail/AddMoreDialog.vue'
import ExportJsonDialog from '@/components/detail/ExportJsonDialog.vue'
import { exportTaskTransferJson } from '@/utils/taskTransfer'
import SubCheck from '@/components/ui/SubCheck.vue'
import RingCheck from '@/components/ui/RingCheck.vue'
import { IDEA_TYPE_OPTIONS } from '@/types'
import { vScrollFade } from '@/directives/scrollFade'

const props = defineProps<{ ideaId: number | null }>()
const emit = defineEmits<{ select: [id: number | null] }>()

const app = useAppStore()
const ui = useUiStore()
const { ideas } = storeToRefs(app)
const {
  s,
  pane,
  row,
  grow,
  crumbBtn,
  dimSmall,
  placeholder,
  infoGrid,
  infoKey,
  infoVal,
  pill,
  addBtn,
  chipStyle,
} = useDetailStyles()

const index = computed(() => buildIndex(ideas.value))
const idea = computed(() => (props.ideaId == null ? undefined : index.value.byId.get(props.ideaId)))
const subIdeas = computed(() => (idea.value ? childrenOf(index.value, idea.value.id) : []))
const subDone = computed(() => subIdeas.value.filter((t) => t.status === 'done').length)
const allDescendants = computed(() =>
  idea.value ? descendantsOf(index.value, idea.value.id).length : 0,
)
const ancestors = computed(() => (idea.value ? ancestorsOf(index.value, idea.value.id) : []))
function kidCount(id: number) {
  return childrenOf(index.value, id).length
}
const typeOptions = IDEA_TYPE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))
// The picker is in single-date mode, so anything but a date string is a clear.
function setDeadline(value: unknown) {
  if (idea.value)
    app.updateIdea(idea.value.id, { deadline: typeof value === 'string' ? value : '' })
}

// --- inline editing (double-click) ------------------------------------------
const { draft, start, cancel, commit, isEditing, vFocus } = useInlineEdit((key, raw) => {
  const i = idea.value
  if (!i) return
  const value = raw.trim()
  if (key === 'title') {
    if (value) app.updateIdea(i.id, { title: value })
  } else if (key === 'tag') app.updateIdea(i.id, { tag: value })
  else if (key.startsWith('sub:') && value) app.updateIdea(Number(key.slice(4)), { title: value })
})
watch(
  () => props.ideaId,
  () => cancel(),
)

const newSub = ref('')
const addingMore = ref(false)
// Export: this idea and every sub-idea under it as transfer JSON, to copy or
// download — it pastes straight back into "Add more" or the tab's Import.
const exported = ref<{ json: string; filename: string; count: number } | null>(null)
function exportThis() {
  const root = idea.value
  if (!root) return
  const ids = new Set([root.id, ...descendantsOf(index.value, root.id).map((d) => d.id)])
  const picked = ideas.value.filter((t) => ids.has(t.id))
  const slug =
    (root.title || 'idea')
      .toLowerCase()
      .replace(/[^\w]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'idea'
  const at = new Date().toISOString()
  exported.value = {
    json: exportTaskTransferJson('ideas', picked, at),
    filename: `${slug}-${at.slice(0, 10)}.json`,
    count: picked.length,
  }
}
function addSubIdea() {
  const parent = idea.value
  if (!parent || !newSub.value.trim()) return
  // A sub-idea starts with its parent's tag, the way a nested todo does.
  const newId = app.addIdea(newSub.value, parent.tag)
  if (newId != null) app.moveIdea(newId, parent.id, subIdeas.value.length)
  newSub.value = ''
}
function removeIdea(id: number) {
  app.deleteWithUndo('ideas', 'idea', id)
  if (id === props.ideaId) emit('select', null)
}
function moveToTasks() {
  const current = idea.value
  if (!current) return
  const [taskId] = app.convertIdeasToTasks([current.id])
  if (taskId == null) return
  emit('select', null)
  ui.setTab('tasks')
  app.openTaskDialog(taskId)
}
</script>

<template>
  <div v-scroll-fade :style="pane">
    <Transition name="pane-swap" mode="out-in">
      <div :key="ideaId ?? 'empty'" class="pane-swap__body">
        <div v-if="!idea" :style="s.empty">Select an idea to see its details and sub-ideas.</div>

        <template v-else>
          <section class="dp-hero">
            <div v-if="ancestors.length" :style="row">
              <template v-for="a in ancestors" :key="a.id">
                <button type="button" :style="crumbBtn" @click="emit('select', a.id)">
                  {{ a.title || '(untitled)' }}
                </button>
                <span :style="dimSmall">›</span>
              </template>
            </div>

            <div class="dp-top">
              <RingCheck
                :done="idea.status === 'done'"
                :sub-done="subDone"
                :sub-total="subIdeas.length"
                @toggle="app.toggleIdea(idea.id)"
              />
              <TextInput
                v-if="isEditing('tag')"
                v-model="draft"
                v-focus
                size="sm"
                placeholder="Tag"
                aria-label="Tag"
                :style="{ width: '160px' }"
                @keydown.enter="commit"
                @keydown.esc="cancel"
                @blur="commit"
              />
              <span
                v-else-if="idea.tag"
                :style="chipStyle(idea.tag)"
                title="Double-click to edit"
                @dblclick="start('tag', idea.tag)"
                >{{ idea.tag }}</span
              >
              <span
                v-else
                :style="pill"
                title="Double-click to add a tag"
                @dblclick="start('tag', '')"
                >+ tag</span
              >
              <span v-if="idea.status === 'done'" :style="pill">Done</span>
              <PaneToolbar class="dp-actions">
                <RemindBell collection="ideas" :id="idea.id" />
                <PaneButton icon="share" label="Share idea" @click="app.share('idea', idea)" />
                <PaneButton icon="refresh-cw" label="Move to tasks" @click="moveToTasks" />
                <MoveToDeadlineButton
                  type="idea"
                  :item-id="idea.id"
                  :default-due="idea.deadline"
                  @moved="emit('select', null)"
                />
                <PaneButton
                  icon="external-link"
                  label="Open in editor"
                  @click="app.openEdit('idea', idea.id)"
                />
                <PaneButton
                  icon="trash"
                  label="Delete idea"
                  tone="danger"
                  @click="removeIdea(idea.id)"
                />
              </PaneToolbar>
            </div>

            <TextInput
              v-if="isEditing('title')"
              v-model="draft"
              v-focus
              size="lg"
              aria-label="Idea title"
              @keydown.enter="commit"
              @keydown.esc="cancel"
              @blur="commit"
            />
            <div v-else class="dp-titlerow">
              <h2
                class="dp-title"
                :class="{ 'is-done': idea.status === 'done' }"
                title="Double-click to edit"
                @dblclick="start('title', idea.title)"
              >
                {{ idea.title || '(untitled)' }}
              </h2>
              <button
                type="button"
                class="dp-addmore"
                title="Paste JSON or lines to add as sub-ideas"
                @click="addingMore = true"
              >
                <Icon name="plus" size="xs" />Add more
              </button>
              <button
                type="button"
                class="dp-addmore"
                title="Download this and all its sub-ideas as JSON"
                @click="exportThis"
              >
                <Icon name="download" size="xs" />Export
              </button>
            </div>
            <ExportJsonDialog
              :open="!!exported"
              :title="idea.title || '(untitled)'"
              :json="exported?.json ?? ''"
              :filename="exported?.filename ?? ''"
              :count="exported?.count ?? 0"
              @close="exported = null"
            />
            <AddMoreDialog
              :open="addingMore"
              collection="ideas"
              :parent-id="idea.id"
              :parent-title="idea.title || '(untitled)'"
              @close="addingMore = false"
            />

            <!-- Type and deadline: the two things an idea has that a todo
                 does not, as live pickers rather than double-click fields. -->
            <div class="idea-fields">
              <Select
                :model-value="idea.ideaType"
                :options="typeOptions"
                label="Type"
                size="sm"
                @update:model-value="app.updateIdea(idea.id, { ideaType: String($event) })"
              />
              <GlassDatePicker
                :model-value="idea.deadline"
                label="Deadline"
                size="sm"
                clearable
                @update:model-value="setDeadline"
              />
            </div>

            <RichDescription
              class="dp-desc"
              :model-value="idea.description"
              empty-text="No description — double-click to write one."
              @update:model-value="app.updateIdea(idea.id, { description: $event })"
            />

            <div v-if="subIdeas.length" class="dp-progress">
              <ProgressBar class="dp-progress__bar" :value="subDone" :max="subIdeas.length" />
              <span class="dp-progress__count">{{ subDone }} of {{ subIdeas.length }}</span>
            </div>
            <span v-if="allDescendants > subIdeas.length" :style="dimSmall"
              >{{ allDescendants }} in total, nested</span
            >
          </section>

          <PaneNotes type="idea" :id="idea.id" />

          <!-- Sub-ideas: one card each, ticked here or opened in this pane. -->
          <div class="dp-subs">
            <div v-for="st in subIdeas" :key="st.id" class="dp-sub">
              <SubCheck :done="st.status === 'done'" size="md" @toggle="app.toggleIdea(st.id)" />
              <TextInput
                v-if="isEditing('sub:' + st.id)"
                v-model="draft"
                v-focus
                size="sm"
                aria-label="Sub-idea title"
                :style="grow"
                @keydown.enter="commit"
                @keydown.esc="cancel"
                @blur="commit"
              />
              <span
                v-else
                class="dp-sub__text"
                :class="{ 'is-done': st.status === 'done' }"
                title="Double-click to rename"
                @dblclick="start('sub:' + st.id, st.title)"
                >{{ st.title || '(untitled)' }}</span
              >
              <div class="dp-sub__actions">
                <span v-if="kidCount(st.id)" :style="pill">{{ kidCount(st.id) }} sub</span>
                <PaneButton
                  icon="chevron-right"
                  label="Open sub-idea"
                  @click="emit('select', st.id)"
                />
                <PaneButton
                  icon="trash"
                  label="Delete sub-idea"
                  tone="danger"
                  @click="removeIdea(st.id)"
                />
              </div>
            </div>
            <div v-if="!subIdeas.length" :style="placeholder">No sub-ideas yet.</div>

            <form class="dp-add" @submit.prevent="addSubIdea">
              <TextInput
                v-model="newSub"
                size="sm"
                placeholder="Add a sub-idea…"
                aria-label="New sub-idea"
                :style="grow"
              />
              <button type="submit" :style="addBtn">Add</button>
            </form>
          </div>

          <PaneSection title="Details" storage-key="idea:details">
            <div :style="infoGrid">
              <span :style="infoKey">Created</span>
              <span :style="infoVal">{{ fmtDate(idea.createdAt) || '—' }}</span>
              <span :style="infoKey">Last updated</span>
              <span :style="infoVal">{{ fmtDate(idea.updatedAt) || '—' }}</span>
              <template v-if="idea.completedAt">
                <span :style="infoKey">Completed</span>
                <span :style="infoVal">{{ fmtDate(idea.completedAt) }}</span>
              </template>
            </div>
          </PaneSection>

          <span :style="dimSmall"
            >Tip: double-click the title, tag, description or a sub-idea to edit.</span
          >
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.idea-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--sp-3);
}
</style>
