<script setup lang="ts">
// The model picker when the AI runs on Aureon (VITE_AI_BACKEND=aureon).
//
// Per conversation: a provider and a model from GET /api/models/catalog — the
// models installed in the server's local Ollama, plus the OpenRouter models the
// server allows (backend docs/25-openrouter.md). The browser never calls
// OpenRouter and never sees its key. The server keeps finance, trading, broker,
// positions, secrets and logs on the local model whatever is picked here, and
// falls back to it on any OpenRouter error; each reply says which one answered.
//
// The usage meter shows today's OpenRouter spend against the server's daily cap.
import { computed, onMounted, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import { useAppStore } from '@/stores/app'
import {
  aureonAi,
  fallbackText,
  loadCatalog,
  loadUsage,
  setTarget,
  targetFor,
  type AiProvider,
} from '@/ai/aureonChat'

defineProps<{ disabled?: boolean }>()

const app = useAppStore()
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    await loadCatalog()
    await loadUsage().catch(() => null)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
onMounted(load)

const chatKey = computed(() => (app.aiActiveChatId == null ? null : String(app.aiActiveChatId)))
const current = computed(() => targetFor(chatKey.value))
const models = computed(() => aureonAi.catalog?.models ?? [])
const openrouterOn = computed(() => !!aureonAi.catalog && !aureonAi.catalog.openrouterOff)

const SEP = '|'
const options = computed(() =>
  models.value.map((m) => ({
    value: `${m.provider}${SEP}${m.id}`,
    label: m.label,
    group: m.provider === 'openrouter' ? 'OpenRouter (external, filtered)' : 'Local (this server)',
  })),
)
const value = computed(() =>
  current.value ? `${current.value.provider}${SEP}${current.value.model}` : '',
)

function pick(v: string) {
  const i = v.indexOf(SEP)
  if (i < 0) return
  setTarget(chatKey.value, { provider: v.slice(0, i) as AiProvider, model: v.slice(i + 1) })
}

const summary = computed(() => {
  const t = current.value
  if (!t) return ''
  if (t.provider === 'openrouter') {
    const local = aureonAi.catalog?.localFallbackModel
    return [
      'OpenRouter, via the Aureon server',
      'private data stays local',
      local ? `falls back to ${local}` : 'falls back to the local model',
    ].join(' · ')
  }
  return ['Local Ollama on the Aureon server', 'text in → text out', 'offline'].join(' · ')
})

const offNote = computed(() => {
  const off = aureonAi.catalog?.openrouterOff
  return off && off !== 'disabled' ? `OpenRouter is off: ${fallbackText(off)}.` : ''
})

const usage = computed(() => aureonAi.usage)
const showMeter = computed(() => openrouterOn.value && !!usage.value && usage.value.limitUsd > 0)
const pct = computed(() => {
  const u = usage.value
  if (!u || u.limitUsd <= 0) return 0
  return Math.min(100, Math.round((u.spentUsd / u.limitUsd) * 100))
})
function usd(n: number): string {
  return n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}
const meterText = computed(() => {
  const u = usage.value
  if (!u) return ''
  if (!u.available) return 'OpenRouter spend unavailable — replies stay local'
  const base = `OpenRouter today: ${usd(u.spentUsd)} of ${usd(u.limitUsd)}`
  return u.capReached ? `${base} — cap reached, replies stay local` : `${base} · ${u.calls} calls`
})
</script>

<template>
  <div class="aamp">
    <div class="aamp__row">
      <div v-if="models.length" class="aamp__model">
        <Select
          :model-value="value"
          :options="options"
          size="sm"
          aria-label="Model"
          :disabled="disabled"
          @update:model-value="pick(String($event))"
        />
      </div>
      <span
        v-if="current"
        class="aamp__provider"
        :class="{ 'is-external': current.provider === 'openrouter' }"
        data-testid="provider-badge"
        >{{ current.provider === 'openrouter' ? 'OpenRouter' : 'Local' }}</span
      >
      <Button variant="ghost" size="sm" :disabled="loading" @click="load">
        {{ loading ? 'Loading models…' : 'Refresh models' }}
      </Button>
    </div>
    <p v-if="error" class="aamp__note" role="alert">{{ error }}</p>
    <p v-else-if="!loading && !models.length" class="aamp__summary">
      No models are installed in the server's Ollama yet. Pull one there, then refresh.
    </p>
    <p v-else class="aamp__summary">{{ summary }}</p>
    <p v-if="offNote" class="aamp__summary">{{ offNote }}</p>
    <div v-if="showMeter" class="aamp__meter" data-testid="usage-meter">
      <div
        class="aamp__bar"
        role="meter"
        aria-label="OpenRouter spend today"
        :aria-valuenow="pct"
        aria-valuemin="0"
        aria-valuemax="100"
        :class="{ 'is-full': usage?.capReached }"
      >
        <span class="aamp__fill" :style="{ width: pct + '%' }" />
      </div>
      <span class="aamp__summary">{{ meterText }}</span>
    </div>
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
.aamp__provider {
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  background: color-mix(in oklch, var(--theme-accent) 16%, transparent);
  color: var(--theme-accent);
}
.aamp__provider.is-external {
  background: color-mix(in oklch, var(--text-secondary) 16%, transparent);
  color: var(--text-secondary);
}
.aamp__summary,
.aamp__note {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-2xs);
  color: var(--text-secondary);
}
.aamp__meter {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.aamp__bar {
  position: relative;
  flex: 0 0 120px;
  height: 6px;
  border-radius: var(--radius-pill);
  overflow: hidden;
  background: color-mix(in oklch, var(--text-secondary) 20%, transparent);
}
.aamp__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--theme-accent);
}
.aamp__bar.is-full .aamp__fill {
  background: var(--theme-danger);
}
</style>
