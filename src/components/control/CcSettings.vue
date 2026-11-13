<script setup lang="ts">
// Settings and secrets (backend docs/settings.md), in the home screen's language.
// It lives in the workspace itself (/settings renders WorkspaceView with this page
// on the stage), so the shell, the dock and the type are home's, and the page is
// built like the Dashboard: a PanelHeader (search, Diagnose), then an overview of
// the categories as Dashboard blocks — AI spend against its cap, the Dhan session,
// each credential set or not and its last test — which are also the navigation,
// then the selected category: its header (purpose, Test connection), and its
// settings in Accordions of FormFields. Page-wide states (encryption off, Claude
// off, the list failing to load) are Alerts, shown in the app's warnings area.
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
import PanelHeader from '@/components/PanelHeader.vue'
import Accordion from '@/components/ui/Accordion.vue'
import Alert from '@/components/ui/Alert.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import Icon from '@/components/ui/Icon.vue'
import SearchField from '@/components/ui/SearchField.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import UnsavedSheet from '@/components/ui/UnsavedSheet.vue'
import BudgetCard from '@/components/ai/costs/BudgetCard.vue'
import DhanSessionBar from '@/components/control/DhanSessionBar.vue'
import SettingField from '@/components/control/SettingField.vue'
import SettingsBlock from '@/components/settings/SettingsBlock.vue'
import SettingReauth from '@/components/control/SettingReauth.vue'
import SettingsDiagnostics from '@/components/control/settings/SettingsDiagnostics.vue'
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
  testKey,
  type Category,
  type SearchHit,
} from '@/control/settings'
import { BUDGET_KEYS, type BudgetDraft } from '@/control/settingEditors'
import { summarize } from '@/control/settingsOverview'
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

// --- the Diagnose panel, kept in the URL (?diagnose=1) so a link opens it ---------------------
const diagnosing = computed(() => route.query.diagnose === '1')
function toggleDiagnose() {
  const query = { ...route.query }
  if (diagnosing.value) delete query.diagnose
  else query.diagnose = '1'
  void router.replace({ query })
}
// --- the overview: one Dashboard-style block per category, which is also the nav -------------
const blockId = (c: string) => `settings-block-${c}`
const PANEL_ID = 'settings-panel'
const blocks = computed(() =>
  categories.value.map((c) => ({ c, summary: summarize(c, usage.value) })),
)
/** Arrow keys move along the blocks, as in any tablist (Home/End to the ends). */
async function onBlocksKey(e: KeyboardEvent) {
  const keys = categories.value.map((c) => c.category)
  const at = keys.indexOf(selected.value?.category ?? '')
  const next =
    e.key === 'ArrowRight' || e.key === 'ArrowDown'
      ? (at + 1) % keys.length
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
        ? (at - 1 + keys.length) % keys.length
        : e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? keys.length - 1
            : -1
  if (next < 0) return
  e.preventDefault()
  pick(keys[next])
  await nextTick()
  document.getElementById(blockId(keys[next]))?.focus()
}
const groups = computed(() =>
  selected.value ? groupRows(selected.value.category, selected.value.rows) : [],
)

// --- groups fold like the Todos tab's sections; folded ones are remembered per device ---------
const FOLD_KEY = 'aureon.settings.folded'
function readFolded(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FOLD_KEY) || '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
const folded = ref<string[]>(readFolded())
const foldKey = (title: string) => `${selected.value?.category}:${title}`
function toggleGroup(title: string, open: boolean) {
  const k = foldKey(title)
  folded.value = open ? folded.value.filter((x) => x !== k) : [...folded.value, k]
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify(folded.value))
  } catch {
    /* private window: holds for this visit */
  }
}

