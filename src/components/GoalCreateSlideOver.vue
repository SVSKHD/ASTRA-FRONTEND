<script setup lang="ts">
import TextInput from '@/components/ui/TextInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
// Manual "new goal" slide-over (task 12c). A floating right-side drawer (not a
// full page, and not glued to the edge either — the same inset, rounded panel
// the notes drawer uses) that creates a draft goal on open and edits it live:
// title, optional timeline, colour, description, an optional "Make it recurring"
// block (the section-11 recurrence/metric editor), and inline points added one
// after another with a live shorthand-chip preview. Create finalises + routes to
// the detail; Cancel discards the draft.
//
// It also carries the shape a goal has to have: the example document and the
// required fields, open on arrival. The form's own labels say what each field
// is; what they cannot say is which of them a goal cannot do without, or what
// the same goal looks like as JSON — and that is exactly what somebody about to
// paste or script one needs before they start typing.
import { ref, computed, onMounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import AutoTextarea from '@/components/ui/AutoTextarea.vue'
import GoalMetricPanel from '@/components/GoalMetricPanel.vue'
import { parseItemMetadata } from '@/utils/goals'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import SlideOver from '@/components/ui/SlideOver.vue'
import Caret from '@/components/ui/Caret.vue'
import { GOAL_SCHEMA_FIELDS, GOAL_SHORTHAND, SAMPLE_GOAL_JSON } from '@/utils/goalHelp'

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

// The drawer's own width, not the detail panes' mode: a button on this form
// must not move the pane on the tab behind it (see utils/paneMode).
const wide = computed(() => app.drawerWide)

// --- what a goal has to have -------------------------------------------------
// Open on arrival, and collapsible: it is a reference, and a reference that
// cannot be folded away is in the way of the form it describes. The rows come
// from utils/goalHelp, which is asserted against the real importer — a field
// list that drifts from the parser is worse than none.
const showFormat = ref(true)
const requiredFields = computed(() => GOAL_SCHEMA_FIELDS.filter((f) => f.required))
const optionalFields = computed(() =>
  GOAL_SCHEMA_FIELDS.filter((f) => !f.required && f.source === 'json'),
)
// Where the field actually sits in the document. `title` on its own is the kind
// of half-answer that makes somebody nest it wrongly and wonder why the import
// dropped their goal.
function fieldPath(f: (typeof GOAL_SCHEMA_FIELDS)[number]): string {
  if (f.scope === 'goal') return `goals[].${f.field}`
  if (f.scope === 'point') return `goals[].points[].${f.field}`
  return f.field
}
// goalHelp writes its prose with markdown ticks; this block renders plain text.
const plain = (text: string) => text.replace(/`/g, '')
const sampleCopied = ref(false)
async function copySample() {
  try {
    await navigator.clipboard.writeText(SAMPLE_GOAL_JSON)
    sampleCopied.value = true
    setTimeout(() => (sampleCopied.value = false), 1500)
  } catch {
    // Clipboard blocked. The sample is on screen and selectable, so this is a
    // convenience that failed rather than an error worth a toast.
  }
}
// The full reference (schema table, the three routes in) lives in the help
// drawer. Opening it discards nothing: the draft stays as it is.
function openFullReference() {
  app.openGoalHelp('json')
}

// --- styles ------------------------------------------------------------------
// The drawer itself (fixed, inset, rounded, glass) is SlideOver's; what is left
// here is the form inside it.
const body = pxify({
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-3)',
  minWidth: 0,
  flex: 1,
})
const fieldLabel = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim }))
const dateRow = pxify({
  display: 'flex',
  gap: 'var(--sp-3)',
  flexWrap: 'wrap',
  alignItems: 'center',
})
const swatchRow = pxify({ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' })
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
const sectionTitle = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: c.value.dim,
    marginTop: 4,
  }),
)
// Top-aligned: a point that wraps keeps its delete button beside the first line.
const pointRow = pxify({ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-2)' })
// Wraps rather than truncating — an added point is read back in full.
const pointText = computed(() =>
  pxify({
    ...typeStep('sm'),
    lineHeight: 1.5,
    color: c.value.text,
    flex: 1,
    minWidth: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  }),
)
const chipRow = pxify({ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginTop: -4 })
const chip = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-pill)',
    color: c.value.accent,
    border: '1px solid ' + c.value.accent,
  }),
)
const delBtn = computed(() =>
  pxify({ ...s.value.del, ...typeStep('base'), cursor: 'pointer', flexShrink: 0 }),
)
// --- the format block --------------------------------------------------------
const formatBlock = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
    minWidth: 0,
    marginTop: 4,
    padding: '12px 14px',
    borderRadius: 'var(--radius-card)',
    border: '1px dashed ' + c.value.border,
    background: c.value.input,
  }),
)
const formatHead = pxify({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--sp-2)',
  flexWrap: 'wrap',
  minWidth: 0,
})
const discBtn = computed(() =>
  pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-1)',
    flex: 1,
    minWidth: 0,
    padding: 0,
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: c.value.dim,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  }),
)
const tinyBtn = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '4px 8px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
)
const sampleBox = computed(() =>
  pxify({
    margin: 0,
    minWidth: 0,
    maxHeight: 220,
    overflow: 'auto',
    overscrollBehavior: 'contain',
    padding: '10px 12px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid ' + c.value.border,
    background: c.value.card,
    ...typeStep('2xs'),
    lineHeight: 1.6,
    color: c.value.text,
    fontFamily: 'var(--font-mono)',
    whiteSpace: 'pre',
  }),
)
const reqNote = computed(() => pxify({ ...typeStep('2xs'), color: c.value.dim, lineHeight: 1.5 }))
// field → what it is, one per line. A grid rather than a table: five columns of
// schema belong in the help drawer, and what is needed here is which fields
// exist and which of them a goal cannot be created without.
const fieldGrid = pxify({
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 1fr)',
  columnGap: 'var(--sp-3)',
  rowGap: 2,
  minWidth: 0,
})
const fieldName = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontFamily: 'var(--font-mono)',
    color: c.value.accent,
    whiteSpace: 'nowrap',
  }),
)
const fieldNote = computed(() =>
  pxify({ ...typeStep('2xs'), color: c.value.dim, minWidth: 0, overflowWrap: 'anywhere' }),
)
const reqTag = computed(() =>
  pxify({
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '1px 6px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + c.value.accent,
    color: c.value.accent,
    whiteSpace: 'nowrap',
  }),
)
const footer = pxify({ display: 'flex', gap: 'var(--sp-3)', marginTop: 'auto', paddingTop: 8 })
const createBtn = computed(() =>
  pxify({
    flex: 1,
    ...typeStep('sm'),
    fontWeight: 'var(--weight-semibold)',
    padding: '10px 16px',
    borderRadius: 'var(--radius-pill)',
    border: 'none',
    background: canCreate.value ? c.value.accent : c.value.border,
    color: canCreate.value ? c.value.onAccent : c.value.dim,
    cursor: canCreate.value ? 'pointer' : 'not-allowed',
  }),
)
const cancelBtn = computed(() =>
  pxify({
    ...typeStep('sm'),
    fontWeight: 'var(--weight-semibold)',
    padding: '10px 16px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
  }),
)
</script>

<template>
  <!-- A form has no column of this tab to sit in, so it is always a drawer and
       its button only picks a width — its own, never the detail panes'. The
       wide step is `lg` rather than half the window: this is a column of
       fields, and a 700px-wide text input is not a better text input. -->
  <SlideOver
    open
    :size="wide ? 'lg' : 'compact'"
    :mode-icon="wide ? 'minimize' : 'maximize'"
    :mode-label="wide ? 'Compact drawer' : 'Wider drawer'"
    title="New goal"
    @mode="app.toggleDrawerWide()"
    @close="cancel"
  >
    <div :style="body">
      <TextInput
        ref="titleInput"
        :model-value="goal?.title"
        placeholder="Goal title"
        @update:model-value="set('title', $event)"
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

      <TextArea
        :model-value="goal?.description ?? ''"
        placeholder="Description (optional)"
        @update:model-value="set('description', $event)"
      />

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

      <!-- What a goal has to have, and the same goal as a document. Open on
           arrival; the disclosure folds it away once it has been read. -->
      <section :style="formatBlock">
        <div :style="formatHead">
          <button :style="discBtn" :aria-expanded="showFormat" @click="showFormat = !showFormat">
            <Caret :open="showFormat" size="xs" />
            Example JSON &amp; what a goal needs
          </button>
          <button v-if="showFormat" :style="tinyBtn" @click="copySample">
            {{ sampleCopied ? 'Copied ✓' : 'Copy' }}
          </button>
          <button v-if="showFormat" :style="tinyBtn" @click="openFullReference">
            Full reference
          </button>
        </div>

        <template v-if="showFormat">
          <pre :style="sampleBox"><code>{{ SAMPLE_GOAL_JSON }}</code></pre>

          <div :style="reqNote">
            <span :style="reqTag">Required</span> — everything else is optional, and a goal missing
            a required field is skipped rather than failing the import.
          </div>
          <div :style="fieldGrid">
            <template v-for="f in requiredFields" :key="`req-${f.scope}.${f.field}`">
              <span :style="fieldName">{{ fieldPath(f) }}</span>
              <span :style="fieldNote">{{ f.type }} — {{ plain(f.notes) }}</span>
            </template>
          </div>

          <div :style="reqNote">Optional</div>
          <div :style="fieldGrid">
            <template v-for="f in optionalFields" :key="`opt-${f.scope}.${f.field}`">
              <span :style="fieldName">{{ fieldPath(f) }}</span>
              <span :style="fieldNote">{{ f.type }} — example {{ f.example }}</span>
            </template>
          </div>

          <div :style="reqNote">
            Shorthand inside a point —
            <template v-for="(sh, i) in GOAL_SHORTHAND" :key="sh.token"
              ><span v-if="i">, </span><code>{{ sh.token }}</code> {{ plain(sh.means) }}</template
            >.
          </div>
        </template>
      </section>

      <div :style="footer">
        <button :style="createBtn" :disabled="!canCreate" @click="create">Create goal</button>
        <button :style="cancelBtn" @click="cancel">Cancel</button>
      </div>
    </div>
  </SlideOver>
</template>
