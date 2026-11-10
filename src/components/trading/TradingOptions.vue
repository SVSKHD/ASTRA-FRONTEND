<script setup lang="ts">
// Futures & Options (/trading/options), read-only (docs/market-terminal.md §8):
//
//   futures   GET /api/trading/instruments ?instrument_type=FUTIDX|FUTSTK&q=<underlying>
//   expiries  GET /api/trading/option-chain/expiries ?underlying=SEGMENT:ID
//   chain     GET /api/trading/option-chain ?underlying=SEGMENT:ID&expiry
//   lot size  each leg's own instrument row (OPTIDX|OPTSTK, matched by SEGMENT:ID) — never a constant
//
// Every absent field is "—", never estimated. Change in OI is oi − previous_oi
// and only when both are present. Nothing here places an order.
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Switch from '@/components/ui/Switch.vue'
import TextInput from '@/components/ui/TextInput.vue'
import InstrumentDetail from './InstrumentDetail.vue'
import InstrumentPicker from './InstrumentPicker.vue'
import MarketPanel from './MarketPanel.vue'
import SourceTag from './SourceTag.vue'
import { aureon, type components } from '@/api/client'
import { useNow } from '@/control/poll'
import { useUiStore } from '@/stores/ui'
import { ago, dec, signed, sumDec, toneOf, when } from '@/trading/format'
import {
  describe,
  kindOf,
  searchInstruments,
  securityIdOf,
  type Instrument,
} from '@/trading/instruments'
import { LEG_SCAN_PAGES, lookupRefs, remember } from '@/trading/resolve'
import { chartPath } from '@/trading/sections'
import { ApiFailure, must, useLoad } from '@/trading/useLoad'

type Chain = components['schemas']['OptionChainOut']
type Strike = components['schemas']['OptionStrikeOut']
type Leg = components['schemas']['OptionLegOut']
type Side = 'call' | 'put'

const { isPhone } = storeToRefs(useUiStore())
const router = useRouter()
const now = useNow(15_000)

// --- underlying ------------------------------------------------------------------------------
const underlying = shallowRef<Instrument | null>(null)
const contractText = ref('')
function pickUnderlying(i: Instrument) {
  remember([i])
  underlying.value = i
  contractText.value = (i.underlying || i.symbol).trim()
  query.value = contractText.value
}
const isIndex = computed(() => !!underlying.value && kindOf(underlying.value) === 'index')
const isDerivative = computed(
  () => !!underlying.value && ['future', 'option'].includes(kindOf(underlying.value)),
)
const futType = computed(() => (isIndex.value ? 'FUTIDX' : 'FUTSTK'))
const optType = computed(() => (isIndex.value ? 'OPTIDX' : 'OPTSTK'))
const ref_ = computed(() => underlying.value?.broker_instrument_id ?? '')
// The contract search text, debounced: each change is a search on the server.
const query = ref('')
let debounce: ReturnType<typeof setTimeout> | undefined
watch(contractText, (t) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => (query.value = t.trim()), 400)
})
onBeforeUnmount(() => clearTimeout(debounce))

// --- futures ---------------------------------------------------------------------------------
const futures = useLoad(async () => {
  if (!underlying.value || !query.value) return null
  const page = await searchInstruments({
    q: query.value,
    instrumentType: futType.value,
    limit: 100,
  })
  remember(page.items)
  const want = query.value.toUpperCase()
  const exact = page.items.filter((r) => (r.underlying || '').toUpperCase() === want)
  const items = (exact.length ? exact : page.items)
    .slice()
    .sort((a, b) => (a.expiry || '').localeCompare(b.expiry || ''))
  return { items, exact: exact.length > 0, total: page.total }
}, false)

