<script setup lang="ts">
// Closing a milestone (spec section 5).
//
// Ticking every subtask gets a milestone to 100%; it is "Completed" only once
// its conclusion is written and confirmed here. Open, this is the form — the
// summary, evidence links, acceptance checks — and a Close button that says
// exactly what still stands in its way. Close shows a short review before it
// commits, and the store checks every rule again.
//
// Closed, it is the record: the summary, the evidence, when it closed and the
// history of closes and reopens. Reopen asks first, because it makes the
// milestone editable again; the history keeps both events.
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import TextArea from '@/components/ui/TextArea.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Switch from '@/components/ui/Switch.vue'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import { closeBlockers, emptyConclusion, isClosed, pointProgress } from '@/utils/milestoneProgress'

const props = defineProps<{ goalId: number }>()
const app = useAppStore()

const goal = computed(() => app.goals.find((g) => g.id === props.goalId))
const conclusion = computed(() => goal.value?.conclusion ?? emptyConclusion())
const closed = computed(() => !!goal.value && isClosed(goal.value))
const progress = computed(() => app.goalProgress(props.goalId))
const blockers = computed(() => closeBlockers(progress.value, goal.value?.conclusion))
const points = computed(() => app.checklistOf(props.goalId))

// The summary is typed into a local draft and written on blur, so a paragraph
// is one save rather than one per keystroke.
const summary = ref('')
watch(
  () => [props.goalId, conclusion.value.summary] as const,
  ([, s]) => (summary.value = s),
  { immediate: true },
)
function saveSummary() {
  if (summary.value !== conclusion.value.summary)
    app.setConclusionSummary(props.goalId, summary.value)
}

const evidenceDraft = ref('')
function addEvidence() {
  const e = evidenceDraft.value.trim()
  if (!e) return
  app.setConclusionEvidence(props.goalId, [...conclusion.value.evidence, e])
  evidenceDraft.value = ''
}
function removeEvidence(i: number) {
  app.setConclusionEvidence(
    props.goalId,
    conclusion.value.evidence.filter((_, j) => j !== i),
  )
}
const isLink = (e: string) => /^https?:\/\//i.test(e)

const checkDraft = ref('')
function addCheck() {
  app.addAcceptanceCheck(props.goalId, checkDraft.value)
  checkDraft.value = ''
}

// --- closing and reopening -----------------------------------------------------
const reviewOpen = ref(false)
const closeError = ref<string[]>([])
function openReview() {
  saveSummary()
  closeError.value = []
  if (!blockers.value.length) reviewOpen.value = true
}
function confirmClose() {
  saveSummary()
  const left = app.closeMilestone(props.goalId)
  closeError.value = left
  if (!left.length) reviewOpen.value = false
}
const reopenOpen = ref(false)
function confirmReopen() {
  app.reopenMilestone(props.goalId, 'Reopened by hand')
  reopenOpen.value = false
}

