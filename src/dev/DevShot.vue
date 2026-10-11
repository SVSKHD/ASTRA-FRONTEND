<script setup lang="ts">
// The screenshot stage (section 38).
//
// It mounts ONE tab, with a known month behind it, outside the workspace shell.
// That is on purpose and it is the difference between a harness that gets run
// and one that does not: going through the shell means signing in, waiting for
// the workspace document, passing the PIN gate and hoping none of the three
// changed — four things that can fail for reasons that have nothing to do with
// what the picture is of.
//
// `data-ready` is set here rather than in the tabs, and only when the settings,
// the trades and the signals have EACH delivered a first snapshot. A harness
// that shoots on `load` photographs a skeleton about one run in five.
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import TradesView from '@/components/views/TradesView.vue'
import ExpensesView from '@/components/views/ExpensesView.vue'
import NewsView from '@/components/views/NewsView.vue'
import CodeView from '@/components/views/CodeView.vue'
import TodoView from '@/components/views/TodoView.vue'
import TasksView from '@/components/views/TasksView.vue'
import RemindersView from '@/components/views/RemindersView.vue'
import DeadlinesView from '@/components/views/DeadlinesView.vue'
import FinancesView from '@/components/views/FinancesView.vue'
import GoalsView from '@/components/views/GoalsView.vue'
import IdeasView from '@/components/views/IdeasView.vue'
import BotsView from '@/components/views/BotsView.vue'
import WalletsView from '@/components/views/WalletsView.vue'
import PromptsView from '@/components/views/PromptsView.vue'
import GithubView from '@/components/views/GithubView.vue'
import CalendarView from '@/components/views/CalendarView.vue'
import OverviewView from '@/components/views/OverviewView.vue'
import AppShell from '@/components/shell/AppShell.vue'
import TimelineDrawer from '@/components/TimelineDrawer.vue'
import TimelineEditor from '@/components/TimelineEditor.vue'
import LoadingStates from '@/dev/LoadingStates.vue'
import { useAppStore } from '@/stores/app'
import { supabase } from '@/supabase'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import {
  seedDeadlines,
  seedIdeas,
  seedReminders,
  seedTasks,
  seedTimeline,
  seedTodos,
} from '@/dev/seedWorkspace'
import { useSettings } from '@/composables/useSettings'
import { useSignals } from '@/composables/useSignals'
import { useTrades } from '@/composables/useTrades'
import { DEMO_UID, forcedState, loadFixture } from '@/dev/fixture'
import { SEED_TODAY } from '@/dev/seed'
import { isThemeKey, type ThemeSetting } from '@/themes'
import { TAB_ORDER } from '@/tabs.config'
import type { TabKey } from '@/types'

function isTabKey(v: string): v is TabKey {
  return (TAB_ORDER as readonly string[]).includes(v)
}

const route = useRoute()
const state = forcedState()

// The month to photograph. Defaults to the one the pinned clock lands in —
// which is deliberately a PARTIAL month, four days in, because that is what the
// app looks like most of the time. `?month=` asks for a complete one instead.
const month = String(route.query.month ?? '') || SEED_TODAY.slice(0, 7)

loadFixture(state)
useAuthStore().user = {
  uid: DEMO_UID,
  name: 'Demo',
  email: 'demo@spasta.online',
  // The demo account signs in with a password; the store's union does not
  // carry that yet and the field is only used for an icon, so it borrows the
  // one it looks like.
  provider: 'google',
  initial: 'D',
  color: 'oklch(0.7 0.02 260)',
}

const ui = useUiStore()
onMounted(() => {
  const theme = String(route.query.theme ?? '')
  if (isThemeKey(theme)) ui.setTheme(theme as ThemeSetting)
  // The chrome reads the current tab for its title and the active rail slot,
  // so a shot of the Todos tab says "Todo" rather than "Dashboard".
  if (withShell && isTabKey(which.value)) ui.setTab(which.value)
})

const settings = useSettings()
const trades = useTrades(() => month)
const signals = useSignals(() => month)

const VIEWS = {
  expenses: ExpensesView,
  news: NewsView,
  code: CodeView,
  // The two tabs section 44 is about: the Dashboard that has to aggregate every
  // other tab, and the Todos list whose "+ New todo" button the reminder pill
  // used to sit on top of.
  overview: OverviewView,
  todo: TodoView,
  // The rest of the tabs, mounted here only so the colour audit (section 44,
  // item 10) can render every view under two opposite themes and diff what
  // moved. They are not in the screenshot set.
  tasks: TasksView,
  reminders: RemindersView,
  deadlines: DeadlinesView,
  finances: FinancesView,
  goals: GoalsView,
  ideas: IdeasView,
  bots: BotsView,
  wallets: WalletsView,
  prompts: PromptsView,
  github: GithubView,
  calendar: CalendarView,
  // The five loading and glass states on one page (section 43, item 10).
  states: LoadingStates,
  trades: TradesView,
} as const

