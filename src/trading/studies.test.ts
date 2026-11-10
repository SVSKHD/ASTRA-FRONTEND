import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PALETTE,
  PRESETS_KEY,
  STUDIES_KEY,
  cleanParams,
  computeStudy,
  createStudio,
  crossMarkers,
  parsePresets,
  serverName,
  sourceOf,
  toNumbers,
  type ServerRow,
  type Study,
} from './studies'

const T0 = Date.parse('2026-11-10T03:45:00Z')
const candles = [10, 11, 12, 11, 13].map((c, i) => ({
  ts: new Date(T0 + i * 900_000).toISOString(),
  open: String(c),
  high: String(c + 1),
  low: String(c - 1),
  close: String(c),
  volume: '100',
}))
const study = (kind: Study['kind'], params: number[]): Study => ({
  id: 'x',
  kind,
  params,
  color: 'accent',
  visible: true,
})

describe('which studies the server stores', () => {
  it('names the research worker’s default set, and nothing else', () => {
    expect(serverName(study('ema', [9]))).toBe('ema:9')
    expect(serverName(study('ema', [21]))).toBe('ema:21')
    expect(serverName(study('ema', [8]))).toBeNull()
    expect(serverName(study('macd', [12, 26, 9]))).toBe('macd:12:26:9')
    expect(serverName(study('macd', [8, 21, 5]))).toBeNull()
    expect(serverName(study('atr', [14]))).toBe('atr:14')
    expect(serverName(study('vwap', []))).toBe('vwap:UTC')
    expect(serverName(study('rsi', [14]))).toBeNull()
  })
})

describe('server values first, the browser otherwise', () => {
  const n = toNumbers(candles)
  it('uses the stored rows, as the server’s strings, matched by instant', () => {
    // A different spelling of the same instant still matches.
    const rows: ServerRow[] = [
      {
        name: 'ema:9',
        ts: candles[4].ts.replace('.000Z', '+00:00'),
        values: { value: '11.40000001' },
      },
    ]
    const r = computeStudy(study('ema', [9]), n, new Map([['ema:9', rows]]))
    expect(r.source).toBe('server')
    expect(r.lines[0].display).toEqual([null, null, null, null, '11.40000001'])
    expect(r.lines[0].values[4]).toBeCloseTo(11.4, 6)
  })
  it('calculates in the browser when no stored row matches, and says so', () => {
    const r = computeStudy(study('ema', [3]), n, new Map())
    expect(r.source).toBe('browser')
    expect(r.lines[0].display).toEqual([null, null, '11.00', '11.00', '12.00'])
    expect(sourceOf(study('ema', [9]), n.time, new Map([['ema:9', []]]))).toBe('browser')
  })
  it('MACD from the server keeps all three stored values', () => {
    const rows: ServerRow[] = [
      {
        name: 'macd:12:26:9',
        ts: candles[4].ts,
        values: { macd: '0.5', signal: '0.25', hist: '0.25' },
      },
    ]
    const r = computeStudy(study('macd', [12, 26, 9]), n, new Map([['macd:12:26:9', rows]]))
    expect(r.source).toBe('server')
    expect(r.lines.map((l) => [l.key, l.display[4]])).toEqual([
      ['hist', '0.25'],
      ['macd', '0.5'],
      ['signal', '0.25'],
    ])
  })
  it('colours are theme tokens, never literals', () => {
    for (const p of PALETTE) expect(p.css).toMatch(/^var\(--/)
  })
  it('clamps params', () => {
    expect(cleanParams('ema', [0])).toEqual([1])
    expect(cleanParams('ema', ['x'])).toEqual([20])
    expect(cleanParams('macd', [26, 12, 9])).toEqual([26, 27, 9])
    expect(cleanParams('bb', [20, 2.3])).toEqual([20, 2.5])
  })
})

describe('crossover markers', () => {
  it('a cross on the live last candle is unconfirmed; earlier ones are confirmed', () => {
    const fast = [null, 1, 3, 1, 3]
    const slow = [null, 2, 2, 2, 2]
    expect(crossMarkers(fast, slow, true)).toEqual([
      { index: 2, side: 'bullish', confirmed: true },
      { index: 3, side: 'bearish', confirmed: true },
      { index: 4, side: 'bullish', confirmed: false },
    ])
    expect(crossMarkers(fast, slow, false).every((m) => m.confirmed)).toBe(true)
  })
})

describe('the studio', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('adds the EMA 8/32 crossover in one go, reusing EMAs already there', () => {
    const s = createStudio()
    s.add('ema', [8])
    expect(s.addCrossover()).toBe(true)
    expect(s.state.studies.map((x) => x.params[0])).toEqual([8, 32])
    expect(s.state.cross).toEqual({ fast: s.state.studies[0].id, slow: s.state.studies[1].id })
    s.remove(s.state.studies[1].id)
    expect(s.state.cross).toBeNull()
  })
  it('keeps studies and presets on this device, and survives bad storage', () => {
    const s = createStudio()
    s.add('rsi')
    s.addCrossover()
    s.savePreset('Momentum')
    const again = createStudio()
    expect(again.state.studies.map((x) => x.kind)).toEqual(['rsi', 'ema', 'ema'])
    expect(again.state.cross).not.toBeNull()
    expect(again.state.presets.map((p) => p.name)).toEqual(['Momentum'])

    localStorage.setItem(STUDIES_KEY, '{not json')
    localStorage.setItem(PRESETS_KEY, '[{"name":"x","studies":[{"kind":"nope"}]}]')
    const bad = createStudio()
    expect(bad.state.studies).toEqual([])
    expect(bad.state.presets).toEqual([{ name: 'x', studies: [], cross: null }])
  })
  it('loads a preset in place of the current studies', () => {
    const s = createStudio({ persist: false })
    s.add('ema', [50])
    s.savePreset('Trend')
    s.remove(s.state.studies[0].id)
    s.add('atr')
    s.loadPreset('Trend')
    expect(s.state.studies.map((x) => `${x.kind}${x.params}`)).toEqual(['ema50'])
    expect(() => s.savePreset('   ')).toThrow()
  })
  it('drops presets it cannot read', () => {
    expect(parsePresets('nope')).toEqual([])
    expect(parsePresets('{"a":1}')).toEqual([])
  })
})
