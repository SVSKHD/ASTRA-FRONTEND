// The instrument universe, from the backend's instrument master only.
//
//   GET /api/trading/instruments ?broker&q&instrument_type&limit&offset  → Page<InstrumentOut>
//
// Nothing here is hardcoded market data: every instrument, symbol and lot size
// comes from that endpoint. The vocabulary is Dhan's, kept as the backend
// normalises it (backend app/agents/trading/dhan/parse.py):
//
//   segment            NSE_EQ · NSE_FNO · BSE_EQ · BSE_FNO · NSE_CURRENCY · BSE_CURRENCY · IDX_I
//   instrument_type    EQUITY · INDEX · FUTIDX · FUTSTK · OPTIDX · OPTSTK · FUTCOM · …
//   broker_instrument_id "SEGMENT:SECURITY_ID" (security ids are unique only within a segment)
//
// BACKEND GAP (docs/market-terminal.md §2): the endpoint filters by `q` and
// `instrument_type` only. NSE/BSE and segment filters therefore apply to the
// page that came back, and say so; they must not pretend to filter the market.

import { aureon, type components } from '@/api/client'
import { must } from '@/trading/useLoad'

export type Instrument = components['schemas']['InstrumentOut']
export type InstrumentPage = components['schemas']['Page_InstrumentOut_']
export type Broker = components['schemas']['Broker']

export type Exchange = 'NSE' | 'BSE'
export type Kind = 'equity' | 'index' | 'future' | 'option' | 'other'

export const KIND_LABEL: Record<Kind, string> = {
  equity: 'Equity',
  index: 'Index',
  future: 'Future',
  option: 'Option',
  other: 'Other',
}

/** instrument_type values per kind, as the backend sends them. */
export const TYPES_BY_KIND: Record<Exclude<Kind, 'other'>, string[]> = {
  equity: ['EQUITY'],
  index: ['INDEX'],
  future: ['FUTIDX', 'FUTSTK', 'FUTCOM', 'FUTCUR'],
  option: ['OPTIDX', 'OPTSTK', 'OPTFUT', 'OPTCUR'],
}

export function kindOf(i: Pick<Instrument, 'instrument_type'>): Kind {
  const t = (i.instrument_type || '').toUpperCase()
  for (const [kind, types] of Object.entries(TYPES_BY_KIND) as [Kind, string[]][]) {
    if (types.includes(t)) return kind
  }
  return 'other'
}

/** "NSE_EQ" from an instrument's own segment, else from its "SEGMENT:ID" reference. */
export function segmentOf(i: Pick<Instrument, 'segment' | 'broker_instrument_id'>): string | null {
  if (i.segment) return i.segment
  const ref = i.broker_instrument_id || ''
  const at = ref.indexOf(':')
  return at > 0 ? ref.slice(0, at) : null
}

/** NSE / BSE, from the exchange field or the segment; null for an index segment without one. */
export function exchangeOf(
  i: Pick<Instrument, 'exchange' | 'segment' | 'broker_instrument_id'>,
): Exchange | null {
  const raw = (i.exchange || segmentOf(i) || '').toUpperCase()
  if (raw.startsWith('NSE')) return 'NSE'
  if (raw.startsWith('BSE')) return 'BSE'
  return null
}

/** The Dhan security id alone ("2885" from "NSE_EQ:2885"). */
export function securityIdOf(i: Pick<Instrument, 'broker_instrument_id'>): string {
  const ref = i.broker_instrument_id || ''
  const at = ref.indexOf(':')
  return at >= 0 ? ref.slice(at + 1) : ref
}

/** One line that tells two "NIFTY" contracts apart. */
export function describe(i: Instrument): string {
  const parts = [exchangeOf(i) ?? segmentOf(i) ?? i.broker.toUpperCase(), KIND_LABEL[kindOf(i)]]
  if (i.expiry) parts.push(i.expiry)
  if (i.strike) parts.push(i.strike)
  if (i.option_type) parts.push(i.option_type)
  return parts.join(' · ')
}

export interface InstrumentQuery {
  broker?: Broker
  q?: string
  instrumentType?: string
  limit?: number
  offset?: number
}

export const PAGE_SIZE = 50

export async function searchInstruments(query: InstrumentQuery): Promise<InstrumentPage> {
  const q = query.q?.trim()
  return must(
    await aureon.GET('/api/trading/instruments', {
      params: {
        query: {
          broker: query.broker ?? 'dhan',
          ...(q ? { q: q.slice(0, 64) } : {}),
          ...(query.instrumentType ? { instrument_type: [query.instrumentType] } : {}),
          limit: query.limit ?? PAGE_SIZE,
          offset: query.offset ?? 0,
        },
      },
    }),
  )
}
