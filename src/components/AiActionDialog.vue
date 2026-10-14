<script setup lang="ts">
// "Add from this reply": a reply becomes a todo, task, calendar block, reminder
// or note. It opens prefilled (aiActionDraft) and creates nothing until Add, so
// what the model guessed — a title, a time, a duration — is always seen and
// can be fixed first. Switching the kind keeps what has been typed and fills
// only the fields the new kind needs.
import { computed, ref, watch } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import FormField from '@/components/ui/FormField.vue'
import TextInput from '@/components/ui/TextInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useAiChat } from '@/composables/useAiChat'
import {
  AI_ACTION_KINDS,
  AI_ACTION_META,
  aiActionDraft,
  nextSlot,
  type AiActionDraft,
  type AiActionKind,
} from '@/utils/ai'

const props = defineProps<{
  open: boolean
  kind: AiActionKind
  reply: string
  chatTitle: string
}>()
const emit = defineEmits<{ close: [] }>()
const { createFromDraft } = useAiChat()

const kinds = AI_ACTION_KINDS.map((k) => ({ value: k, label: AI_ACTION_META[k].label }))

const draft = ref<AiActionDraft>(aiActionDraft(props.kind, src()))
function src() {
  return { reply: props.reply, chatTitle: props.chatTitle, now: Date.now() }
}

// Each opening starts from a fresh prefill.
watch(
  () => [props.open, props.kind] as const,
  ([open]) => {
    if (open) draft.value = aiActionDraft(props.kind, src())
  },
)

function setKind(k: string) {
  const kind = k as AiActionKind
  const fresh = aiActionDraft(kind, src())
  const cur = draft.value
  draft.value = {
    kind,
    title: cur.title.trim() ? cur.title : fresh.title,
    // A time carries over between the timed kinds; a due day drops its time.
    when:
      kind === 'event' || kind === 'reminder'
        ? cur.when.includes('T')
          ? cur.when
          : fresh.when || nextSlot(Date.now())
        : kind === 'task'
          ? cur.when.slice(0, 10)
          : '',
    mins: kind === 'event' ? (cur.mins ?? fresh.mins) : null,
    // A note's body is the whole reply; the others keep a shorter one.
    notes: kind === 'note' || cur.kind === 'note' ? fresh.notes : cur.notes,
  }
}

const needsTime = computed(() => draft.value.kind === 'event' || draft.value.kind === 'reminder')
const canAdd = computed(() => {
  const d = draft.value
  if (d.kind === 'note') return !!(d.title.trim() || d.notes.trim())
  if (!d.title.trim()) return false
  return needsTime.value ? /T\d{2}:\d{2}$/.test(d.when) : true
})

function add() {
  if (!canAdd.value) return
  if (createFromDraft(draft.value)) emit('close')
}
</script>

<template>
  <Modal :open="open" :title="'Add from this reply'" size="md" @close="emit('close')">
    <div class="aad">
      <SegmentedControl
        :model-value="draft.kind"
        :options="kinds"
        size="sm"
        aria-label="Add as"
        @update:model-value="setKind"
      />

      <FormField :label="draft.kind === 'note' ? 'Title' : 'What'" required>
        <TextInput v-model="draft.title" placeholder="Title" />
      </FormField>

      <div v-if="draft.kind !== 'todo' && draft.kind !== 'note'" class="aad__row">
        <FormField
          class="aad__grow"
          :label="draft.kind === 'task' ? 'Due' : draft.kind === 'event' ? 'Starts' : 'Remind at'"
          :required="needsTime"
        >
          <GlassDatePicker
            :model-value="draft.when || null"
            :mode="draft.kind === 'task' ? 'date' : 'datetime'"
            :clearable="draft.kind === 'task'"
            :placeholder="draft.kind === 'task' ? 'No due date' : 'Pick date and time'"
            @update:model-value="draft.when = String($event ?? '')"
          />
        </FormField>
        <FormField v-if="draft.kind === 'event'" class="aad__mins" label="Duration">
          <NumberInput v-model="draft.mins" :min="5" :step="5" suffix="min" />
        </FormField>
      </div>

      <FormField :label="draft.kind === 'note' ? 'Note' : 'Notes'">
        <TextArea v-model="draft.notes" :rows="draft.kind === 'note' ? 8 : 4" max-height="40vh" />
      </FormField>
    </div>

    <template #footer>
      <Button variant="ghost" @click="emit('close')">Cancel</Button>
      <Button variant="primary" :disabled="!canAdd" @click="add">
        {{ AI_ACTION_META[draft.kind].add }}
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.aad {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
.aad__row {
  display: flex;
  gap: var(--sp-3);
  flex-wrap: wrap;
}
.aad__grow {
  flex: 1 1 220px;
  min-width: 0;
}
.aad__mins {
  flex: 0 0 140px;
}
</style>
