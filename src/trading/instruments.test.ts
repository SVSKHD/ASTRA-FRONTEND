import { describe, expect, it } from 'vitest'
import {
  describe as describeInstrument,
  exchangeOf,
  kindOf,
  securityIdOf,
  segmentOf,
  type Instrument,
} from '@/trading/instruments'

const base: Instrument = {
  id: 7,
  broker: 'dhan',
  broker_instrument_id: 'NSE_FNO:35001',
  symbol: 'NIFTY',
  exchange: null,
  segment: null,
  instrument_type: 'OPTIDX',
  underlying: 'NIFTY',
  expiry: '2026-11-27',
  strike: '24500',
  option_type: 'CE',
  lot_size: '75',
  tick_size: '0.05',
  currency: 'INR',
  is_active: true,
}

describe('instruments', () => {
  it('reads the segment and security id from the Dhan reference', () => {
    expect(segmentOf(base)).toBe('NSE_FNO')
    expect(securityIdOf(base)).toBe('35001')
    expect(exchangeOf(base)).toBe('NSE')
    expect(exchangeOf({ ...base, segment: 'BSE_EQ' })).toBe('BSE')
    expect(exchangeOf({ ...base, broker_instrument_id: 'IDX_I:13', exchange: null })).toBeNull()
  })

  it('classifies the backend instrument types', () => {
    expect(kindOf(base)).toBe('option')
    expect(kindOf({ instrument_type: 'FUTSTK' })).toBe('future')
    expect(kindOf({ instrument_type: 'EQUITY' })).toBe('equity')
    expect(kindOf({ instrument_type: 'INDEX' })).toBe('index')
    expect(kindOf({ instrument_type: 'SOMETHING' })).toBe('other')
  })

  it('tells two contracts on one underlying apart', () => {
    expect(describeInstrument(base)).toBe('NSE · Option · 2026-11-27 · 24500 · CE')
  })
})

describe('broker test instruments', () => {
  it('are told apart from real ones by symbol or ISIN', async () => {
    const { isTestInstrument } = await import('./instruments')
    expect(isTestInstrument({ symbol: '011NSETEST', isin: null })).toBe(true)
    expect(isTestInstrument({ symbol: 'ABC', isin: 'DUMMYSAN007' })).toBe(true)
    expect(isTestInstrument({ symbol: 'RELIANCE', isin: 'INE002A01018' })).toBe(false)
    expect(isTestInstrument({ symbol: 'TESTBANK', isin: null })).toBe(false)
  })
})
