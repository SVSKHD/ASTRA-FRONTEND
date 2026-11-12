<script setup lang="ts">
// The Diagnose panel on the Settings page (backend GET /api/v1/settings/diagnostics):
// what every setting actually is, at every layer, and who is running what.
//
//   Status cards   server, encryption, database, saved values, change signal (Redis),
//                  workers, Claude, running
//   Processes      the API and every worker: when it loaded its settings, what it
//                  watches, and which keys it still runs an older value of
//   Connections    each group's last connection test, with a button to run it again
//   Settings       per key: the value in .env, in the database, after a reload and
//                  running now, as code blocks (full for non-secrets; a secret after
//                  Reveal + password, for a minute), each problem with its fix, and
//                  Edit, which opens the same editor as the Settings page.
//
// "Reload settings" asks the server to re-read .env + the DB now and rebuild its
// clients (the Claude gateway included); workers restart themselves for their keys.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import Icon from '@/components/ui/Icon.vue'
import SearchField from '@/components/ui/SearchField.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import SettingField from '@/components/control/SettingField.vue'
import ValueBlock from '@/components/control/settings/ValueBlock.vue'
import { aureon } from '@/api/client'
import { must } from '@/control/api'
import { CATEGORY_LABEL, labelOf, testKey, type SettingRow } from '@/control/settings'
import {
  ISSUES,
  checks,
  filterKeys,
  headline,
  layersOf,
  problemKeys,
  staleIn,
  watchesText,
  type Diagnostics,
  type Filter,
  type KeyDiagnosis,
} from '@/control/settingsDiagnostics'
import type { SettingWriter } from '@/control/useSettingWriter'
import { ago } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

const props = defineProps<{
  category?: string
  categoryLabel?: string
  /** The Settings list rows, for the editors. */
  rows?: SettingRow[]
  writer: SettingWriter
  encryptionReady: boolean
}>()
const emit = defineEmits<{ reloaded: [] }>()
const w = props.writer

const report = useLoad<Diagnostics>(async () =>
  must(await aureon.GET('/api/v1/settings/diagnostics')),
)
const d = computed(() => report.data.value)
const cards = computed(() => (d.value ? checks(d.value) : []))
const head = computed(() => (d.value ? headline(d.value) : null))

// A save, revert or test from an editor here changes what the report says: refresh it.
watch(
  () => [w.message.key, w.message.text] as const,
  ([key, text]) => {
    if (key && text) void report.reload()
  },
)

// --- which settings ---------------------------------------------------------------------
const filter = ref<Filter>('problems')
const query = ref('')
const filters = computed(() => [
  { value: 'problems', label: `Problems (${d.value ? problemKeys(d.value).length : 0})` },
  { value: 'category', label: props.categoryLabel ?? 'This tab' },
  { value: 'all', label: `All (${d.value?.keys.length ?? 0})` },
])
const keys = computed(() => {
  if (!d.value) return []
  const q = query.value.trim().toLowerCase()
  const base = q ? d.value.keys : filterKeys(d.value, filter.value, props.category)
  if (!q) return base
  return base.filter(
    (k) => k.key.toLowerCase().includes(q) || labelOf(k.key).toLowerCase().includes(q),
  )
})

// --- edit in place: the same editor the Settings page uses -----------------------------
const editing = ref<string | null>(null)
const rowOf = (key: string) => props.rows?.find((r) => r.key === key) ?? null
function toggleEdit(key: string) {
  editing.value = editing.value === key ? null : key
}

// --- reveal a secret: every layer in full, after the password ---------------------------
function reveal(k: KeyDiagnosis) {
  void w.reveal({ key: k.key, kind: k.kind, requires_reauth: k.requires_reauth })
}

// --- connection tests per group --------------------------------------------------------
const tests = computed(() => {
  const out: {
    category: string
    label: string
    key: string
    detail: string
    ok: boolean | null
    when: string | null
  }[] = []
  if (!d.value) return out
  const cats = [...new Set(d.value.keys.filter((k) => k.is_secret).map((k) => k.category))]
  for (const c of cats) {
    const key = testKey({ rows: (props.rows ?? []).filter((r) => r.category === c) })
    if (!key) continue
    const t = d.value.tests[c]
    out.push({
      category: c,
      label: CATEGORY_LABEL[c] ?? c,
      key,
      detail: t?.detail ?? 'Not tested yet',
      ok: t ? t.ok : null,
      when: t?.tested_at ?? null,
    })
  }
  return out
})
function runTest(key: string, category: string) {
  void w.runTest(key, `test:${category}`)
}

