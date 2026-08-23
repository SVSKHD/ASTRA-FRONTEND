<script setup lang="ts">
import TextInput from '@/components/ui/TextInput.vue'
// The Commands help: a compact, searchable glass panel that lists every slash
// command and markdown shortcut with a one-line description and a tiny preview
// of the result. Opened from the notes drawer header so the editor's shortcuts
// are discoverable rather than folklore. Rendered inside the drawer, so it works
// on mobile exactly as it does on desktop.
import { computed, ref } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { SLASH_COMMANDS, MARKDOWN_SHORTCUTS } from '@/utils/editorCommands'

defineEmits<{ (e: 'close'): void }>()

const { c } = useStyles()
const query = ref('')

const commands = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.id.includes(q) ||
      cmd.label.toLowerCase().includes(q) ||
      cmd.hint.toLowerCase().includes(q) ||
      cmd.example.includes(q) ||
      cmd.keywords.some((k) => k.includes(q)),
  )
})
const shortcuts = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return MARKDOWN_SHORTCUTS
  return MARKDOWN_SHORTCUTS.filter(
    (m) => m.syntax.toLowerCase().includes(q) || m.hint.toLowerCase().includes(q),
  )
})
const nothing = computed(() => commands.value.length === 0 && shortcuts.value.length === 0)

const panelStyle = computed(() =>
  pxify({
    position: 'absolute',
    inset: 0,
    zIndex: 2,
    background: c.value.glass,
    backdropFilter: 'blur(30px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(30px) saturate(1.6)',
    borderRadius: 'var(--radius-dialog)',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-3)',
    animation: 'fadeUp .25s ease both',
  }),
)
const headRow = pxify({ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' })
const titleStyle = computed(() =>
  pxify({
    flex: 1,
    ...typeStep('sm'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: c.value.text,
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
  }),
)
const listStyle = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-2)',
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
  paddingRight: 2,
})
const rowStyle = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    padding: '9px 10px',
    borderRadius: 'var(--radius-dialog)',
    background: c.value.card,
    border: '1px solid ' + c.value.border,
  }),
)
const chipStyle = computed(() =>
  pxify({
    flexShrink: 0,
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '3px 8px',
    borderRadius: 'var(--radius-control)',
    background: c.value.input,
    border: '1px solid ' + c.value.border,
    color: c.value.accent,
    fontFamily: 'var(--font-mono)',
    whiteSpace: 'nowrap',
  }),
)
const rowMain = pxify({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 })
const rowLabel = computed(() =>
  pxify({ ...typeStep('xs'), fontWeight: 'var(--weight-semibold)', color: c.value.text }),
)
const rowHint = computed(() => pxify({ ...typeStep('2xs'), color: c.value.dim, lineHeight: 1.3 }))
const previewStyle = computed(() =>
  pxify({
    flexShrink: 0,
    width: 74,
    maxHeight: 40,
    overflow: 'hidden',
    ...typeStep('2xs'),
    lineHeight: 1.2,
    color: c.value.dim,
    opacity: 0.85,
    borderLeft: '1px solid ' + c.value.border,
    paddingLeft: 8,
  }),
)
const sectionLabel = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: c.value.dim,
    padding: '4px 2px 0',
  }),
)
const mdRow = computed(() =>
  pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    padding: '7px 10px',
    borderRadius: 'var(--radius-card)',
    background: c.value.input,
  }),
)
const emptyStyle = computed(() =>
  pxify({ textAlign: 'center', color: c.value.dim, ...typeStep('xs'), padding: '18px 0' }),
)
const closeBtn = computed(() =>
  pxify({
    cursor: 'pointer',
    color: c.value.dim,
    ...typeStep('lg'),
    background: 'none',
    border: 'none',
  }),
)
</script>

<template>
  <div :style="panelStyle">
    <div :style="headRow">
      <span :style="titleStyle">
        <span aria-hidden="true">⌘</span>
        Commands
      </span>
      <button :style="closeBtn" aria-label="Close commands help" @click="$emit('close')">×</button>
    </div>

    <TextInput
      type="search"
      placeholder="Search commands…"
      v-model="query"
      aria-label="Search commands"
    />

    <div :style="listStyle">
      <div v-if="nothing" :style="emptyStyle">No command matches that.</div>

      <template v-if="commands.length">
        <div v-for="cmd in commands" :key="cmd.id" :style="rowStyle" :title="cmd.example">
          <span :style="chipStyle">{{ cmd.example }}</span>
          <span :style="rowMain">
            <span :style="rowLabel">{{ cmd.label }}</span>
            <span :style="rowHint">{{ cmd.hint }}</span>
          </span>
          <span class="rich" :style="previewStyle" v-html="cmd.preview"></span>
        </div>
      </template>

      <template v-if="shortcuts.length">
        <div :style="sectionLabel">Markdown shortcuts</div>
        <div v-for="m in shortcuts" :key="m.syntax" :style="mdRow">
          <span :style="chipStyle">{{ m.syntax }}</span>
          <span :style="rowHint">{{ m.hint }}</span>
        </div>
      </template>
    </div>
  </div>
</template>
