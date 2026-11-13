// One watchlist's rows, ready to draw: each item resolved against the
// instrument master, its quote (the live stream's when it has ticked, else a
// snapshot read once), its daily history (trend line and day change), and a
// flag when something is wrong with it. Items are flagged, never dropped.
import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import { changeOf, fetchQuotes, quoteView, type QuoteOut } from '@/trading/quotes'
import { resolveItems, type Resolution } from '@/trading/resolve'
import { useLiveQuotes } from '@/trading/liveQuotes'
import { useDayHistory, type DayHistory } from '@/trading/dayHistory'
import { live } from '@/trading/stream'
import { ApiFailure } from '@/trading/useLoad'
import type { Instrument } from '@/trading/instruments'
import type { WatchlistItem } from '@/trading/watchlists'

export interface StockRowData {
  item: WatchlistItem
  instrument: Instrument | null
  quote: ReturnType<typeof quoteView>
  history: DayHistory | null
  /** Against the previous session's close; null when either is unknown. */
  change: { change: string; pct: string; up: boolean } | null
  flag: { tone: 'danger' | 'warning' | 'neutral'; label: string; text: string } | null
}

export function useWatchlistRows(items: () => WatchlistItem[], now: Ref<number>) {
  const resolution = shallowRef(new Map<number, Resolution>())
  const snapshots = shallowRef(new Map<string, QuoteOut>())
  const loading = ref(false)
  const error = ref('')
  const readAt = ref<string | null>(null)
  let seq = 0

  async function refresh() {
    const list = items()
    const mine = ++seq
    error.value = ''
    if (!list.length) {
      resolution.value = new Map()
      snapshots.value = new Map()
      return
    }
    loading.value = true
    try {
      const res = await resolveItems(list)
      if (mine !== seq) return
      resolution.value = res
      const refs = [...res.values()]
        .map((r) =>
          r.status === 'ok' && r.instrument.broker === 'dhan'
            ? r.instrument.broker_instrument_id
            : '',
        )
        .filter(Boolean)
      if (refs.length) {
        try {
          snapshots.value = await fetchQuotes(refs)
          readAt.value = new Date().toISOString()
        } catch (e) {
          if (mine !== seq) return
          snapshots.value = new Map()
          error.value =
            e instanceof ApiFailure
              ? `Prices could not be read: ${e.message}.`
              : 'Prices could not be reached.'
        }
      }
    } finally {
      if (mine === seq) loading.value = false
    }
  }
  watch(
    () =>
      items()
        .map((i) => i.id)
        .join(),
    () => void refresh(),
    { immediate: true },
  )

  const ids = () => items().map((i) => i.id)
  const streamQuotes = useLiveQuotes(ids)
  const histories = useDayHistory(ids)

  const rows = computed<StockRowData[]>(() =>
    items().map((item) => {
      const res = resolution.value.get(item.id)
      const instrument = res?.status === 'ok' ? res.instrument : null
      const quote = quoteView(
        streamQuotes.value.get(item.id),
        instrument ? snapshots.value.get(instrument.broker_instrument_id) : undefined,
        live.status,
        now.value,
      )
      const history = histories.value.get(item.id) ?? null
      const c = changeOf(
        quote?.last ?? null,
        quote?.previousClose ?? history?.previousClose ?? null,
      )
      let flag: StockRowData['flag'] = null
      if (res?.status === 'missing') {
        flag = {
          tone: 'danger',
          label: 'Not found',
          text: `${item.symbol} is not in the instrument list: delisted, or the list is not synced. It stays here until you remove it.`,
        }
      } else if (res?.status === 'error') {
        flag = { tone: 'warning', label: 'Unchecked', text: `Could not look it up: ${res.message}` }
      } else if (res?.status === 'ok' && !quote && !loading.value && !error.value) {
        flag = { tone: 'neutral', label: 'No price', text: 'The broker returned no price for it.' }
      }
      return {
        item,
        instrument,
        quote,
        history,
        change: c ? { ...c, up: !c.change.startsWith('-') } : null,
        flag,
      }
    }),
  )

  return { rows, loading, error, readAt, refresh }
}