/**
 * `?shell=1` puts the real chrome around the view.
 *
 * The stage normally mounts a tab bare, which is the right default: a shot of
 * the trades table should not depend on the account menu rendering. But the
 * whole subject of section 44 is whether the chrome overlaps the content, and
 * that is unphotographable without the chrome. So it is an opt-in, and the
 * overlap shots ask for it.
 *
 * Read ONCE from the address bar rather than from the reactive route, the same
 * way `forcedState` is. The Trades tab owns its own query — `useTradeRoute`
 * replaces it with `{mode, month, day, symbol}` on the first tick — so a flag
 * read reactively from `route.query` is true for one frame and false forever
 * after, and the shell would unmount from under the shot.
 */
const withShell = new URLSearchParams(globalThis.location?.search ?? '').get('shell') === '1'

/**
 * `?ghmock=1` hands the GitHub proxy client a stand-in session, so a harness
 * that answers `/api/github` itself can photograph the GitHub tab populated.
 * The stage signs in no one, and `ghCall` refuses to send without a session.
 */
if (new URLSearchParams(globalThis.location?.search ?? '').get('ghmock') === '1' && supabase) {
  const fake = { data: { session: { access_token: 'dev-shot' } }, error: null }
  supabase.auth.getSession = (async () => fake) as unknown as typeof supabase.auth.getSession
}

