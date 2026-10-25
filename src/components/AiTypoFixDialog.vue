<script setup lang="ts">
// "Fix typos in my items" (AI tab). Three steps in one dialog: pick what to
// check, watch the scan, then review every proposed fix before anything is
// written. Nothing changes until "Fix"; the toast after it has an Undo.
// The work lives in utils/typoSweep.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import { useAppStore } from '@/stores/app'
import { startProgress, type ProgressHandle } from '@/services/progress'
import { wordChanges } from '@/utils/autoCorrectFields'
import {
  SWEEP_KIND_LABEL,
  applyTypoFixes,
  scanForTypos,
  sweepCounts,
  sweepSources,
  type SweepKind,
  type TypoFix,
} from '@/utils/typoSweep'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const app = useAppStore()

const KINDS: SweepKind[] = ['todo', 'task', 'goal', 'reminder']

const step = ref<'pick' | 'scan' | 'review'>('pick')
const picked = ref<Record<SweepKind, boolean>>({ todo: true, task: true, goal: true, reminder: true })
const includeDone = ref(false)
const counts = computed(() => sweepCounts(app, includeDone.value))
const total = computed(() => KINDS.reduce((n, k) => n + (picked.value[k] ? counts.value[k] : 0), 0))

const progress = ref({ done: 0, total: 0 })
const scanned = ref(0)
const error = ref('')
const fixes = ref<TypoFix[]>([])
const kept = ref<Set<string>>(new Set())
let abort: AbortController | null = null
let job: ProgressHandle | null = null

watch(
  () => props.open,
  (open) => {
    if (open && step.value !== 'scan') reset()
  },
)

function reset() {
  step.value = 'pick'
  error.value = ''
  fixes.value = []
  kept.value = new Set()
}

async function scan() {
  const kinds = KINDS.filter((k) => picked.value[k])
  const sources = sweepSources(app, kinds, includeDone.value)
  if (!sources.length) return
  step.value = 'scan'
  error.value = ''
  scanned.value = sources.length
  progress.value = { done: 0, total: 0 }
  abort = new AbortController()
  job = startProgress({ id: 'ai-typo-sweep', title: 'Checking for typos', total: null })
  try {
    const found = await scanForTypos(sources, {
      signal: abort.signal,
      onProgress: (p) => {
        progress.value = p
        job?.update({ done: p.done, total: p.total, detail: `${p.done} of ${p.total} batches` })
      },
    })
    job.finish(found.length ? `${found.length} fixes found` : 'No typos found')
    fixes.value = found
    kept.value = new Set(found.map((f) => f.key))
    step.value = 'review'
  } catch (e) {
    if (abort?.signal.aborted) {
      job?.finish('Stopped')
      step.value = 'pick'
    } else {
      job?.fail('Could not check')
      error.value =
        (e as Error)?.message && (e as Error).message !== 'unavailable'
          ? (e as Error).message
          : 'The AI could not be reached.'
      step.value = 'pick'
    }
  } finally {
    abort = null
    job = null
  }
}

function stop() {
  abort?.abort()
}

onBeforeUnmount(stop)

// Review list, grouped by kind, then by item.
const groups = computed(() =>
  KINDS.map((kind) => ({
    kind,
    label: SWEEP_KIND_LABEL[kind],
    rows: fixes.value
      .filter((f) => f.kind === kind)
      .map((f) => ({ fix: f, changes: wordChanges(f.beforePlain, f.afterPlain) })),
  })).filter((g) => g.rows.length),
)

function toggle(key: string, on: boolean) {
  const next = new Set(kept.value)
  if (on) next.add(key)
  else next.delete(key)
  kept.value = next
}
const allKept = computed(() => fixes.value.length > 0 && kept.value.size === fixes.value.length)
function toggleAll(on: boolean) {
  kept.value = on ? new Set(fixes.value.map((f) => f.key)) : new Set()
}

function apply() {
  const chosen = fixes.value.filter((f) => kept.value.has(f.key))
  const n = applyTypoFixes(app, chosen)
  if (!n) app.showToastMsg('Nothing to fix — those items changed since the scan')
  emit('close')
  reset()
}

function close() {
  // A scan keeps running in the background card if the dialog is closed.
  emit('close')
}

const pct = computed(() =>
  progress.value.total ? Math.round((progress.value.done / progress.value.total) * 100) : 0,
)
</script>

