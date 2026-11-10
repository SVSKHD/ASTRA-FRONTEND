import { describe, expect, it } from 'vitest'
import {
  buildBacktestRequest,
  buildStrategyCreate,
  errorText,
  intList,
  metricEntries,
  paramsText,
  validateBacktest,
  validateDraft,
  type BacktestDraft,
  type StrategyDraft,
} from './strategyForm'

const DRAFT = (over: Partial<StrategyDraft> = {}): StrategyDraft => ({
  name: 'ema-9-21',
  description: '',
  code_ref: 'ema_cross',
  fast: 9,
  slow: 21,
  instrumentIds: [7],
  timeframes: ['15m'],
  ...over,
})
const BT = (over: Partial<BacktestDraft> = {}): BacktestDraft => ({
  versionId: 'v1',
  instrumentId: 42,
  timeframe: '15m',
  days: 30,
  quantity: null,
  spread: 2,
  slippage: 1,
  fee: 3,
  fastGrid: '',
  slowGrid: '',
  ...over,
})

describe('validateDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft(DRAFT())).toEqual({})
  })
  it('needs fast < slow, both positive whole numbers (backend _int and fast >= slow)', () => {
    expect(validateDraft(DRAFT({ fast: 21, slow: 9 })).slow).toBe(
      'The slow EMA must be longer than the fast one.',
    )
    expect(validateDraft(DRAFT({ fast: 21, slow: 21 })).slow).toBeDefined()
    expect(validateDraft(DRAFT({ fast: 0 })).fast).toBeDefined()
    expect(validateDraft(DRAFT({ fast: 2.5 })).fast).toBeDefined()
    expect(validateDraft(DRAFT({ slow: null })).slow).toBeDefined()
  })
  it('checks the name against StrategyCreate.name (pattern, 1–100)', () => {
    expect(validateDraft(DRAFT({ name: ' ' })).name).toBe('Give the strategy a name.')
    expect(validateDraft(DRAFT({ name: 'ema/9' })).name).toBeDefined()
    expect(validateDraft(DRAFT({ name: 'x'.repeat(101) })).name).toBeDefined()
    expect(validateDraft(DRAFT({ name: 'EMA 9:21_v2.b-1' })).name).toBeUndefined()
  })
  it('needs a registered type, an instrument and a timeframe', () => {
    const e = validateDraft(DRAFT({ code_ref: 'rsi', instrumentIds: [], timeframes: [] }))
    expect(Object.keys(e).sort()).toEqual(['code_ref', 'instruments', 'timeframes'])
  })
})

describe('buildStrategyCreate', () => {
  it('sends exactly the params the backend reads', () => {
    expect(buildStrategyCreate(DRAFT({ description: '  trend  ', instrumentIds: [7, 9] }))).toEqual(
      {
        name: 'ema-9-21',
        code_ref: 'ema_cross',
        params: { fast: 9, slow: 21, instrument_ids: [7, 9], timeframes: ['15m'] },
        description: 'trend',
      },
    )
    expect(buildStrategyCreate(DRAFT())).not.toHaveProperty('description')
  })
})

describe('backtest', () => {
  it('validates the version, instrument, days, quantity, costs and grid', () => {
    expect(validateBacktest(BT())).toEqual({})
    const e = validateBacktest(
      BT({ versionId: '', instrumentId: null, days: 0, quantity: 0, fee: -1, fastGrid: '5, x' }),
    )
    expect(Object.keys(e).sort()).toEqual([
      'costs',
      'days',
      'grid',
      'instrument',
      'quantity',
      'version',
    ])
  })
  it('builds the BacktestRequest with period, grid, quantity and costs', () => {
    const now = new Date('2026-11-10T12:00:00Z')
    expect(
      buildBacktestRequest(BT({ days: 2, quantity: 10, fastGrid: '5, 9', slowGrid: '' }), now),
    ).toEqual({
      strategy_version_id: 'v1',
      instrument_id: 42,
      timeframe: '15m',
      start: '2026-11-08T12:00:00.000Z',
      end: '2026-11-10T12:00:00.000Z',
      grid: { fast: [5, 9] },
      quantity: '10',
      costs: { spread_bps: '2', slippage_bps: '1', fee_bps: '3' },
    })
    expect(buildBacktestRequest(BT(), now)).not.toHaveProperty('quantity')
  })
  it('parses comma lists strictly', () => {
    expect(intList('')).toEqual([])
    expect(intList('5, 9,')).toEqual([5, 9])
    expect(intList('5, 0')).toBeNull()
  })
})

describe('errorText', () => {
  it('spells out FastAPI 422 validation lists', () => {
    expect(
      errorText(
        {
          detail: [
            { loc: ['body', 'name'], msg: 'String should match pattern', type: 'x' },
            { loc: ['body', 'params', 'fast'], msg: 'bad', type: 'y' },
          ],
        },
        422,
      ),
    ).toBe('name: String should match pattern; params.fast: bad')
  })
  it("keeps the backend's own {code, detail} text", () => {
    expect(
      errorText({ detail: { code: 'bad_params', detail: 'fast must be shorter than slow' } }, 422),
    ).toBe('fast must be shorter than slow')
    expect(errorText({ detail: 'instrument not found' }, 404)).toBe('instrument not found')
    expect(errorText(undefined, 500)).toBe('Aureon answered 500')
  })
})

describe('display', () => {
  it('labels every metric key, keeping unknown ones', () => {
    const e = metricEntries({
      trades: 3,
      win_rate: '0.5',
      fill: 'next bar open',
      costs: {},
      sharpe: '1.2',
    })
    expect(e.map((x) => x.label)).toEqual(['Trades', 'Win rate', 'Fills at', 'sharpe'])
  })
  it('summarises params without the watch list', () => {
    expect(paramsText({ fast: 9, slow: 21, instrument_ids: [1], timeframes: ['15m'] })).toBe(
      'fast 9 · slow 21',
    )
  })
})
