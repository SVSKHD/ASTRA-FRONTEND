<script setup lang="ts">
// The home screen (section 44, item 6).
//
// Nine blocks, each answering one question, each a link into the tab that owns
// it. The order is the order a trading day is read in: what today has done
// against its target, what the month has, what the account is worth, when the
// next session opens — then the four lists that are context rather than score.
//
// EVERY FIGURE COMES FROM `useDashboard`, WHICH IMPORTS IT. Nothing on this
// screen re-implements a sum. That is the rule the file is written to keep and
// the reason `useDashboard` exists at all: a home screen that says the day is
// +12.40 while the Trades tab says +9.80 is worse than a home screen with no
// number on it, and the way that happens is somebody writing a two-line
// `reduce` here rather than importing the one the tab uses.
//
// The session countdown is the exception to "read it here", and deliberately:
// it ticks once a second and owns its own clock, at the leaf, so the tick
// re-renders four characters rather than nine blocks.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useDashboard } from '@/composables/useDashboard'
import DashBlock from '@/components/dashboard/DashBlock.vue'
import DashCountdown from '@/components/dashboard/DashCountdown.vue'
import Icon from '@/components/ui/Icon.vue'
import IconBalance from '@/components/icons/IconBalance.vue'
import IconSecured from '@/components/icons/IconSecured.vue'
import IconSymbol from '@/components/icons/IconSymbol.vue'
import IconTargetHit from '@/components/icons/IconTargetHit.vue'
import IconTargetMissed from '@/components/icons/IconTargetMissed.vue'
import IconPrOpen from '@/components/feedicons/IconPrOpen.vue'
import IconForex from '@/components/feedicons/IconForex.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { amount2, fmt2, signed2 } from '@/utils/format'
import { signOf } from '@/utils/tradeMath'
import { currentMonthKey } from '@/utils/budget'

const props = withDefaults(defineProps<{ month?: string }>(), { month: '' })

const { now } = storeToRefs(useUiStore())
const monthKey = computed(() => props.month || currentMonthKey())

const d = useDashboard({
  month: () => monthKey.value,
  // The store's coarse clock, not `Date.now()`: it is the same reading every
  // other tab's "today" is taken from, and the screenshot harness pins it.
  now: () => now.value,
})

defineExpose({ ready: d.ready })

/** A P/L or a move, coloured by its own SIGN and never by which metric it is. */
function signClass(value: number): string {
  return `is-${signOf(value)}`
}

/** `08-26 · 19:42` — enough to place a trade in the month without a full date. */
function whenOf(trade: { istDate: string; istTime: string }): string {
  return `${trade.istDate.slice(5)} · ${trade.istTime}`
}

