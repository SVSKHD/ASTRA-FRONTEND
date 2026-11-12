<script setup lang="ts">
// Settings and secrets (backend docs/settings.md), as a "system preferences"
// page: a rail of categories (AI, Agents, Dhan, GitHub, Discord, MT5), each with
// the result of its last connection test and how many credentials it still
// needs; on the right, the category's purpose, its Test connection, and its
// settings in titled cards. On a phone the rail is a horizontal strip.
//
// The server never sends a value back: each row shows a mask, where the value in
// effect comes from, and when it changed. A typed value lives only in this page's
// memory until it is sent, and is cleared after. Secrets (and the URLs a
// credential is sent to) ask for the admin's password first; the server checks
// it, audits the change and applies it without a restart.
//
// Leaving with unsaved changes asks first (the app's UnsavedSheet), and so does
// closing the tab.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
  useRouter,
  type RouteLocationRaw,
} from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import SearchField from '@/components/ui/SearchField.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import UnsavedSheet from '@/components/ui/UnsavedSheet.vue'
import BudgetCard from '@/components/ai/costs/BudgetCard.vue'
import DhanSessionBar from '@/components/control/DhanSessionBar.vue'
import SettingField from '@/components/control/SettingField.vue'
import SettingReauth from '@/components/control/SettingReauth.vue'
import { aureon } from '@/api/client'
import { loadUsage, num, type AiUsage } from '@/ai/costs'
import { must } from '@/control/api'
import {
  canTest,
  categoriesOf,
  groupRows,
  labelOf,
  missingCount,
  searchSettings,
  testChip,
  testDot,
  testKey,
  type Category,
  type SearchHit,
} from '@/control/settings'
import { BUDGET_KEYS, type BudgetDraft } from '@/control/settingEditors'
import { useSettingWriter } from '@/control/useSettingWriter'
import { useAppStore } from '@/stores/app'
import { ago } from '@/trading/format'
import { useLoad } from '@/trading/useLoad'

const route = useRoute()
const router = useRouter()
const app = useAppStore()

const missing = ref(false)
const list = useLoad(async () => {
  const r = await aureon.GET('/api/v1/settings')
  missing.value = r.response.status === 404
  return missing.value ? null : must(r)
})
const categories = computed<Category[]>(() =>
  list.data.value ? categoriesOf(list.data.value) : [],
)
const encryptionReady = computed(() => !!list.data.value?.encryption_ready)

// --- the selected category, kept in the URL (?category=ai) -------------------------------------
const selected = computed<Category | null>(() => {
  const want = String(route.query.category ?? '')
  return categories.value.find((c) => c.category === want) ?? categories.value[0] ?? null
})
function pick(category: string) {
  void router.replace({ query: { ...route.query, category } })
}
const groups = computed(() =>
  selected.value ? groupRows(selected.value.category, selected.value.rows) : [],
)

// --- AI: this month's spend at the top, and the caps the budget editor starts from ----------
const usage = ref<AiUsage | null>(null)
async function refreshUsage() {
  const r = await loadUsage()
  usage.value = r.ok ? r.data : null
}
watch(
  () => selected.value?.category,
  (c) => {
    if (c === 'ai' && !usage.value) void refreshUsage()
  },
  { immediate: true },
)
const budgetSeed = computed<BudgetDraft | null>(() => {
  const u = usage.value
  if (!u) return null
  const out = { investments: '', business: '', chat: '', reserve: '' } as BudgetDraft
  for (const k of BUDGET_KEYS) {
    const b = u.budgets.find((x) => x.budget === k)
    if (b) out[k] = String(num(b.limit_usd))
  }
  return out
})
const writer = useSettingWriter(async () => {
  await list.reload()
  if (selected.value?.category === 'ai') await refreshUsage()
})
/** The monthly budget to compare the split with: the typed one, else the one in use. */
const monthlyBudget = computed<number | null>(() => {
  const typed = writer.drafts.AI_MONTHLY_BUDGET_USD
  if (typed !== undefined && /^\d+(\.\d+)?$/.test(typed.trim())) return Number(typed)
  return usage.value ? num(usage.value.limit_usd) : null
})
const keyMissing = computed(
  () =>
    selected.value?.category === 'ai' &&
    selected.value.rows.some((r) => r.key === 'ANTHROPIC_API_KEY' && !r.is_set),
)