// --- expiries and the chain --------------------------------------------------------------------
const expiries = useLoad(async () => {
  if (!ref_.value) return []
  return must(
    await aureon.GET('/api/trading/option-chain/expiries', {
      params: { query: { underlying: ref_.value } },
    }),
  )
}, false)
const expiry = ref('')
const expiryOptions = computed(() =>
  (expiries.data.value ?? []).map((d) => ({ value: d, label: d })),
)
watch(expiries.data, (list) => {
  const today = new Date().toISOString().slice(0, 10)
  expiry.value = list?.find((d) => d >= today) ?? list?.[0] ?? ''
})

const chain = useLoad<Chain | null>(async () => {
  if (!ref_.value || !expiry.value) return null
  return must(
    await aureon.GET('/api/trading/option-chain', {
      params: { query: { underlying: ref_.value, expiry: expiry.value } },
    }),
  )
}, false)

watch(
  () => underlying.value?.id,
  () => {
    expiry.value = ''
    chain.data.value = null
    void expiries.reload()
  },
)
watch([() => underlying.value?.id, query], () => void futures.reload())
watch([ref_, expiry], () => void chain.reload())

// --- leg instruments (lot size, ids) ------------------------------------------------------------
const legs = shallowRef(new Map<string, Instrument>())
const legState = ref<{
  status: 'idle' | 'loading' | 'done' | 'error'
  scanned: number
  complete: boolean
  error: string
}>({
  status: 'idle',
  scanned: 0,
  complete: false,
  error: '',
})
let legSeq = 0
async function loadLegs(c: Chain | null) {
  const mine = ++legSeq
  legs.value = new Map()
  if (!c || !query.value) {
    legState.value = { status: 'idle', scanned: 0, complete: false, error: '' }
    return
  }
  const refs = c.strikes.flatMap((s) =>
    [s.call?.broker_instrument_id, s.put?.broker_instrument_id].filter((r): r is string => !!r),
  )
  if (!refs.length) {
    legState.value = { status: 'done', scanned: 0, complete: false, error: '' }
    return
  }
  legState.value = { status: 'loading', scanned: 0, complete: false, error: '' }
  try {
    const r = await lookupRefs(refs, query.value, [optType.value])
    if (mine !== legSeq) return
    legs.value = r.found
    legState.value = { status: 'done', scanned: r.scanned, complete: r.complete, error: '' }
  } catch (e) {
    if (mine !== legSeq) return
    legState.value = {
      status: 'error',
      scanned: 0,
      complete: false,
      error: e instanceof ApiFailure ? e.message : 'The instrument search could not be reached.',
    }
  }
}
watch(chain.data, (c) => void loadLegs(c))

const lotSizes = computed(() => [...new Set([...legs.value.values()].map((i) => dec(i.lot_size)))])
const legOf = (leg: Leg | null) =>
  leg?.broker_instrument_id ? legs.value.get(leg.broker_instrument_id) : undefined

// --- strike window around the money --------------------------------------------------------------
const WINDOWS = [
  { value: '10', label: '±10' },
  { value: '20', label: '±20' },
  { value: 'all', label: 'All' },
]
const windowSize = ref('10')
const atmIndex = computed(() => {
  const c = chain.data.value
  const px = c?.underlying_price != null ? Number(c.underlying_price) : NaN
  if (!c || !c.strikes.length || !Number.isFinite(px)) return -1
  let best = 0
  for (let i = 1; i < c.strikes.length; i++) {
    if (Math.abs(Number(c.strikes[i].strike) - px) < Math.abs(Number(c.strikes[best].strike) - px))
      best = i
  }
  return best
})
const strikes = computed<Strike[]>(() => {
  const all = chain.data.value?.strikes ?? []
  if (windowSize.value === 'all' || atmIndex.value < 0) return all
  const n = Number(windowSize.value)
  return all.slice(Math.max(0, atmIndex.value - n), atmIndex.value + n + 1)
})
const atmStrike = computed(() =>
  atmIndex.value >= 0 ? chain.data.value!.strikes[atmIndex.value].strike : null,
)

