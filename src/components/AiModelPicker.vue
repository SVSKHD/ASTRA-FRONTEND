<script setup lang="ts">
// The AI tab's provider switch (Bytez | OpenRouter) and, beside it, the model
// list for whichever provider is on — grouped into text and image models, each
// with its price, and a line under it saying what the model in use takes in,
// gives back and costs. "Custom…" takes any other model id. The
// choice is per device (utils/aiSettings) and also drives autocorrect and the
// typo sweep. When the picked provider did not answer the last reply, a note
// under it says who did.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { AI_PROVIDERS, aiModelInfo, aiModelLabel, isImageModel, type AiProvider } from '@/types'
import { MODEL_ID, aiSettings, setAiModel, setAiProvider } from '@/utils/aiSettings'
import { useAiChat } from '@/composables/useAiChat'

defineProps<{ disabled?: boolean }>()

const { answerer } = useAiChat()
const CUSTOM = '__custom__'

const providers = (Object.keys(AI_PROVIDERS) as AiProvider[]).map((p) => ({
  value: p,
  label: AI_PROVIDERS[p].label,
}))

const current = computed(() => aiSettings.models[aiSettings.provider])

// Groups say what a model makes, so a text model and an image model are never
// mistaken for each other. Image models are shown but cannot be picked: the
// chat writes text and has nowhere to put a picture yet.
const GROUP_TEXT = 'Text models — write chat replies'
const GROUP_IMAGE = 'Image models — make pictures (not in chat yet)'
const GROUP_OTHER = 'Other'

/** "$0.30 / $2.50" — input / output, USD per million tokens. */
function priceTag(p?: { in: number; out: number }): string {
  if (!p) return ''
  const f = (n: number) => `$${n < 1 ? n.toFixed(2) : n.toFixed(n % 1 ? 2 : 0)}`
  return `${f(p.in)} / ${f(p.out)}`
}

const options = computed(() => {
  const list: { value: string; label: string; group: string; disabled?: boolean }[] = AI_PROVIDERS[
    aiSettings.provider
  ].models.map((m) => ({
    value: m.id,
    label: [m.label, m.note, priceTag(m.price)].filter(Boolean).join(' · '),
    group: m.output === 'image' ? GROUP_IMAGE : GROUP_TEXT,
    disabled: m.output === 'image',
  }))
  // A typed-in id stays listed, so the select shows what is in use.
  if (!list.some((o) => o.value === current.value))
    list.push({
      value: current.value,
      label: `${aiModelLabel(current.value)} · custom`,
      group: GROUP_TEXT,
    })
  list.push({ value: CUSTOM, label: 'Custom model id…', group: GROUP_OTHER })
  // Text first, then image, then "Custom…".
  const order = [GROUP_TEXT, GROUP_IMAGE, GROUP_OTHER]
  return list.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group))
})

// One line about the model in use: what goes in, what comes out, what it costs.
const summary = computed(() => {
  const info = aiModelInfo(current.value)
  const parts = [info?.vision ? 'Text + image in → text out' : 'Text in → text out']
  if (aiSettings.provider === 'bytez') parts.push('Bytez bills per second of compute')
  else if (info?.price)
    parts.push(`$${info.price.in} in / $${info.price.out} out per 1M tokens`)
  else parts.push('price: see openrouter.ai/models')
  return parts.join(' · ')
})

const editing = ref(false)
const draft = ref('')
const draftImage = computed(() => isImageModel(draft.value.trim()))
const draftValid = computed(() => MODEL_ID.test(draft.value.trim()) && !draftImage.value)
watch(
  () => aiSettings.provider,
  () => (editing.value = false),
)

function pickModel(v: string) {
  if (v === CUSTOM) {
    draft.value = ''
    editing.value = true
    return
  }
  setAiModel(v)
}
function saveCustom() {
  if (!draftValid.value) return
  setAiModel(draft.value)
  editing.value = false
}

// The last reply came from somewhere other than what is picked.
const standIn = computed(() => {
  const a = answerer.value
  if (!a?.fallback) return ''
  if (a.provider === AI_PROVIDERS[aiSettings.provider].label && a.model === current.value) return ''
  return `Last reply came from ${aiModelLabel(a.model)} via ${a.provider} — ${AI_PROVIDERS[aiSettings.provider].label} did not answer.`
})
const standInTitle = computed(() => answerer.value?.fallback ?? '')
</script>

<template>
  <div class="amp">
    <div class="amp__row">
      <SegmentedControl
        :model-value="aiSettings.provider"
        :options="providers"
        size="sm"
        aria-label="AI provider"
        :disabled="disabled"
        @update:model-value="setAiProvider($event as AiProvider)"
      />
      <div v-if="!editing" class="amp__model">
        <Select
          :model-value="current"
          :options="options"
          size="sm"
          aria-label="Model"
          :disabled="disabled"
          @update:model-value="pickModel"
        />
      </div>
      <form v-else class="amp__custom" @submit.prevent="saveCustom">
        <TextInput
          v-model="draft"
          size="sm"
          :autocorrect="false"
          :invalid="!!draft && !draftValid"
          :placeholder="aiSettings.provider === 'bytez' ? 'owner/model, e.g. Qwen/Qwen3-8B' : 'vendor/model, e.g. openai/gpt-5.5'"
          aria-label="Custom model id"
          @keydown.escape="editing = false"
        />
        <Button type="submit" variant="primary" size="sm" :disabled="!draftValid">Use</Button>
        <Button variant="ghost" size="sm" @click="editing = false">Cancel</Button>
      </form>
    </div>
    <p v-if="editing && draftImage" class="amp__note" role="alert">
      That is an image model — it makes pictures, and the chat needs a text model.
    </p>
    <p v-else-if="!editing" class="amp__summary">{{ summary }}</p>
    <p v-if="standIn" class="amp__note" :title="standInTitle" role="status">{{ standIn }}</p>
  </div>
</template>

<style scoped>
.amp {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.amp__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.amp__model {
  flex: 1 1 220px;
  min-width: 0;
  max-width: 340px;
}
.amp__custom {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  flex: 1 1 240px;
  min-width: 0;
}
.amp__custom > :first-child {
  flex: 1;
  min-width: 0;
}
.amp__summary {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
.amp__note {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-2xs);
  color: var(--theme-warning, var(--theme-accent));
}
</style>
