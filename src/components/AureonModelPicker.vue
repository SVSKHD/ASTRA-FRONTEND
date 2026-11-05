<script setup lang="ts">
// The model picker when the AI runs on Aureon (VITE_AI_BACKEND=aureon).
//
// Per conversation: a provider and a model from GET /api/models/catalog, in four
// groups (backend docs/26-ai-providers.md): Local — Ollama, OpenRouter, Claude
// through the direct Anthropic API, and Gemini through the direct Google API.
// The browser never calls a provider and never sees a key. The server keeps
// finance, trading, broker, positions, secrets and logs on the local model
// whatever is picked here, and on any external error it falls back to the local
// model — never to another external provider. Each reply says who answered.
//
// Everything listed comes from the catalog: a model the server marks
// unavailable (an unpriced Claude or Gemini model, for example) is shown greyed
// out with the reason, and a provider the server calls unusable is named with
// why, plus the way to fix it (Settings, admin only).
//
// The usage meter shows today's spend of the picked external provider against
// its daily cap, and the shared external cap when one is set. "Think" asks the
// model for its reasoning, shown above the reply as thinking steps (src/ai/steps.ts).
import { computed, inject, onMounted, ref, watch } from 'vue'
import { routerKey } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import { groupOf, modelReason, PROVIDER_GROUP, providerRows } from '@/ai/providers'
import { aiTraces, phaseText } from '@/ai/steps'
import { useAppStore } from '@/stores/app'
import {
  aureonAi,
  fallbackText,
  isProvider,
  loadCatalog,
  loadUsage,
  PROVIDER_NAME,
  setTarget,
  targetFor,
  type ExternalProvider,
} from '@/ai/aureonChat'

defineProps<{ disabled?: boolean }>()

const app = useAppStore()
// Optional: the picker also mounts outside the router (tests, previews).
const router = inject(routerKey, null)
const loading = ref(false)
const error = ref('')

const chatKey = computed(() => (app.aiActiveChatId == null ? null : String(app.aiActiveChatId)))
const current = computed(() => targetFor(chatKey.value))
const models = computed(() => aureonAi.catalog?.models ?? [])
const providers = computed(() => aureonAi.catalog?.providers ?? [])

/** The external provider whose spend the meter shows: the pick, else the server default. */
const meterProvider = computed<ExternalProvider | null>(() => {
  const t = current.value
  if (t && t.provider !== 'ollama') return t.provider
  const d = aureonAi.catalog?.defaultExternalProvider
  const usable = providers.value.find((p) => p.provider === d)?.usable
  return isProvider(d) && d !== 'ollama' && usable ? d : null
})