// --- AI: this month's spend at the top, and the caps the budget editor starts from ----------
const usage = ref<AiUsage | null>(null)
async function refreshUsage() {
  const r = await loadUsage()
  usage.value = r.ok ? r.data : null
}
// The AI block on the overview shows this month's spend, so it loads with the list.
watch(
  () => !!list.data.value,
  (loaded) => {
    if (loaded && !usage.value) void refreshUsage()
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
  await refreshUsage()
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

// --- search: a toggle in the header, as on the Todos tab; Ctrl/Cmd+K opens it ----------------
const searchOpen = ref(false)
const query = ref('')
const searchBox = ref<HTMLElement | null>(null)
const hits = computed<SearchHit[]>(() => searchSettings(list.data.value, query.value))
async function openSearch() {
  searchOpen.value = true
  await nextTick()
  searchBox.value?.querySelector('input')?.focus()
}
function toggleSearch() {
  if (searchOpen.value) {
    searchOpen.value = false
    query.value = ''
  } else void openSearch()
}
async function jump(hit: SearchHit) {
  query.value = ''
  searchOpen.value = false
  pick(hit.category)
  await nextTick()
  // The group it is in may be folded: open it.
  const group = groupRows(
    hit.category,
    categories.value.find((c) => c.category === hit.category)?.rows ?? [],
  ).find((g) => g.rows.some((r) => r.key === hit.row.key))
  if (group) folded.value = folded.value.filter((k) => k !== `${hit.category}:${group.title}`)
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
    void openSearch()
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
    <PanelHeader title="Settings">
      <template #left>
        <button
          type="button"
          class="panel-action panel-action--icon"
          :class="{ 'is-on': searchOpen }"
          :aria-pressed="searchOpen"
          aria-label="Search settings (Ctrl K)"
          title="Search settings (Ctrl K)"
          data-testid="search-toggle"
          @click="toggleSearch"
        >
          <Icon name="search" size="sm" />
        </button>
      </template>
      <template #right>
        <button
          type="button"
          class="panel-action"
          :class="{ 'is-on': diagnosing }"
          :aria-pressed="diagnosing"
          data-testid="diagnose-toggle"
          @click="toggleDiagnose"
        >
          <Icon name="stethoscope" size="sm" />Diagnose
        </button>
      </template>
    </PanelHeader>

    <div v-if="searchOpen" ref="searchBox" class="cs__search">
      <SearchField
        v-model="query"
        size="md"
        label="Search settings"
        placeholder="Search settings"
      />
      <GlassPanel v-if="query.trim()" padding="sm" class="cs__hits">
        <ul role="listbox" aria-label="Matching settings">
          <li v-for="h in hits" :key="h.row.key" role="option" :aria-selected="false">
            <button type="button" class="cs__hit" @click="jump(h)">
              <span class="cs__hit-label">{{ h.label }}</span>
              <span class="cs__hit-meta"
                >{{ categories.find((c) => c.category === h.category)?.label }} ·
                {{ h.row.key }}</span
              >
            </button>
          </li>
          <li v-if="!hits.length" class="cs__hit-meta">No setting matches “{{ query }}”.</li>
        </ul>
      </GlassPanel>
    </div>

    <EmptyState
      v-if="missing"
      title="Settings need the backend settings manager"
      description="This server has no /api/v1/settings yet. Deploy it and this page fills in."
    />

    <template v-else-if="list.error.value && !list.data.value">
      <Alert tone="danger" title="Settings could not be loaded">{{ list.error.value }}</Alert>
      <EmptyState
        title="Settings could not be loaded"
        :description="String(list.error.value)"
        class="cs__error"
      >
        <template #action>
          <Button size="sm" variant="secondary" @click="list.reload()">Retry</Button>
        </template>
      </EmptyState>
    </template>

    <Skeleton v-else-if="!list.data.value" :lines="10" aria-busy="true" />

    <template v-else>
      <Alert v-if="!encryptionReady" tone="warning" title="Encryption is not ready">
        The server has no SETTINGS_MASTER_KEY, so nothing can be saved here yet. Every value comes
        from .env.
      </Alert>
      <Alert v-if="keyMissing" tone="info" title="Claude is off">
        Add an Anthropic API key under Settings → AI to turn on chat, agents, reports and voice
        fallback.
      </Alert>

      <SettingsDiagnostics
        v-if="diagnosing"
        :category="selected?.category"
        :category-label="selected?.label"
        :rows="list.data.value?.settings ?? []"
        :writer="writer"
        :encryption-ready="encryptionReady"
        @reloaded="list.reload()"
      />

      <div
        class="cs__blocks"
        role="tablist"
        aria-label="Settings categories"
        data-testid="settings-overview"
        @keydown="onBlocksKey"
      >
        <SettingsBlock
          v-for="b in blocks"
          :id="blockId(b.c.category)"
          :key="b.c.category"
          :panel-id="PANEL_ID"
          :title="b.c.label"
          :icon="b.c.icon"
          :summary="b.summary"
          :selected="selected?.category === b.c.category"
          :data-category="b.c.category"
          @select="pick(b.c.category)"
        />
      </div>

      <section
        v-if="selected"
        :id="PANEL_ID"
        role="tabpanel"
        :aria-labelledby="blockId(selected.category)"
        class="cs__pane"
        :data-category="selected.category"
      >
        <header class="cs__dhead">
          <div class="cs__dtext">
            <h3 class="cs__dtitle">
              <Icon :name="selected.icon" size="md" class="cs__dicon" />{{ selected.label }}
              <span v-if="missingCount(selected.rows)" class="cs__dcount ui-label"
                >{{ missingCount(selected.rows) }} to set</span
              >
            </h3>
            <p class="cs__purpose">{{ selected.note }}</p>
          </div>
          <div v-if="canTest(selected)" class="cs__dactions">
            <Badge v-if="testChip(selected.test)" v-bind="testChip(selected.test)!" />
            <button
              type="button"
              class="panel-action"
              :disabled="writer.busy.value === `test:${selected.category}`"
              data-testid="test-connection"
              @click="runTest(selected)"
            >
              <Icon name="refresh-cw" size="sm" />Test connection
            </button>
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
        <p v-else-if="selected.test" class="cs__test-msg">
          Last test {{ ago(selected.test.tested_at) }}: {{ selected.test.detail }}
        </p>

        <BudgetCard v-if="selected.category === 'ai' && usage" :usage="usage" compact />

        <DhanSessionBar
          v-if="selected.category === 'dhan'"
          admin
          detailed
          finish-callback
          @changed="list.reload()"
        />

        <Accordion
          v-for="g in groups"
          :key="g.title"
          :title="g.title"
          :open="!folded.includes(foldKey(g.title))"
          class="cs__group"
          :data-group="g.title"
          @toggle="toggleGroup(g.title, $event)"
        >
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
        </Accordion>
      </section>
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
/* Six categories as two even rows of three (the Dashboard's block gap), never
   five and an orphan; two to a row on a phone. */
.cs__blocks {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-3);
  min-width: 0;
}
/* Two to a row on a phone: six categories in three short rows, not six tall ones. */
@media (max-width: 520px) {
  .cs__blocks {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-2);
  }
}
.cs__pane {
  padding-top: var(--sp-2);
}
.cs__dhead {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
  min-width: 0;
}
.cs__dtext {
  display: flex;
  flex: 1 1 18rem;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.cs__dtitle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  margin: 0;
  min-width: 0;
  font-size: var(--text-lg);
  line-height: var(--lh-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary, var(--theme-text));
}
.cs__dicon {
  color: var(--accent, var(--theme-accent));
}
.cs__dcount {
  color: var(--theme-warning);
}
.cs__dactions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}
.cs__pane {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.cs__purpose,
.cs__test-msg {
  margin: 0;
  min-width: 0;
  max-width: 70ch;
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
.cs__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.cs__search {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.cs__hits ul {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cs__hit {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-width: 0;
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
.cs__hit-label {
  min-width: 0;
  font-weight: var(--weight-medium);
}
.cs__hit-meta {
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
</style>