// --- connection test ------------------------------------------------------------------------
function runTest(c: Category) {
  const key = testKey(c)
  if (key) void writer.runTest(key, `test:${c.category}`)
}
const testMessage = computed(() => {
  const c = selected.value
  const key = c ? testKey(c) : undefined
  return key && writer.message.key === key && writer.message.text ? writer.message : null
})

// --- toasts for saves and reverts -------------------------------------------------------------
watch(
  () => [writer.message.key, writer.message.text, writer.message.tone] as const,
  ([key, text, tone]) => {
    if (key && text && tone === 'ok' && !text.startsWith('Test')) {
      app.showToastMsg(`${labelOf(key)}: ${text}`)
    }
  },
)

// --- search (and Ctrl/Cmd+K) ------------------------------------------------------------------
const query = ref('')
const searchBox = ref<HTMLElement | null>(null)
const hits = computed<SearchHit[]>(() => searchSettings(list.data.value, query.value))
async function jump(hit: SearchHit) {
  query.value = ''
  pick(hit.category)
  await nextTick()
  await nextTick()
  const el = document.getElementById(`set-${hit.row.key}`)
  el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  el?.focus({ preventScroll: true })
  el?.classList.add('is-flash')
  setTimeout(() => el?.classList.remove('is-flash'), 1200)
}
function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchBox.value?.querySelector('input')?.focus()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// --- unsaved changes ------------------------------------------------------------------------
const leaveTo = ref<RouteLocationRaw | null>(null)
const unsavedLabels = computed(() => writer.dirty.value.map(labelOf))
function guard(to: { fullPath: string; path: string }, from: { path: string }) {
  // Switching categories stays on this page; the drafts come along.
  if (to.path === from.path) return true
  if (!writer.dirty.value.length) return true
  leaveTo.value = to.fullPath
  return false
}
onBeforeRouteLeave(guard)
onBeforeRouteUpdate(guard)
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (writer.dirty.value.length) {
    e.preventDefault()
    e.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
function stay() {
  leaveTo.value = null
}
function leave() {
  const to = leaveTo.value
  writer.discardAll()
  leaveTo.value = null
  if (to) void router.push(to)
}
async function saveAndLeave() {
  const done = await writer.saveAll(list.data.value?.settings ?? [])
  if (done) leave()
  else {
    leaveTo.value = null
    app.showToastMsg('Some changes need your password: save them on the page.')
  }
}
</script>

<template>
  <div class="cs">
    <EmptyState
      v-if="missing"
      title="Settings need the backend settings manager"
      description="This server has no /api/v1/settings yet. Deploy it and this page fills in."
    />

    <div v-else-if="list.error.value && !list.data.value" class="cs__error" role="alert">
      <Icon name="alert-triangle" size="sm" />
      <span>Settings could not be loaded: {{ list.error.value }}</span>
      <Button size="sm" variant="secondary" @click="list.reload()">Retry</Button>
    </div>

    <div v-else-if="!list.data.value" class="cs__layout" aria-busy="true">
      <div class="cs__rail"><Skeleton :lines="6" /></div>
      <div class="cs__pane"><Skeleton :lines="10" /></div>
    </div>

    <template v-else>
      <div v-if="!encryptionReady" class="cs__banner" role="alert">
        <Icon name="lock" size="sm" />
        <span>
          Encryption is not ready: the server has no SETTINGS_MASTER_KEY, so nothing can be saved
          here yet. Every value below comes from .env.
        </span>
      </div>

      <div ref="searchBox" class="cs__search">
        <SearchField
          v-model="query"
          size="md"
          label="Search settings"
          placeholder="Search settings (Ctrl K)"
        />
        <ul v-if="query.trim()" class="cs__hits" role="listbox" aria-label="Matching settings">
          <li v-for="h in hits" :key="h.row.key" role="option" :aria-selected="false">
            <button type="button" class="cs__hit" @click="jump(h)">
              <span class="cs__hit-label">{{ h.label }}</span>
              <span class="cs__hit-meta"
                >{{ categories.find((c) => c.category === h.category)?.label }} ·
                {{ h.row.key }}</span
              >
            </button>
          </li>
          <li v-if="!hits.length" class="cs__hit-none">No setting matches “{{ query }}”.</li>
        </ul>
      </div>

      <div class="cs__layout">
        <nav class="cs__rail" aria-label="Settings categories">
          <button
            v-for="c in categories"
            :key="c.category"
            type="button"
            class="cs__cat"
            :class="{ 'is-active': selected?.category === c.category }"
            :aria-current="selected?.category === c.category ? 'page' : undefined"
            :data-category="c.category"
            @click="pick(c.category)"
          >
            <Icon :name="c.icon" size="sm" class="cs__cat-icon" />
            <span class="cs__cat-label">{{ c.label }}</span>
            <span
              class="cs__cat-dot"
              :class="`is-${testDot(c.test)}`"
              :title="
                c.test
                  ? `Last test ${c.test.ok ? 'passed' : 'failed'} ${ago(c.test.tested_at)}`
                  : 'Not tested yet'
              "
              ><span class="sr-only">{{
                c.test ? (c.test.ok ? 'Test passed' : 'Test failed') : 'Not tested'
              }}</span></span
            >
            <span
              v-if="missingCount(c.rows)"
              class="cs__cat-count"
              :title="`${missingCount(c.rows)} credential(s) not set`"
              >{{ missingCount(c.rows) }}<span class="sr-only"> not set</span></span
            >
          </button>
        </nav>

        <section v-if="selected" class="cs__pane" :data-category="selected.category">
          <header class="cs__head">
            <div class="cs__head-text">
              <h2 class="cs__title">
                <Icon :name="selected.icon" size="md" />{{ selected.label }}
              </h2>
              <p class="cs__purpose">{{ selected.note }}</p>
            </div>
            <div v-if="canTest(selected)" class="cs__test">
              <Button
                size="sm"
                variant="secondary"
                :loading="writer.busy.value === `test:${selected.category}`"
                data-testid="test-connection"
                @click="runTest(selected)"
                >Test connection</Button
              >
              <Badge v-if="testChip(selected.test)" v-bind="testChip(selected.test)!" />
              <span v-if="selected.test" class="cs__test-when">{{
                ago(selected.test.tested_at)
              }}</span>
            </div>
          </header>
          <p
            v-if="testMessage"
            class="cs__test-msg"
            :class="`is-${testMessage.tone}`"
            role="status"
            aria-live="polite"
            data-testid="test-result"
          >
            {{ testMessage.text }}
          </p>
          <p v-else-if="selected.test" class="cs__test-msg">{{ selected.test.detail }}</p>

          <div v-if="keyMissing" class="cs__callout" role="status" data-testid="key-callout">
            <Icon name="key-round" size="sm" />
            <span>
              <strong>Claude is off.</strong> Add an Anthropic API key below to turn on chat,
              agents, reports and voice fallback.
            </span>
          </div>

          <BudgetCard
            v-if="selected.category === 'ai' && usage"
            :usage="usage"
            compact
            class="cs__usage"
          />

          <DhanSessionBar
            v-if="selected.category === 'dhan'"
            admin
            detailed
            finish-callback
            @changed="list.reload()"
          />

          <Card v-for="g in groups" :key="g.title" :title="g.title" class="cs__group">
            <ul class="cs__rows">
              <SettingField
                v-for="row in g.rows"
                :key="row.key"
                :row="row"
                :writer="writer"
                :encryption-ready="encryptionReady"
                :budget-seed="row.key === 'AI_AGENT_BUDGETS_USD' ? budgetSeed : null"
                :monthly-budget="row.key === 'AI_AGENT_BUDGETS_USD' ? monthlyBudget : null"
              />
            </ul>
          </Card>
        </section>
      </div>
    </template>

    <SettingReauth :writer="writer" />
    <UnsavedSheet
      :open="!!leaveTo"
      :fields="unsavedLabels"
      title="Leave with unsaved settings?"
      @back="stay"
      @discard="leave"
      @save="saveAndLeave"
    />
  </div>
</template>

<style scoped>
.cs {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}
.cs__layout {
  display: grid;
  grid-template-columns: 13rem minmax(0, 1fr);
  gap: var(--sp-5, var(--sp-4));
  align-items: start;
  min-width: 0;
}
.cs__rail {
  position: sticky;
  top: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.cs__cat {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border: 0;
  border-radius: var(--radius-card);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}
.cs__cat:hover {
  background: color-mix(in oklch, var(--text-secondary) 10%, transparent);
  color: var(--text-primary);
}
.cs__cat:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 1px;
}
.cs__cat.is-active {
  background: color-mix(in oklch, var(--theme-accent) 14%, transparent);
  color: var(--text-primary);
  font-weight: var(--weight-semibold);
}
.cs__cat-icon {
  flex: none;
}
.cs__cat-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs__cat-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: color-mix(in oklch, var(--text-secondary) 40%, transparent);
}
.cs__cat-dot.is-ok {
  background: var(--theme-success, var(--theme-accent));
}
.cs__cat-dot.is-failed {
  background: var(--theme-danger);
}
.cs__cat-count {
  flex: none;
  min-width: 1.25rem;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--theme-warning) 20%, transparent);
  color: var(--theme-warning);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.cs__pane {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}
