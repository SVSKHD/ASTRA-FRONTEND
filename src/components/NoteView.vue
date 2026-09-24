<script setup lang="ts">
// The full view of a note.
//
// It is a dialog, and it now behaves like the app's other dialogs: the backdrop
// closes it while READING, as ItemDialog, ReminderDialog and the notes drawer
// all do. While EDITING it still does not — that is the case the old
// no-backdrop rule was really protecting, and a stray click landing on the page
// behind an open editor should not put the editor away.
//
// Cancel is a real cancel. It used to be a lie: the autosave rebinds the view
// to the newly created note after ~700ms, so by the time anybody pressed Cancel
// the text was already stored and "Cancel" just flipped to read mode over it.
// The body as it stood when editing began is captured below and put back.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { noteViewCard, pxify, typeStep } from '@/styles'
import { isHtmlNote, noteChecks, noteLabel } from '@/utils/notes'
import { sanitize } from '@/utils/sanitizeHtml'
import { toMarkdown } from '@/utils/noteMigrate'
import { toggleTaskAt } from '@/utils/mdTyping'
import { copyAsMarkdown, copyAsRichText, downloadMarkdown } from '@/utils/noteExport'
import { checklistItems } from '@/utils/mdTyping'
import TextInput from '@/components/ui/TextInput.vue'
import NoteEditor from '@/components/notes/NoteEditor.vue'
import MarkdownView from '@/components/notes/MarkdownView.vue'
import NoteToc from '@/components/notes/NoteToc.vue'
import ChecklistToTasks from '@/components/notes/ChecklistToTasks.vue'

const app = useAppStore()
const ui = useUiStore()
const { c, s, isMobile } = useStyles()
const { noteView, noteViewClosing, openNote, draft, noteSearch } = storeToRefs(app)
const { now } = storeToRefs(ui)

const isEdit = computed(() => noteView.value?.mode === 'edit')
const isNew = computed(() => noteView.value?.id == null)
const source = computed(() => openNote.value?.text ?? '')
// Notes written before section 17 hold HTML. They still render — through the
// same allow-list as before — rather than being converted just to be read.
const isLegacy = computed(() => isHtmlNote(source.value))
const legacyHtml = computed(() => (isLegacy.value ? sanitize(source.value) : ''))
// What this note is called, asked the same way the drawer, the panes and the
// columns ask it — its own title first, the body's first line otherwise.
const title = computed(() => {
  if (isNew.value) return 'New note'
  const note = openNote.value
  if (!note) return 'Note'
  return noteLabel(
    isEdit.value ? { title: draftTitle(), text: String(draft.value.text ?? '') } : note,
  )
})
const checks = computed(() => noteChecks(source.value))

const editorRef = ref<{ focus: () => void } | null>(null)
watch(isEdit, (v) => {
  if (v) nextTick(() => editorRef.value?.focus())
})

// Opening a legacy note in the editor is where it becomes markdown: the draft
// is seeded with the conversion, and saving writes it back with format 'md'.
watch(
  [isEdit, () => noteView.value?.id],
  async ([editing]) => {
    if (!editing || !isLegacy.value) return
    const converted = await toMarkdown(source.value)
    // Only seed if nothing has been typed since — an await is a chance for the
    // user to have started editing.
    if (noteView.value?.mode === 'edit' && String(draft.value.text ?? '') === source.value) {
      app.setDraft('text', converted)
    }
  },
  { immediate: true },
)

// Ticking a box in the rendered note rewrites the markdown source, which is
// what makes the state survive a reload (acceptance 82). It goes through the
// store like any other edit, so the sync guard and the debounced save apply.
function onToggleTask(index: number) {
  const note = openNote.value
  if (!note) return
  app.setNoteText(note.id, toggleTaskAt(source.value, index))
}

const savedLabel = computed(() => {
  const n = openNote.value
  if (!n) return ''
  const stamp = n.updatedAt ?? n.ts
  const mins = Math.round((now.value - stamp) / 60000)
  if (mins < 1) return 'saved just now'
  if (mins < 60) return 'saved ' + mins + 'm ago'
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return 'saved ' + hrs + 'h ago'
  return 'saved ' + new Date(stamp).toLocaleDateString()
})

function draftText(): string {
  return String(draft.value.text ?? '')
}
function draftTitle(): string {
  return String(draft.value.title ?? '')
}

// The note as it stood when this edit began, so Cancel has something to put
// back. Captured on entering edit mode rather than on open: an edit started
// from read mode should revert to what was on screen a moment ago.
const beforeEdit = ref<{ text: string; title: string } | null>(null)
watch(
  isEdit,
  (editing) => {
    if (!editing) return (beforeEdit.value = null)
    const note = openNote.value
    beforeEdit.value = { text: note?.text ?? '', title: note?.title ?? '' }
  },
  { immediate: true },
)

