// The chart's studies (indicators): what the user added, where each value comes from,
// and the series the chart draws.
//
// SOURCE RULE (docs/market-terminal.md §4): a study whose stored name the research
// worker writes (ema:9, ema:21, macd:12:26:9, atr:14, vwap:UTC) uses the server's rows
// whenever any came back; every other study, or one with no stored rows, is calculated
// in the browser (src/trading/indicators.ts) and is labelled so. Server values are
// shown as the server's decimal strings; browser values are formatted from floats.
//
// Studies are a presentation preference: they and the named presets are kept on this
// device (localStorage, guarded), and nothing here depends on a strategy being
// registered on the backend.

import { reactive } from 'vue'
import {
  adx,
  atr,
  bollinger,
  crossovers,
  ema,
  macd,
  rsi,
  sma,
  vwap,
  type CrossSide,
} from '@/trading/indicators'

export type StudyKind = 'ema' | 'sma' | 'bb' | 'vwap' | 'rsi' | 'macd' | 'atr' | 'adx'
export type ValueSource = 'server' | 'browser'

/** Colours a study can take: theme tokens only, so every theme re-colours them. */
export const PALETTE = [
  { key: 'accent', label: 'Accent', css: 'var(--theme-accent)' },
  { key: 'warning', label: 'Amber', css: 'var(--theme-warning)' },
  { key: 'info', label: 'Blue', css: 'var(--theme-info, var(--theme-accent))' },
  { key: 'success', label: 'Green', css: 'var(--theme-success)' },
  { key: 'danger', label: 'Red', css: 'var(--theme-danger)' },
  { key: 'text', label: 'Ink', css: 'var(--theme-text)' },
  { key: 'dim', label: 'Grey', css: 'var(--theme-dim)' },
] as const
export type ColorKey = (typeof PALETTE)[number]['key']

export function colorCss(key: string): string {
  return PALETTE.find((p) => p.key === key)?.css ?? PALETTE[0].css
}

export interface Study {
  id: string
  kind: StudyKind
  /** Periods etc., per kind (see PARAMS). */
  params: number[]
  color: ColorKey
  visible: boolean
}

export interface ParamSpec {
  label: string
  min: number
  max: number
  step?: number
}

export const KINDS: {
  kind: StudyKind
  label: string
  pane: 'price' | 'sub'
  defaults: number[]
  params: ParamSpec[]
  hint: string
}[] = [
  {
    kind: 'ema',
    label: 'EMA',
    pane: 'price',
    defaults: [20],
    params: [{ label: 'Period', min: 1, max: 500 }],
    hint: 'Exponential moving average',
  },
  {
    kind: 'sma',
    label: 'SMA',
    pane: 'price',
    defaults: [20],
    params: [{ label: 'Period', min: 1, max: 500 }],
    hint: 'Simple moving average',
  },
  {
    kind: 'bb',
    label: 'Bollinger Bands',
    pane: 'price',
    defaults: [20, 2],
    params: [
      { label: 'Period', min: 2, max: 500 },
      { label: 'Std devs', min: 0.5, max: 5, step: 0.5 },
    ],
    hint: 'SMA ± k standard deviations',
  },
  {
    kind: 'vwap',
    label: 'VWAP',
    pane: 'price',
    defaults: [],
    params: [],
    hint: 'Volume-weighted average price, reset daily',
  },
  {
    kind: 'rsi',
    label: 'RSI',
    pane: 'sub',
    defaults: [14],
    params: [{ label: 'Period', min: 2, max: 200 }],
    hint: 'Relative strength index (Wilder)',
  },
  {
    kind: 'macd',
    label: 'MACD',
    pane: 'sub',
    defaults: [12, 26, 9],
    params: [
      { label: 'Fast', min: 1, max: 200 },
      { label: 'Slow', min: 2, max: 400 },
      { label: 'Signal', min: 1, max: 200 },
    ],
    hint: 'Moving average convergence/divergence',
  },
  {
    kind: 'atr',
    label: 'ATR',
    pane: 'sub',
    defaults: [14],
    params: [{ label: 'Period', min: 1, max: 200 }],
    hint: 'Average true range (Wilder)',
  },
  {
    kind: 'adx',
    label: 'ADX',
    pane: 'sub',
    defaults: [14],
    params: [{ label: 'Period', min: 2, max: 200 }],
    hint: 'Average directional index with +DI / −DI (Wilder)',
  },
]

