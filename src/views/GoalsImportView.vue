<script setup lang="ts">
// Goals URL import preview (task 8, route /import/goals). Paste a link shaped
// like spasta.online/?project=<slug>&goals=<items> (or the legacy
// ?project=slug=a|b|c form); it is parsed tolerantly, shown as an editable
// preview, and written in one atomic import. Re-importing the same URL offers a
// merge into the existing goal instead of creating a duplicate.
import { computed, ref, onMounted } from 'vue'
import AutoTextarea from '@/components/ui/AutoTextarea.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useStyles } from '@/composables/useStyles'
import { pxify, rowBase, typeStep } from '@/styles'
import {
  parseImportUrl,
  parseGoalsJson,
  MAX_IMPORT_ITEMS,
  type ParsedImport,
  type GoalsDocument,
} from '@/utils/goals'

const app = useAppStore()
const ui = useUiStore()
const router = useRouter()
const { c, s } = useStyles()

type RowKind = 'checklist' | 'task' | 'todo'
interface Row {
  text: string
  estimateMins: number | null
  dueAt: string | null
  tags: string[]
  kind: RowKind
}

// Prefill from the current URL's query if it already carries the import params,
// so a pasted spasta link that landed here directly parses on open.
const initial =
  typeof window !== 'undefined' && /[?&]project=/.test(window.location.search)
    ? window.location.href
    : ''
const raw = ref(initial)
const parsed = ref<ParsedImport | null>(null)
const jsonDoc = ref<(GoalsDocument & { parseError?: string }) | null>(null)
const title = ref('')
const rows = ref<Row[]>([])
const merge = ref(false)
const dragActive = ref(false)

// If the box is empty on open, offer to prefill from a spasta link sitting on the
// clipboard (task 12.3). Permission is requested by the read itself; a denial or
// unsupported API fails silently — we never surface an error for this convenience.
onMounted(async () => {
  if (raw.value) return
  // A sample handed over by the help panel's "Load sample goal" (section 23).
  // Taken rather than read, so re-opening this screen does not overwrite what
  // the reader has since pasted themselves.
  const seed = app.takeGoalImportSeed()
  if (seed) {
    raw.value = seed
    doParse()
    return
  }
  try {
    const text = (await navigator.clipboard.readText())?.trim()
    if (text && /spasta\.online|[?&]project=/.test(text)) {
      raw.value = text
      doParse()
    }
  } catch {
    /* clipboard unavailable / denied — ignore */
  }
})

// The pasted text is JSON when it opens with a { or [ (after trimming); anything
// else is treated as a spasta URL / delimited list.
function looksLikeJson(s: string): boolean {
  const t = s.trim()
  return t.startsWith('{') || t.startsWith('[')
}
const importableJsonGoals = computed(() => (jsonDoc.value?.goals ?? []).filter((g) => !g.error))

const mergeCandidate = computed(() =>
  parsed.value ? app.goalBySourceUrl(parsed.value.sourceUrl) : undefined,
)
const overCap = computed(() => !!parsed.value && parsed.value.overCap)

function doParse() {
  if (looksLikeJson(raw.value)) {
    jsonDoc.value = parseGoalsJson(raw.value)
    parsed.value = null
    return
  }
  jsonDoc.value = null
  const p = parseImportUrl(raw.value)
  parsed.value = p
  title.value = p.goalTitle
  rows.value = p.items.map((i) => ({
    text: i.text,
    estimateMins: i.estimateMins,
    dueAt: i.dueAt,
    tags: i.tags,
    kind: 'checklist' as RowKind,
  }))
  merge.value = !!app.goalBySourceUrl(p.sourceUrl)
}
function doImportJson() {
  if (!jsonDoc.value || importableJsonGoals.value.length === 0) return
  app.importGoalsDocument({ goals: jsonDoc.value.goals })
  goHome()
}
// Read a dropped or chosen .json file into the paste box, then parse it.
function loadFile(file: File | undefined) {
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    raw.value = String(reader.result ?? '')
    doParse()
  }
  reader.readAsText(file)
}
function onDrop(e: DragEvent) {
  dragActive.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) loadFile(file)
}
function onFilePick(e: Event) {
  loadFile((e.target as HTMLInputElement).files?.[0])
}
function removeRow(i: number) {
  rows.value.splice(i, 1)
}
function moveRow(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= rows.value.length) return
  const arr = rows.value
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}
function onEstimate(i: number, e: Event) {
  const v = (e.target as HTMLInputElement).value
  rows.value[i].estimateMins = v === '' ? null : Math.max(0, parseInt(v, 10) || 0)
}

