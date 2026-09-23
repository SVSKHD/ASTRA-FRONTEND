<script setup lang="ts">
// Writing an issue, and editing one, in one form.
//
// The two are the same fields with a different verb, and splitting them into
// two components is how a "New issue" dialog and an "Edit" panel drift into
// disagreeing about what an issue is — one gains labels, the other doesn't.
// The repository picker is the only difference: an existing issue cannot move.
//
// Nothing is written until Save. The GitHub tab is a mirror of somebody's real
// repository, and a keystroke-by-keystroke patch of an issue title would be a
// stream of commits to other people's notifications.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import TextArea from '@/components/ui/TextArea.vue'
import Select from '@/components/ui/Select.vue'
import type { GithubIssue } from '@/types'

const props = defineProps<{
  /** Absent for a new issue; the issue being edited otherwise. */
  issue?: GithubIssue | null
  /** `{ value: repoId, label: fullName }`, for a new issue's picker. */
  repos: { value: string; label: string }[]
  /** Pre-selected repository for a new issue (the current filter's repo). */
  repoId?: string
  busy?: boolean
}>()
const emit = defineEmits<{
  submit: [{ repoId: string; title: string; body: string; labels: string[] }]
  cancel: []
}>()

const editing = computed(() => !!props.issue)
const repo = ref(props.repoId || props.repos[0]?.value || '')
const title = ref(props.issue?.title ?? '')
const body = ref(props.issue?.body ?? '')
// Comma-separated, because a label editor with chips and a picker is a control
// of its own and this is a text field's worth of the job.
const labels = ref((props.issue?.labels ?? []).join(', '))

// Re-seed when the form is pointed at another issue: the panel is reused by
// whichever row is expanded, and a stale draft would silently overwrite the
// wrong issue's title.
watch(
  () => props.issue?.id,
  () => {
    title.value = props.issue?.title ?? ''
    body.value = props.issue?.body ?? ''
    labels.value = (props.issue?.labels ?? []).join(', ')
  },
)

const canSave = computed(() => !!title.value.trim() && (editing.value || !!repo.value))

function submit(): void {
  if (!canSave.value) return
  emit('submit', {
    repoId: props.issue?.repoId ?? repo.value,
    title: title.value.trim(),
    body: body.value,
    labels: labels.value
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean),
  })
}
</script>

<template>
  <form class="isf" @submit.prevent="submit">
    <Select
      v-if="!editing"
      v-model="repo"
      :options="repos"
      size="sm"
      aria-label="Repository"
      placeholder="Repository"
    />
    <TextInput
      v-model="title"
      size="sm"
      placeholder="Title"
      aria-label="Issue title"
      :autofocus="true"
    />
    <TextArea
      v-model="body"
      :rows="4"
      placeholder="Description (markdown)"
      aria-label="Issue body"
    />
    <TextInput
      v-model="labels"
      size="sm"
      placeholder="Labels, comma separated"
      aria-label="Labels"
    />
    <div class="isf__row">
      <Button type="submit" size="sm" :disabled="!canSave" :loading="busy">
        {{ editing ? 'Save changes' : 'Create issue' }}
      </Button>
      <Button size="sm" variant="ghost" type="button" @click="emit('cancel')">Cancel</Button>
      <span class="isf__note">
        {{ editing ? 'Writes to GitHub when you save.' : 'Opens on GitHub immediately.' }}
      </span>
    </div>
  </form>
</template>

<style scoped>
.isf {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
}
.isf__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.isf__note {
  min-width: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  color: var(--text-muted, var(--theme-dim));
}
</style>
