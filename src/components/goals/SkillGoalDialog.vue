<script setup lang="ts">
// Create or edit a goal above milestones (spec 3.4): its title, what it is for,
// and its start and target. A target before the start is refused here, and the
// title cannot be blank — the same rules the importer enforces.
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
import GlassDatePicker from '@/components/ui/GlassDatePicker.vue'

const props = defineProps<{ open: boolean; goalId?: number | null }>()
const emit = defineEmits<{ close: []; saved: [id: number] }>()
const app = useAppStore()

const title = ref('')
const description = ref('')
const start = ref('')
const target = ref('')
const tried = ref(false)

watch(
  () => [props.open, props.goalId] as const,
  ([open]) => {
    if (!open) return
    const g = props.goalId != null ? app.skillGoalById(props.goalId) : undefined
    title.value = g?.title ?? ''
    description.value = g?.description ?? ''
    start.value = g?.startDate ?? ''
    target.value = g?.targetDate ?? ''
    tried.value = false
  },
  { immediate: true },
)

const titleError = computed(() =>
  tried.value && !title.value.trim() ? 'Give the goal a title' : '',
)
const dateError = computed(() =>
  start.value && target.value && target.value < start.value
    ? 'The target cannot be before the start'
    : '',
)

function save() {
  tried.value = true
  if (titleError.value || dateError.value) return
  const fields = {
    title: title.value.trim(),
    description: description.value.trim(),
    startDate: start.value,
    targetDate: target.value,
  }
  let id = props.goalId ?? null
  if (id != null) app.updateSkillGoal(id, fields)
  else id = app.addSkillGoal(fields)
  emit('saved', id)
  emit('close')
}
</script>

<template>
  <Modal
    :open="open"
    :title="goalId != null ? 'Edit goal' : 'New goal'"
    size="sm"
    @close="emit('close')"
  >
    <form class="sgd" @submit.prevent="save">
      <TextInput
        v-model="title"
        label="Title"
        placeholder="e.g. JavaScript — Junior to Advanced"
        :error="titleError"
      />
      <TextArea
        v-model="description"
        label="What it is for"
        :rows="2"
        placeholder="Optional — the outcome this goal is aiming at"
      />
      <div class="sgd__dates">
        <GlassDatePicker v-model="start" label="Start" clearable placeholder="No start" />
        <GlassDatePicker
          v-model="target"
          label="Target"
          clearable
          placeholder="No target"
          :min="start || null"
        />
      </div>
      <p v-if="dateError" class="sgd__error" role="alert">{{ dateError }}</p>
    </form>
    <template #footer>
      <Button variant="ghost" size="sm" @click="emit('close')">Cancel</Button>
      <Button variant="primary" size="sm" @click="save">
        {{ goalId != null ? 'Save' : 'Create goal' }}
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.sgd {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.sgd__dates {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--sp-3);
}
.sgd__error {
  margin: 0;
  color: var(--theme-danger);
  font-size: var(--text-xs);
}
</style>
