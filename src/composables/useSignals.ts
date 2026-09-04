// Dacoit's signals, read-only from the client (section 34).
//
// There is no create, no update and no delete here, and that is the design: the
// only writer is the ingestion function, which runs as admin, resolves the uid
// from the shared key rather than from the request body, and stamps `userId`
// itself. A client that could write this collection could invent a GO after the
// fact and change what the record says it knew at the time — which is the one
// thing a signal log exists to be trusted about.
//
// Unknown fields are never rejected and never dropped. `raw` is whatever Dacoit
// sent, kept whole and rendered as key/value, so a strategy that starts
// reporting a new number does not have to wait for a schema change here.

import { computed } from 'vue'
import type { DocumentData } from 'firebase/firestore'
import { useOwnedMonth } from '@/composables/useOwnedMonth'
import { IST, ymdOn } from '@/utils/tradeTime'
import type { DacoitSignal, TradeSession } from '@/types'

/** A GO is worth acting on for this long; after it, the setup is stale. */
export const SIGNAL_FRESH_MS = 90 * 60_000

function millis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis(): number }).toMillis()
  }
  return typeof value === 'number' ? value : 0
}

export function readSignal(id: string, data: DocumentData): DacoitSignal {
  const signalAt = millis(data.signalAt)
  return {
    id,
    userId: String(data.userId ?? ''),
    signalId: String(data.signalId ?? id),
    signalAt,
    receivedAt: millis(data.receivedAt),
    // Recomputed from the instant when the stored day is missing, so a document
    // written by an older ingestion still lands on the right calendar cell.
    istDate: String(data.istDate ?? '') || (signalAt ? ymdOn(IST, signalAt) : ''),
    symbol: String(data.symbol ?? '').toUpperCase(),
    session: (data.session as TradeSession) ?? 'London',
    verdict: data.verdict === 'NO_GO' ? 'NO_GO' : 'GO',
    raw: typeof data.raw === 'object' && data.raw ? (data.raw as Record<string, unknown>) : {},
    source: String(data.source ?? 'dacoit'),
  }
}

export function useSignals(month: () => string) {
  const live = useOwnedMonth<DacoitSignal>({
    key: 'dacoitCollection',
    field: 'istDate',
    read: readSignal,
    month,
  })

  /** Oldest first within the day, which is the order they fired. */
  const signals = computed<DacoitSignal[]>(() =>
    live.rows.value
      .slice()
      .sort((a, b) =>
        a.istDate < b.istDate ? -1 : a.istDate > b.istDate ? 1 : a.signalAt - b.signalAt,
      ),
  )

  const byDay = computed<Record<string, DacoitSignal[]>>(() => {
    const out: Record<string, DacoitSignal[]> = {}
    for (const s of signals.value) (out[s.istDate] ??= []).push(s)
    return out
  })

  const goCount = computed(() => signals.value.filter((s) => s.verdict === 'GO').length)

  return {
    signals,
    byDay,
    goCount,
    loading: live.loading,
    error: live.error,
    collection: live.collection,
  }
}

/** The most recent GO still inside its window, for the desk's inline notice. */
export function freshGo(
  signals: DacoitSignal[],
  now = Date.now(),
  within = SIGNAL_FRESH_MS,
): DacoitSignal | null {
  let best: DacoitSignal | null = null
  for (const s of signals) {
    if (s.verdict !== 'GO') continue
    const age = now - s.signalAt
    if (age < 0 || age > within) continue
    if (!best || s.signalAt > best.signalAt) best = s
  }
  return best
}