async function refreshUsage() {
  const p = meterProvider.value
  if (!p) return
  await loadUsage(p).catch(() => null)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    await loadCatalog()
    await refreshUsage()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(meterProvider, (p, prev) => {
  if (p && p !== prev && aureonAi.catalog) void refreshUsage()
})

const SEP = '|'
const local = computed(() => aureonAi.catalog?.localFallbackModel ?? null)
const defaultTarget = computed(() => aureonAi.catalog?.default ?? null)

/** "x (server default)", "y (local fallback)": the two models the server names. */
function tagged(provider: string, id: string, label: string): string {
  const tags: string[] = []
  const d = defaultTarget.value
  if (d && d.provider === provider && d.model === id) tags.push('server default')
  if (provider === 'ollama' && id === local.value) tags.push('local fallback')
  return tags.length ? `${label} (${tags.join(', ')})` : label
}

const options = computed(() => {
  const list = models.value.map((m) => ({
    value: `${m.provider}${SEP}${m.id}`,
    label: m.available
      ? tagged(m.provider, m.id, m.label)
      : `${m.label} — unavailable: ${modelReason(m)}`,
    group: groupOf(m),
    disabled: !m.available,
  }))
  // An external provider the server calls unusable lists no models: name it anyway.
  for (const p of providers.value) {
    if (p.provider === 'ollama' || p.usable) continue
    list.push({
      value: `${p.provider}${SEP}`,
      label: `Off: ${fallbackText(p.unavailableReason ?? 'disabled', p.provider)}`,
      group: PROVIDER_GROUP[p.provider],
      disabled: true,
    })
  }
  // A chat's earlier pick that is no longer offered stays visible, never swapped:
  // the server answers it locally, and switching providers is the user's call.
  const t = current.value
  if (t && !list.some((o) => o.value === `${t.provider}${SEP}${t.model}`)) {
    list.push({
      value: `${t.provider}${SEP}${t.model}`,
      label: `${t.model} — no longer offered; replies fall back to local`,
      group: PROVIDER_GROUP[t.provider],
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
  const provider = v.slice(0, i)
  const model = v.slice(i + 1)
  if (i < 0 || !model || !isProvider(provider)) return
  setTarget(chatKey.value, { provider, model })
}

const currentModel = computed(() => {
  const t = current.value
  return t ? models.value.find((m) => m.provider === t.provider && m.id === t.model) : undefined
})
const isExternal = computed(() => !!current.value && current.value.provider !== 'ollama')

const summary = computed(() => {
  const t = current.value
  if (!t) return ''
  const caps = currentModel.value?.capabilities.join(', ')
  if (t.provider !== 'ollama') {
    const via =
      t.provider === 'openrouter'
        ? 'OpenRouter, via the Aureon server'
        : `${PROVIDER_NAME[t.provider]}, direct API via the Aureon server`
    return [
      via,
      'external · private data stays local',
      local.value ? `falls back to ${local.value}` : 'falls back to the local model',
      ...(caps ? [caps] : []),
    ].join(' · ')
  }
  return [
    'Local Ollama on the Aureon server',
    'nothing leaves the server',
    ...(caps ? [caps] : []),
  ].join(' · ')
})

/** "Server default: Claude · claude-x" when the server names one. */
const defaultNote = computed(() => {
  const d = defaultTarget.value
  return d?.model ? `Server default: ${PROVIDER_NAME[d.provider]} · ${d.model}` : ''
})

/** External providers that are off, each with why: "OpenRouter: no daily budget". */
const offList = computed(() =>
  providers.value
    .filter((p) => p.provider !== 'ollama' && !p.usable)
    .map((p) => ({
      provider: p.provider,
      text: `${PROVIDER_NAME[p.provider]} is off: ${fallbackText(p.unavailableReason ?? 'disabled', p.provider)}.`,
    })),
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

// Only the meter provider's own numbers: usage loaded for another provider is not shown.
const usage = computed(() =>
  aureonAi.usage && aureonAi.usage.provider === meterProvider.value ? aureonAi.usage : null,
)
const showMeter = computed(() => !!usage.value && usage.value.limitUsd > 0)
const pct = computed(() => {
  const u = usage.value
  if (!u || u.limitUsd <= 0) return 0
  return Math.min(100, Math.round((u.spentUsd / u.limitUsd) * 100))
})
function usd(n: number): string {
  return n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}
const meterName = computed(() => (usage.value ? PROVIDER_NAME[usage.value.provider] : ''))
const meterText = computed(() => {
  const u = usage.value
  if (!u) return ''
  if (!u.available) return `${meterName.value} spend unavailable — replies stay local`
  const base = `${meterName.value} today: ${usd(u.spentUsd)} of ${usd(u.limitUsd)}`
  const global =
    u.globalLimitUsd != null && u.globalSpentUsd != null
      ? ` · all external: ${usd(u.globalSpentUsd)} of ${usd(u.globalLimitUsd)}`
      : ''
  return u.capReached
    ? `${base} — cap reached, replies stay local${global}`
    : `${base} · ${u.calls} calls${global}`
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
        :class="{ 'is-external': isExternal }"
        :title="isExternal ? 'External: sent only after the server’s privacy check' : 'Local'"
        data-testid="provider-badge"
        >{{ PROVIDER_NAME[current.provider] }}</span
      >
      <span
        v-if="current"
        class="aamp__privacy"
        :class="{ 'is-external': isExternal }"
        data-testid="privacy-badge"
        >{{ isExternal ? 'External' : 'Local only' }}</span
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
      <li
        v-for="r in rows"
        :key="r.key"
        class="aamp__prow"
        :class="{ 'is-on': r.available }"
        :data-provider="r.key"
      >
        <span class="aamp__dot" aria-hidden="true" />
        <span class="aamp__pname">{{ r.group }}</span>
        <span class="aamp__summary">
          {{ r.privacy === 'local' ? 'local' : 'external' }} ·
          {{ r.available ? 'available' : 'unavailable' }} ·
          {{ r.available ? `${r.models} model${r.models === 1 ? '' : 's'}` : r.reason }}
          <template v-if="r.available && r.blocked"> · {{ r.blocked }} without a price</template>
          <template v-if="r.defaultModel"> · default {{ r.defaultModel }}</template>
          <template v-if="r.dailyLimitUsd != null"> · cap ${{ r.dailyLimitUsd }}/day</template>
        </span>
      </li>
      <li v-if="local" class="aamp__summary">Local fallback: {{ local }}</li>
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
    <p v-if="defaultNote" class="aamp__summary" data-testid="default-note">{{ defaultNote }}</p>
    <div v-if="offList.length" class="aamp__row" data-testid="providers-off">
      <span class="aamp__summary">
        <span v-for="o in offList" :key="o.provider" :data-provider="o.provider">{{
          o.text + ' '
        }}</span>
      </span>
      <Button variant="ghost" size="sm" @click="openSettings">Set up providers</Button>
    </div>
    <div v-if="showMeter" class="aamp__meter" data-testid="usage-meter">
      <div
        class="aamp__bar"
        role="meter"
        :aria-label="`${meterName} spend today`"
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
.aamp__privacy {
  font-size: var(--text-2xs);
  color: var(--theme-accent);
}
.aamp__privacy.is-external {
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
