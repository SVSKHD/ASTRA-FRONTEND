<script setup lang="ts">
// One milestone point ("sub-milestone"), opened in full: where it sits (goal →
// milestone), its progress, its description, timeline, time spent against the
// estimate, tags, subtasks and what it taught. The row shows a single line;
// this is where the detail lives.
//
// Edits write straight through (updateChecklistItem), like the row does. A
// closed milestone opens read-only.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import Modal from '@/components/ui/Modal.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
import PointLearnings from '@/components/goals/PointLearnings.vue'
import PointSubtasks from '@/components/goals/PointSubtasks.vue'
import { useAppStore } from '@/stores/app'
import { formatMinutes } from '@/utils/detailFields'
import { pointProgress } from '@/utils/milestoneProgress'

const props = defineProps<{ open: boolean; pointId: number; spent: number; locked?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const app = useAppStore()

const point = computed(() => app.goalChecklist.find((c) => c.id === props.pointId) ?? null)
const milestone = computed(() =>
  point.value ? (app.goals.find((g) => g.id === point.value!.goalId) ?? null) : null,
)
const skillGoal = computed(() => {
  const sg = milestone.value?.skillGoalId
  return sg != null ? (app.skillGoals.find((g) => g.id === sg) ?? null) : null
})
const prog = computed(() => (point.value ? pointProgress(point.value) : null))
const position = computed(() => {
  const p = point.value
  if (!p) return ''
  const siblings = app.goalChecklist
    .filter((c) => c.goalId === p.goalId)
    .sort((a, b) => a.order - b.order)
  return `Point ${siblings.findIndex((c) => c.id === p.id) + 1} of ${siblings.length}`
})
const overEstimate = computed(
  () => point.value?.estimateMins != null && props.spent > point.value.estimateMins,
)

function patch(fields: Parameters<typeof app.updateChecklistItem>[1]) {
  if (point.value && !props.locked) app.updateChecklistItem(point.value.id, fields)
}
function openMilestone() {
  const m = milestone.value
  if (!m) return
  emit('close')
  app.openGoalDialog(m.id)
}
</script>

<template>
  <Modal
    :open="open && !!point"
    :title="point?.text || 'Untitled point'"
    size="lg"
    @close="emit('close')"
  >
    <div v-if="point" class="pdd" data-testid="point-detail">
      <nav class="pdd__crumbs" aria-label="Where this point sits">
        <span v-if="skillGoal">{{ skillGoal.title }} ›</span>
        <button v-if="milestone" type="button" class="pdd__link" @click="openMilestone">
          {{ milestone.title || 'Untitled milestone' }}
        </button>
        <span>› {{ position }}</span>
      </nav>

      <div class="pdd__row">
        <Badge
          :tone="point.done ? 'success' : prog && prog.done ? 'info' : 'neutral'"
          :label="point.done ? 'Done' : prog && prog.done ? 'In progress' : 'Not started'"
        />
        <span v-if="prog && (point.subtasks?.length ?? 0)" class="pdd__muted"
          >{{ prog.done }}/{{ prog.total }} subtasks</span
        >
        <span v-if="point.completedAt" class="pdd__muted"
          >completed {{ new Date(point.completedAt).toLocaleString() }}</span
        >
        <Badge v-if="locked" tone="neutral" label="Milestone closed · read-only" />
      </div>

      <section class="pdd__section">
        <label class="pdd__h" :for="`pdd-title-${pointId}`">Point</label>
        <TextArea
          :model-value="point.text"
          :rows="2"
          auto-grow
          :id="`pdd-title-${pointId}`"
          :disabled="locked"
          @update:model-value="patch({ text: $event })"
        />
      </section>

      <section class="pdd__section">
        <label class="pdd__h" :for="`pdd-desc-${pointId}`">Description</label>
        <TextArea
          :model-value="point.description ?? ''"
          :rows="5"
          auto-grow
          placeholder="What this point is, why it matters, how to do it, links…"
          :id="`pdd-desc-${pointId}`"
          :disabled="locked"
          @update:model-value="patch({ description: $event })"
        />
      </section>

      <section class="pdd__section pdd__grid">
        <div>
          <h3 class="pdd__h">Start</h3>
          <GlassDatePicker
            size="sm"
            clearable
            placeholder="start"
            :disabled="locked"
            :model-value="point.startAt"
            @update:model-value="patch({ startAt: String($event ?? '') })"
          />
        </div>
        <div>
          <h3 class="pdd__h">Due</h3>
          <GlassDatePicker
            size="sm"
            clearable
            placeholder="due"
            :disabled="locked"
            :model-value="point.dueAt"
            @update:model-value="patch({ dueAt: String($event ?? '') })"
          />
        </div>
        <div>
          <h3 class="pdd__h">Estimate (min)</h3>
          <NumberInput
            size="sm"
            :min="0"
            aria-label="Estimate in minutes"
            :disabled="locked"
            :model-value="point.estimateMins"
            @update:model-value="
              patch({ estimateMins: $event == null ? null : Math.max(0, $event) })
            "
          />
        </div>
        <div>
          <h3 class="pdd__h">Time spent</h3>
          <p class="pdd__value" :class="{ 'is-over': overEstimate }">
            {{ formatMinutes(spent) || '0m' }}
            <template v-if="point.estimateMins != null">
              of {{ formatMinutes(point.estimateMins) }}</template
            >
            <span v-if="point.timerStartedAt != null" class="pdd__muted"> · timer running</span>
          </p>
        </div>
      </section>

      <section v-if="point.tags.length" class="pdd__section">
        <h3 class="pdd__h">Tags</h3>
        <div class="pdd__row">
          <Badge v-for="t in point.tags" :key="t" tone="neutral" :label="`#${t}`" />
        </div>
      </section>

      <section class="pdd__section">
        <h3 class="pdd__h">Subtasks</h3>
        <PointSubtasks :point-id="point.id" :subtasks="point.subtasks ?? []" :locked="locked" />
      </section>

      <section class="pdd__section">
        <h3 class="pdd__h">What it taught</h3>
        <PointLearnings :point-id="point.id" />
      </section>

      <div class="pdd__row pdd__foot">
        <Button v-if="milestone" variant="ghost" size="sm" @click="openMilestone"
          >Open the milestone</Button
        >
        <Button variant="secondary" size="sm" @click="emit('close')">Close</Button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.pdd {
  display: grid;
  gap: var(--sp-4);
  min-width: 0;
}

.pdd__crumbs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  align-items: center;
  font-size: var(--text-xs);
  color: var(--theme-dim);
  min-width: 0;
  overflow-wrap: anywhere;
}

.pdd__link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--theme-accent);
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.pdd__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: center;
  min-width: 0;
}

.pdd__section {
  display: grid;
  gap: var(--sp-2);
  min-width: 0;
}

.pdd__grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
}

.pdd__h {
  display: block;
  margin: 0 0 var(--sp-1);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--theme-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.pdd__muted {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}

.pdd__value {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-text);
}

.pdd__value.is-over {
  color: var(--theme-warning, var(--theme-text));
}

.pdd__foot {
  justify-content: flex-end;
}
</style>
