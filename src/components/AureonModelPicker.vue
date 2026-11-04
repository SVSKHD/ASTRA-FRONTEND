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
//
// Claude, GPT and Gemini are OpenRouter models grouped by vendor (src/ai/providers.ts);
// "Providers" lists all five with whether each is usable and why not. "Think" asks the
// model for its reasoning, shown above the reply as thinking steps (src/ai/steps.ts).
//
// The server lists OpenRouter models only while OpenRouter is usable. When it
// is not, the picker still names it — a greyed-out entry with the reason — and
// offers the way to switch it on: the OpenRouter card in Settings (/settings,
// admin only; the server's own Settings page decides who may change it).
import { computed, inject, onMounted, ref } from 'vue'
import { routerKey } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import { groupOf, providerRows } from '@/ai/providers'
import { aiTraces, phaseText } from '@/ai/steps'
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
// Optional: the picker also mounts outside the router (tests, previews).
const router = inject(routerKey, null)
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
const OR_GROUP = 'Other models · via OpenRouter'
const offReason = computed(() => aureonAi.catalog?.openrouterOff ?? null)
const options = computed(() => {
  const list = models.value.map((m) => ({
    value: `${m.provider}${SEP}${m.id}`,
    label: m.label,
    group: groupOf(m),
    disabled: false,
  }))
  if (offReason.value) {
    list.push({
      value: `openrouter${SEP}`,
      label: `Off: ${fallbackText(offReason.value)}`,
      group: OR_GROUP,
      disabled: true,
    })
  }
  return list
})
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

const offNote = computed(() =>
  offReason.value ? `OpenRouter is off: ${fallbackText(offReason.value)}.` : '',
)
function openSettings() {
  void router?.push('/settings')
}

const rows = computed(() => providerRows(aureonAi.catalog))
const showProviders = ref(false)

/** The run in progress in this chat, if any: "Thinking… 2.1 s", "Writing…". */
const live = computed(() => {
  const key = chatKey.value
  if (key == null) return ''
  const prefix = `${key}:`
  const running = Object.entries(aiTraces)
    .filter(
      ([k, t]) => k.startsWith(prefix) && ['sending', 'thinking', 'writing'].includes(t.phase),
    )
    .map(([, t]) => t)
  return running.length ? phaseText(running[running.length - 1]) : ''
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
      <span v-if="live" class="aamp__live" data-testid="run-status">{{ live }}</span>
      <Switch
        :model-value="aureonAi.think"
        label="Think"
        size="sm"
        :disabled="disabled"
        data-testid="think-switch"
        @update:model-value="aureonAi.think = $event"
      />
      <Button
        variant="ghost"
        size="sm"
        :aria-expanded="showProviders"
        data-testid="providers-toggle"
        @click="showProviders = !showProviders"
        >Providers</Button
      >
      <Button variant="ghost" size="sm" :disabled="loading" @click="load">
        {{ loading ? 'Loading models…' : 'Refresh models' }}
      </Button>
    </div>
    <ul v-if="showProviders && rows.length" class="aamp__providers" data-testid="providers">
      <li v-for="r in rows" :key="r.key" class="aamp__prow" :class="{ 'is-on': r.available }">
        <span class="aamp__dot" aria-hidden="true" />
        <span class="aamp__pname">{{ r.name }}</span>
        <span class="aamp__summary">
          {{ r.via }} ·
          {{ r.available ? `${r.models} model${r.models === 1 ? '' : 's'}` : r.reason }}
        </span>
      </li>
    </ul>
    <p v-if="aureonAi.think" class="aamp__summary">
      Think is on: the model's reasoning streams above each reply. Reasoning uses more tokens, and
      models without it answer as usual.
    </p>
    <p v-if="error" class="aamp__note" role="alert">{{ error }}</p>
    <p v-else-if="!loading && !models.length" class="aamp__summary">
      No models are installed in the server's Ollama yet. Pull one there, then refresh.
    </p>
    <p v-else class="aamp__summary">{{ summary }}</p>
    <div v-if="offNote" class="aamp__row" data-testid="openrouter-off">
      <span class="aamp__summary">{{ offNote }}</span>
      <Button variant="ghost" size="sm" @click="openSettings">Set up OpenRouter</Button>
    </div>
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
      <Button variant="ghost" size="sm" data-testid="cost-center" @click="router?.push('/ai/costs')"
        >Cost Center</Button
      >
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
.aamp__live {
  font-size: var(--text-2xs);
  color: var(--theme-accent);
  font-variant-numeric: tabular-nums;
}
.aamp__providers {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: var(--sp-2);
  list-style: none;
  border: 1px solid var(--theme-border);
  border-radius: var(--radius-card);
  min-width: 0;
}
.aamp__prow {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px var(--sp-2);
  min-width: 0;
}
.aamp__dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  align-self: center;
  background: var(--text-secondary);
  opacity: 0.5;
}
.aamp__prow.is-on .aamp__dot {
  background: var(--theme-success, var(--theme-accent));
  opacity: 1;
}
.aamp__pname {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
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
