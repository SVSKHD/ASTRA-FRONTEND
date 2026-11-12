<script setup lang="ts">
// The Diagnose panel on the Settings page (backend GET /api/v1/settings/diagnostics).
//
// For each setting it shows the value at every layer — .env, the encrypted DB row,
// what a reload would give, what the server is running with — as masks only, and
// names where they disagree with a one-line fix. "Reload settings" asks the server
// to re-read .env + the DB and rebuild its clients (the Claude gateway included).
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { aureon } from '@/api/client'
import { must } from '@/control/api'
import { labelOf } from '@/control/settings'
import {
  ISSUES,
  SOURCE_LABEL,
  cell,
  checks,
  filterKeys,
  headline,
  problemKeys,
  type Diagnostics,
  type Filter,
} from '@/control/settingsDiagnostics'
import { ago } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

const props = defineProps<{ category?: string; categoryLabel?: string }>()
const emit = defineEmits<{ reloaded: [] }>()

const report = useLoad<Diagnostics>(async () =>
  must(await aureon.GET('/api/v1/settings/diagnostics')),
)
const d = computed(() => report.data.value)
const cards = computed(() => (d.value ? checks(d.value) : []))
const head = computed(() => (d.value ? headline(d.value) : null))

const filter = ref<Filter>('problems')
const filters = computed(() => [
  { value: 'problems', label: `Problems (${d.value ? problemKeys(d.value).length : 0})` },
  { value: 'category', label: props.categoryLabel ?? 'This tab' },
  { value: 'all', label: 'All' },
])
const rows = computed(() => (d.value ? filterKeys(d.value, filter.value, props.category) : []))

const reloading = ref(false)
const reloadMsg = ref('')
async function reload() {
  reloading.value = true
  reloadMsg.value = ''
  try {
    const r = must(await aureon.POST('/api/v1/settings/reload'))
    reloadMsg.value = r.changed.length
      ? `Applied: ${r.changed.map(labelOf).join(', ')}`
      : 'Nothing to apply: the server already runs these values.'
    emit('reloaded')
    await report.reload()
  } catch (e) {
    reloadMsg.value = (e as Error).message || 'Reload failed.'
  } finally {
    reloading.value = false
  }
}
</script>

