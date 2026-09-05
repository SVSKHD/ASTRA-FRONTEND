// The Dashboard's nine figures (section 44, item 6).
//
// THE RULE THIS FILE EXISTS TO KEEP: no block duplicates logic. Every figure on
// the Dashboard is read from the same composable and computed by the same pure
// function its own tab uses — `useTrades` and `targetProgress` for the targets,
// `accountTotals` for the account, `useSignals` for the day's GOs, `useExpenses`
// and `expenseTotals` for the month's spend, `useGithubLive` for the open pull
// requests, `useNews` for the headlines.
//
// That matters more than it sounds. A dashboard is the surface where a
// re-implementation is least likely to be noticed and most likely to be
// believed: a home screen that says the day is +12.40 while the Trades tab says
// +9.80 is worse than a home screen with no number on it at all, and the way
// that happens is somebody writing `trades.reduce(...)` here because it was two
// lines. So the arithmetic is imported, never repeated, and where a helper did
// not exist the helper was added to the tab's own module rather than inlined
// here.
//
// WHAT IS DELIBERATELY NOT HERE: the session countdown. It ticks once a second,
// and a value that changes every second in this composable would re-render every
// block that reads it — the same bug section 42 fixed by moving the clock into
// `SessionDesk`. The countdown is owned by the one leaf component that shows it.

import { computed } from 'vue'
import { useExpenses } from '@/composables/useExpenses'
import { useGithubLive } from '@/composables/useGithubLive'
import { useNews } from '@/composables/useNews'
import { useSecured } from '@/composables/useSecured'
import { useSettings } from '@/composables/useSettings'
import { useSignals } from '@/composables/useSignals'
import { useTrades } from '@/composables/useTrades'
import { linkSignals } from '@/utils/combine'
import { elapsedDays, expenseTotals } from '@/utils/expenseMath'
import { accountTotals, dayTotals, targetProgress } from '@/utils/tradeMath'
import { IST, ymdOn } from '@/utils/tradeTime'

/** How many of each list the home screen shows. Five is a glance; ten is a tab. */
export const RECENT_TRADES = 5
export const RECENT_HEADLINES = 5

export interface DashboardInput {
  /** The month the home screen is about. Almost always the current one. */
  month: () => string
  /**
   * The instant "today" is read at.
   *
   * Injected rather than read from `Date.now()` so the screenshot harness's
   * pinned clock reaches it, and so a test can ask what the day looked like
   * without waiting for one.
   */
  now: () => number
}

export function useDashboard({ month, now }: DashboardInput) {
  const store = useSettings()
  const { settings, ready: settingsReady } = store

  // Every one of these is the SAME composable the corresponding tab mounts.
  // They are singletons per month key, so opening the Dashboard and then the
  // Trades tab is one listener on the month, not two.
  const log = useTrades(month)
  const signalLog = useSignals(month)
  const secured = useSecured(month)
  const expenseLog = useExpenses(month)
  const github = useGithubLive()
  const news = useNews(() => ['forex', 'ai', 'code'])

  /** The trader's own day, on the trader's own clock — not the machine's. */
  const today = computed(() => ymdOn(IST, now()))

  // ---- 1 & 2: the two targets ---------------------------------------------
  // `targetProgress` and `dayTotals` are the same two functions `TradeTargets`
  // calls with the same two arguments. If this ever disagrees with the Trades
  // tab, it is because the tab changed and this did not — which a test catches.
  const dayProgress = computed(() =>
    targetProgress(dayTotals(log.trades.value, today.value).move, settings.value.dayTarget),
  )
  const monthProgress = computed(() =>
    targetProgress(
      log.trades.value.reduce((sum, t) => sum + t.move, 0),
      settings.value.monthTarget,
    ),
  )

  // ---- 3: balance / secured / total profit ---------------------------------
  const account = computed(() =>
    accountTotals(log.trades.value, secured.entries.value, settings.value.startingBalance),
  )

  // ---- 5: the last five trades ---------------------------------------------
  // Newest first, which is the opposite of the journal's order on purpose: the
  // journal is a record read forwards, and this is "what just happened".
  const recentTrades = computed(() =>
    log.trades.value
      .slice()
      .sort((a, b) => (a.istDate === b.istDate ? b.istTime.localeCompare(a.istTime) : a.istDate < b.istDate ? 1 : -1))
      .slice(0, RECENT_TRADES),
  )

  // ---- 6: today's open Dacoit signals --------------------------------------
  //
  // "Open" means a GO that has not been acted on. `linkSignals` is the Trades
  // tab's own answer to that and is used verbatim, over the whole month, with
  // today's date filtered out of its `untaken` list afterwards.
  //
  // Filtering the month rather than joining the day is deliberate and is the
  // second time this file has had to resist writing "simpler" code. A signal
  // fired at 23:50 can be taken by a trade at 00:10, and a join scoped to one
  // day would call that signal untaken forever — the window is ninety minutes,
  // not a calendar. `linkSignals` also matches on proximity as well as on an
  // explicit `signalId`, which a hand-written `signalId` check silently does
  // not, so a signal taken without the id being carried through would show
  // here as still waiting.
  const openSignals = computed(() =>
    linkSignals(log.trades.value, signalLog.signals.value).untaken.filter(
      (s) => s.istDate === today.value,
    ),
  )

  // ---- 7: the month's expenses ---------------------------------------------
  const expenses = computed(() =>
    expenseTotals(
      expenseLog.expenses.value,
      settings.value.monthlyBudget,
      elapsedDays(month(), today.value),
    ),
  )

  // ---- 8: open pull requests -----------------------------------------------
  //
  // Counted from the pull rows rather than summed from each repo's
  // `openPRCount`, because the two can disagree: `openPRCount` is refreshed by
  // the webhook and the sweep, and a repo whose count is stale would be counted
  // at its stale number. The rows are what the Code tab lists, so this is the
  // number a reader can go and see.
  const openPulls = computed(() =>
    github.pulls.value.filter((p) => p.state === 'open' || p.state === 'draft'),
  )

  // ---- 9: the latest headlines ---------------------------------------------
  // Already newest-first from the query's `orderBy publishedAt desc`.
  const headlines = computed(() => news.items.value.slice(0, RECENT_HEADLINES))

  /**
   * Everything has delivered a first answer.
   *
   * The news and the GitHub mirror are deliberately NOT in this: both are
   * shared collections that can legitimately be empty forever (nobody has
   * connected GitHub; the feeds have not run), and a home screen that never
   * says it is ready because a feature is not set up is a home screen that
   * shows a skeleton for good.
   */
  const ready = computed(
    () =>
      settingsReady.value &&
      !log.loading.value &&
      !signalLog.loading.value &&
      !expenseLog.loading.value,
  )

  return {
    today,
    settings,
    ready,
    dayProgress,
    monthProgress,
    account,
    recentTrades,
    openSignals,
    expenses,
    openPulls,
    headlines,
    tradesLoading: log.loading,
    newsLoading: news.loading,
    githubLoading: github.loading,
  }
}
