<script setup lang="ts">
// Manual "new goal" slide-over (task 12c). A right-side panel (not a full page)
// that creates a draft goal on open and edits it live: title, optional timeline,
// colour, description, an optional "Make it recurring" block (the section-11
// recurrence/metric editor), and inline points added one after another with a
// live shorthand-chip preview. Create finalises + routes to the detail; Cancel
// discards the draft.
import { ref, computed, onMounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import AutoTextarea from '@/components/ui/AutoTextarea.vue'
import GoalMetricPanel from '@/components/GoalMetricPanel.vue'
import { parseItemMetadata } from '@/utils/goals'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'

const emit = defineEmits<{ (e: 'close'): void; (e: 'created', goalId: number): void }>()

const app = useAppStore()
const { c, s } = useStyles()
const { goals, goalChecklist } = storeToRefs(app)

const draftId = ref<number>(-1)
let finalised = false

const goal = computed(() => goals.value.find((g) => g.id === draftId.value))
const points = computed(() => {
  void goalChecklist.value
  return app.checklistOf(draftId.value)
})
const canCreate = computed(() => (goal.value?.title ?? '').trim().length > 0)

const COLORS = ['#4ade80', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#34d399']

const titleInput = ref<HTMLInputElement | null>(null)
// AutoTextarea exposes focus(); the ref is to the component, not the element.
const pointInput = ref<{ focus: () => void } | null>(null)
const draftPoint = ref('')

// Live shorthand preview of the point being typed.
const parsedPoint = computed(() => parseItemMetadata(draftPoint.value))

onMounted(async () => {
  draftId.value = app.addGoal({ title: '' })
  await nextTick()
  titleInput.value?.focus()
})

function set(field: 'title' | 'description' | 'startDate' | 'targetDate' | 'color', v: string) {
  app.updateGoal(draftId.value, { [field]: v })
}
function addPoint() {
  const p = parseItemMetadata(draftPoint.value)
  if (!p.text) return
  app.addChecklistItem(draftId.value, p.text, {
    estimateMins: p.estimateMins,
    dueAt: p.dueAt ?? '',
    tags: p.tags,
  })
  draftPoint.value = ''
  pointInput.value?.focus() // keep focus for the next point
}
function exitAdd() {
  draftPoint.value = ''
  ;(document.activeElement as HTMLElement | null)?.blur?.()
}
function removePoint(id: number) {
  app.deleteChecklistItem(id)
}

function create() {
  if (!canCreate.value) return
  finalised = true
  emit('created', draftId.value)
}
function cancel() {
  if (!finalised && draftId.value > 0) app.deleteGoal(draftId.value)
  emit('close')
}

// --- styles ------------------------------------------------------------------
const overlay = pxify({
  position: 'fixed',
  inset: '0',
  background: 'rgba(0,0,0,0.5)',
  zIndex: 60,
  display: 'flex',
  justifyContent: 'flex-end',
})
const panel = computed(() =>
  pxify({
    width: 'min(460px, 100%)',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 18,
    overflowY: 'auto',
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(28px) saturate(1.6)',
    borderLeft: '1px solid ' + c.value.border,
    boxShadow: c.value.shadow,
    animation: 'slideInR .22s ease both',
  }),
)
const headRow = pxify({ display: 'flex', alignItems: 'center', gap: 10 })
const h1 = computed(() => pxify({ fontSize: 16, fontWeight: 700, color: c.value.text, flex: 1 }))
const fieldLabel = computed(() => pxify({ fontSize: 11, color: c.value.dim }))
const titleField = computed(() =>
  pxify({ ...s.value.input, width: '100%', fontSize: 16, fontWeight: 600, padding: '8px 10px' }),
)
const dateRow = pxify({ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' })
const swatchRow = pxify({ display: 'flex', gap: 6, flexWrap: 'wrap' })
function swatch(color: string, active: boolean) {
  return pxify({
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: color,
    cursor: 'pointer',
    border: '2px solid ' + (active ? c.value.text : 'transparent'),
  })
}
const descField = computed(() =>
  pxify({ ...s.value.input, width: '100%', minHeight: 52, resize: 'vertical' }),
)
const sectionTitle = computed(() =>
  pxify({
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: c.value.dim,
    marginTop: 4,
  }),
)
// Top-aligned: a point that wraps keeps its delete button beside the first line.
const pointRow = pxify({ display: 'flex', alignItems: 'flex-start', gap: 8 })
// Wraps rather than truncating — an added point is read back in full.
const pointText = computed(() =>
  pxify({
    fontSize: 13,
    lineHeight: 1.5,
    color: c.value.text,
    flex: 1,
    minWidth: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  }),
)
const chipRow = pxify({ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: -4 })
const chip = computed(() =>
  pxify({
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 999,
    color: c.value.accent,
    border: '1px solid ' + c.value.accent,
  }),
)
const delBtn = computed(() =>
  pxify({ ...s.value.del, fontSize: 14, cursor: 'pointer', flexShrink: 0 }),
)
const footer = pxify({ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 8 })
const createBtn = computed(() =>
  pxify({
    flex: 1,
    fontSize: 13,
    fontWeight: 700,
    padding: '10px 16px',
    borderRadius: 999,
    border: 'none',
    background: canCreate.value ? c.value.accent : c.value.border,
    color: canCreate.value ? c.value.onAccent : c.value.dim,
    cursor: canCreate.value ? 'pointer' : 'not-allowed',
  }),
)
const cancelBtn = computed(() =>
  pxify({
    fontSize: 13,
    fontWeight: 600,
    padding: '10px 16px',
    borderRadius: 999,
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
  }),
)
</script>

<template>
  <div :style="overlay" @click.self="cancel">
    <div :style="panel">
      <div :style="headRow">
        <span :style="h1">New goal</span>
        <button :style="cancelBtn" @click="cancel">Close</button>
      </div>

      <input
        ref="titleInput"
        :style="titleField"
        :value="goal?.title"
        placeholder="Goal title"
        @input="set('title', ($event.target as HTMLInputElement).value)"
        @keydown.enter.prevent="create"
      />

      <div :style="dateRow">
        <label :style="fieldLabel">Start</label>
        <GlassDatePicker
          :model-value="goal?.startDate ?? ''"
          placeholder="Start"
          @update:model-value="set('startDate', String($event ?? ''))"
        />
        <label :style="fieldLabel">Target</label>
        <GlassDatePicker
          :model-value="goal?.targetDate ?? ''"
          :min="goal?.startDate || null"
          placeholder="Target"
          @update:model-value="set('targetDate', String($event ?? ''))"
        />
      </div>

      <div :style="swatchRow">
        <span
          v-for="col in COLORS"
          :key="col"
          :style="swatch(col, goal?.color === col)"
          @click="set('color', goal?.color === col ? '' : col)"
        ></span>
      </div>

      <textarea
        :style="descField"
        :value="goal?.description"
        placeholder="Description (optional)"
        @input="set('description', ($event.target as HTMLTextAreaElement).value)"
      ></textarea>

      <!-- Recurrence + metric block from section 11 (config only). -->
      <GoalMetricPanel v-if="draftId > 0" :goal-id="draftId" config-only />

      <!-- Inline points -->
      <div :style="sectionTitle">Points</div>
      <div v-for="p in points" :key="p.id" :style="pointRow">
        <span :style="pointText">{{ p.text }}</span>
        <button :style="delBtn" @click="removePoint(p.id)">×</button>
      </div>
      <!-- Grows as it is typed rather than scrolling sideways, so a long point
           is readable before it is added (section 20b). Enter still adds it;
           Shift+Enter is how a newline gets in. -->
      <AutoTextarea
        ref="pointInput"
        class="gcso__pointinput"
        v-model="draftPoint"
        label="Add a point"
        placeholder="Add a point — Enter to add, shorthand ~2h @date #tag"
        @commit="addPoint"
        @revert="exitAdd"
      />
      <div v-if="draftPoint.trim()" :style="chipRow">
        <span :style="chip">{{ parsedPoint.text || '(empty)' }}</span>
        <span v-if="parsedPoint.estimateMins != null" :style="chip"
          >~{{ parsedPoint.estimateMins }}m</span
        >
        <span v-if="parsedPoint.dueAt" :style="chip">@{{ parsedPoint.dueAt }}</span>
        <span v-for="t in parsedPoint.tags" :key="t" :style="chip">#{{ t }}</span>
      </div>

      <div :style="footer">
        <button :style="createBtn" :disabled="!canCreate" @click="create">Create goal</button>
        <button :style="cancelBtn" @click="cancel">Cancel</button>
      </div>
    </div>
  </div>
</template>