function doImport() {
  if (!parsed.value || overCap.value || rows.value.length === 0) return
  app.importGoals({
    title: title.value,
    sourceUrl: parsed.value.sourceUrl,
    rows: rows.value.map((r) => ({
      text: r.text,
      estimateMins: r.estimateMins,
      dueAt: r.dueAt,
      tags: r.tags,
      kind: r.kind,
    })),
    mergeGoalId: merge.value && mergeCandidate.value ? mergeCandidate.value.id : null,
  })
  goHome()
}
function goHome() {
  ui.setTab('goals')
  router.push('/')
}

// --- styles ------------------------------------------------------------------
const page = computed(() =>
  pxify({
    minHeight: '100vh',
    padding: '32px 16px',
    display: 'flex',
    justifyContent: 'center',
    color: c.value.text,
    fontFamily: 'var(--font-mono)',
  }),
)
const card = computed(() =>
  pxify({
    ...rowBase(c.value),
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 14,
    width: 'min(720px, 100%)',
    height: 'fit-content',
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(28px) saturate(1.6)',
  }),
)
const h1 = computed(() =>
  pxify({ ...typeStep('md'), fontWeight: 'var(--weight-semibold)', color: c.value.text }),
)
const sub = computed(() => pxify({ ...typeStep('xs'), color: c.value.dim, lineHeight: 1.5 }))
const rowStyle = computed(() =>
  pxify({
    display: 'flex',
    // Top-aligned, so the controls stay beside a wrapped row's first line.
    alignItems: 'flex-start',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 10,
    border: '1px solid ' + c.value.border,
    background: c.value.card,
    flexWrap: 'wrap',
  }),
)
const mini = computed(() =>
  pxify({ ...s.value.input, width: 78, padding: '4px 6px', ...typeStep('xs') }),
)
const btn = computed(() =>
  pxify({
    ...typeStep('xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: '5px 10px',
    borderRadius: 999,
    border: '1px solid ' + c.value.border,
    background: 'transparent',
    color: c.value.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
)
const primary = computed(() =>
  pxify({
    ...typeStep('sm'),
    fontWeight: 'var(--weight-semibold)',
    padding: '9px 16px',
    borderRadius: 999,
    border: 'none',
    background: c.value.accent,
    color: c.value.onAccent,
    cursor: 'pointer',
  }),
)
const actions = pxify({
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  marginTop: 4,
  flexWrap: 'wrap',
})
const dropZone = computed(() =>
  pxify({
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    border: '1.5px dashed ' + (dragActive.value ? c.value.accent : c.value.border),
    background: dragActive.value ? c.value.card : 'transparent',
    transition: 'border-color .15s ease, background .15s ease',
  }),
)
const warn = computed(() =>
  pxify({ ...typeStep('xs'), color: 'oklch(0.64 0.22 25)', fontWeight: 'var(--weight-semibold)' }),
)
const mergeNote = computed(() =>
  pxify({
    ...typeStep('xs'),
    color: c.value.text,
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid ' + c.value.accent,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  }),
)
</script>

<template>
  <div :style="page">
    <div :style="card">
      <div :style="h1">Import goals</div>
      <div :style="sub">
        Paste a <strong>spasta link</strong> (<code
          >?project=learningandgoals=read papers|build bot ~2h</code
        >) or a <strong>goals JSON</strong> document, or drop a <code>.json</code> file below. Link
        items may carry <code>~45m</code>/<code>~2h</code>, <code>@2026-09-01</code> and
        <code>#tag</code>.
      </div>

      <div
        :style="dropZone"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop.prevent="onDrop"
      >
        <textarea
          :style="{ ...s.input, width: '100%', minHeight: 72, resize: 'vertical' }"
          v-model="raw"
          placeholder="Paste a link or JSON…"
        ></textarea>
        <div :style="sub">Drag a .json file here, or</div>
        <label :style="btn">
          Choose file…
          <input type="file" accept="application/json,.json" hidden @change="onFilePick" />
        </label>
      </div>
      <div :style="actions">
        <button :style="primary" @click="doParse">Preview</button>
        <button :style="btn" @click="goHome">Cancel</button>
      </div>

      <template v-if="jsonDoc">
        <div v-if="jsonDoc.parseError">
          <div :style="warn">Could not parse JSON: {{ jsonDoc.parseError }}</div>
          <div :style="sub">
            Fix common issues — remove trailing commas, replace “smart quotes” with straight
            <code>"</code>, and make sure every bracket is closed. Your text is kept above.
          </div>
        </div>
        <div v-else-if="jsonDoc.goals.length === 0" :style="s.empty">
          No goals found in that JSON.
        </div>
        <template v-else>
          <div :style="sub">
            {{ importableJsonGoals.length }} goal{{
              importableJsonGoals.length === 1 ? '' : 's'
            }}
            ready to import<span v-if="jsonDoc.project">
              from project <strong>{{ jsonDoc.project }}</strong></span
            >.
          </div>
          <div v-for="(g, gi) in jsonDoc.goals" :key="gi" :style="rowStyle">
            <span :style="{ flex: 1, fontWeight: 'var(--weight-semibold)', color: c.text }">
              {{ g.title || '(untitled)' }}
            </span>
            <span v-if="g.error" :style="warn">{{ g.error }}</span>
            <span v-else :style="sub"
              >{{ g.points.length }} point{{ g.points.length === 1 ? '' : 's' }}</span
            >
          </div>
          <div :style="actions">
            <button
              :style="primary"
              :disabled="importableJsonGoals.length === 0"
              @click="doImportJson"
            >
              Import {{ importableJsonGoals.length }} goal{{
                importableJsonGoals.length === 1 ? '' : 's'
              }}
            </button>
            <button :style="btn" @click="goHome">Cancel</button>
          </div>
        </template>
      </template>

      <template v-if="parsed">
        <div :style="sub">
          Project <strong>{{ parsed.projectSlug || '—' }}</strong> — this workspace has no separate
          projects, so it seeds the goal title below.
        </div>

        <label :style="sub">Goal title</label>
        <input :style="{ ...s.input, width: '100%' }" v-model="title" placeholder="Goal title" />

        <div v-if="overCap" :style="warn">
          Too many items — {{ parsed.items.length }} shown, the import cap is
          {{ MAX_IMPORT_ITEMS }}. Trim the source link and try again.
        </div>

        <div v-if="mergeCandidate" :style="mergeNote">
          <input type="checkbox" v-model="merge" />
          <span>
            A goal already exists for this link (“{{ mergeCandidate.title }}”). Merge — appending
            only new checklist items — instead of creating a duplicate.
          </span>
        </div>

        <div v-if="rows.length === 0" :style="s.empty">No items parsed from that link.</div>
        <div v-for="(r, i) in rows" :key="i" :style="rowStyle">
          <!-- A pasted point has to be readable in full before it is confirmed
               (acceptance 105), so this grows to fit rather than cutting off. -->
          <AutoTextarea
            class="importrow__text"
            v-model="r.text"
            label="Item text"
            placeholder="Item text"
          />
          <select
            :style="s.select"
            :value="r.kind"
            @change="r.kind = ($event.target as HTMLSelectElement).value as RowKind"
          >
            <option value="checklist">Checklist</option>
            <option value="task">Task</option>
            <option value="todo">Todo</option>
          </select>
          <input
            :style="mini"
            type="number"
            min="0"
            :value="r.estimateMins ?? ''"
            placeholder="est m"
            @input="onEstimate(i, $event)"
          />
          <GlassDatePicker
            size="sm"
            :model-value="r.dueAt ?? ''"
            placeholder="Due"
            @update:model-value="r.dueAt = String($event ?? '')"
          />
          <button :style="btn" title="Move up" @click="moveRow(i, -1)">↑</button>
          <button :style="btn" title="Move down" @click="moveRow(i, 1)">↓</button>
          <button :style="s.del" @click="removeRow(i)">×</button>
        </div>

        <div :style="actions">
          <button :style="primary" :disabled="overCap || rows.length === 0" @click="doImport">
            {{ merge && mergeCandidate ? 'Merge into goal' : 'Import' }} ({{ rows.length }})
          </button>
          <button :style="btn" @click="goHome">Cancel</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Takes the room the other controls do not, and grows downwards rather than
   truncating (section 20b). */
.importrow__text {
  flex: 1;
  min-width: 160px;
}
</style>