// A note deleted from somewhere else while it is open here leaves this dialog
// showing an empty body under the heading "Untitled note". The note column and
// the pane row both guard on the note still existing; this one did not.
watch(
  () => [noteView.value?.id, openNote.value == null] as const,
  ([id, gone]) => {
    if (id != null && gone && !noteViewClosing.value) app.closeNoteView()
  },
)

// Autosave: while editing, the draft is persisted in place a short beat after
// you stop typing, so a note is never lost to a stray close. Manual Save / Esc
// still finalise to read mode; the store's own debounce flushes to Firestore.
const saveState = ref<'idle' | 'saving' | 'saved'>('idle')
let autosaveTimer: ReturnType<typeof setTimeout> | undefined
// The title is its own field on a note and is editable from the detail panes,
// the note column and the create-dialog draft editor — but not, until now, from
// the note's own full view. It autosaves on the same beat as the body.
function onDraftTitle(v: string) {
  app.setDraft('title', v)
  queueAutosave()
}
function onDraft(v: string) {
  app.setDraft('text', v)
  queueAutosave()
}
function queueAutosave() {
  if (!isEdit.value) return
  saveState.value = 'saving'
  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    app.autosaveNoteDraft(draftText())
    saveState.value = 'saved'
  }, 700)
}
onBeforeUnmount(() => clearTimeout(autosaveTimer))
const autosaveLabel = computed(() =>
  saveState.value === 'saving' ? 'Saving…' : saveState.value === 'saved' ? 'Saved' : '',
)

function save() {
  clearTimeout(autosaveTimer)
  app.saveNoteView(draftText())
}
// Put back what was there when editing began. The autosave has almost certainly
// written by now — that is the whole reason this has to restore rather than
// merely switch modes.
function cancel() {
  clearTimeout(autosaveTimer)
  saveState.value = 'idle'
  const id = noteView.value?.id
  const before = beforeEdit.value
  if (id == null) return app.closeNoteView()
  if (before) {
    app.setNoteText(id, before.text)
    app.setNoteTitle(id, before.title)
  }
  app.openNoteView(id)
}
function onEsc() {
  if (isEdit.value) cancel()
  else app.closeNoteView()
}
function remove() {
  const id = noteView.value?.id
  app.closeNoteView()
  if (id != null) app.deleteWithUndo('notes', 'note', id)
}
// Reading: a click outside puts it away, like every other dialog in the app.
// Editing: it does not, because the click that lands outside an open editor is
// usually the one that was meant for the editor.
function onBackdrop() {
  if (!isEdit.value) app.closeNoteView()
}
function shareNote() {
  const n = openNote.value
  if (n) app.share('note', n)
}

// A legacy HTML note keeps its old behaviour: the checkbox state lives in the
// attribute, so ticking one writes the markup back.
function onLegacyClick(e: MouseEvent) {
  const el = e.target as HTMLElement
  const n = openNote.value
  if (!n || !(el instanceof HTMLInputElement) || el.type !== 'checkbox') return
  if (el.checked) el.setAttribute('checked', 'checked')
  else el.removeAttribute('checked')
  const body = e.currentTarget as HTMLElement
  app.setNoteText(n.id, body.innerHTML)
}

// --- the note menu ----------------------------------------------------------
const menuOpen = ref(false)
const convertOpen = ref(false)
const hasChecklist = computed(() => !isLegacy.value && checklistItems(source.value).length > 0)

async function doCopyMarkdown() {
  menuOpen.value = false
  app.showToastMsg((await copyAsMarkdown(source.value)) ? 'Copied as markdown' : 'Could not copy')
}
async function doCopyRich() {
  menuOpen.value = false
  app.showToastMsg((await copyAsRichText(source.value)) ? 'Copied as rich text' : 'Could not copy')
}
function doExport() {
  menuOpen.value = false
  downloadMarkdown(source.value)
}
function openConvert() {
  menuOpen.value = false
  convertOpen.value = true
}

