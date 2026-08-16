<script setup lang="ts">
// The click-drag quick create popover (section 15, QUICK CREATE). A title input
// (autofocused), a type toggle, a project, and the time range the drag already
// chose. Enter saves, Esc discards — nothing is written until one of those.
import { computed, nextTick, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import { durationLabel } from '@/utils/calendarEvents'

const props = defineProps<{
  start: number
  end: number
  allDay: boolean
  x: number
  y: number
}>()
const emit = defineEmits<{
  close: []
  create: [{ kind: 'task' | 'todo' | 'reminder'; title: string; project: string }]
}>()

const app = useAppStore()
const { c, s } = useStyles()
const { tags } = storeToRefs(app)

const title = ref('')
const kind = ref<'task' | 'todo' | 'reminder'>('task')
const project = ref('')
const input = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  await nextTick()
  input.value?.focus()
})

function save() {
  if (!title.value.trim()) return
  emit('create', { kind: kind.value, title: title.value.trim(), project: project.value })
}

const rangeLabel = computed(() => {
  if (props.allDay) return 'All day'
  const fmt = (ms: number) =>
    new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${fmt(props.start)} – ${fmt(props.end)} · ${durationLabel((props.end - props.start) / 60_000)}`
})

const card = computed(() =>
  pxify({
    position: 'fixed',
    left: Math.min(props.x, (typeof window !== 'undefined' ? window.innerWidth : 900) - 290),
    top: Math.min(props.y, (typeof window !== 'undefined' ? window.innerHeight : 700) - 210),
    zIndex: 19,
    width: 270,
    background: c.value.glass,
    backdropFilter: 'blur(30px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    borderRadius: 14,
    padding: 12,
    boxShadow: c.value.shadow,
    color: c.value.text,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  }),
)
function typeBtn(active: boolean) {
  return pxify({
    flex: 1,
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: 8,
    cursor: 'pointer',
    border: '1px solid ' + (active ? c.value.accent : c.value.border),
    background: active
      ? 'color-mix(in oklch, ' + c.value.accent + ' 18%, transparent)'
      : 'transparent',
    color: active ? c.value.accent : c.value.dim,
  })
}
const rowStyle = pxify({ display: 'flex', gap: 6 })
const metaStyle = computed(() => pxify({ fontSize: 11, color: c.value.dim }))
</script>

<template>
  <div :style="s.dialogOverlay" @click="emit('close')"></div>
  <div :style="card" @keydown.enter.prevent="save" @keydown.esc.prevent="emit('close')">
    <input ref="input" :style="s.input" placeholder="What is it?" v-model="title" />
    <div :style="rowStyle">
      <button :style="typeBtn(kind === 'task')" @click="kind = 'task'">Task</button>
      <button :style="typeBtn(kind === 'todo')" @click="kind = 'todo'">Todo</button>
      <button :style="typeBtn(kind === 'reminder')" @click="kind = 'reminder'">Reminder</button>
    </div>
    <select :style="s.select" v-model="project">
      <option value="">No project</option>
      <option v-for="tag in tags" :key="tag" :value="tag">{{ tag }}</option>
    </select>
    <span :style="metaStyle">{{ rangeLabel }}</span>
    <div :style="s.dialogActions">
      <button :style="s.saveBtn" @click="save">Create</button>
      <button :style="s.cancelBtn" @click="emit('close')">Cancel</button>
    </div>
  </div>
</template>