export const EMA_PRESETS = [8, 9, 20, 21, 32, 50, 200]

export function kindInfo(kind: StudyKind) {
  return KINDS.find((k) => k.kind === kind)!
}

export function studyLabel(s: Pick<Study, 'kind' | 'params'>): string {
  const info = kindInfo(s.kind)
  if (s.kind === 'vwap') return 'VWAP'
  return `${info.label === 'Bollinger Bands' ? 'BB' : info.label} ${s.params.join(', ')}`
}

/**
 * The name the research worker stores this study under, when it stores it
 * (backend app/agents/research/indicators.py `compute` with the default IndicatorSet
 * and RESEARCH_EMA_PERIODS = [9, 21]). Null when only the browser can calculate it.
 */
export function serverName(s: Pick<Study, 'kind' | 'params'>): string | null {
  const p = s.params
  switch (s.kind) {
    case 'ema':
      return p[0] === 9 || p[0] === 21 ? `ema:${p[0]}` : null
    case 'macd':
      return p[0] === 12 && p[1] === 26 && p[2] === 9 ? 'macd:12:26:9' : null
    case 'atr':
      return p[0] === 14 ? 'atr:14' : null
    case 'vwap':
      return 'vwap:UTC'
    default:
      return null
  }
}

/** Clamp a study's params to what its kind allows (bad input never reaches the maths). */
export function cleanParams(kind: StudyKind, params: unknown[]): number[] {
  const info = kindInfo(kind)
  const out = info.params.map((spec, i) => {
    const raw = Number(params[i])
    const v = Number.isFinite(raw) ? raw : info.defaults[i]
    const stepped = spec.step ? Math.round(v / spec.step) * spec.step : Math.round(v)
    return Math.min(spec.max, Math.max(spec.min, stepped))
  })
  if (kind === 'macd' && out[0] >= out[1]) out[1] = out[0] + 1
  return out
}

// --- Computing ------------------------------------------------------------------------

export interface StudyCandle {
  ts: string
  open: string
  high: string
  low: string
  close: string
  volume?: string | null
}

/** A server indicator row (GET /api/trading/indicators). */
export interface ServerRow {
  name: string
  ts: string
  values: Record<string, unknown>
}

export interface SeriesLine {
  key: string
  label: string
  color: string
  /** Pixel positions only. */
  values: (number | null)[]
  /** What the legend and tooltip show: the server's string, or the browser's rounding. */
  display: (string | null)[]
  style: 'line' | 'hist' | 'dashed'
}

export interface StudyResult {
  study: Study
  label: string
  source: ValueSource
  pane: 'price' | 'sub'
  lines: SeriesLine[]
  /** Fixed axis range for oscillators. */
  range?: [number, number]
  guides?: number[]
  note?: string
}

export interface Numbers {
  time: number[]
  open: number[]
  high: number[]
  low: number[]
  close: number[]
  volume: number[]
}

export function toNumbers(candles: readonly StudyCandle[]): Numbers {
  return {
    time: candles.map((c) => Date.parse(c.ts)),
    open: candles.map((c) => Number(c.open)),
    high: candles.map((c) => Number(c.high)),
    low: candles.map((c) => Number(c.low)),
    close: candles.map((c) => Number(c.close)),
    volume: candles.map((c) => (c.volume == null ? NaN : Number(c.volume))),
  }
}

/** Browser rounding for display: 2 decimals for prices ≥ 1, else 4 significant. */
export function fmtNum(v: number, dp?: number): string | null {
  if (!Number.isFinite(v)) return null
  const d = dp ?? (Math.abs(v) >= 1 ? 2 : 4)
  return v.toFixed(d)
}

function fromBrowser(values: number[], dp?: number) {
  return {
    values: values.map((v) => (Number.isFinite(v) ? v : null)),
    display: values.map((v) => fmtNum(v, dp)),
  }
}