function ago(ms: number): string {
  const mins = Math.max(0, Math.round((now.value - ms) / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`
}
</script>

<template>
  <section class="dash" aria-label="Dashboard">
    <div class="dash__grid">
      <!-- 1. Today against the daily target. -->
      <DashBlock title="Today · move" tab="trades" :hint="`${d.dayProgress.value.pct}%`">
        <template #icon>
          <IconTargetHit v-if="!d.dayProgress.value.remaining" :size="16" />
          <IconTargetMissed v-else :size="16" />
        </template>
        <span class="dash__figure ui-mono" :class="signClass(d.dayProgress.value.move)">
          {{ signed2(d.dayProgress.value.move) }}
        </span>
        <span class="dash__of">of {{ fmt2(d.dayProgress.value.target) }}</span>
        <ProgressBar :value="d.dayProgress.value.pct" label="Today's move against the day target" />
        <p class="dash__note">
          {{
            d.dayProgress.value.remaining
              ? `${fmt2(d.dayProgress.value.remaining)} to go today`
              : 'Day target met'
          }}
        </p>
      </DashBlock>

      <!-- 2. Month to date against the monthly target. -->
      <DashBlock title="Month to date · move" tab="trades" :hint="`${d.monthProgress.value.pct}%`">
        <template #icon>
          <IconTargetHit v-if="!d.monthProgress.value.remaining" :size="16" />
          <IconTargetMissed v-else :size="16" />
        </template>
        <span class="dash__figure ui-mono" :class="signClass(d.monthProgress.value.move)">
          {{ signed2(d.monthProgress.value.move) }}
        </span>
        <span class="dash__of">of {{ fmt2(d.monthProgress.value.target) }}</span>
        <ProgressBar
          :value="d.monthProgress.value.pct"
          label="Month to date against the month target"
        />
        <p class="dash__note">
          {{
            d.monthProgress.value.remaining
              ? `${fmt2(d.monthProgress.value.remaining)} still needed this month`
              : 'Month target met'
          }}
        </p>
      </DashBlock>

      <!-- 3. Balance, secured, total profit. Three figures of one account, so
           one block rather than three: they are read against each other. -->
      <DashBlock title="Account" tab="trades">
        <template #icon><IconBalance :size="16" /></template>
        <span class="dash__figure ui-mono">{{ fmt2(d.account.value.balance) }}</span>
        <span class="dash__of">balance</span>
        <dl class="dash__pairs">
          <div class="dash__pair">
            <dt><IconSecured :size="12" /> Secured</dt>
            <dd class="ui-mono">{{ fmt2(d.account.value.securedTotal) }}</dd>
          </div>
          <div class="dash__pair">
            <dt>Total profit</dt>
            <dd class="ui-mono" :class="signClass(d.account.value.totalProfit)">
              {{ signed2(d.account.value.totalProfit) }}
            </dd>
          </div>
        </dl>
      </DashBlock>

      <!-- 4. The session countdown. Its own component: it ticks. -->
      <DashBlock title="Next session" tab="trades">
        <template #icon><Icon name="globe" size="sm" /></template>
        <DashCountdown />
      </DashBlock>

      <!-- 5. The last five trades. -->
      <DashBlock
        title="Last trades"
        tab="trades"
        :hint="d.recentTrades.value.length ? undefined : ''"
      >
        <template #icon><IconSymbol :size="16" /></template>
        <ul v-if="d.recentTrades.value.length" class="dash__list">
          <li v-for="t in d.recentTrades.value" :key="t.id" class="dash__row dash__row--trade">
            <span class="dash__rowMain">{{ t.symbol }}</span>
            <span class="dash__rowMeta ui-mono">{{ whenOf(t) }}</span>
            <span class="dash__rowFig ui-mono" :class="signClass(t.pl)">{{ signed2(t.pl) }}</span>
          </li>
        </ul>
        <p v-else class="dash__note">Nothing logged this month yet.</p>
      </DashBlock>

      <!-- 6. Today's open Dacoit signals — GO, and not yet taken. -->
      <DashBlock
        title="Open signals today"
        tab="trades"
        :hint="String(d.openSignals.value.length)"
      >
        <template #icon><Icon name="bot" size="sm" /></template>
        <ul v-if="d.openSignals.value.length" class="dash__list">
          <li v-for="s in d.openSignals.value" :key="s.id" class="dash__row">
            <span class="dash__rowMain">{{ s.symbol }}</span>
            <span class="dash__rowMeta">{{ s.session }}</span>
            <span class="dash__rowFig ui-mono">{{ ago(s.signalAt) }}</span>
          </li>
        </ul>
        <!-- A sentence, not a zero. Four rows of nothing look like data. -->
        <p v-else class="dash__note">No GO signals waiting today.</p>
      </DashBlock>

      <!-- 7. The month's expenses. -->
      <DashBlock title="Expenses this month" tab="expenses" :hint="`${d.expenses.value.pct}%`">
        <template #icon><Icon name="rupee" size="sm" /></template>
        <!-- `amount2`, the same formatter the Expenses tab's own header uses.
             Expense amounts are major units there, and reformatting them as
             paise here would multiply every figure on the home screen by a
             hundred — which is exactly the class of drift `useDashboard` exists
             to prevent, arrived at through the formatter rather than the sum. -->
        <span class="dash__figure ui-mono">{{ amount2(d.expenses.value.spent) }}</span>
        <span class="dash__of">
          {{ d.expenses.value.budget ? `of ${amount2(d.expenses.value.budget)}` : 'logged' }}
        </span>
        <ProgressBar
          v-if="d.expenses.value.budget"
          :value="d.expenses.value.pct"
          label="Spent against the month's budget"
        />
        <p class="dash__note">
          {{
            d.expenses.value.count
              ? `${d.expenses.value.count} logged · ${amount2(d.expenses.value.perDay)} a day`
              : 'Nothing logged this month yet.'
          }}
        </p>
      </DashBlock>

      <!-- 8. Open pull requests. -->
      <DashBlock title="Open pull requests" tab="code" :hint="String(d.openPulls.value.length)">
        <template #icon><IconPrOpen :size="16" /></template>
        <ul v-if="d.openPulls.value.length" class="dash__list">
          <li v-for="p in d.openPulls.value.slice(0, 5)" :key="p.id" class="dash__row">
            <span class="dash__rowMain">{{ p.title }}</span>
            <span class="dash__rowFig ui-mono">#{{ p.number }}</span>
          </li>
        </ul>
        <p v-else-if="d.githubLoading.value" class="dash__note">Reading the mirror…</p>
        <p v-else class="dash__note">Nothing open. Connect a repository on the Code tab.</p>
      </DashBlock>

      <!-- 9. The latest headlines. -->
      <DashBlock title="Latest headlines" tab="news">
        <template #icon><IconForex :size="16" /></template>
        <ul v-if="d.headlines.value.length" class="dash__list">
          <li v-for="n in d.headlines.value" :key="n.id" class="dash__row">
            <span class="dash__rowMain">{{ n.title }}</span>
            <span class="dash__rowFig">{{ n.source }}</span>
          </li>
        </ul>
        <p v-else-if="d.newsLoading.value" class="dash__note">Reading the feeds…</p>
        <!-- Said plainly, because an empty News tab has a cause and the reader
             should not have to guess which. -->
        <p v-else class="dash__note">
          No headlines yet — open News and use “Feeds” to see what each source answered.
        </p>
      </DashBlock>
    </div>
  </section>
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
/* `auto-fit` with a floor rather than a fixed column count: three blocks at
   1440, two at a tablet, one at 390 — decided by the space there is rather than
   by a breakpoint somebody has to keep in step with the shell's. */
.dash__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
  gap: var(--sp-3);
  min-width: 0;
}
.dash__figure {
  display: block;
  min-width: 0;
  font-size: var(--text-xl);
  line-height: 1.05;
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary, var(--theme-text));
}
/* Sign, not metric: a gain is the success token and a loss the danger one, and
   a flat figure stays ordinary text rather than being coloured for having a
   name. */
.dash__figure.is-pos,
.dash__rowFig.is-pos,
.dash__pairs .is-pos {
  color: var(--theme-success);
}
.dash__figure.is-neg,
.dash__rowFig.is-neg,
.dash__pairs .is-neg {
  color: var(--theme-danger);
}
.dash__of {
  display: block;
  min-width: 0;
  margin-bottom: var(--sp-2);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.dash__note {
  margin: var(--sp-2) 0 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.dash__pairs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  min-width: 0;
}
.dash__pair {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
}
.dash__pair dt {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.dash__pair dd {
  margin: 0;
  flex-shrink: 0;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary, var(--theme-text));
}
.dash__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.dash__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: var(--sp-2);
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.dash__row--trade {
  grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto;
}
.dash__rowMain {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash__rowMeta,
.dash__rowFig {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary, var(--theme-dim));
}
.dash__rowFig {
  text-align: right;
}
</style>
