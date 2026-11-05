<script setup lang="ts">
// Settings and secrets (backend docs/settings.md): the keys Aureon reads for
// OpenRouter, Anthropic, Gemini, the shared AI controls, the agents, Dhan,
// GitHub, Discord and MT5, set from here instead of .env.
//
// The server never sends a value back: each row shows a mask, where the value
// in effect comes from, and when it changed. A typed value lives only in this
// page's inputs until it is sent, and is cleared after. Secrets (and the URLs a
// credential is sent to) ask for the admin's password first; the server checks
// it, audits the change and applies it without a restart.
//
// Each AI provider card also says whether the provider is usable now and why
// not, from the model catalog. "Key set" is not "connected": only Test (run by
// the server, POST /api/v1/settings/{key}/test) checks the key against the
// provider. The browser never calls Anthropic, Google or OpenRouter itself.
import { computed, onMounted, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import DhanSessionBar from '@/components/control/DhanSessionBar.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SettingField from '@/components/control/SettingField.vue'
import SettingReauth from '@/components/control/SettingReauth.vue'
import { aureon } from '@/api/client'
import { aureonAi, fallbackText, loadCatalog, PROVIDER_NAME } from '@/ai/aureonChat'
import { must } from '@/control/api'
import { CATEGORY_PROVIDER, providerState } from '@/control/aiSettings'
import { groupSettings, testChip, testKey, type Group } from '@/control/settings'
import { useSettingWriter } from '@/control/useSettingWriter'
import { ago } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

const missing = ref(false)
const list = useLoad(async () => {
  const r = await aureon.GET('/api/v1/settings')
  missing.value = r.response.status === 404
  return missing.value ? null : must(r)
})
const groups = computed(() => (list.data.value ? groupSettings(list.data.value) : []))

// The catalog says whether each provider is usable now and which models are priced.
// Refreshed after every change, because a setting can change both.
async function refreshCatalog() {
  await loadCatalog().catch(() => null)
}
onMounted(refreshCatalog)
const writer = useSettingWriter(async () => {
  await list.reload()
  await refreshCatalog()
})

function runTest(group: Group) {
  const key = testKey(group)
  if (key) void writer.runTest(key, `test:${group.category}`)
}

/** "Usable" / "Unavailable: …" with key and enabled state, for a provider card. */
function stateLine(category: string) {
  const s = providerState(aureonAi.catalog, category)
  const p = CATEGORY_PROVIDER[category]
  if (!s || !p) return null
  return {
    usable: s.usable,
    text: [
      s.enabled ? 'Enabled' : 'Disabled',
      s.configured ? 'key set (not tested)' : 'no key',
      s.defaultModel ? `default ${s.defaultModel}` : 'no default model',
      s.usable ? 'usable' : `unavailable: ${fallbackText(s.reason ?? 'disabled', p)}`,
    ].join(' · '),
    label: PROVIDER_NAME[p],
  }
}
</script>

<template>
  <div class="tp-page">
    <EmptyState
      v-if="missing"
      title="Settings need the backend settings manager"
      description="This server has no /api/v1/settings yet. Deploy it and this page fills in."
    />
    <template v-else>
      <p v-if="list.error.value" class="tp-note" role="alert">{{ list.error.value }}</p>
      <p v-if="list.data.value && !list.data.value.encryption_ready" class="tp-note" role="alert">
        The server has no SETTINGS_MASTER_KEY, so values cannot be stored yet. Everything below
        comes from .env.
      </p>
      <!-- The control center is admin-only; finish a Dhan login that came back here. -->
      <DhanSessionBar admin detailed finish-callback @changed="list.reload()" />
      <Card
        v-for="g in groups"
        :key="g.category"
        :title="g.label"
        class="cc-set"
        :data-category="g.category"
      >
        <template #header>
          <div class="cc-set__title">
            <span class="ui-card__title">{{ g.label }}</span>
            <Badge v-if="testChip(g.test)" v-bind="testChip(g.test)!" />
            <Button
              size="sm"
              variant="secondary"
              :loading="writer.busy.value === `test:${g.category}`"
              @click="runTest(g)"
              >Test</Button
            >
          </div>
        </template>
        <p class="tp-note">
          {{ g.note }}
          <span v-if="g.test"> Last test {{ ago(g.test.tested_at) }}: {{ g.test.detail }}</span>
        </p>
        <p
          v-if="stateLine(g.category)"
          class="tp-note cc-set__state"
          :class="{ 'is-off': !stateLine(g.category)!.usable }"
          data-testid="provider-state"
        >
          {{ stateLine(g.category)!.label }} now: {{ stateLine(g.category)!.text }}
        </p>
        <ul class="cc-set__rows">
          <SettingField
            v-for="row in g.rows"
            :key="row.key"
            :row="row"
            :writer="writer"
            :encryption-ready="!!list.data.value?.encryption_ready"
            :catalog="aureonAi.catalog"
          />
        </ul>
      </Card>
    </template>

    <SettingReauth :writer="writer" />
  </div>
</template>

<style scoped>
.cc-set__title {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.cc-set__rows {
  display: grid;
  gap: var(--sp-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.cc-set__state {
  min-width: 0;
  overflow-wrap: anywhere;
}

.cc-set__state.is-off {
  color: var(--theme-warning, var(--text-secondary));
}
</style>