// --- cells ---------------------------------------------------------------------------------------
const showGreeks = ref(false)
const phoneSide = ref<Side>('call')
const PHONE_SIDES = [
  { value: 'call', label: 'Calls (CE)' },
  { value: 'put', label: 'Puts (PE)' },
]

/** oi − previous_oi, only when both are present. */
function deltaOi(leg: Leg | null): string | null {
  if (!leg || leg.oi == null || leg.previous_oi == null) return null
  const neg = leg.previous_oi.startsWith('-') ? leg.previous_oi.slice(1) : `-${leg.previous_oi}`
  return sumDec([leg.oi, neg])
}
const DOI_ABSENT = 'Change in OI needs both OI and previous OI; one is missing.'
const v = (x: string | null | undefined, dp = 2) => dec(x ?? null, dp)

interface Col {
  key: string
  label: string
  title?: string
  greek?: boolean
}
const COLS: Col[] = [
  { key: 'oi', label: 'OI' },
  { key: 'doi', label: 'ΔOI', title: 'oi − previous_oi, only when both are present' },
  { key: 'volume', label: 'Vol' },
  { key: 'iv', label: 'IV' },
  { key: 'delta', label: 'Δ', title: 'Delta', greek: true },
  { key: 'gamma', label: 'Γ', title: 'Gamma', greek: true },
  { key: 'theta', label: 'Θ', title: 'Theta', greek: true },
  { key: 'vega', label: 'ν', title: 'Vega', greek: true },
  { key: 'bidask', label: 'Bid / ask' },
  { key: 'ltp', label: 'LTP' },
]
const cols = computed(() => COLS.filter((c) => showGreeks.value || !c.greek))
const callCols = computed(() => cols.value)
const putCols = computed(() => [...cols.value].reverse())

function cell(leg: Leg | null, key: string): { text: string; title?: string; tone?: string } {
  if (!leg) return { text: '—', title: 'No contract on this side at this strike.' }
  switch (key) {
    case 'oi':
      return { text: v(leg.oi, 0) }
    case 'doi': {
      const d = deltaOi(leg)
      return d == null
        ? { text: '—', title: DOI_ABSENT }
        : {
            text: signed(d, 0),
            tone: toneOf(d),
            title: `${v(leg.oi, 0)} − ${v(leg.previous_oi, 0)}`,
          }
    }
    case 'volume':
      return { text: v(leg.volume, 0) }
    case 'iv':
      return { text: v(leg.implied_volatility) }
    case 'delta':
      return { text: v(leg.delta, 4) }
    case 'gamma':
      return { text: v(leg.gamma, 4) }
    case 'theta':
      return { text: v(leg.theta, 4) }
    case 'vega':
      return { text: v(leg.vega, 4) }
    case 'bidask':
      return { text: `${v(leg.bid)} / ${v(leg.ask)}` }
    case 'ltp':
      return { text: v(leg.last_price) }
  }
  return { text: '—' }
}

// --- leg detail --------------------------------------------------------------------------------
const open = shallowRef<{ strike: string; side: Side; leg: Leg } | null>(null)
function openLeg(s: Strike, side: Side) {
  const leg = s[side]
  if (leg) open.value = { strike: s.strike, side, leg }
}
const openInstrument = computed(() => (open.value ? legOf(open.value.leg) : undefined))
const openTitle = computed(() =>
  open.value
    ? `${underlying.value?.symbol ?? ''} ${dec(open.value.strike)} ${open.value.side === 'call' ? 'CE' : 'PE'}`
    : '',
)
const legFacts = computed(() => {
  const l = open.value?.leg
  if (!l) return []
  const d = deltaOi(l)
  return [
    ['LTP', v(l.last_price)],
    ['Bid', v(l.bid)],
    ['Ask', v(l.ask)],
    ['Previous close', v(l.previous_close)],
    ['OI', v(l.oi, 0)],
    ['Previous OI', v(l.previous_oi, 0)],
    ['Change in OI', d == null ? '—' : signed(d, 0)],
    ['Volume', v(l.volume, 0)],
    ['IV', v(l.implied_volatility)],
    ['Delta', v(l.delta, 4)],
    ['Gamma', v(l.gamma, 4)],
    ['Theta', v(l.theta, 4)],
    ['Vega', v(l.vega, 4)],
    ['Broker reference', l.broker_instrument_id ?? '—'],
    [
      'Security id',
      l.broker_instrument_id ? securityIdOf({ broker_instrument_id: l.broker_instrument_id }) : '—',
    ],
  ] as [string, string][]
})

