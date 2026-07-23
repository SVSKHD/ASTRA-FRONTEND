<script setup lang="ts">
// The full view of a note. Opening one from the drawer puts it here and leaves
// it here — clicking the backdrop does nothing on purpose, so a note you are
// reading or writing cannot be dismissed by a stray click. Only ×, Close, or
// Escape puts it away.
import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, noteViewCard } from '@/styles'
import { noteChecks, noteTitle } from '@/utils/notes'
import RichEditor from '@/components/RichEditor.vue'

const app = useAppStore()
const ui = useUiStore()
const { c, s, isMobile } = useStyles()
const { noteView, noteViewClosing, openNote, draft } = storeToRefs(app)
const { now } = storeToRefs(ui)

const isEdit = computed(() => noteView.value?.mode === 'edit')
const isNew = computed(() => noteView.value?.id == null)
const html = computed(() => openNote.value?.text ?? '')
const title = computed(() =>
  isNew.value ? 'New note' : noteTitle(isEdit.value ? String(draft.value.text ?? '') : html.value),
)
const checks = computed(() => noteChecks(html.value))

const editorRef = ref<{ focus: () => void } | null>(null)
watch(isEdit, (v) => {
  if (v) nextTick(() => editorRef.value?.focus())
})

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
function onDraft(v: string) {
  app.setDraft('text', v)
}
function save() {
  app.saveNoteView(draftText())
}
function cancel() {
  if (isNew.value) app.closeNoteView()
  else if (noteView.value) app.openNoteView(noteView.value.id as number)
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
function shareNote() {
  const n = openNote.value
  if (n) app.share('note', n)
}

// Reading mode is live: ticking a checkbox in the rendered note writes the
// attribute back to the stored HTML, so the note is the checklist.
function onBodyClick(e: MouseEvent) {
  const el = e.target as HTMLElement
  const n = openNote.value
  if (!n || !(el instanceof HTMLInputElement) || el.type !== 'checkbox') return
  if (el.checked) el.setAttribute('checked', 'checked')
  else el.removeAttribute('checked')
  const body = e.currentTarget as HTMLElement
  app.setNoteText(n.id, body.innerHTML)
}

const cardStyle = computed(() =>
  pxify(noteViewCard(c.value, isMobile.value, noteViewClosing.value)),
)
const metaStyle = computed(() =>
  pxify({ fontSize: 10, color: c.value.dim, letterSpacing: '0.03em', whiteSpace: 'nowrap' }),
)
const headStyle = pxify({ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 })
const spacer = pxify({ flex: 1 })
</script>

<template>
  <template v-if="noteView">
    <div :style="s.noteViewOverlay"></div>
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
        <RichEditor
          ref="editorRef"
          :model-value="draftText()"
          placeholder="Start typing… use the toolbar for headings, lists and checkboxes."
          @update:model-value="onDraft"
          @save="save"
        />
        <div :style="s.noteViewFoot">
          <span :style="metaStyle">Ctrl/⌘ + Enter saves</span>
          <span :style="spacer"></span>
          <button :style="s.cancelBtn" @click="cancel">Cancel</button>
          <button :style="s.saveBtn" @click="save">Save</button>
        </div>
      </template>

      <template v-else>
        <div class="rich" :style="s.noteViewBody" v-html="html" @click="onBodyClick"></div>
        <div :style="s.noteViewFoot">
          <span :style="metaStyle">{{ savedLabel }}</span>
          <span :style="spacer"></span>
          <button :style="s.del" title="Delete note" aria-label="Delete note" @click="remove">
            ×
          </button>
          <button :style="s.shareBtn" title="Share note" aria-label="Share note" @click="shareNote">
            ↗
          </button>
          <button :style="s.cancelBtn" @click="app.closeNoteView()">Close</button>
          <button :style="s.saveBtn" @click="app.editNoteView()">Edit</button>
        </div>
      </template>
    </div>
  </template>
</template>
