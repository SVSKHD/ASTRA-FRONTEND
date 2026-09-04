<script setup lang="ts">
// What Dacoit said, and whether it was acted on (section 34).
//
// Same treatment as the trade table — sticky header, one date per day, a rail
// in the left channel — because it is the same reading task on a different
// record, and a second table shaped differently would be a second thing to
// learn. The rail here is the verdict rather than a P/L: a signal has no sign,
// it has an answer.
//
// `raw` is rendered as key/value and never filtered. A field this build has
// never seen is exactly the field worth showing: it is what Dacoit started
// reporting since the last release.
import { computed } from 'vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconSessionAsia from '@/components/icons/IconSessionAsia.vue'
import IconSessionLondon from '@/components/icons/IconSessionLondon.vue'
import IconSessionNy from '@/components/icons/IconSessionNy.vue'
import { clockPair, orDash } from '@/utils/format'
import { IST, hhmmOn, type Clock } from '@/utils/tradeTime'
import type { DacoitSignal, TradeSession } from '@/types'

const props = withDefaults(
  defineProps<{
    signals: DacoitSignal[]
    broker: Clock
    /** Signal id → the trade taken on it. Absent means nobody took it. */
    taken?: Record<string, string>
  }>(),
  { taken: () => ({}) },
)

const SESSION_ICON = {
  Asia: IconSessionAsia,
  London: IconSessionLondon,
  NY: IconSessionNy,
} satisfies Record<TradeSession, unknown>

const firstOfDay = computed(() => {
  const seen = new Set<string>()
  const out = new Set<string>()
  for (const s of props.signals) {
    if (seen.has(s.istDate)) continue
    seen.add(s.istDate)
    out.add(s.id)
  }
  return out
})

function clocks(signal: DacoitSignal): string {
  return clockPair(hhmmOn(IST, signal.signalAt), hhmmOn(props.broker, signal.signalAt))
}

/** Everything Dacoit sent that is not part of the envelope, as one line. */
function extras(signal: DacoitSignal): string {
  const entries = Object.entries(signal.raw)
  if (!entries.length) return ''
  return entries.map(([k, v]) => `${k} ${format(v)}`).join(' · ')
}

function format(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
</script>

<template>
  <div v-if="signals.length" class="stable__wrap">
    <table class="stable">
      <caption class="ui-sr-only">
        Dacoit signals, oldest first, grouped by date
      </caption>
      <thead>
        <tr>
          <th scope="col" class="stable__rail"><span class="ui-sr-only">Verdict</span></th>
          <th scope="col">Date</th>
          <th scope="col">IST · Broker</th>
          <th scope="col">Symbol</th>
          <th scope="col">Session</th>
          <th scope="col">Verdict</th>
          <th scope="col">Taken</th>
          <th scope="col">From Dacoit</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="s in signals"
          :key="s.id"
          :class="{ 'is-dayStart': firstOfDay.has(s.id) }"
          :style="{
            '--row-rail': s.verdict === 'GO' ? 'var(--theme-success)' : 'var(--text-muted)',
          }"
        >
          <td class="stable__rail" aria-hidden="true"></td>
          <td class="is-mono stable__date">
            <span v-if="firstOfDay.has(s.id)">{{ s.istDate }}</span>
            <span v-else class="ui-sr-only">{{ s.istDate }}</span>
          </td>
          <td class="is-mono">{{ clocks(s) }}</td>
          <td>{{ s.symbol }}</td>
          <td>
            <span class="stable__with">
              <component :is="SESSION_ICON[s.session]" :size="14" />
              {{ s.session }}
            </span>
          </td>
          <!-- The word, not only the rail: on the achromatic themes a coloured
               bar says nothing, and this is the column the row is about. -->
          <td class="stable__verdict">{{ s.verdict === 'GO' ? 'GO' : 'NO GO' }}</td>
          <td class="stable__taken">
            <template v-if="s.verdict !== 'GO'">—</template>
            <template v-else-if="taken[s.id]">Yes</template>
            <!-- Named rather than left blank: an untaken GO is the finding this
                 whole view exists to surface. -->
            <span v-else class="stable__missed">Not taken</span>
          </td>
          <td class="stable__raw" :title="extras(s)">{{ orDash(extras(s)) }}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <EmptyState
    v-else
    title="No signals this month"
    description="Dacoit posts to /api/dacoit/signal; anything it sends lands here, unknown fields and all."
  />
</template>

<style scoped>
/* The page carries the height (section 42). No `max-height` and no vertical
   overflow: a list in a 420px window inside a page that could not scroll was
   two broken things agreeing with each other. Sideways only, and only where a
   phone needs it — an overflow of any kind makes this the scrollport a sticky
   header sticks to, which is the header's whole job undone. */
.stable__wrap {
  min-width: 0;
  border: 1px solid var(--layer-raised-border);
  border-radius: var(--radius-card);
  background: var(--layer-raised-bg);
  box-shadow: var(--layer-raised-shadow);
}
.stable {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.stable th,
.stable td {
  padding: var(--sp-2) var(--sp-3);
  white-space: nowrap;
  text-align: left;
}
.stable thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--layer-overlay-bg);
  border-bottom: 1px solid var(--layer-raised-border);
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary, var(--theme-dim));
}
/* A day scrolled to must not land under the sticky header. */
.stable tbody tr.is-dayStart {
  scroll-margin-top: 64px;
}
.stable tbody tr.is-dayStart td {
  border-top: 1px solid var(--layer-raised-border);
}
.stable tbody tr:first-child td {
  border-top: none;
}
.stable tbody tr:hover td {
  background: color-mix(in oklch, var(--text-primary, currentcolor) 5%, transparent);
}
.stable th.stable__rail,
.stable td.stable__rail {
  width: 3px;
  min-width: 3px;
  padding: 0;
}
.stable tbody td.stable__rail {
  background: var(--row-rail);
}
.stable tbody tr.is-dayStart td.stable__rail {
  border-top: none;
}
.stable__date,
.stable__raw {
  color: var(--text-secondary, var(--theme-dim));
}
.stable__with {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
}
.stable__verdict {
  font-weight: var(--weight-semibold);
}
.stable__missed {
  color: var(--theme-warning);
}
/* The one column that may be long: it clamps rather than widening the table,
   and the whole of it is in the title. */
.stable__raw {
  max-width: 22ch;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.stable .is-mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

/* The phone's bargain: sideways scrolling instead of a page-sticky header. */
@media (max-width: 700px) {
  .stable__wrap {
    overflow-x: auto;
  }
}
</style>
