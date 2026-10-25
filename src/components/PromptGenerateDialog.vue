<script setup lang="ts">
// "Generate with AI" (Prompts tab): describe what you need a prompt for, get a
// few clean templates — each with a title, topic, use case and {{blanks}} —
// tick the ones worth keeping, save them to your own.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import TextArea from '@/components/ui/TextArea.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Icon from '@/components/ui/Icon.vue'
import { useConnectivity } from '@/composables/useConnectivity'
import { blanksOf, estimateTokens } from '@/utils/prompts'
import { generateTemplates, type DraftTemplate } from '@/utils/promptAi'

const props = defineProps<{ open: boolean; topics: string[] }>()
const emit = defineEmits<{ close: []; save: [DraftTemplate[]] }>()
const { isOnline } = useConnectivity()

const EXAMPLES = [
  'Reply to customer emails about late deliveries',
  'Turn meeting notes into action items',
  'Review a pull request for bugs and readability',
  'Plan a weekly workout around my schedule',
]

const useCase = ref('')
const count = ref('3')
const counts = ['1', '2', '3', '4'].map((v) => ({ value: v, label: v }))
const busy = ref(false)
const error = ref('')
const drafts = ref<DraftTemplate[]>([])
const kept = ref<Set<number>>(new Set())
let abort: AbortController | null = null

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    if (!busy.value) {
      drafts.value = []
      kept.value = new Set()
    }
  },
)

async function generate() {
  if (!useCase.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  abort = new AbortController()
  try {
    const out = await generateTemplates(useCase.value, Number(count.value), props.topics, abort.signal)
    drafts.value = out
    kept.value = new Set(out.map((_, i) => i))
    if (!out.length) error.value = 'The AI answered, but not with a usable template. Try rewording.'
  } catch (e) {
    if (!abort?.signal.aborted) error.value = (e as Error).message || 'Could not generate.'
  } finally {
    busy.value = false
    abort = null
  }
}
onBeforeUnmount(() => abort?.abort())

function toggle(i: number, on: boolean) {
  const next = new Set(kept.value)
  if (on) next.add(i)
  else next.delete(i)
  kept.value = next
}
const keptCount = computed(() => kept.value.size)
function save() {
  emit(
    'save',
    drafts.value.filter((_, i) => kept.value.has(i)),
  )
  drafts.value = []
  kept.value = new Set()
  useCase.value = ''
}
</script>

<template>
  <Modal :open="open" title="Generate prompts with AI" size="md" @close="emit('close')">
    <div class="pgd">
      <form class="pgd__ask" @submit.prevent="generate">
        <TextArea
          v-model="useCase"
          label="What do you need a prompt for?"
          :rows="2"
          max-height="160px"
          placeholder="e.g. Reply to customer emails about late deliveries, warm but brief"
        />
        <div class="pgd__examples">
          <button
            v-for="ex in EXAMPLES"
            :key="ex"
            type="button"
            class="pgd__chip"
            @click="useCase = ex"
          >
            {{ ex }}
          </button>
        </div>
        <div class="pgd__row">
          <span class="pgd__label">How many</span>
          <SegmentedControl v-model="count" :options="counts" size="sm" aria-label="How many templates" />
          <span class="pgd__spacer" />
          <Button
            type="submit"
            variant="primary"
            :loading="busy"
            :disabled="!useCase.trim() || busy || !isOnline"
          >
            <Icon name="sparkles" size="xs" />
            {{ drafts.length ? 'Generate again' : 'Generate' }}
          </Button>
        </div>
        <p v-if="!isOnline" class="pgd__note">You are offline — generating needs a connection.</p>
        <p v-if="error" class="pgd__error" role="alert">{{ error }}</p>
      </form>

      <div v-if="busy" class="pgd__busy" role="status">
        <span class="pgd__spin" aria-hidden="true"></span> Writing {{ count }} template{{
          count === '1' ? '' : 's'
        }}…
      </div>

      <ul v-else-if="drafts.length" class="pgd__list">
        <li
          v-for="(d, i) in drafts"
          :key="i"
          class="pgd__card"
          :class="{ 'is-off': !kept.has(i) }"
        >
          <Checkbox
            :model-value="kept.has(i)"
            :aria-label="`Keep ${d.title}`"
            @update:model-value="toggle(i, $event)"
          />
          <div class="pgd__body">
            <div class="pgd__head">
              <strong class="pgd__title">{{ d.title }}</strong>
              <span class="pgd__topic">{{ d.topic }}</span>
            </div>
            <p v-if="d.useCase" class="pgd__use"><Icon name="target" size="xs" />{{ d.useCase }}</p>
            <pre class="pgd__prompt">{{ d.body }}</pre>
            <span class="pgd__meta"
              >{{ blanksOf(d.body).length }} blanks · ≈{{ estimateTokens(d.body) }} tokens</span
            >
          </div>
        </li>
      </ul>
    </div>
    <template #footer>
      <Button variant="ghost" @click="emit('close')">Cancel</Button>
      <Button variant="primary" :disabled="!keptCount || busy" @click="save">
        Save {{ keptCount || '' }} template{{ keptCount === 1 ? '' : 's' }}
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.pgd {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}
.pgd__ask {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.pgd__examples {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pgd__chip {
  border: 0;
  border-radius: var(--radius-pill);
  padding: 3px 10px;
  background: color-mix(in oklch, var(--theme-text) 6%, transparent);
  color: var(--theme-dim);
  font: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
}
.pgd__chip:hover {
  color: var(--theme-text);
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
}
.pgd__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.pgd__label {
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.pgd__spacer {
  flex: 1;
}
.pgd__note,
.pgd__error {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.pgd__error {
  color: var(--theme-danger);
}
.pgd__busy {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--theme-dim);
  font-size: var(--text-sm);
}
.pgd__spin {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid color-mix(in oklch, var(--theme-accent) 30%, transparent);
  border-top-color: var(--theme-accent);
  animation: pgdSpin 700ms linear infinite;
}
@keyframes pgdSpin {
  to {
    transform: rotate(360deg);
  }
}
.pgd__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  max-height: 50vh;
  overflow-y: auto;
}
.pgd__card {
  display: flex;
  gap: var(--sp-3);
  align-items: flex-start;
  padding: var(--sp-3);
  border-radius: 14px;
  background: color-mix(in oklch, var(--theme-accent) 7%, transparent);
}
.pgd__card.is-off .pgd__body {
  opacity: 0.45;
}
.pgd__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.pgd__head {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.pgd__title {
  color: var(--theme-text);
}
.pgd__topic {
  font-size: var(--text-2xs);
  padding: 0 8px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-text) 7%, transparent);
  color: var(--theme-dim);
}
.pgd__use {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin: 0;
  font-size: var(--text-xs);
  color: var(--theme-dim);
}
.pgd__prompt {
  margin: 0;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1.6;
  color: var(--theme-text);
}
.pgd__meta {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
}
@media (prefers-reduced-motion: reduce) {
  .pgd__spin {
    animation: none;
  }
}
</style>