<template>
  <Modal :open="open" title="Fix typos in my items" size="md" @close="close">
    <!-- 1. what to check -->
    <div v-if="step === 'pick'" class="atf">
      <p class="atf__lead">
        AI reads the titles and descriptions of your items and suggests spelling and grammar
        fixes. You review every change before it is saved.
      </p>
      <div class="atf__kinds">
        <Checkbox
          v-for="k in KINDS"
          :key="k"
          :model-value="picked[k]"
          :label="`${SWEEP_KIND_LABEL[k]} (${counts[k]})`"
          @update:model-value="picked[k] = $event"
        />
      </div>
      <Checkbox v-model="includeDone" label="Include finished and archived items" />
      <p class="atf__note">
        Calendar events are your scheduled todos, tasks, goals and reminders, so fixing those
        fixes the calendar too. Reminders already on Google Calendar are updated there as well.
      </p>
      <p v-if="error" class="atf__error" role="alert">{{ error }}</p>
    </div>

    <!-- 2. scanning -->
    <div v-else-if="step === 'scan'" class="atf" role="status" aria-live="polite">
      <p class="atf__lead">Checking {{ scanned }} items for typos…</p>
      <div
        class="atf__bar"
        role="progressbar"
        :aria-valuenow="pct"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span :style="{ width: `${Math.max(pct, 4)}%` }"></span>
      </div>
      <p class="atf__note">
        {{ progress.total ? `${progress.done} of ${progress.total} batches` : 'Starting…' }}
      </p>
    </div>

    <!-- 3. review -->
    <div v-else class="atf">
      <p v-if="!fixes.length" class="atf__lead">No typos found in {{ scanned }} items. 🎉</p>
      <template v-else>
        <div class="atf__reviewhead">
          <p class="atf__lead">
            {{ fixes.length }} fix{{ fixes.length === 1 ? '' : 'es' }} found in {{ scanned }} items.
            Untick any you want to keep as is.
          </p>
          <Checkbox :model-value="allKept" label="All" @update:model-value="toggleAll" />
        </div>
        <div class="atf__list">
          <section v-for="g in groups" :key="g.kind" class="atf__group">
            <h3 class="atf__grouptitle">{{ g.label }}</h3>
            <div v-for="r in g.rows" :key="r.fix.key" class="atf__row">
              <Checkbox
                :model-value="kept.has(r.fix.key)"
                :aria-label="`Fix ${r.fix.field} of ${r.fix.label}`"
                @update:model-value="toggle(r.fix.key, $event)"
              />
              <div class="atf__body">
                <div class="atf__item">
                  <span class="atf__field">{{
                    r.fix.field === 'title' ? 'Title' : 'Description'
                  }}</span>
                  <span v-if="r.fix.field === 'description'" class="atf__label">{{
                    r.fix.label
                  }}</span>
                </div>
                <div class="atf__changes">
                  <span v-for="(c, i) in r.changes" :key="i" class="atf__change">
                    <s v-if="c.from">{{ c.from }}</s>
                    <span v-if="c.from && c.to" aria-hidden="true">→</span>
                    <b v-if="c.to">{{ c.to }}</b>
                  </span>
                </div>
                <p v-if="r.fix.field === 'title'" class="atf__after">{{ r.fix.afterPlain }}</p>
              </div>
            </div>
          </section>
        </div>
      </template>
    </div>

    <template #footer>
      <template v-if="step === 'pick'">
        <Button variant="ghost" @click="close">Cancel</Button>
        <Button variant="primary" :disabled="!total" @click="scan">
          Check {{ total }} item{{ total === 1 ? '' : 's' }}
        </Button>
      </template>
      <template v-else-if="step === 'scan'">
        <Button variant="ghost" @click="stop">Stop</Button>
      </template>
      <template v-else>
        <Button variant="ghost" @click="reset">Back</Button>
        <Button v-if="fixes.length" variant="primary" :disabled="!kept.size" @click="apply">
          Fix {{ kept.size }}
        </Button>
        <Button v-else variant="primary" @click="close">Done</Button>
      </template>
    </template>
  </Modal>
</template>

<style scoped>
.atf {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.atf__lead {
  margin: 0;
  color: var(--theme-text);
}
.atf__note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.atf__error {
  margin: 0;
  color: var(--theme-danger);
  font-weight: var(--weight-medium);
}
.atf__kinds {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--sp-2);
}
.atf__bar {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in oklch, var(--theme-accent) 18%, transparent);
  overflow: hidden;
}
.atf__bar span {
  display: block;
  height: 100%;
  background: var(--theme-accent);
  transition: width 300ms ease;
}
.atf__reviewhead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
}
.atf__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-height: 55vh;
  overflow-y: auto;
  min-width: 0;
}
.atf__grouptitle {
  margin: 0 0 var(--sp-2);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--theme-dim);
}
.atf__row {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-2) 0;
  border-top: 1px solid color-mix(in oklch, var(--theme-text) 8%, transparent);
}
.atf__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.atf__item {
  display: flex;
  gap: var(--sp-2);
  align-items: baseline;
  min-width: 0;
}
.atf__field {
  flex-shrink: 0;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.atf__label {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xs);
}
.atf__changes {
  display: flex;
  flex-wrap: wrap;
  gap: 2px var(--sp-3);
  font-size: var(--text-xs);
}
.atf__change {
  display: inline-flex;
  gap: 4px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.atf__change s {
  color: var(--theme-dim);
}
.atf__change b {
  color: var(--theme-accent);
  font-weight: var(--weight-semibold);
}
.atf__after {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
@media (prefers-reduced-motion: reduce) {
  .atf__bar span {
    transition: none;
  }
}
</style>
