<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, merge, rowBase } from '@/styles'
import type { Note } from '@/types'

const ui = useUiStore()
const app = useAppStore()
const { c, s } = useStyles()
const { drawerOpen } = storeToRefs(ui)
const { notes, editing, draft } = storeToRefs(app)
const { now } = storeToRefs(ui)

const isEditing = computed(() => editing.value.type === 'note')
const editorRef = ref<HTMLDivElement | null>(null)

// When entering note-edit mode, seed the contentEditable with the draft HTML
// once (binding v-html reactively would reset the caret on every keystroke).
watch(isEditing, (v) => {
  if (v) nextTick(() => {
    if (editorRef.value) editorRef.value.innerHTML = (draft.value.text as string) || ''
  })
})

function syncEditor() {
  if (editorRef.value) app.setDraft('text', editorRef.value.innerHTML)
}
function exec(cmd: string, val?: string) {
  editorRef.value?.focus()
  document.execCommand(cmd, false, val)
  syncEditor()
}
const cmdBold = () => exec('bold')
const cmdItalic = () => exec('italic')
const cmdUnderline = () => exec('underline')
const cmdStrike = () => exec('strikeThrough')
const cmdH1 = () => exec('formatBlock', 'H1')
const cmdH2 = () => exec('formatBlock', 'H2')
const cmdUL = () => exec('insertUnorderedList')
const cmdOL = () => exec('insertOrderedList')
function cmdChecklist() {
  editorRef.value?.focus()
  document.execCommand(
    'insertHTML',
    false,
    '<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><input type="checkbox">&nbsp;<span>list item</span></div>',
  )
  syncEditor()
}
function cmdLink() {
  const url = window.prompt('Link URL:', 'https://')
  if (!url) return
  exec('createLink', url)
}
function cmdCode() {
  editorRef.value?.focus()
  const sel = (window.getSelection && window.getSelection()?.toString()) || 'code'
  document.execCommand(
    'insertHTML',
    false,
    '<code style="background:rgba(127,127,127,.25);padding:1px 5px;border-radius:4px;font-family:inherit">' + sel + '</code>',
  )
  syncEditor()
}
function cmdHighlight() {
  editorRef.value?.focus()
  const col = c.value.accent || '#ffd76a'
  if (!document.execCommand('hiliteColor', false, col)) document.execCommand('backColor', false, col)
  syncEditor()
}

const drawerStyle = computed(() =>
  pxify({
    position: 'fixed',
    top: 16,
    right: 16,
    bottom: 16,
    width: 'min(84vw,340px)',
    zIndex: 7,
    background: c.value.glass,
    backdropFilter: 'blur(30px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    borderRadius: 26,
    boxShadow: c.value.shadow,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    transform: 'translateX(' + (drawerOpen.value ? '0' : '150%') + ')',
    opacity: drawerOpen.value ? 1 : 0,
    pointerEvents: drawerOpen.value ? 'auto' : 'none',
    transition: 'transform .45s cubic-bezier(.5,1.3,.4,1), opacity .3s ease',
    overflowY: 'auto',
    color: c.value.text,
  }),
)

const toolButtons: { label: string; fn: () => void }[] = [
  { label: 'B', fn: cmdBold },
  { label: 'I', fn: cmdItalic },
  { label: 'U', fn: cmdUnderline },
  { label: 'S', fn: cmdStrike },
  { label: 'H1', fn: cmdH1 },
  { label: 'H2', fn: cmdH2 },
  { label: '•', fn: cmdUL },
  { label: '1.', fn: cmdOL },
  { label: '[x]', fn: cmdChecklist },
  { label: 'Link', fn: cmdLink },
  { label: '</>', fn: cmdCode },
  { label: 'HL', fn: cmdHighlight },
]

function timeLabel(n: Note) {
  const mins = Math.round((now.value - n.ts) / 60000)
  return mins < 1 ? 'just now' : mins < 60 ? mins + 'm ago' : Math.round(mins / 60) + 'h ago'
}
const row = computed(() => merge(rowBase(c.value)))
</script>

<template>
  <div v-if="drawerOpen" :style="s.overlay" @click="ui.toggleDrawer()"></div>
  <div :style="drawerStyle">
    <div :style="s.drawerHeader">
      <span :style="s.drawerTitle">Notes</span>
      <button :style="s.del" @click="ui.toggleDrawer()">×</button>
    </div>

    <template v-if="isEditing">
      <div :style="s.toolbar">
        <button v-for="b in toolButtons" :key="b.label" :style="s.toolBtn" @click="b.fn()" v-html="b.label"></button>
      </div>
      <div ref="editorRef" contenteditable="true" :style="s.editorArea" @input="syncEditor"></div>
      <div :style="s.dialogActions">
        <button :style="s.saveBtn" @click="app.saveEdit()">Save</button>
        <button :style="s.cancelBtn" @click="app.cancelEdit()">Cancel</button>
      </div>
    </template>

    <template v-else>
      <button :style="s.addBtn2" @click="app.newNote()">+ New Note</button>
      <div v-if="notes.length === 0" :style="s.empty">No notes yet.</div>
      <div :style="s.list">
        <div v-for="n in notes" :key="n.id" :style="row" v-hover-style="s.rowHover">
          <div :style="s.taskMain">
            <div :style="s.noteRendered" v-html="n.text"></div>
            <span :style="s.finMeta">{{ timeLabel(n) }}</span>
          </div>
          <button :style="s.shareBtn" @click="app.share('note', n)">↗</button>
          <button :style="s.editBtn" @click="app.startEdit('note', n)">Edit</button>
          <button :style="s.del" @click="app.deleteWithUndo('notes', 'note', n.id)">×</button>
        </div>
      </div>
    </template>
  </div>
</template>