<template>
  <GlassPanel padding="md" class="sd" data-testid="settings-diagnostics">
    <header class="sd__head">
      <div class="sd__title">
        <h2>Diagnostics</h2>
        <p>
          Every value at each layer, masked: .env → database → after reload → running now.
          <template v-if="d"> Checked {{ ago(d.checked_at) }}.</template>
        </p>
      </div>
      <div class="sd__actions">
        <Button size="sm" variant="ghost" :loading="report.loading.value" @click="report.reload()"
          >Refresh</Button
        >
        <Button
          size="sm"
          :variant="d && (d.stale.length || !d.ai.matches_settings) ? 'primary' : 'secondary'"
          :loading="reloading"
          data-testid="reload-settings"
          @click="reload"
          >Reload settings</Button
        >
      </div>
    </header>

    <p v-if="reloadMsg" class="sd__msg" role="status" aria-live="polite">{{ reloadMsg }}</p>

    <p v-if="report.error.value && !d" class="sd__headline is-danger" role="alert">
      Diagnostics could not be loaded: {{ report.error.value }}
    </p>
    <Skeleton v-else-if="!d" :lines="6" aria-busy="true" />

    <template v-else>
      <p class="sd__headline" :class="`is-${head!.tone}`" data-testid="diag-headline">
        {{ head!.text }}
      </p>

      <ul class="sd__checks">
        <li
          v-for="c in cards"
          :key="c.id"
          class="sd__check"
          :class="`is-${c.tone}`"
          :data-check="c.id"
        >
          <span class="sd__check-label">{{ c.label }}</span>
          <span class="sd__check-value">{{ c.value }}</span>
          <span v-if="c.detail" class="sd__check-detail">{{ c.detail }}</span>
        </li>
      </ul>

      <p v-if="d.unknown_rows.length" class="sd__msg" data-testid="unknown-rows">
        Old settings in the database, for features that no longer exist (ignored):
        <code>{{ d.unknown_rows.join(', ') }}</code>
      </p>

      <SegmentedControl
        :model-value="filter"
        :options="filters"
        size="sm"
        aria-label="Which settings to show"
        class="sd__filter"
        @update:model-value="filter = $event as Filter"
      />

      <p v-if="!rows.length" class="sd__empty">
        {{ filter === 'problems' ? 'No problems: every layer agrees.' : 'No settings here.' }}
      </p>

      <ul v-else class="sd__keys">
        <li v-for="k in rows" :key="k.key" class="sd__key" :data-key="k.key">
          <div class="sd__key-head">
            <span class="sd__key-name">{{ labelOf(k.key) }}</span>
            <code class="sd__key-id">{{ k.key }}</code>
            <span class="sd__badges">
              <Badge
                v-for="i in k.issues"
                :key="i"
                :tone="ISSUES[i].tone"
                :label="ISSUES[i].label"
              />
            </span>
          </div>
          <dl class="sd__layers">
            <div>
              <dt>.env</dt>
              <dd>
                {{ cell(k.env_masked) }}
                <small>{{ SOURCE_LABEL[k.env_source] }}</small>
              </dd>
            </div>
            <div>
              <dt>Database</dt>
              <dd>
                {{ k.db_present ? (k.db_masked ?? 'unreadable') : '—' }}
                <small v-if="k.db_present && k.db_updated_at"
                  >v{{ k.db_version }} · {{ ago(k.db_updated_at) }}</small
                >
              </dd>
            </div>
            <div>
              <dt>After reload</dt>
              <dd>
                {{ cell(k.expected_masked) }}
                <small>{{ SOURCE_LABEL[k.expected_source] }}</small>
              </dd>
            </div>
            <div :class="{ 'is-stale': k.issues.includes('stale') }">
              <dt>Running now</dt>
              <dd>{{ cell(k.live_masked) }}</dd>
            </div>
          </dl>
          <ul v-if="k.issues.length" class="sd__fixes">
            <li v-for="i in k.issues" :key="i">{{ ISSUES[i].fix }}</li>
          </ul>
        </li>
      </ul>
    </template>
  </GlassPanel>
</template>

<style scoped>
.sd {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.sd__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
}
.sd__title {
  min-width: 0;
}
.sd__title h2 {
  margin: 0;
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.sd__title p,
.sd__msg,
.sd__empty {
  margin: var(--sp-1) 0 0;
  max-width: 70ch;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.sd__actions {
  display: flex;
  gap: var(--sp-2);
}
.sd__headline {
  margin: 0;
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.sd__headline.is-danger {
  color: var(--theme-danger);
}
.sd__headline.is-warning {
  color: var(--theme-warning, var(--text-primary));
}
.sd__headline.is-success {
  color: var(--theme-success, var(--text-primary));
}
.sd__checks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.sd__check {
  --sd-tone: var(--text-muted, var(--theme-dim));

  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--glass-border);
  border-left: 3px solid var(--sd-tone);
  border-radius: var(--radius-md);
}
.sd__check.is-success {
  --sd-tone: var(--theme-success, var(--theme-accent));
}
.sd__check.is-warning {
  --sd-tone: var(--theme-warning, var(--theme-accent));
}
.sd__check.is-danger {
  --sd-tone: var(--theme-danger);
}
.sd__check-label,
.sd__check-detail {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.sd__check-value {
  min-width: 0;
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.sd__filter {
  align-self: flex-start;
  max-width: 100%;
}
.sd__keys {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.sd__key {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
}
.sd__key-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.sd__key-name {
  font-weight: var(--weight-medium);
  color: var(--text-primary);
}
.sd__key-id {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.sd__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
}
.sd__layers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: var(--sp-2);
  margin: 0;
}
.sd__layers dt {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.sd__layers dd {
  min-width: 0;
  display: flex;
  flex-direction: column;
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.sd__layers small {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.sd__layers .is-stale dd {
  color: var(--theme-warning, var(--text-primary));
}
.sd__fixes {
  margin: 0;
  padding-left: var(--sp-4);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
</style>
