<script setup lang="ts">
// A form generated from a manifest view's request schema (JSON Schema), with
// validation before anything is sent. Writes go through the shared client, so
// the CSRF header is set like every other write. Secret inputs are password
// fields and are cleared once sent; nothing typed is stored anywhere.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import FormField from '@/components/ui/FormField.vue'
import NumberInput from '@/components/ui/NumberInput.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import TextArea from '@/components/ui/TextArea.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { bodyOf, fieldsOf, initialValues, validate } from '@/modules/schema'

const props = withDefaults(
  defineProps<{
    schema: Record<string, unknown> | null | undefined
    submitLabel?: string
    busy?: boolean
  }>(),
  { submitLabel: 'Send', busy: false },
)
const emit = defineEmits<{ submit: [body: Record<string, unknown>] }>()

const fields = computed(() => fieldsOf(props.schema))
const values = ref(initialValues(fields.value))
const errors = ref<Record<string, string>>({})

function submit() {
  errors.value = validate(fields.value, values.value)
  if (Object.keys(errors.value).length) return
  emit('submit', bodyOf(fields.value, values.value))
  for (const f of fields.value) if (f.type === 'secret') values.value[f.name] = ''
}
defineExpose({ values, errors })
</script>

<template>
  <form class="gform" novalidate @submit.prevent="submit">
    <FormField
      v-for="f in fields"
      :key="f.name"
      :label="f.label"
      :hint="f.description"
      :error="errors[f.name]"
      :required="f.required"
    >
      <Switch
        v-if="f.type === 'boolean'"
        :model-value="!!values[f.name]"
        :label="f.label"
        @update:model-value="values[f.name] = $event"
      />
      <Select
        v-else-if="f.type === 'enum'"
        :model-value="String(values[f.name] ?? '')"
        :options="[{ value: '', label: '—' }, ...(f.options ?? [])]"
        size="sm"
        :aria-label="f.label"
        @update:model-value="values[f.name] = $event"
      />
      <NumberInput
        v-else-if="f.type === 'number' || f.type === 'integer'"
        :model-value="(values[f.name] as number | null) ?? null"
        :min="f.minimum"
        :max="f.maximum"
        :step="f.type === 'integer' ? 1 : undefined"
        @update:model-value="values[f.name] = $event"
      />
      <TextArea
        v-else-if="f.type === 'text' || f.type === 'json'"
        :model-value="String(values[f.name] ?? '')"
        :rows="f.type === 'json' ? 4 : 3"
        :maxlength="f.maxLength"
        :autocorrect="false"
        :placeholder="f.type === 'json' ? 'JSON' : ''"
        @update:model-value="values[f.name] = $event"
      />
      <TextInput
        v-else
        :model-value="String(values[f.name] ?? '')"
        :type="f.type === 'secret' ? 'password' : 'text'"
        :maxlength="f.maxLength"
        :aria-label="f.label"
        autocomplete="off"
        @update:model-value="values[f.name] = $event"
      />
    </FormField>
    <p v-if="!fields.length" class="gform__note">No input needed.</p>
    <div class="gform__row">
      <Button type="submit" variant="primary" size="sm" :loading="busy">{{ submitLabel }}</Button>
      <slot name="actions" />
    </div>
  </form>
</template>

<style scoped>
.gform {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.gform__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.gform__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
}
</style>