// --- reload -------------------------------------------------------------------------------
const reloading = ref(false)
const reloadMsg = ref('')
async function reload() {
  reloading.value = true
  reloadMsg.value = ''
  try {
    const r = must(await aureon.POST('/api/v1/settings/reload'))
    reloadMsg.value = r.changed.length
      ? `Applied: ${r.changed.map(labelOf).join(', ')}. Workers that use them restart on their own.`
      : 'Nothing to apply: this server already runs these values. Workers were told to check.'
    w.hideAll()
    emit('reloaded')
    await report.reload()
  } catch (e) {
    reloadMsg.value = (e as Error).message || 'Reload failed.'
  } finally {
    reloading.value = false
  }
}
const needsReload = computed(
  () =>
    !!d.value &&
    (d.value.stale.length > 0 ||
      !d.value.ai.matches_settings ||
      d.value.processes.some((p) => p.stale.length)),
)
</script>

<template>
  <GlassPanel padding="md" class="sd" data-testid="settings-diagnostics">
    <header class="sd__head">
      <div class="sd__title">
        <h2>Diagnostics</h2>
        <p>
          Every setting at each layer: .env → database → after reload → running now, and what each
          worker loaded.
          <template v-if="d"> Checked {{ ago(d.checked_at) }}.</template>
        </p>
      </div>
      <div class="sd__actions">
        <Button size="sm" variant="ghost" :loading="report.loading.value" @click="report.reload()"
          ><Icon name="refresh-cw" size="xs" />Refresh</Button
        >
        <Button
          size="sm"
          :variant="needsReload ? 'primary' : 'secondary'"
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

      <!-- processes -------------------------------------------------------------------- -->
      <section class="sd__section" aria-labelledby="sd-procs">
        <h3 id="sd-procs">Processes</h3>
        <p v-if="!d.processes.length" class="sd__msg">
          No process has reported yet. Each one reports when it starts with this version.
        </p>
        <ul v-else class="sd__procs">
          <li
            v-for="p in d.processes"
            :key="`${p.process}@${p.host}`"
            class="sd__proc"
            :class="{ 'is-stale': p.stale.length }"
            :data-process="p.process"
          >
            <div class="sd__proc-head">
              <strong>{{ p.process }}</strong>
              <Badge v-if="p.this" tone="info" label="Answered this" />
              <Badge
                :tone="p.stale.length ? 'warning' : 'success'"
                :label="p.stale.length ? `${p.stale.length} out of date` : 'Up to date'"
              />
            </div>
            <dl class="sd__proc-meta">
              <div>
                <dt>Host · pid</dt>
                <dd>
                  <code>{{ p.host }} · {{ p.pid }}</code>
                </dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{{ p.started_at ? ago(p.started_at) : '—' }}</dd>
              </div>
              <div>
                <dt>Settings loaded</dt>
                <dd>{{ p.applied_at ? ago(p.applied_at) : '—' }}</dd>
              </div>
              <div>
                <dt>Reloads on</dt>
                <dd>{{ watchesText(p) }}</dd>
              </div>
            </dl>
            <p v-if="p.stale.length" class="sd__proc-stale">
              Running older values of: <code>{{ p.stale.join(', ') }}</code
              >. Reload settings; if it stays, restart this container.
            </p>
            <p v-if="p.unwatched_stale.length" class="sd__proc-note">
              Holds older copies of {{ p.unwatched_stale.length }} setting{{
                p.unwatched_stale.length === 1 ? '' : 's'
              }}
              it does not use live ({{ p.unwatched_stale.join(', ') }}): no effect.
            </p>
          </li>
        </ul>
      </section>

      <!-- connection tests ------------------------------------------------------------- -->
      <section v-if="tests.length" class="sd__section" aria-labelledby="sd-tests">
        <h3 id="sd-tests">Connections</h3>
        <ul class="sd__tests">
          <li v-for="t in tests" :key="t.category" class="sd__test" :data-test="t.category">
            <Badge
              :tone="t.ok === null ? 'neutral' : t.ok ? 'success' : 'danger'"
              :label="t.label"
            />
            <span class="sd__test-detail"
              >{{ t.detail }}<template v-if="t.when"> · {{ ago(t.when) }}</template></span
            >
            <Button
              size="sm"
              variant="ghost"
              :loading="w.busy.value === `test:${t.category}`"
              @click="runTest(t.key, t.category)"
              >Test</Button
            >
          </li>
        </ul>
      </section>

      <!-- settings ---------------------------------------------------------------------- -->
      <section class="sd__section" aria-labelledby="sd-keys">
        <h3 id="sd-keys">Settings</h3>
        <div class="sd__tools">
          <SegmentedControl
            :model-value="filter"
            :options="filters"
            size="sm"
            aria-label="Which settings to show"
            class="sd__filter"
            @update:model-value="filter = $event as Filter"
          />
          <SearchField
            v-model="query"
            size="sm"
            label="Find a setting"
            placeholder="Find a setting"
          />
        </div>

        <p v-if="!keys.length" class="sd__empty">
          {{
            query.trim()
              ? `No setting matches “${query}”.`
              : filter === 'problems'
                ? 'No problems: every layer agrees.'
                : 'No settings here.'
          }}
        </p>

        <ul v-else class="sd__keys">
          <li v-for="k in keys" :key="k.key" class="sd__key" :data-key="k.key">
            <div class="sd__key-head">
              <span class="sd__key-name">{{ labelOf(k.key) }}</span>
              <code class="sd__key-id">{{ k.key }}</code>
              <Badge v-if="k.is_secret" tone="neutral" label="Secret" />
              <span class="sd__badges">
                <Badge
                  v-for="i in k.issues"
                  :key="i"
                  :tone="ISSUES[i].tone"
                  :label="ISSUES[i].label"
                />
                <Badge
                  v-for="p in staleIn(d, k.key)"
                  :key="p.process"
                  tone="warning"
                  :label="`Old in ${p.process}`"
                />
              </span>
              <span class="sd__key-actions">
                <Button
                  v-if="k.is_secret && !w.revealed[k.key]"
                  size="sm"
                  variant="ghost"
                  data-testid="diag-reveal"
                  @click="reveal(k)"
                  ><Icon name="eye" size="xs" />Reveal</Button
                >
                <Button v-if="w.revealed[k.key]" size="sm" variant="ghost" @click="w.hide(k.key)"
                  ><Icon name="eye-off" size="xs" />Hide</Button
                >
                <Button
                  v-if="rowOf(k.key)"
                  size="sm"
                  :variant="editing === k.key ? 'secondary' : 'ghost'"
                  :aria-expanded="editing === k.key"
                  data-testid="diag-edit"
                  @click="toggleEdit(k.key)"
                  ><Icon name="pencil" size="xs" />{{
                    editing === k.key ? 'Close' : 'Edit'
                  }}</Button
                >
              </span>
            </div>

            <div class="sd__layers">
              <ValueBlock
                v-for="l in layersOf(k, w.revealed[k.key])"
                :key="l.id"
                :label="`${l.label} · ${l.note}`"
                :value="l.value"
                :masked="l.masked"
                :kind="k.kind"
                :empty="l.empty"
                :tone="l.tone"
                :data-layer="l.id"
              />
            </div>

            <ul v-if="k.issues.length || staleIn(d, k.key).length" class="sd__fixes">
              <li v-for="i in k.issues" :key="i">{{ ISSUES[i].fix }}</li>
              <li v-for="p in staleIn(d, k.key)" :key="`p-${p.process}`">
                The {{ p.process }} worker still runs an older value. Press “Reload settings”; if it
                stays, restart that container.
              </li>
            </ul>

            <ul v-if="editing === k.key && rowOf(k.key)" class="sd__editor">
              <SettingField
                :row="rowOf(k.key)!"
                :writer="writer"
                :encryption-ready="encryptionReady"
              />
            </ul>
          </li>
        </ul>
      </section>
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
.sd__section h3 {
  margin: 0 0 var(--sp-2);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.sd__section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.sd__title p,
.sd__msg,
.sd__empty {
  min-width: 0;
  margin: var(--sp-1) 0 0;
  max-width: 70ch;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.sd__actions,
.sd__key-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.sd__key-actions {
  margin-left: auto;
  gap: var(--sp-1);
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
.sd__checks,
.sd__procs,
.sd__tests,
.sd__keys,
.sd__editor {
  margin: 0;
  padding: 0;
  list-style: none;
}
.sd__checks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--sp-2);
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
.sd__procs,
.sd__keys {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.sd__proc,
.sd__key {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
}
.sd__proc.is-stale {
  border-color: var(--theme-warning, var(--glass-border));
}
.sd__proc-head,
.sd__key-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  color: var(--text-primary);
}
.sd__proc-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--sp-2);
  margin: 0;
}
.sd__proc-meta dt {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.sd__proc-meta dd {
  min-width: 0;
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.sd__proc-stale,
.sd__proc-note {
  min-width: 0;
  margin: 0;
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}
.sd__proc-stale {
  color: var(--theme-warning, var(--text-primary));
}
.sd__proc-note {
  color: var(--text-secondary);
}
.sd__tests {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.sd__test {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.sd__test-detail {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.sd__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}
.sd__filter {
  max-width: 100%;
}
.sd__key-name {
  font-weight: var(--weight-medium);
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
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--sp-2);
}
.sd__fixes {
  margin: 0;
  padding-left: var(--sp-4);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.sd__editor {
  padding: 0 var(--sp-2);
  border-left: 3px solid var(--theme-accent);
}
</style>