/** Server rows → per-candle values for `key`, matched by instant (not by string). */
function fromServer(rows: ServerRow[], times: number[], key: string) {
  const at = new Map<number, unknown>()
  for (const r of rows) at.set(Date.parse(r.ts), r.values?.[key])
  const display = times.map((t) => {
    const v = at.get(t)
    return v === null || v === undefined ? null : String(v)
  })
  return {
    values: display.map((d) => {
      if (d === null) return null
      const n = Number(d)
      return Number.isFinite(n) ? n : null
    }),
    display,
  }
}

type Picker = (
  key: string,
  compute: () => number[],
  dp?: number,
) => {
  values: (number | null)[]
  display: (string | null)[]
}

/** One study → its lines, from server rows when they exist, else from the browser. */
/** 'server' when the study's stored name has rows on at least one of these candles. */
export function sourceOf(
  study: Pick<Study, 'kind' | 'params'>,
  times: readonly number[],
  server: Map<string, ServerRow[]>,
): ValueSource {
  const name = serverName(study)
  const rows = name ? (server.get(name) ?? []) : []
  if (!rows.length) return 'browser'
  const at = new Set(rows.map((r) => Date.parse(r.ts)))
  return times.some((t) => at.has(t)) ? 'server' : 'browser'
}

export function computeStudy(
  study: Study,
  n: Numbers,
  server: Map<string, ServerRow[]> = new Map(),
): StudyResult {
  const name = serverName(study)
  const rows = name ? (server.get(name) ?? []) : []
  const source = sourceOf(study, n.time, server)
  const pick: Picker = (key, compute, dp) =>
    source === 'server' ? fromServer(rows, n.time, key) : fromBrowser(compute(), dp)
  const color = colorCss(study.color)
  const info = kindInfo(study.kind)
  const p = study.params
  const hlc = { high: n.high, low: n.low, close: n.close }
  const line = (
    key: string,
    label: string,
    v: ReturnType<Picker>,
    style: SeriesLine['style'] = 'line',
    c = color,
  ): SeriesLine => ({ key, label, color: c, style, ...v })

  const base = { study, label: studyLabel(study), source, pane: info.pane }
  switch (study.kind) {
    case 'ema':
      return {
        ...base,
        lines: [
          line(
            'value',
            base.label,
            pick('value', () => ema(n.close, p[0])),
          ),
        ],
      }
    case 'sma':
      return {
        ...base,
        lines: [
          line(
            'value',
            base.label,
            pick('value', () => sma(n.close, p[0])),
          ),
        ],
      }
    case 'bb': {
      const b = bollinger(n.close, p[0], p[1])
      return {
        ...base,
        lines: [
          line('upper', 'Upper', fromBrowser(b.upper), 'dashed'),
          line('middle', 'Middle', fromBrowser(b.middle)),
          line('lower', 'Lower', fromBrowser(b.lower), 'dashed'),
        ],
      }
    }
    case 'vwap':
      return {
        ...base,
        label: source === 'server' ? 'VWAP (UTC day)' : 'VWAP (IST day)',
        note: 'Resets each day. The server anchors on UTC days, the browser on IST days; for NSE hours both are the same calendar day.',
        lines: [
          line(
            'value',
            'VWAP',
            pick('value', () => vwap(n)),
          ),
        ],
      }
    case 'rsi':
      return {
        ...base,
        range: [0, 100],
        guides: [30, 70],
        lines: [line('value', base.label, fromBrowser(rsi(n.close, p[0]), 2))],
      }
    case 'atr':
      return {
        ...base,
        lines: [
          line(
            'value',
            base.label,
            pick('value', () => atr(hlc, p[0])),
          ),
        ],
      }
    case 'adx': {
      const a = adx(hlc, p[0])
      return {
        ...base,
        guides: [25],
        lines: [
          line('adx', 'ADX', fromBrowser(a.adx, 2)),
          line('plus', '+DI', fromBrowser(a.plusDI, 2), 'dashed', colorCss('success')),
          line('minus', '−DI', fromBrowser(a.minusDI, 2), 'dashed', colorCss('danger')),
        ],
      }
    }
    case 'macd': {
      let m: ReturnType<typeof macd> | null = null
      const calc = () => (m ??= macd(n.close, p[0], p[1], p[2]))
      return {
        ...base,
        guides: [0],
        lines: [
          line(
            'hist',
            'Hist',
            pick('hist', () => calc().hist),
            'hist',
            colorCss('dim'),
          ),
          line(
            'macd',
            'MACD',
            pick('macd', () => calc().macd),
          ),
          line(
            'signal',
            'Signal',
            pick('signal', () => calc().signal),
            'dashed',
            colorCss('warning'),
          ),
        ],
      }
    }
  }
}