// The workspace document, which the Firestore fixture does not cover because it
// is not a collection. Assigned straight onto the store — see `seedWorkspace`.
const app = useAppStore()
function seedStage() {
  app.todos = seedTodos()
  app.tasks = seedTasks()
  app.deadlines = seedDeadlines()
  app.reminders = seedReminders()
  app.ideas = seedIdeas()
  app.timeline = seedTimeline(app.tasks.map((t) => t.id))
  if (String(route.params.view) === 'goals') seedGoals()
  // The calendar needs scheduled items to have anything to draw: tasks and
  // todos placed around today — timed, all-day, and one already done.
  if (String(route.params.view) !== 'calendar') return
  const day = (offset: number, hour: number, min = 0) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    d.setHours(hour, min, 0, 0)
    return d.getTime()
  }
  // [day offset, hour, minute, minutes long, all day]
  const plan: [number, number, number, number, boolean][] = [
    [0, 10, 0, 60, false],
    [1, 14, 30, 90, false],
    [2, 0, 0, 0, true],
    [-2, 11, 0, 60, false],
  ]
  app.tasks = app.tasks.map((t, i) => {
    const p = plan[i]
    if (!p) return t
    const [off, hour, min, mins, allDay] = p
    const start = day(off, hour, min)
    return {
      ...t,
      startAt: start,
      endAt: allDay ? null : start + mins * 60_000,
      allDay,
      ...(off < 0 ? { status: 'done' as const, done: true } : {}),
    }
  })
  app.todos = app.todos.map((t, i) =>
    i < 3 ? { ...t, startAt: day(i * 2, 9 + i * 3), endAt: day(i * 2, 10 + i * 3) } : t,
  )
}
// The goals grid needs goals at every stage: one just started, one well along,
// one finished, one paused, one with nothing in it yet — with checklists so
// the rings have something to report.
function seedGoals() {
  const iso = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return d.toISOString().slice(0, 10)
  }
  const base = {
    source: 'manual',
    sourceUrl: '',
    parentId: null,
    depth: 0,
    localRev: 0,
    updatedBy: '',
    icon: '',
    startDate: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const g = (
    id: number,
    title: string,
    description: string,
    tag: string,
    color: string,
    target: string,
    status: 'active' | 'paused' | 'done' = 'active',
  ) => ({
    ...base,
    id,
    rootId: id,
    order: id,
    title,
    description,
    tag,
    color,
    targetDate: target,
    status,
  })
  app.goals = [
    g(
      1,
      'Launch the softener funnel',
      'Manual and automatic softener sales funnels live, with tracking.',
      'Frontend',
      'oklch(0.7 0.15 250)',
      iso(12),
    ),
    g(
      2,
      'Learn Vue 3 — junior to advanced',
      'Composition API, state management, performance and Nuxt.',
      'Learning',
      'oklch(0.72 0.13 180)',
      iso(40),
    ),
    g(
      3,
      'Pay off the credit cards',
      'Clear both cards and keep them clean every month.',
      'Finance',
      'oklch(0.7 0.15 340)',
      iso(-3),
    ),
    g(
      4,
      'Run a half marathon',
      'Build up to 21 km by spring.',
      'Health',
      'oklch(0.68 0.15 275)',
      iso(90),
      'paused',
    ),
    g(
      5,
      'Ship the GitHub workspace',
      'Issues, pull requests and code, all inside Astra.',
      'Astra',
      'oklch(0.7 0.16 300)',
      iso(5),
      'done',
    ),
    g(6, 'Read twelve books this year', '', 'Personal', 'oklch(0.72 0.12 200)', ''),
  ] as unknown as typeof app.goals
  const plan: [number, number, number][] = [
    // [goal, points, done]
    [1, 6, 2],
    [2, 10, 7],
    [3, 4, 1],
    [4, 5, 2],
    [5, 4, 4],
  ]
  let id = 1000
  app.goalChecklist = plan.flatMap(([goalId, n, done]) =>
    Array.from({ length: n }, (_, i) => ({
      id: id++,
      goalId,
      text: `Step ${i + 1}`,
      done: i < done,
      order: i,
      estimateMins: null,
      spentMins: 0,
      dueAt: '',
      startAt: '',
      tags: [],
      startedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
  ) as unknown as typeof app.goalChecklist
}
seedStage()
app.cloudReady = true
// The stage's sync settles a moment after mount and can land over the seed
// with an empty workspace; seed once more after it has.
onMounted(() => setTimeout(seedStage, 1200))

const which = computed(() => String(route.params.view) as keyof typeof VIEWS)
const view = computed(() => VIEWS[which.value] ?? TradesView)

/**
 * News and Code own their own `data-ready`.
 *
 * They read the shared news collection and the GitHub mirror, neither of which
 * this stage waits on — so it says `false` and lets the view say when it is
 * ready. The harness waits for the attribute, not for this element, so the
 * shutter still fires at the right moment; claiming `true` here would fire it
 * on a stage whose contents are still empty.
 */
const ownsReady = computed(() => which.value === 'news' || which.value === 'code')

/** Which of the five to put up, for the states page. */
const show = computed(() => String(route.query.show ?? 'all'))

/**
 * All three, not any one of them.
 *
 * The trade table can be painted while the signals are still arriving, and a
 * screenshot taken then is of a Combined view with half its rows — which looks
 * like a bug in the link drawing rather than like a race in the harness.
 */
const ready = computed(() =>
  state === 'loading' || ownsReady.value
    ? false
    : settings.ready.value && !trades.loading.value && !signals.loading.value,
)

const stage = ref<HTMLElement | null>(null)
</script>

<template>
  <!-- With the shell, the stage is a plain child of the content region: the
       shell owns the height, the scrolling and the padding, exactly as it does
       in the workspace. Without it, the stage is the page. -->
  <AppShell v-if="withShell">
    <div
      ref="stage"
      class="shot shot--shell"
      :data-ready="ready ? 'true' : 'false'"
      :data-state="state || 'live'"
    >
      <component :is="view" :show="which === 'states' ? show : undefined" />
    </div>
  </AppShell>
  <!-- The shell's bar opens the Timeline; the workspace mounts it, so the
       stage has to as well for a shot of it to show anything. -->
  <template v-if="withShell">
    <TimelineDrawer />
    <TimelineEditor />
  </template>
  <div
    v-else
    ref="stage"
    class="shot"
    :data-ready="ready ? 'true' : 'false'"
    :data-state="state || 'live'"
  >
    <component :is="view" :show="which === 'states' ? show : undefined" />
  </div>
</template>

<style scoped>
/* No background of its own (section 43). The stage used to paint the page
   colour, which was harmless when panels were opaque and is not now: a
   translucent panel over a flat fill is a flat fill, so every glass surface
   photographed here would have been a picture of the fallback. The starfield
   App draws is what these sit on, the same as in the workspace. */
.shot {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 100dvh;
  padding: var(--sp-4);
  color: var(--text-primary, var(--theme-text));
}
/* Inside the shell the viewport height belongs to the shell, and a `100dvh`
   floor here would add exactly the chrome's height of scroll to every tab. */
.shot--shell {
  min-height: 100%;
}
</style>
