// The instrument universe, from the backend's instrument master only.
//
//   GET /api/trading/instruments ?broker&q&instrument_type&exchange&segment&limit&offset
//   GET /api/trading/brokers     the brokers, how many instruments each has, per segment
//
// Nothing here is hardcoded market data: every instrument, symbol and lot size
// comes from those endpoints. The vocabulary is Dhan's, kept as the backend
// normalises it (backend app/agents/trading/dhan/parse.py):
//
//   segment            NSE_EQ · NSE_FNO · BSE_EQ · BSE_FNO · NSE_CURRENCY · BSE_CURRENCY · IDX_I
//   instrument_type    EQUITY · INDEX · FUTIDX · FUTSTK · OPTIDX · OPTSTK · FUTCOM · …
//   broker_instrument_id "SEGMENT:SECURITY_ID" (security ids are unique only within a segment)
//
// Every filter (text, type, exchange, segment, broker) is applied by the server
// before paging, so it covers the whole master, not just the loaded page.

import { aureon, type components } from '@/api/client'
import { must } from '@/trading/useLoad'

export type Instrument = components['schemas']['InstrumentOut']
export type InstrumentPage = components['schemas']['Page_InstrumentOut_']
export type Broker = components['schemas']['Broker']
export type BrokerInfo = components['schemas']['BrokerOut']

export type Exchange = 'NSE' | 'BSE' | 'MCX'
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
  if (raw.startsWith('MCX')) return 'MCX'
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
  exchange?: Exchange
  segment?: string
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
          ...(query.exchange ? { exchange: [query.exchange] } : {}),
          ...(query.segment ? { segment: [query.segment] } : {}),
          limit: query.limit ?? PAGE_SIZE,
          offset: query.offset ?? 0,
        },
      },
    }),
  )
}

/** The brokers the server knows, with their instrument counts per segment. */
export async function fetchBrokers(): Promise<BrokerInfo[]> {
  return must(await aureon.GET('/api/trading/brokers'))
}

/** "Dhan · 197,073 instruments", or "MT5 · not configured". */
export function brokerLabel(b: BrokerInfo): string {
  if (!b.configured) return `${b.label} · not configured`
  return `${b.label} · ${b.instruments.toLocaleString()} instruments`
}