// --- Crossover markers --------------------------------------------------------------

export interface CrossMarker {
  index: number
  side: CrossSide
  /** False when the cross involves the live (unconfirmed) last candle. */
  confirmed: boolean
}

/**
 * Crossovers between two EMA studies, from the browser's EMAs on every candle shown.
 *
 * A cross on the last candle while that candle's period has not ended is UNCONFIRMED:
 * the EMA there moves with every tick, and the backend's strategies only decide on
 * closed candles.
 */
export function crossMarkers(
  fast: (number | null)[],
  slow: (number | null)[],
  lastUnconfirmed: boolean,
): CrossMarker[] {
  const f = fast.map((v) => v ?? NaN)
  const s = slow.map((v) => v ?? NaN)
  const last = f.length - 1
  return crossovers(f, s).map((c) => ({
    ...c,
    confirmed: !(lastUnconfirmed && c.index === last),
  }))
}

// --- The studio's state and presets --------------------------------------------------

export const STUDIES_KEY = 'aureon.trading.chart.studies.v1'
export const PRESETS_KEY = 'aureon.trading.chart.presets.v1'
export const MAX_STUDIES = 12
export const MAX_PRESETS = 20

export interface StudyPreset {
  name: string
  studies: Omit<Study, 'id'>[]
  /** Indices into `studies` of the EMA pair whose crossovers are marked. */
  cross: [number, number] | null
}

export interface StudioState {
  studies: Study[]
  /** The ids of the EMA pair whose crossovers are marked (the 8/32 preset sets it). */
  cross: { fast: string; slow: string } | null
  presets: StudyPreset[]
}

let seq = 0
function newId(): string {
  seq += 1
  return `st_${Date.now().toString(36)}_${seq}`
}

function isKind(k: unknown): k is StudyKind {
  return typeof k === 'string' && KINDS.some((x) => x.kind === k)
}
function isColor(c: unknown): c is ColorKey {
  return typeof c === 'string' && PALETTE.some((p) => p.key === c)
}

function parseStudy(raw: unknown): Omit<Study, 'id'> | null {
  const s = raw as Partial<Study>
  if (!s || typeof s !== 'object' || !isKind(s.kind)) return null
  return {
    kind: s.kind,
    params: cleanParams(s.kind, Array.isArray(s.params) ? s.params : []),
    color: isColor(s.color) ? s.color : 'accent',
    visible: s.visible !== false,
  }
}

/** Parse stored presets; anything malformed is dropped rather than trusted. */
export function parsePresets(raw: string | null): StudyPreset[] {
  try {
    const data = JSON.parse(raw || '[]') as unknown
    if (!Array.isArray(data)) return []
    return data
      .filter((p): p is StudyPreset => !!p && typeof p === 'object' && typeof p.name === 'string')
      .slice(0, MAX_PRESETS)
      .map((p) => {
        const studies = (Array.isArray(p.studies) ? p.studies : [])
          .map(parseStudy)
          .filter((s): s is Omit<Study, 'id'> => !!s)
          .slice(0, MAX_STUDIES)
        const c = p.cross
        const cross =
          Array.isArray(c) &&
          c.length === 2 &&
          c.every((i) => Number.isInteger(i) && studies[i]?.kind === 'ema')
            ? ([c[0], c[1]] as [number, number])
            : null
        return { name: p.name.trim().slice(0, 40) || 'Preset', studies, cross }
      })
  } catch {
    return []
  }
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null
  } catch {
    return null
  }
}
function write(key: string, value: string): void {
  try {
    storage()?.setItem(key, value)
  } catch {
    /* private window or full storage: the setting lasts for this page only */
  }
}

