<script setup lang="ts">
// The Forms page's worked example (section 25d).
//
// A real useForm over a real schema, not a mock-up: the timing rules are the
// thing the page is documenting, and a fake that only looks like a form would
// document nothing. Tab out of an empty name and it complains; fix it and the
// complaint clears on the keystroke that fixes it, not on the next blur. Submit
// with the project left off and the first bad field takes focus.
import { computed } from 'vue'
import { useForm } from '@/composables/useForm'
import { taskFormSchema } from '@/utils/formSchemas'
import FormField from '@/components/ui/FormField.vue'
import TextInput from '@/components/ui/TextInput.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Select from '@/components/ui/Select.vue'
import Button from '@/components/ui/Button.vue'
import Alert from '@/components/ui/Alert.vue'

const PROJECTS = [
  { value: '', label: 'No project' },
  { value: 'trading', label: 'trading' },
  { value: 'home', label: 'home' },
]

const form = useForm({
  initial: {
    title: '',
    deadline: '',
    startAt: '',
    project: '',
    estimateMins: null as number | null,
  },
  schema: taskFormSchema,
  async: [
    {
      field: 'title',
      // Stands in for a uniqueness check against the server: debounced, and the
      // field stays editable the whole time.
      run: async (values) =>
        values.title.trim().toLowerCase() === 'taken'
          ? 'A task by that name already exists.'
          : null,
    },
  ],
  onSubmit: async (values) => {
    if (values.title.trim().toLowerCase() === 'boom') {
      throw new Error('The workspace rejected the write. Check your connection and try again.')
    }
  },
})

const announcement = computed(() =>
  form.submitted.value && form.invalidCount.value
    ? `${form.invalidCount.value} field${form.invalidCount.value === 1 ? '' : 's'} need attention.`
    : '',
)
</script>

<template>
  <form class="fdemo" novalidate @submit.prevent="form.submit()">
    <!-- Announced rather than only shown: a reader who cannot see the red
         borders otherwise gets no signal that the submit did anything. -->
    <p class="ui-sr-only" role="status" aria-live="polite">{{ announcement }}</p>

    <FormField
      label="Task"
      hint="What you are going to do"
      required
      :error="form.errorFor('title')"
      :length="form.values.title.length"
      :max-length="200"
      v-slot="f"
    >
      <div data-field="title">
        <TextInput
          v-bind="f"
          v-model="form.values.title"
          placeholder="Ship the trading bot"
          :loading="form.pending.value.has('title')"
          @update:model-value="form.change('title')"
          @blur="form.blur('title')"
        />
      </div>
    </FormField>

    <FormField label="Starts" :error="form.errorFor('startAt')" v-slot="f">
      <div data-field="startAt">
        <TextInput
          v-bind="f"
          v-model="form.values.startAt"
          placeholder="2026-09-01"
          @update:model-value="form.change('startAt')"
          @blur="form.blur('startAt')"
        />
      </div>
    </FormField>

    <FormField
      label="Due"
      hint="On or after the start date"
      :error="form.errorFor('deadline')"
      v-slot="f"
    >
      <div data-field="deadline">
        <TextInput
          v-bind="f"
          v-model="form.values.deadline"
          placeholder="2026-11-30"
          @update:model-value="form.change('deadline')"
          @blur="form.blur('deadline')"
        />
      </div>
    </FormField>

    <FormField label="Project" :error="form.errorFor('project')" v-slot="f">
      <div data-field="project">
        <Select
          v-bind="f"
          v-model="form.values.project"
          :options="PROJECTS"
          @update:model-value="form.change('project')"
        />
      </div>
    </FormField>

    <FormField label="Estimate" hint="Minutes" :error="form.errorFor('estimateMins')" v-slot="f">
      <div data-field="estimateMins">
        <NumberInput
          v-bind="f"
          v-model="form.values.estimateMins"
          :min="0"
          :step="15"
          suffix="min"
          @update:model-value="form.change('estimateMins')"
        />
      </div>
    </FormField>

    <Alert v-if="form.formError.value" tone="danger" title="Could not save">
      {{ form.formError.value }}
    </Alert>

    <div class="fdemo__actions">
      <!-- Never disabled for being invalid: a button that will not press and
           will not say why is the worst version of this. It disables only while
           the submit is actually in flight. -->
      <Button type="submit" variant="primary" :loading="form.submitting.value">Save</Button>
      <Button type="button" variant="ghost" @click="form.reset()">Reset</Button>
    </div>
    <p class="fdemo__note">
      Type <code>taken</code> for the async check, <code>boom</code> for a server rejection, or
      submit empty to see focus move to the first bad field.
    </p>
  </form>
</template>

<style scoped>
.fdemo {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
  max-width: 420px;
}
.fdemo__actions {
  display: flex;
  gap: var(--sp-2);
  min-width: 0;
}
.fdemo__note {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted, var(--theme-dim));
}
</style>
