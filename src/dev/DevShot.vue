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
import LoadingStates from '@/dev/LoadingStates.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useSettings } from '@/composables/useSettings'
import { useSignals } from '@/composables/useSignals'
import { useTrades } from '@/composables/useTrades'
import { DEMO_UID, forcedState, loadFixture } from '@/dev/fixture'
import { SEED_TODAY } from '@/dev/seed'
import { isThemeKey, type ThemeSetting } from '@/themes'

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
})

const settings = useSettings()
const trades = useTrades(() => month)
const signals = useSignals(() => month)

const VIEWS = {
  expenses: ExpensesView,
  news: NewsView,
  code: CodeView,
  // The five loading and glass states on one page (section 43, item 10).
  states: LoadingStates,
  trades: TradesView,
} as const

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
  <div
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
</style>