function openFutureChart(i: Instrument) {
  void router.push(chartPath(i.id))
}
const futureDetail = shallowRef<Instrument | null>(null)
</script>

<template>
  <div class="tp-page">
    <Card>
      <template #header>
        <div class="tp-head">
          <span class="tp-title">Futures &amp; Options</span>
          <span class="tp-note">Read-only · nothing here places an order</span>
        </div>
      </template>
      <div class="fo__pick">
        <InstrumentPicker
          id="fo-underlying"
          :model-value="underlying ? String(underlying.id) : ''"
          :selected-label="underlying ? `${underlying.symbol} — ${describe(underlying)}` : ''"
          placeholder="Underlying: search an index or a stock…"
          class="fo__picker"
          @pick="pickUnderlying"
        />
        <TextInput
          v-if="underlying"
          v-model="contractText"
          size="sm"
          class="fo__q"
          aria-label="Contract symbol text"
          placeholder="Contract symbol text"
        />
      </div>
      <p v-if="underlying" class="tp-note">
        {{ underlying.symbol }} · {{ describe(underlying) }} · reference
        {{ underlying.broker_instrument_id }}. Contracts are found by the symbol text “{{ query }}”
        ({{ futType }} / {{ optType }}); edit it if the master names them differently.
      </p>
      <p v-if="isDerivative" class="tp-note fo__warn" role="alert">
        This is a contract, not an underlying. Pick the index or the stock itself.
      </p>
      <EmptyState
        v-if="!underlying"
        title="Pick an underlying"
        description="Search the instrument master for an index (NIFTY, BANKNIFTY) or a stock. Its futures and option chain come from Dhan through Aureon."
      />
    </Card>

    <template v-if="underlying">
      <!-- futures -->
      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Futures</span>
            <SourceTag source="broker" />
          </div>
        </template>
        <div v-if="futures.loading.value" class="fo__skeleton">
          <Skeleton :lines="3" height="20px" />
        </div>
        <EmptyState
          v-else-if="futures.error.value"
          title="Futures could not be loaded"
          :description="futures.error.value"
        >
          <template #action>
            <Button size="sm" variant="secondary" @click="futures.reload()">Retry</Button>
          </template>
        </EmptyState>
        <EmptyState
          v-else-if="!futures.data.value?.items.length"
          :title="`No ${futType} contracts match “${query}”`"
          description="The instrument master may not list them, or may not be synced (docs/market-terminal.md §2)."
        />
        <template v-else>
          <p v-if="!futures.data.value.exact" class="tp-note fo__warn">
            No row names “{{ query }}” as its underlying, so these are every {{ futType }} whose
            symbol contains it. Check the symbols.
          </p>
          <ul class="tp-list" aria-label="Futures contracts">
            <li v-for="f in futures.data.value.items" :key="f.id" class="tp-item">
              <div class="tp-main">
                <span class="tp-strong">{{ f.symbol }}</span>
                <span class="tp-note tp-num"
                  >Expiry {{ f.expiry ?? '—' }} · lot {{ dec(f.lot_size) }} · tick
                  {{ dec(f.tick_size) }} · security id {{ securityIdOf(f) }} ·
                  {{ f.segment ?? '—' }}</span
                >
              </div>
              <div class="tp-row">
                <Button size="sm" variant="ghost" @click="futureDetail = f">Details</Button>
                <Button size="sm" variant="secondary" @click="openFutureChart(f)"
                  >Open chart</Button
                >
              </div>
            </li>
          </ul>
        </template>
      </Card>

      <!-- option chain -->
      <Card>
        <template #header>
          <div class="tp-head">
            <span class="tp-title">Option chain</span>
            <SourceTag source="broker" />
          </div>
        </template>

        <EmptyState
          v-if="expiries.error.value"
          title="Expiries could not be loaded"
          :description="expiries.error.value"
        >
          <template #action>
            <Button size="sm" variant="secondary" @click="expiries.reload()">Retry</Button>
          </template>
        </EmptyState>
        <div v-else-if="expiries.loading.value" class="fo__skeleton">
          <Skeleton :lines="2" height="20px" />
        </div>
        <EmptyState
          v-else-if="!expiryOptions.length"
          title="No option expiries"
          :description="`Dhan returned no expiries for ${ref_}. It may have no options.`"
        />

        <template v-else>
          <div class="fo__controls">
            <Select
              v-model="expiry"
              :options="expiryOptions"
              size="sm"
              aria-label="Expiry"
              class="fo__expiry"
            />
            <SegmentedControl
              v-model="windowSize"
              :options="WINDOWS"
              size="sm"
              aria-label="Strikes around the money"
            />
            <Switch v-if="!isPhone" v-model="showGreeks" size="sm" label="Greeks" />
            <SegmentedControl
              v-if="isPhone"
              v-model="phoneSide"
              :options="PHONE_SIDES"
              size="sm"
              aria-label="Side"
            />
          </div>

          <div v-if="chain.loading.value && !chain.data.value" class="fo__skeleton">
            <Skeleton :lines="8" height="20px" />
          </div>
          <EmptyState
            v-else-if="chain.error.value"
            title="The option chain could not be loaded"
            :description="chain.error.value"
          >
            <template #action>
              <Button size="sm" variant="secondary" @click="chain.reload()">Retry</Button>
            </template>
          </EmptyState>
          <EmptyState
            v-else-if="chain.data.value && !chain.data.value.strikes.length"
            title="The chain is empty"
            description="Dhan returned no strikes for this expiry."
          />

          <template v-else-if="chain.data.value">
            <div class="fo__meta tp-row">
              <span class="tp-note tp-num">
                Underlying
                <strong>{{ v(chain.data.value.underlying_price) }}</strong>
                · as of
                <span :title="when(chain.data.value.as_of)">{{
                  ago(chain.data.value.as_of, now)
                }}</span>
              </span>
              <span class="tp-note" data-testid="lot-size">
                <template v-if="legState.status === 'loading'"
                  >Finding the contracts' lot size…</template
                >
                <template v-else-if="legState.status === 'error'"
                  >Lot size unavailable: {{ legState.error }}</template
                >
                <template v-else-if="lotSizes.length">
                  Lot size {{ lotSizes.join(' / ') }} (from {{ legs.size }} contract rows in the
                  instrument master<template v-if="!legState.complete"
                    >; some legs were not found</template
                  >)
                </template>
                <template v-else-if="legState.status === 'done'">
                  Lot size —: no leg was found in the instrument master ({{ legState.scanned }}
                  {{ optType }} rows matching “{{ query }}” read, up to {{ LEG_SCAN_PAGES * 500 }}).
                </template>
              </span>
              <Button
                size="sm"
                variant="ghost"
                :loading="chain.loading.value"
                @click="chain.reload()"
                >Refresh</Button
              >
            </div>
            <p v-if="atmIndex < 0" class="tp-note fo__warn">
              No underlying price came back, so there is no at-the-money strike: showing every
              strike.
            </p>

            <!-- tablet / desktop: CE | strike | PE -->
            <div v-if="!isPhone" class="fo__scroll">
              <table class="fo__table" aria-label="Option chain">
                <thead>
                  <tr>
                    <th :colspan="callCols.length" class="fo__side">Calls (CE)</th>
                    <th class="fo__strike-h">Strike</th>
                    <th :colspan="putCols.length" class="fo__side">Puts (PE)</th>
                  </tr>
                  <tr>
                    <th v-for="c in callCols" :key="`c-${c.key}`" :title="c.title" scope="col">
                      {{ c.label }}
                    </th>
                    <th scope="col" class="fo__strike-h">
                      {{ atmStrike ? `ATM ${dec(atmStrike)}` : '' }}
                    </th>
                    <th v-for="c in putCols" :key="`p-${c.key}`" :title="c.title" scope="col">
                      {{ c.label }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="s in strikes"
                    :key="s.strike"
                    :class="{ 'is-atm': s.strike === atmStrike }"
                  >
                    <td
                      v-for="c in callCols"
                      :key="`c-${c.key}`"
                      :title="cell(s.call, c.key).title"
                      :class="[
                        `is-${cell(s.call, c.key).tone ?? 'plain'}`,
                        { 'is-itm': atmStrike != null && Number(s.strike) < Number(atmStrike) },
                      ]"
                      @click="openLeg(s, 'call')"
                    >
                      <button
                        v-if="c.key === 'ltp' && s.call"
                        type="button"
                        class="fo__leg"
                        :aria-label="`${dec(s.strike)} CE details`"
                        @click.stop="openLeg(s, 'call')"
                      >
                        {{ cell(s.call, c.key).text }}
                      </button>
                      <template v-else>{{ cell(s.call, c.key).text }}</template>
                    </td>
                    <th scope="row" class="fo__strike">{{ dec(s.strike) }}</th>
                    <td
                      v-for="c in putCols"
                      :key="`p-${c.key}`"
                      :title="cell(s.put, c.key).title"
                      :class="[
                        `is-${cell(s.put, c.key).tone ?? 'plain'}`,
                        { 'is-itm': atmStrike != null && Number(s.strike) > Number(atmStrike) },
                      ]"
                      @click="openLeg(s, 'put')"
                    >
                      <button
                        v-if="c.key === 'ltp' && s.put"
                        type="button"
                        class="fo__leg"
                        :aria-label="`${dec(s.strike)} PE details`"
                        @click.stop="openLeg(s, 'put')"
                      >
                        {{ cell(s.put, c.key).text }}
                      </button>
                      <template v-else>{{ cell(s.put, c.key).text }}</template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- phone: one side at a time -->
            <div v-else class="fo__scroll">
              <table
                class="fo__table fo__table--phone"
                :aria-label="`Option chain, ${phoneSide === 'call' ? 'calls' : 'puts'}`"
              >
                <thead>
                  <tr>
                    <th scope="col">Strike</th>
                    <th scope="col">LTP</th>
                    <th scope="col">OI</th>
                    <th scope="col" title="oi − previous_oi, only when both are present">ΔOI</th>
                    <th scope="col">IV</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="s in strikes"
                    :key="s.strike"
                    :class="{ 'is-atm': s.strike === atmStrike }"
                  >
                    <th scope="row" class="fo__strike">{{ dec(s.strike) }}</th>
                    <td>
                      <button
                        v-if="s[phoneSide]"
                        type="button"
                        class="fo__leg"
                        :aria-label="`${dec(s.strike)} ${phoneSide === 'call' ? 'CE' : 'PE'} details`"
                        @click="openLeg(s, phoneSide)"
                      >
                        {{ cell(s[phoneSide], 'ltp').text }}
                      </button>
                      <template v-else>—</template>
                    </td>
                    <td>{{ cell(s[phoneSide], 'oi').text }}</td>
                    <td
                      :title="cell(s[phoneSide], 'doi').title"
                      :class="`is-${cell(s[phoneSide], 'doi').tone ?? 'plain'}`"
                    >
                      {{ cell(s[phoneSide], 'doi').text }}
                    </td>
                    <td>{{ cell(s[phoneSide], 'iv').text }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </template>
      </Card>
    </template>

    <MarketPanel :open="!!open" :title="openTitle" @close="open = null">
      <div v-if="open" class="fo__detail">
        <div class="tp-row">
          <Badge :label="open.side === 'call' ? 'Call (CE)' : 'Put (PE)'" tone="info" />
          <span class="tp-note">Expiry {{ chain.data.value?.expiry ?? expiry }}</span>
        </div>
        <dl class="fo__facts">
          <div v-for="[k, val] in legFacts" :key="k">
            <dt>{{ k }}</dt>
            <dd class="tp-num">{{ val }}</dd>
          </div>
        </dl>
        <InstrumentDetail v-if="openInstrument" :instrument="openInstrument" />
        <p v-else class="tp-note fo__warn">
          This contract was not found in the instrument master<template
            v-if="legState.status === 'loading'"
          >
            yet</template
          >, so it has no instrument id to chart and no lot size to show.
        </p>
      </div>
    </MarketPanel>
    <MarketPanel
      :open="!!futureDetail"
      :title="futureDetail?.symbol ?? ''"
      @close="futureDetail = null"
    >
      <InstrumentDetail v-if="futureDetail" :instrument="futureDetail" />
    </MarketPanel>
  </div>
</template>

<style scoped>
.fo__pick,
.fo__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.fo__picker {
  flex: 2 1 260px;
  min-width: 0;
}
.fo__q {
  flex: 1 1 160px;
  min-width: 0;
}
.fo__expiry {
  flex: 0 1 180px;
  min-width: 0;
}
.fo__warn {
  color: var(--theme-warning);
}
.fo__skeleton {
  padding: var(--sp-2) 0;
}
.fo__meta {
  justify-content: space-between;
  padding: var(--sp-2) 0;
}
.fo__scroll {
  min-width: 0;
  overflow-x: auto;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
}
.fo__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--theme-text);
}
.fo__table th,
.fo__table td {
  padding: var(--sp-1) var(--sp-2);
  text-align: right;
  white-space: nowrap;
  border-bottom: 1px solid var(--glass-border);
}
.fo__table thead th {
  position: sticky;
  top: 0;
  background: var(--glass-solid);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  color: var(--theme-dim);
}
.fo__table .fo__side {
  text-align: center;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.fo__table td {
  cursor: pointer;
}
.fo__strike,
.fo__strike-h {
  text-align: center;
  font-weight: var(--weight-semibold);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
}
.fo__table td.is-itm {
  background: color-mix(in srgb, var(--theme-accent) 6%, transparent);
}
.fo__table tr.is-atm > * {
  border-top: 2px solid color-mix(in srgb, var(--theme-accent) 60%, transparent);
  border-bottom: 2px solid color-mix(in srgb, var(--theme-accent) 60%, transparent);
}
.fo__table td.is-positive {
  color: var(--theme-success);
}
.fo__table td.is-negative {
  color: var(--theme-danger);
}
.fo__table tbody tr:hover > td {
  background: color-mix(in srgb, var(--theme-text) 5%, transparent);
}
.fo__table--phone th:first-child,
.fo__table--phone td:first-child {
  text-align: left;
}
.fo__leg {
  min-height: 28px;
  padding: 0 var(--sp-1);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--theme-accent);
  font: inherit;
  font-weight: var(--weight-semibold);
  cursor: pointer;
}
.fo__leg:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 1px;
}
.fo__detail {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.fo__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 130px), 1fr));
  gap: var(--sp-2) var(--sp-3);
  margin: 0;
  min-width: 0;
}
.fo__facts > div {
  min-width: 0;
}
.fo__facts dt {
  font-size: var(--text-2xs);
  color: var(--theme-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.fo__facts dd {
  margin: 0;
  font-size: var(--text-sm);
  min-width: 0;
  overflow-wrap: anywhere;
}
@media (pointer: coarse) {
  .fo__leg {
    min-height: 44px;
    min-width: 44px;
  }
}
</style>
