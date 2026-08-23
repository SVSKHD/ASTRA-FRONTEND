<script setup lang="ts">
// The click-drag quick create popover (section 15, rebuilt for section 24c).
// A title, a type, a project, and the time range the drag already chose. Enter
// saves, Esc discards — nothing is written until one of those.
//
// Two things were wrong with it, and they are separate problems.
//
// It was clipped. The panel was positioned `fixed` inside the calendar shell,
// and `fixed` does not escape an ancestor with a `transform` or a
// `backdrop-filter` — the glass panel has both, so the panel was laid out
// against the shell and cut off at its edge. Hence the portal: it renders at
// body level and is told where to go, and placeCellPopover works that out,
// flipping to the left of the cell when the cell is against the right edge of
// the window (a month grid puts one there every fourth week).
//
// And it was assembled from raw elements — a bare input, an unstyled native
// select, three hand-rolled buttons — at three different font sizes. It is now
// library controls at one size, which is the only way it matches the dialogs it
// opens next to.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { durationLabel } from '@/utils/calendarEvents'
import { placeCellPopover } from '@/utils/popoverPlace'
import TextInput from '@/components/ui/TextInput.vue'
import Select from '@/components/ui/Select.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Switch from '@/components/ui/Switch.vue'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{
  start: number
  end: number
  allDay: boolean
  /** The cell the drag ended on, in viewport coordinates. */
  anchor: { top: number; left: number; width: number; height: number }
}>()
const emit = defineEmits<{
  close: []
  create: [{ kind: 'task' | 'todo' | 'reminder'; title: string; project: string; allDay: boolean }]
}>()

const app = useAppStore()
const { c } = useStyles()
const { tags } = storeToRefs(app)

const title = ref('')
const kind = ref('task')
const project = ref('')
const allDay = ref(props.allDay)
const panel = ref<HTMLElement | null>(null)

const KINDS = [
  { value: 'task', label: 'Task' },
  { value: 'todo', label: 'Todo' },
  { value: 'reminder', label: 'Reminder' },
]
const projectOptions = computed(() => [
  { value: '', label: 'No project' },
  ...tags.value.map((t) => ({ value: t, label: t })),
])

const pos = ref({ top: 0, left: 0 })

// Measured, not guessed. The panel's height depends on the theme's control
// sizes and on whether the range label wraps, so the hardcoded 210 it used to
// subtract was wrong on half the themes — the other half of why it hung off the
// bottom of the window.
function reposition() {
  const el = panel.value
  if (!el || typeof window === 'undefined') return
  const box = el.getBoundingClientRect()
  pos.value = placeCellPopover(
    props.anchor,
    { top: 0, left: 0, width: box.width, height: box.height },
    { width: window.innerWidth, height: window.innerHeight },
  )
}

onMounted(async () => {
  await nextTick()
  reposition()
  panel.value?.querySelector('input')?.focus()
  window.addEventListener('resize', reposition)
  window.addEventListener('scroll', reposition, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', reposition)
  window.removeEventListener('scroll', reposition, true)
})

function save() {
  if (!title.value.trim()) return
  emit('create', {
    kind: kind.value as 'task' | 'todo' | 'reminder',
    title: title.value.trim(),
    project: project.value,
    allDay: allDay.value,
  })
}

const rangeLabel = computed(() => {
  if (allDay.value) return 'All day'
  const fmt = (ms: number) =>
    new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${fmt(props.start)} – ${fmt(props.end)} · ${durationLabel((props.end - props.start) / 60_000)}`
})
</script>

<template>
  <Teleport to="body">
    <div class="cqc__scrim" @click="emit('close')"></div>
    <div
      ref="panel"
      class="cqc"
      role="dialog"
      aria-label="Quick create"
      :style="{ top: `${pos.top}px`, left: `${pos.left}px`, boxShadow: c.shadow }"
      @keydown.enter.prevent="save"
      @keydown.esc.prevent="emit('close')"
    >
      <TextInput v-model="title" placeholder="What is it?" size="md" />
      <SegmentedControl v-model="kind" :options="KINDS" size="md" aria-label="Type" />
      <Select v-model="project" :options="projectOptions" size="md" />
      <label class="cqc__row">
        <Switch v-model="allDay" />
        <span>All day</span>
      </label>
      <span class="cqc__meta ui-mono">{{ rangeLabel }}</span>
      <div class="cqc__actions">
        <Button variant="primary" size="md" :disabled="!title.trim()" @click="save">Create</Button>
        <Button variant="ghost" size="md" @click="emit('close')">Cancel</Button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cqc__scrim {
  position: fixed;
  inset: 0;
  z-index: 80;
}
.cqc {
  position: fixed;
  z-index: 81;
  width: 300px;
  max-width: calc(100vw - 2 * var(--sp-2));
  min-width: 0;
  display: flex;
  flex-direction: column;
  /* Section 24c: 12px gaps, one value, rather than the 6/8/10 mix that made the
     rows read as three fragments of three different forms. */
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-radius: var(--radius-dialog);
  border: 1px solid var(--border-subtle, var(--glass-border));
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  color: var(--text-primary, var(--theme-text));
  font-size: var(--text-base);
  line-height: var(--lh-base);
}
.cqc__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  cursor: pointer;
}
.cqc__meta {
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
.cqc__actions {
  display: flex;
  gap: var(--sp-2);
  min-width: 0;
}
</style>