// The contents list scrolls the rendered note rather than navigating, so the
// note stays open and the reader keeps their place in the app.
const viewBody = ref<HTMLElement | null>(null)
function jumpTo(id: string) {
  viewBody.value?.querySelector('#' + CSS.escape(id))?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

const menuWrap = pxify({ position: 'relative' })
const menuPanel = computed(() =>
  pxify({
    position: 'absolute',
    bottom: 'calc(100% + 8px)',
    right: 0,
    zIndex: 20,
    minWidth: 190,
    display: 'flex',
    flexDirection: 'column',
    padding: 6,
    borderRadius: 'var(--radius-dialog)',
    border: '1px solid ' + c.value.border,
    background: c.value.glass,
    backdropFilter: 'blur(24px) saturate(1.5)',
    boxShadow: c.value.shadow,
  }),
)
const menuItem = computed(() =>
  pxify({
    padding: '8px 10px',
    borderRadius: 'var(--radius-control)',
    border: 'none',
    background: 'transparent',
    color: c.value.text,
    ...typeStep('xs'),
    textAlign: 'left',
    cursor: 'pointer',
  }),
)
const menuItemHover = computed(() => ({ background: c.value.card }))

const cardStyle = computed(() =>
  pxify(noteViewCard(c.value, isMobile.value, noteViewClosing.value)),
)
const metaStyle = computed(() =>
  pxify({ ...typeStep('2xs'), color: c.value.dim, letterSpacing: '0.03em', whiteSpace: 'nowrap' }),
)
const headStyle = pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minWidth: 0 })
const spacer = pxify({ flex: 1 })
</script>

<template>
  <template v-if="noteView">
    <div :style="s.noteViewOverlay" @click="onBackdrop"></div>
    <div :style="cardStyle" role="dialog" aria-modal="true" tabindex="-1" @keydown.esc="onEsc">
      <div :style="headStyle">
        <span :style="s.noteViewTitle">{{ title }}</span>
        <span v-if="!isEdit && checks.total" :style="metaStyle">
          {{ checks.done }}/{{ checks.total }} done
        </span>
        <button :style="s.del" aria-label="Close note" title="Close" @click="app.closeNoteView()">
          ×
        </button>
      </div>

      <template v-if="isEdit">
        <TextInput
          :model-value="draftTitle()"
          placeholder="Title (optional — the first line is used without one)"
          aria-label="Note title"
          @update:model-value="onDraftTitle"
        />
        <NoteEditor
          ref="editorRef"
          :model-value="draftText()"
          @update:model-value="onDraft"
          @save="save"
        />
        <div :style="s.noteViewFoot">
          <span :style="metaStyle">{{ autosaveLabel || 'Markdown · ⌘↵ to finish' }}</span>
          <span :style="spacer"></span>
          <button :style="s.cancelBtn" @click="cancel">Cancel</button>
          <button :style="s.saveBtn" @click="save">Done</button>
        </div>
      </template>

      <template v-else>
        <div
          v-if="isLegacy"
          class="rich"
          :style="s.noteViewBody"
          v-html="legacyHtml"
          @click="onLegacyClick"
        ></div>
        <template v-else>
          <NoteToc :source="source" @jump="jumpTo" />
          <div ref="viewBody" :style="s.noteViewBody">
            <MarkdownView
              :source="source"
              interactive
              :highlight="noteSearch"
              @toggle-task="onToggleTask"
            />
          </div>
        </template>
        <div :style="s.noteViewFoot">
          <span :style="metaStyle">{{ savedLabel }}</span>
          <span :style="spacer"></span>
          <button :style="s.del" title="Delete note" aria-label="Delete note" @click="remove">
            ×
          </button>
          <button :style="s.shareBtn" title="Share note" aria-label="Share note" @click="shareNote">
            ↗
          </button>
          <div :style="menuWrap">
            <button
              :style="s.shareBtn"
              title="More"
              aria-label="Note actions"
              :aria-expanded="menuOpen"
              @click="menuOpen = !menuOpen"
            >
              ⋯
            </button>
            <div v-if="menuOpen" :style="menuPanel">
              <button :style="menuItem" v-hover-style="menuItemHover" @click="doCopyMarkdown">
                Copy as markdown
              </button>
              <button :style="menuItem" v-hover-style="menuItemHover" @click="doCopyRich">
                Copy as rich text
              </button>
              <button :style="menuItem" v-hover-style="menuItemHover" @click="doExport">
                Export as .md
              </button>
              <button
                v-if="hasChecklist"
                :style="menuItem"
                v-hover-style="menuItemHover"
                @click="openConvert"
              >
                Convert checklist to tasks
              </button>
            </div>
          </div>
          <button :style="s.cancelBtn" @click="app.closeNoteView()">Close</button>
          <button :style="s.saveBtn" @click="app.editNoteView()">Edit</button>
        </div>
      </template>
    </div>
    <ChecklistToTasks :source="source" :open="convertOpen" @close="convertOpen = false" />
  </template>
</template>