.cs__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
  min-width: 0;
}
.cs__head-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1 1 18rem;
}
.cs__title {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin: 0;
  font-size: var(--text-xl);
  color: var(--text-primary);
}
.cs__purpose {
  margin: 0;
  max-width: 60ch;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}
.cs__test {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}
.cs__test-when {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.cs__test-msg {
  min-width: 0;
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.cs__test-msg.is-ok {
  color: var(--theme-success, var(--text-secondary));
}
.cs__test-msg.is-error {
  color: var(--theme-danger);
}
.cs__callout,
.cs__banner,
.cs__error {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-card);
  font-size: var(--text-sm);
  color: var(--text-primary);
}
.cs__callout {
  border: 1px solid color-mix(in oklch, var(--theme-accent) 40%, transparent);
  background: color-mix(in oklch, var(--theme-accent) 8%, transparent);
}
.cs__banner,
.cs__error {
  border: 1px solid color-mix(in oklch, var(--theme-warning) 45%, transparent);
  background: color-mix(in oklch, var(--theme-warning) 10%, transparent);
}
.cs__error {
  align-items: center;
  flex-wrap: wrap;
}
.cs__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.cs__search {
  position: relative;
  min-width: 0;
  max-width: 32rem;
}
.cs__hits {
  position: absolute;
  z-index: 5;
  inset: calc(100% + 4px) 0 auto;
  max-height: 20rem;
  margin: 0;
  padding: var(--sp-1);
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-card);
  background: var(--theme-surface, var(--glass-bg));
  box-shadow: var(--shadow-lg, 0 8px 24px rgb(0 0 0 / 0.2));
}
.cs__hit {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  border: 0;
  border-radius: var(--radius-card);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.cs__hit:hover,
.cs__hit:focus-visible {
  outline: none;
  background: color-mix(in oklch, var(--theme-accent) 12%, transparent);
}
.cs__hit-meta,
.cs__hit-none {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.cs__hit-none {
  padding: var(--sp-2) var(--sp-3);
}
/* A phone: the rail becomes a horizontal strip that scrolls inside itself. */
@media (max-width: 767px) {
  .cs__layout {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-3);
  }
  .cs__rail {
    /* Relative, not static: the screen-reader labels inside each category are
       absolutely positioned, and with the strip as their containing block they are
       clipped by its scroll like everything else — otherwise the ones for
       categories scrolled out of view stretch the whole page sideways. */
    position: relative;
    max-width: 100%;
    flex-direction: row;
    gap: var(--sp-1);
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 2px;
  }
  .cs__cat {
    flex: none;
    border-radius: var(--radius-pill);
    padding: var(--sp-1) var(--sp-3);
  }
  .cs__cat-label {
    overflow: visible;
  }
  .cs__search {
    max-width: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cs__cat {
    transition: none;
  }
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
