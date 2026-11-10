<script setup lang="ts">
// Everything the instrument master says about one instrument, its quote if
// there is one, and the two things to do with it: open its chart, or add it
// to a watchlist. Nothing here places an order.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import AddToWatchlist from './AddToWatchlist.vue'
import { ago, dec, when } from '@/trading/format'
import {
  describe,
  exchangeOf,
  KIND_LABEL,
  kindOf,
  securityIdOf,
  segmentOf,
  type Instrument,
} from '@/trading/instruments'
import { changeOf, NO_CHANGE_REASON, type QuoteView } from '@/trading/quotes'
import { chartPath } from '@/trading/sections'

const props = defineProps<{ instrument: Instrument; quote?: QuoteView | null }>()
const router = useRouter()

const facts = computed(() => {
  const i = props.instrument
  return [
    ['Symbol', i.symbol],
    ['Instrument id', String(i.id)],
    ['Security id', securityIdOf(i) || '—'],
    ['Broker reference', i.broker_instrument_id || '—'],
    ['Broker', i.broker.toUpperCase()],
    ['Exchange', i.exchange || exchangeOf(i) || '—'],
    ['Segment', segmentOf(i) || '—'],
    ['Kind', `${KIND_LABEL[kindOf(i)]} (${i.instrument_type})`],
    ['Underlying', i.underlying || '—'],
    ['Expiry', i.expiry || '—'],
    ['Strike', i.strike ? dec(i.strike) : '—'],
    ['Option type', i.option_type || '—'],
    ['Lot size', dec(i.lot_size)],
    ['Tick size', dec(i.tick_size)],
    ['Currency', i.currency],
  ] as const
})
const change = computed(() =>
  props.quote ? changeOf(props.quote.last, props.quote.previousClose) : null,
)

function openChart() {
  void router.push(chartPath(props.instrument.id))
}
</script>

<template>
  <div class="idet">
    <p class="tp-note">{{ describe(instrument) }}</p>

    <section class="idet__quote" aria-label="Quote">
      <template v-if="quote">
        <div class="tp-row">
          <span class="idet__price tp-num">{{ dec(quote.last) }}</span>
          <Badge
            :tone="quote.freshness.tone"
            :label="quote.freshness.label"
            :title="quote.freshness.text"
          />
          <span class="tp-note">{{ quote.source === 'stream' ? 'Live stream' : 'Snapshot' }}</span>
        </div>
        <dl class="idet__facts">
          <div>
            <dt>Change</dt>
            <dd v-if="change" class="tp-num">{{ change.change }} ({{ change.pct }}%)</dd>
            <dd v-else :title="NO_CHANGE_REASON">—</dd>
          </div>
          <div>
            <dt>Bid / ask</dt>
            <dd class="tp-num">{{ dec(quote.bid) }} / {{ dec(quote.ask) }}</dd>
          </div>
          <div>
            <dt>Volume</dt>
            <dd class="tp-num">{{ dec(quote.volume) }}</dd>
          </div>
          <div>
            <dt>Quote time</dt>
            <dd :title="when(quote.at)">{{ ago(quote.at) }}</dd>
          </div>
        </dl>
      </template>
      <p v-else class="tp-note">No quote for this instrument has been read.</p>
    </section>

    <dl class="idet__facts" aria-label="Instrument master">
      <div v-for="[k, v] in facts" :key="k">
        <dt>{{ k }}</dt>
        <dd class="tp-num">{{ v }}</dd>
      </div>
    </dl>

    <div class="tp-row">
      <Button size="sm" variant="primary" @click="openChart">Open chart</Button>
      <slot name="actions" />
    </div>
    <AddToWatchlist :instrument="instrument" />
  </div>
</template>

<style scoped>
.idet {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.idet__quote {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.idet__price {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--theme-text);
}
.idet__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr));
  gap: var(--sp-2) var(--sp-3);
  margin: 0;
  min-width: 0;
}
.idet__facts > div {
  min-width: 0;
}
.idet__facts dt {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.idet__facts dd {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--theme-text);
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