/** A studio: the chart's studies, the marked crossover pair and the saved presets. */
export function createStudio(opts: { persist?: boolean } = {}) {
  const persist = opts.persist !== false
  const saved = persist ? parsePresets(`[${read(STUDIES_KEY) ?? ''}]`)[0] : undefined
  const state = reactive<StudioState>({
    studies: [],
    cross: null,
    presets: persist ? parsePresets(read(PRESETS_KEY)) : [],
  })
  if (saved) applyPreset(saved)

  function save() {
    if (!persist) return
    write(STUDIES_KEY, JSON.stringify(snapshot('current')))
  }
  function savePresets() {
    if (persist) write(PRESETS_KEY, JSON.stringify(state.presets))
  }
  function snapshot(name: string): StudyPreset {
    const ids = state.studies.map((s) => s.id)
    const cross = state.cross
      ? ([ids.indexOf(state.cross.fast), ids.indexOf(state.cross.slow)] as [number, number])
      : null
    return {
      name,
      studies: state.studies.map(({ id: _id, ...rest }) => ({ ...rest, params: [...rest.params] })),
      cross: cross && cross[0] >= 0 && cross[1] >= 0 ? cross : null,
    }
  }
  function applyPreset(p: StudyPreset) {
    state.studies = p.studies.map((s) => ({ ...s, params: [...s.params], id: newId() }))
    state.cross = p.cross
      ? { fast: state.studies[p.cross[0]].id, slow: state.studies[p.cross[1]].id }
      : null
  }
  /** The next palette colour not already used, so several studies read apart. */
  function nextColor(): ColorKey {
    const used = new Set(state.studies.map((s) => s.color))
    return PALETTE.find((p) => !used.has(p.key))?.key ?? 'accent'
  }

  function add(kind: StudyKind, params?: number[], color?: ColorKey): Study | null {
    if (state.studies.length >= MAX_STUDIES) return null
    state.studies.push({
      id: newId(),
      kind,
      params: cleanParams(kind, params ?? kindInfo(kind).defaults),
      color: color ?? nextColor(),
      visible: true,
    })
    save()
    // The reactive proxy, so a caller's edits are seen.
    return state.studies[state.studies.length - 1]
  }

  return {
    state,
    add,
    remove(id: string) {
      state.studies = state.studies.filter((s) => s.id !== id)
      if (state.cross && (state.cross.fast === id || state.cross.slow === id)) state.cross = null
      save()
    },
    setParam(id: string, index: number, value: number | null) {
      const s = state.studies.find((x) => x.id === id)
      if (!s || value === null) return
      const next = [...s.params]
      next[index] = value
      s.params = cleanParams(s.kind, next)
      save()
    },
    setColor(id: string, color: ColorKey) {
      const s = state.studies.find((x) => x.id === id)
      if (s) s.color = color
      save()
    },
    toggle(id: string, visible?: boolean) {
      const s = state.studies.find((x) => x.id === id)
      if (s) s.visible = visible ?? !s.visible
      save()
    },
    /** The one-click EMA 8/32 crossover: both EMAs plus marked crossovers. */
    addCrossover(fast = 8, slow = 32) {
      const find = (p: number) =>
        state.studies.find((s) => s.kind === 'ema' && s.params[0] === p) ?? null
      const f = find(fast) ?? add('ema', [fast], 'accent')
      const sl = find(slow) ?? add('ema', [slow], 'warning')
      if (!f || !sl) return false
      f.visible = true
      sl.visible = true
      state.cross = { fast: f.id, slow: sl.id }
      save()
      return true
    },
    clearCrossover() {
      state.cross = null
      save()
    },
    savePreset(name: string): StudyPreset {
      const n = name.trim().replace(/\s+/g, ' ').slice(0, 40)
      if (!n) throw new Error('Give the preset a name.')
      const p = snapshot(n)
      const at = state.presets.findIndex((x) => x.name === n)
      if (at >= 0) state.presets.splice(at, 1, p)
      else {
        if (state.presets.length >= MAX_PRESETS) throw new Error(`At most ${MAX_PRESETS} presets.`)
        state.presets.push(p)
      }
      savePresets()
      return p
    },
    loadPreset(name: string) {
      const p = state.presets.find((x) => x.name === name)
      if (!p) return
      applyPreset(p)
      save()
    },
    deletePreset(name: string) {
      state.presets = state.presets.filter((x) => x.name !== name)
      savePresets()
    },
  }
}
export type Studio = ReturnType<typeof createStudio>