const fmtStamp = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <div v-if="goal" class="mcon">
    <!-- Closed: the record. -->
    <template v-if="closed">
      <div class="mcon__closed" role="status">
        <Icon name="check-square" size="sm" />
        <span>
          Completed<template v-if="conclusion.closedAt">
            · {{ fmtStamp(conclusion.closedAt) }}</template
          >
        </span>
        <button type="button" class="mcon__btn" @click="reopenOpen = true">
          <Icon name="rotate-ccw" size="xs" />Reopen
        </button>
      </div>
      <p v-if="conclusion.summary" class="mcon__summary">{{ conclusion.summary }}</p>
      <p v-else class="mcon__dim">Closed before conclusions were recorded.</p>
      <ul v-if="conclusion.evidence.length" class="mcon__evidence">
        <li v-for="(e, i) in conclusion.evidence" :key="i">
          <Icon name="paperclip" size="xs" />
          <a v-if="isLink(e)" :href="e" target="_blank" rel="noopener">{{ e }}</a>
          <span v-else>{{ e }}</span>
        </li>
      </ul>
      <ul v-if="conclusion.acceptance.length" class="mcon__checks is-read">
        <li v-for="a in conclusion.acceptance" :key="a.id">
          <Icon name="check" size="xs" />{{ a.text }}
        </li>
      </ul>
    </template>

    <!-- Open: the form, and what Close still needs. -->
    <template v-else>
      <TextArea
        v-model="summary"
        label="Summary"
        :rows="3"
        placeholder="What this milestone achieved, in a few sentences — e.g. “Can explain closures, coercion and the event loop without notes; built the todo app in plain JS.”"
        @blur="saveSummary"
      />

      <div class="mcon__group">
        <div class="mcon__label">
          Evidence
          <!-- The switch draws its own label; it sits at the row's far end. -->
          <Switch
            class="mcon__require"
            size="sm"
            label="Required to close"
            :model-value="!!conclusion.evidenceRequired"
            @update:model-value="app.setEvidenceRequired(goalId, $event)"
          />
        </div>
        <ul v-if="conclusion.evidence.length" class="mcon__evidence">
          <li v-for="(e, i) in conclusion.evidence" :key="i">
            <Icon name="paperclip" size="xs" />
            <a v-if="isLink(e)" :href="e" target="_blank" rel="noopener">{{ e }}</a>
            <span v-else>{{ e }}</span>
            <button
              type="button"
              class="mcon__icon"
              :aria-label="`Remove evidence ${e}`"
              @click="removeEvidence(i)"
            >
              <Icon name="x" size="xs" />
            </button>
          </li>
        </ul>
        <form class="mcon__add" @submit.prevent="addEvidence">
          <TextInput
            v-model="evidenceDraft"
            size="sm"
            icon="paperclip"
            placeholder="A link or reference — repo, demo, certificate…"
            aria-label="Add evidence"
          />
          <button type="submit" class="mcon__btn" :disabled="!evidenceDraft.trim()">Add</button>
        </form>
      </div>

      <div class="mcon__group">
        <div class="mcon__label">Acceptance checks</div>
        <ul v-if="conclusion.acceptance.length" class="mcon__checks">
          <li v-for="a in conclusion.acceptance" :key="a.id">
            <Checkbox
              :model-value="a.checked"
              :label="a.text"
              @update:model-value="app.toggleAcceptanceCheck(goalId, a.id)"
            />
            <button
              type="button"
              class="mcon__icon"
              :aria-label="`Remove check ${a.text}`"
              @click="app.removeAcceptanceCheck(goalId, a.id)"
            >
              <Icon name="x" size="xs" />
            </button>
          </li>
        </ul>
        <form class="mcon__add" @submit.prevent="addCheck">
          <TextInput
            v-model="checkDraft"
            size="sm"
            icon="plus"
            placeholder="A check to confirm — e.g. Can build it without the tutorial"
            aria-label="Add acceptance check"
          />
          <button type="submit" class="mcon__btn" :disabled="!checkDraft.trim()">Add</button>
        </form>
      </div>

      <div class="mcon__close">
        <ul v-if="blockers.length" class="mcon__blockers" aria-live="polite">
          <li v-for="b in blockers" :key="b"><Icon name="alert-circle" size="xs" />{{ b }}</li>
        </ul>
        <span v-else class="mcon__ready"><Icon name="check" size="xs" />Ready to close</span>
        <Button variant="primary" size="sm" :disabled="!!blockers.length" @click="openReview">
          Close milestone
        </Button>
      </div>
    </template>

    <!-- The audit: every close and reopen, newest first. -->
    <details v-if="goal.audit?.length" class="mcon__audit">
      <summary>History · {{ goal.audit.length }}</summary>
      <ol>
        <li v-for="(a, i) in [...goal.audit].reverse()" :key="i">
          <strong>{{ a.action === 'closed' ? 'Closed' : 'Reopened' }}</strong>
          {{ fmtStamp(a.at) }}<span v-if="a.reason" class="mcon__dim"> — {{ a.reason }}</span>
        </li>
      </ol>
    </details>

    <Modal :open="reviewOpen" title="Close this milestone?" size="sm" @close="reviewOpen = false">
      <div class="mcon__review">
        <p>
          <strong>{{ goal.title }}</strong> — {{ progress.done }} of {{ progress.total }} checked.
        </p>
        <ul class="mcon__reviewlist">
          <li v-for="p in points" :key="p.id">
            <Icon name="check" size="xs" />{{ p.text || 'Untitled point' }}
            <span class="mcon__dim">{{ pointProgress(p).done }}/{{ pointProgress(p).total }}</span>
          </li>
        </ul>
        <p class="mcon__dim">
          It will show as Completed with this conclusion. You can reopen it later; the history keeps
          both.
        </p>
        <ul v-if="closeError.length" class="mcon__blockers">
          <li v-for="b in closeError" :key="b"><Icon name="alert-circle" size="xs" />{{ b }}</li>
        </ul>
      </div>
      <template #footer>
        <Button variant="ghost" size="sm" @click="reviewOpen = false">Cancel</Button>
        <Button variant="primary" size="sm" @click="confirmClose">Close milestone</Button>
      </template>
    </Modal>

    <Modal :open="reopenOpen" title="Reopen this milestone?" size="sm" @close="reopenOpen = false">
      <p class="mcon__dim">
        Its points become editable again and it stops counting as completed. The conclusion text is
        kept, and the history records the reopen.
      </p>
      <template #footer>
        <Button variant="ghost" size="sm" @click="reopenOpen = false">Cancel</Button>
        <Button variant="primary" size="sm" @click="confirmReopen">Reopen</Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.mcon {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.mcon__group {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.mcon__label {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.mcon__require {
  margin-left: auto;
  font-weight: var(--weight-medium);
}
.mcon__dim {
  margin: 0;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
}
.mcon__summary {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}
.mcon__evidence,
.mcon__checks,
.mcon__blockers,
.mcon__reviewlist {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--text-sm);
}
.mcon__evidence li,
.mcon__checks li,
.mcon__blockers li,
.mcon__reviewlist li {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.mcon__evidence a,
.mcon__evidence span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mcon__evidence a {
  color: var(--theme-accent);
}
.mcon__checks.is-read li {
  color: var(--theme-dim);
}
.mcon__checks :deep(.ui-check) {
  flex: 1;
  min-width: 0;
}
.mcon__blockers li {
  color: var(--theme-warning);
  font-size: var(--text-xs);
}
.mcon__reviewlist {
  max-height: 220px;
  overflow-y: auto;
}
.mcon__reviewlist li > :last-child {
  margin-left: auto;
}
.mcon__add {
  display: flex;
  gap: var(--sp-2);
}
.mcon__add > :first-child {
  flex: 1;
  min-width: 0;
}
.mcon__close {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
  padding-top: var(--sp-2);
  border-top: 1px solid color-mix(in oklch, var(--theme-dim) 16%, transparent);
}
.mcon__ready {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--theme-success);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}
.mcon__closed {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  background: color-mix(in oklch, var(--theme-success) 12%, transparent);
  color: var(--theme-success);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
}
.mcon__closed > span {
  flex: 1;
}
.mcon__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--theme-text);
  font-family: inherit;
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  cursor: pointer;
}
.mcon__btn:hover:not(:disabled) {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}
.mcon__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.mcon__icon {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
}
.mcon__icon:hover {
  background: color-mix(in oklch, var(--theme-danger) 14%, transparent);
  color: var(--theme-danger);
}
.mcon__audit {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.mcon__audit summary {
  cursor: pointer;
  font-weight: var(--weight-semibold);
}
.mcon__audit ol {
  margin: var(--sp-2) 0 0;
  padding-left: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mcon__review {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.mcon__review p {
  margin: 0;
}
</style>
