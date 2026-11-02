<script setup lang="ts">
// The model picker when the AI runs on Aureon (VITE_AI_BACKEND=aureon): the
// models installed in the server's local Ollama, from GET /api/models. No
// provider switch, no prices — nothing leaves the server. The choice is per
// device and also drives the prompt helpers and the typo sweep.
import { computed, onMounted, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import { aureonAi, listModels, type LocalModel } from '@/ai/aureonChat'

defineProps<{ disabled?: boolean }>()

const models = ref<LocalModel[]>([])
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    models.value = await listModels()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
onMounted(load)

function gb(bytes: number | null): string {
  return bytes ? `${(bytes / 1e9).toFixed(1)} GB` : ''
}

const options = computed(() =>
  models.value.map((m) => ({
    value: m.name,
    label: [m.name, m.parameterSize, m.quantization].filter(Boolean).join(' · '),
  })),
)

const summary = computed(() => {
  const m = models.value.find((x) => x.name === aureonAi.model)
  const parts = ['Local Ollama on the Aureon server', 'text in → text out', 'offline']
  if (m?.size) parts.push(gb(m.size))
  return parts.join(' · ')
})
</script>

<template>
  <div class="aamp">
    <div class="aamp__row">
      <div v-if="models.length" class="aamp__model">
        <Select
          :model-value="aureonAi.model"
          :options="options"
          size="sm"
          aria-label="Local model"
          :disabled="disabled"
          @update:model-value="aureonAi.model = String($event)"
        />
      </div>
      <Button variant="ghost" size="sm" :disabled="loading" @click="load">
        {{ loading ? 'Loading models…' : 'Refresh models' }}
      </Button>
    </div>
    <p v-if="error" class="aamp__note" role="alert">{{ error }}</p>
    <p v-else-if="!loading && !models.length" class="aamp__summary">
      No models are installed in the server's Ollama yet. Pull one there, then refresh.
    </p>
    <p v-else class="aamp__summary">{{ summary }}</p>
  </div>
</template>

<style scoped>
.aamp {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.aamp__row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.aamp__model {
  flex: 1 1 220px;
  min-width: 0;
  max-width: 340px;
}
.aamp__summary,
.aamp__note {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-2xs);
  color: var(--text-secondary);
}
</style>
